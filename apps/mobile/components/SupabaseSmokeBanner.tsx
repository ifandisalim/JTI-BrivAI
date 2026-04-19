import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Text } from '@/components/Themed';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

type SmokeState =
  | { status: 'loading' }
  | { status: 'missing-env' }
  | { status: 'ok'; hasSession: boolean }
  | { status: 'error'; message: string };

/**
 * Dev-only connectivity banner + smoke call to `getSession()` (JTI-134 / spec 7.2).
 * Uses async flow with try/catch so there are no unhandled promise rejections.
 */
export function SupabaseSmokeBanner() {
  const [state, setState] = useState<SmokeState>({ status: 'loading' });

  useEffect(() => {
    if (!isSupabaseConfigured() || !supabase) {
      setState({ status: 'missing-env' });
      return;
    }

    const client = supabase;
    let cancelled = false;

    const run = async () => {
      try {
        const { data, error } = await client.auth.getSession();
        if (cancelled) {
          return;
        }
        if (error) {
          setState({ status: 'error', message: error.message });
          return;
        }
        setState({ status: 'ok', hasSession: data.session != null });
      } catch (e) {
        if (cancelled) {
          return;
        }
        const message = e instanceof Error ? e.message : 'Unknown error';
        setState({ status: 'error', message });
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!__DEV__) {
    return null;
  }

  return (
    <View style={styles.banner} accessibilityLabel="Supabase smoke status">
      {state.status === 'loading' ? (
        <>
          <ActivityIndicator size="small" color="#fff" />
          <Text style={styles.text}>Supabase: checking…</Text>
        </>
      ) : null}
      {state.status === 'missing-env' ? (
        <Text style={styles.text}>
          Supabase: missing env (copy .env.example → .env in apps/mobile)
        </Text>
      ) : null}
      {state.status === 'ok' ? (
        <Text style={styles.text}>
          Supabase: OK (reachable){state.hasSession ? ', session present' : ', no session'}
        </Text>
      ) : null}
      {state.status === 'error' ? (
        <Text style={styles.text}>Supabase: error — {state.message}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#1a1a2e',
  },
  text: {
    color: '#e8e8e8',
    fontSize: 12,
    flex: 1,
  },
});
