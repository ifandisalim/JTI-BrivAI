import * as Linking from 'expo-linking';
import { Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  TextInput,
  View as RNView,
} from 'react-native';

import { SupabaseSmokeBanner } from '@/components/SupabaseSmokeBanner';
import { Text, View } from '@/components/Themed';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  // Practical MVP check — not full RFC validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mapSendLinkError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Too many requests. Wait a moment and try again.';
  }
  if (m.includes('network') || m.includes('fetch')) {
    return 'Network error. Check your connection and try again.';
  }
  if (m.includes('redirect') && (m.includes('not allowed') || m.includes('disallowed'))) {
    return 'This app build’s redirect URL is not allowed in Supabase. Add it under Authentication → URL configuration → Redirect URLs (see dev log for the exact string).';
  }
  return message;
}

export default function SignInScreen() {
  const supabaseReady = isSupabaseConfigured();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailRedirectTo = useMemo(() => Linking.createURL('auth/callback'), []);

  const onSubmit = useCallback(async () => {
    setError(null);
    setSuccess(false);

    if (!supabaseReady || !supabase) {
      setError('App configuration is incomplete (missing Supabase env).');
      return;
    }

    const normalized = normalizeEmail(email);
    if (!normalized) {
      setError('Enter your email address.');
      return;
    }
    if (!isValidEmail(normalized)) {
      setError('That does not look like a valid email address.');
      return;
    }

    if (__DEV__) {
      console.log(
        '[auth] emailRedirectTo — add this exact URL to Supabase Redirect URLs if sign-in fails:',
        emailRedirectTo,
      );
    }

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: { emailRedirectTo },
      });
      if (otpError) {
        setError(mapSendLinkError(otpError.message));
        return;
      }
      setSuccess(true);
    } catch (e) {
      setError(
        e instanceof Error ? mapSendLinkError(e.message) : 'Something went wrong. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }, [email, emailRedirectTo, supabaseReady]);

  return (
    <>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <RNView style={styles.screen}>
        <SupabaseSmokeBanner />
        <View style={styles.container}>
          {!supabaseReady ? (
            <Text style={styles.configWarning}>
              App configuration is incomplete (missing Supabase env). Check setup docs.
            </Text>
          ) : null}

          <Text style={styles.title}>Sign in with email</Text>
          <Text style={styles.caption}>
            We will email you a sign-in link. Open it on this phone to finish signing in.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor="#888"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            editable={!loading && supabaseReady}
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setError(null);
              setSuccess(false);
            }}
            onSubmitEditing={() => {
              void onSubmit();
            }}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {success ? (
            <Text style={styles.successText}>Check your email for a sign-in link.</Text>
          ) : null}

          <Pressable
            style={[styles.button, (!supabaseReady || loading) && styles.buttonDisabled]}
            disabled={!supabaseReady || loading}
            onPress={() => {
              void onSubmit();
            }}>
            {loading ? (
              <RNView style={styles.buttonInner}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.buttonText}>Sending link…</Text>
              </RNView>
            ) : (
              <Text style={styles.buttonText}>Email me a link</Text>
            )}
          </Pressable>
        </View>
      </RNView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 12,
  },
  configWarning: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.85,
    maxWidth: 320,
    color: '#c44',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  caption: {
    fontSize: 14,
    textAlign: 'center',
    opacity: 0.8,
    maxWidth: 320,
  },
  input: {
    alignSelf: 'stretch',
    maxWidth: 360,
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    marginTop: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#c44',
    textAlign: 'center',
    maxWidth: 320,
  },
  successText: {
    fontSize: 15,
    textAlign: 'center',
    maxWidth: 320,
    opacity: 0.9,
  },
  button: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2f95dc',
    alignSelf: 'stretch',
    maxWidth: 360,
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});
