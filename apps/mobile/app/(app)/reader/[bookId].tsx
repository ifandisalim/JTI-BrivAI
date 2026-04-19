import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

export default function ReaderScreen() {
  const { bookId } = useLocalSearchParams<{ bookId: string }>();

  return (
    <>
      <Stack.Screen options={{ title: 'Reader' }} />
      <View style={styles.container}>
        <Text style={styles.title}>Reader (coming)</Text>
        <Text style={styles.label}>bookId</Text>
        <Text style={styles.bookId}>{bookId}</Text>
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
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    opacity: 0.7,
  },
  bookId: {
    fontSize: 18,
    fontWeight: '500',
    fontFamily: 'SpaceMono',
  },
});
