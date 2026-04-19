import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet, View as RNView } from 'react-native';

import { SupabaseSmokeBanner } from '@/components/SupabaseSmokeBanner';
import { Text, View } from '@/components/Themed';
import { isSupabaseConfigured } from '@/src/lib/supabase';

export default function SignInScreen() {
  const supabaseReady = isSupabaseConfigured();

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
        <Text style={styles.title}>Sign in (coming in Auth epic)</Text>
        <Text style={styles.caption}>
          Use the button below only to exercise the navigation skeleton until auth lands.
        </Text>
        <Link href="/library" asChild>
          <Pressable style={styles.button}>
            <Text style={styles.buttonText}>Go to Library</Text>
          </Pressable>
        </Link>
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
    gap: 16,
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
  button: {
    marginTop: 8,
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
