import { Link, Stack } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function SignInScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Sign in' }} />
      <View style={styles.container}>
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
});
