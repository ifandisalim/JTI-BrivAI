import * as Linking from 'expo-linking';
import { Stack, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View as RNView } from 'react-native';

import { Text, View } from '@/components/Themed';
import { establishSessionFromCallbackUrl } from '@/src/auth/sessionFromCallbackUrl';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

export default function AuthCallbackScreen() {
  const urlFromLinking = Linking.useLinkingURL();
  const handledRef = useRef(false);
  const [phase, setPhase] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState<string | null>(null);

  const runCallback = useCallback(async (href: string) => {
    if (handledRef.current) return;
    handledRef.current = true;

    if (!isSupabaseConfigured() || !supabase) {
      setPhase('error');
      setMessage('App configuration is incomplete (missing Supabase env).');
      handledRef.current = false;
      return;
    }

    setPhase('working');
    setMessage(null);

    try {
      await establishSessionFromCallbackUrl(supabase, href);
      router.replace('/library');
    } catch (e) {
      handledRef.current = false;
      setPhase('error');
      setMessage(e instanceof Error ? e.message : 'Something went wrong completing sign-in.');
    }
  }, []);

  useEffect(() => {
    if (!urlFromLinking) return;
    void runCallback(urlFromLinking);
  }, [urlFromLinking, runCallback]);

  return (
    <>
      <Stack.Screen options={{ title: 'Signing in', headerShown: false }} />
      <RNView style={styles.screen}>
        <View style={styles.container}>
          {phase === 'working' ? (
            <>
              <ActivityIndicator size="large" />
              <Text style={styles.body}>Completing sign-in…</Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Could not sign in</Text>
              <Text style={styles.body}>{message}</Text>
              <Pressable
                style={styles.button}
                onPress={() => {
                  router.replace('/sign-in');
                }}>
                <Text style={styles.buttonText}>Back to sign in</Text>
              </Pressable>
            </>
          )}
        </View>
      </RNView>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    textAlign: 'center',
    opacity: 0.85,
    maxWidth: 320,
  },
  button: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#2f95dc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
