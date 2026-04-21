import AsyncStorage from '@react-native-async-storage/async-storage';

export type { ContentStartMethod } from '@/src/lib/contentStartOpenCopy';
export {
  fallbackStartToastStorageKey,
  messageForContentStartToast,
  smartStartToastStorageKey,
} from '@/src/lib/contentStartOpenCopy';

export async function hasSeenContentStartToast(key: string): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(key);
    return v === '1';
  } catch {
    return false;
  }
}

export async function markContentStartToastSeen(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, '1');
  } catch {
    /* non-fatal */
  }
}
