import * as DocumentPicker from 'expo-document-picker';
import { File as ExpoFsFile } from 'expo-file-system';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Platform, Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { BOOK_MAX_BYTES, BOOK_PDFS_BUCKET, BOOK_STATUS, type BookStatus } from '@/src/config/books';
import { useAuthSession } from '@/src/auth/authSession';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

type Phase = 'idle' | 'working';

function titleFromPickerName(name: string): string {
  const trimmed = name.trim();
  const lower = trimmed.toLowerCase();
  const withoutExt = lower.endsWith('.pdf') ? trimmed.slice(0, -4) : trimmed;
  return withoutExt.trim().length > 0 ? withoutExt.trim() : 'Untitled book';
}

function isLikelyPdfName(name: string, mimeType?: string | null): boolean {
  if (mimeType && mimeType !== 'application/pdf' && !mimeType.includes('pdf')) {
    return false;
  }
  return name.toLowerCase().endsWith('.pdf');
}

function newBookId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  const buf = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < 16; i++) buf[i] = Math.floor(Math.random() * 256);
  buf[6] = (buf[6] & 0x0f) | 0x40;
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const h = [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** expo-file-system's File class is a stub on web (no native validatePath); use fetch for blob/file picker URIs. */
async function readPickerUriAsArrayBuffer(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') {
    const res = await fetch(uri);
    if (!res.ok) {
      throw new Error(`Could not read file (HTTP ${res.status})`);
    }
    return res.arrayBuffer();
  }
  const file = new ExpoFsFile(uri);
  return file.arrayBuffer();
}

function pdfHeaderLooksLikePdf(buf: ArrayBuffer): boolean {
  const n = Math.min(5, buf.byteLength);
  const bytes = new Uint8Array(buf, 0, n);
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  if (bytes.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (bytes[i] !== magic[i]) return false;
  }
  return true;
}

export default function UploadPdfScreen() {
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);

  const resetToIdle = useCallback(() => {
    setPhase('idle');
    setMessage(null);
    setDetail(null);
  }, []);

  const failBookRow = useCallback(async (bookId: string, status: BookStatus, userMessage: string, code: string) => {
    if (!supabase) return;
    await supabase
      .from('books')
      .update({
        status,
        error_code: code,
        error_message: userMessage,
      })
      .eq('id', bookId);
  }, []);

  const removeStorageSilently = useCallback(async (storagePath: string) => {
    if (!supabase) return;
    await supabase.storage.from(BOOK_PDFS_BUCKET).remove([storagePath]);
  }, []);

  const onPickAndUpload = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase || !userId) {
      setMessage('Sign in is required to upload.');
      return;
    }

    setPhase('working');
    setMessage(null);
    setDetail(null);

    const pick = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (pick.canceled || !pick.assets?.[0]) {
      setPhase('idle');
      return;
    }

    const asset = pick.assets[0];
    if (!isLikelyPdfName(asset.name, asset.mimeType)) {
      setPhase('idle');
      setMessage('That file is not a PDF.');
      setDetail('Choose a file that ends in .pdf.');
      return;
    }

    const declaredSize = asset.size ?? null;
    if (declaredSize !== null && declaredSize > BOOK_MAX_BYTES) {
      setPhase('idle');
      setMessage('This PDF is over 50 MB.');
      setDetail('Choose another PDF under 50 MB.');
      return;
    }

    let pdfBytes: ArrayBuffer;
    try {
      pdfBytes = await readPickerUriAsArrayBuffer(asset.uri);
    } catch (e) {
      const errText = e instanceof Error ? e.message : String(e);
      setPhase('idle');
      setMessage('Could not read this PDF.');
      setDetail('Try again, or pick a different file. If the problem persists, start the upload again.');
      if (__DEV__) console.warn('[upload-pdf] read failed', errText);
      return;
    }

    if (pdfBytes.byteLength > BOOK_MAX_BYTES) {
      setPhase('idle');
      setMessage('This PDF is over 50 MB.');
      setDetail('Choose another PDF under 50 MB.');
      return;
    }

    if (!pdfHeaderLooksLikePdf(pdfBytes)) {
      setPhase('idle');
      setMessage('This file does not look like a real PDF.');
      setDetail('Choose another PDF from your library.');
      return;
    }

    const bookId = newBookId();
    const storagePath = `${userId}/${bookId}.pdf`;
    const title = titleFromPickerName(asset.name);
    const byteSize = declaredSize && declaredSize > 0 ? declaredSize : pdfBytes.byteLength;

    const { error: insertError } = await supabase.from('books').insert({
      id: bookId,
      user_id: userId,
      title,
      source_filename: asset.name,
      storage_bucket: BOOK_PDFS_BUCKET,
      storage_path: storagePath,
      byte_size: byteSize,
      status: BOOK_STATUS.uploading,
    });

    if (insertError) {
      setPhase('idle');
      setMessage('Could not start upload.');
      setDetail('Check that you are signed in, then try again. If this keeps happening, sign out and sign back in.');
      if (__DEV__) console.warn('[upload-pdf] books insert', insertError.message);
      return;
    }

    const { error: uploadError } = await supabase.storage
      .from(BOOK_PDFS_BUCKET)
      .upload(storagePath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (uploadError) {
      await removeStorageSilently(storagePath);
      await failBookRow(
        bookId,
        BOOK_STATUS.failed,
        'Upload did not finish. Check your connection and try again.',
        'upload_failed',
      );
      setPhase('idle');
      setMessage('Upload failed.');
      setDetail(
        'Check your connection, then try again. If the app was closed or the network dropped, you may need to start the upload again.',
      );
      if (__DEV__) console.warn('[upload-pdf] storage upload', uploadError.message);
      return;
    }

    const { data: fnData, error: fnError } = await supabase.functions.invoke('validate-book-pdf', {
      body: { book_id: bookId },
    });

    type ValidateResponse = {
      success?: boolean;
      error_code?: string;
      error_message?: string;
    };

    const parsePayload = (): ValidateResponse | null => {
      if (fnData && typeof fnData === 'object' && !Array.isArray(fnData)) {
        return fnData as ValidateResponse;
      }
      return null;
    };

    if (fnError) {
      await removeStorageSilently(storagePath);
      await failBookRow(
        bookId,
        BOOK_STATUS.failed,
        'We could not finish checking your PDF. Check your connection and try uploading again.',
        'validation_unavailable',
      );
      setPhase('idle');
      setMessage('Could not finish checking your PDF.');
      setDetail(
        'Check your connection, then try again. If the problem keeps happening, pick the PDF again from the start.',
      );
      if (__DEV__) console.warn('[upload-pdf] validate-book-pdf invoke', fnError.message);
      return;
    }

    const payload = parsePayload();
    if (!payload?.success) {
      const userMsg =
        typeof payload?.error_message === 'string' && payload.error_message.trim().length > 0
          ? payload.error_message.trim()
          : 'This PDF did not pass our checks. Choose another PDF and try again.';
      const errCode =
        typeof payload?.error_code === 'string' && payload.error_code.trim().length > 0
          ? payload.error_code.trim()
          : 'failed_validation';
      await failBookRow(bookId, BOOK_STATUS.failed, userMsg, errCode);
      setPhase('idle');
      setMessage(userMsg);
      setDetail(
        'Go back to the library to see this import as failed, or pick a different PDF from Add book.',
      );
      return;
    }

    router.replace('/library');
  }, [failBookRow, removeStorageSilently, userId]);

  const busy = phase === 'working';

  useEffect(() => {
    if (!busy) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      Alert.alert(
        'Upload in progress',
        'If you leave now, the upload may not finish. Stay on this screen until it completes, or try again from the library if something goes wrong.',
      );
      return true;
    });
    return () => sub.remove();
  }, [busy]);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Add book',
          headerLeft: () => (
            <Pressable
              onPress={() => {
                if (busy) {
                  Alert.alert(
                    'Upload in progress',
                    'We cannot stop a large upload mid-flight in this MVP build. Wait for it to finish, or close the app and start again from the library if needed.',
                  );
                  return;
                }
                if (router.canGoBack()) router.back();
                else router.replace('/library');
              }}
              hitSlop={12}
              style={styles.headerBtn}>
              <Text style={styles.headerBtnText}>{busy ? 'Close' : 'Back'}</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <Text style={styles.trust}>
          Your PDF stays in your account; we use it to make summaries for you.
        </Text>

        {busy ? (
          <View style={styles.progressBlock}>
            <ActivityIndicator size="large" />
            <Text style={styles.progressTitle}>Uploading and checking…</Text>
            <Text style={styles.progressCaption}>
              Stay on this screen until the upload finishes and the server finishes checking your PDF (type, size, and
              page count). This MVP build does not show byte-level progress; the spinner means work is in progress.
            </Text>
          </View>
        ) : (
          <>
            <Pressable style={styles.primaryButton} onPress={() => void onPickAndUpload()}>
              <Text style={styles.primaryButtonText}>Pick PDF</Text>
            </Pressable>
            <Text style={styles.muted}>
              If the network drops or the app closes during upload, you may need to pick the PDF again and retry.
            </Text>
          </>
        )}

        {message ? <Text style={styles.error}>{message}</Text> : null}
        {detail ? <Text style={styles.detail}>{detail}</Text> : null}

        {message && phase === 'idle' ? (
          <Pressable style={styles.secondaryButton} onPress={resetToIdle}>
            <Text style={styles.secondaryButtonText}>Dismiss</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    gap: 16,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  trust: {
    fontSize: 14,
    opacity: 0.85,
    textAlign: 'center',
  },
  progressBlock: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  progressCaption: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.8,
  },
  primaryButton: {
    marginTop: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2f95dc',
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#2f95dc',
    fontWeight: '600',
  },
  headerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f95dc',
  },
  muted: {
    fontSize: 13,
    opacity: 0.75,
  },
  error: {
    fontSize: 15,
    color: '#c0392b',
    textAlign: 'center',
  },
  detail: {
    fontSize: 14,
    opacity: 0.85,
    textAlign: 'center',
  },
});
