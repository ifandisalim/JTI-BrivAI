import { Stack, router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';
import { supabase } from '@/src/lib/supabase';

const DEMO_BOOK_ID = 'test-book';

export default function LibraryScreen() {
  const onSignOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.replace('/sign-in');
  }, []);

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Library',
          headerRight: () => (
            <Pressable onPress={() => void onSignOut()} hitSlop={12} style={styles.headerButton}>
              <Text style={styles.headerButtonText}>Sign out</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        <Text style={styles.title}>Library (coming)</Text>
        <Text style={styles.caption}>Opens the reader with a hardcoded book id to verify dynamic routes.</Text>
        <Pressable
          style={styles.button}
          onPress={() => {
            router.push(`/reader/${DEMO_BOOK_ID}`);
          }}>
          <Text style={styles.buttonText}>Open reader ({DEMO_BOOK_ID})</Text>
        </Pressable>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
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
  headerButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  headerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2f95dc',
  },
});
