import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

function isConfigured(u: string, key: string): boolean {
  return u.trim().length > 0 && key.trim().length > 0;
}

const configured = isConfigured(url, anonKey);

if (!configured && __DEV__) {
  console.error(
    '[supabase] Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. Copy apps/mobile/.env.example to apps/mobile/.env and set your project values.',
  );
}

/**
 * AsyncStorage’s web implementation reads `window`. Expo Router can execute the web bundle in
 * Node during SSR, where `window` does not exist — use a tiny in-memory store for that case only.
 * Native (ios/android) always uses AsyncStorage.
 */
function authSessionStorage(): Pick<
  typeof AsyncStorage,
  'getItem' | 'setItem' | 'removeItem'
> {
  if (Platform.OS === 'web' && typeof window === 'undefined') {
    const memory = new Map<string, string>();
    return {
      getItem: async (key) => memory.get(key) ?? null,
      setItem: async (key, value) => {
        memory.set(key, value);
      },
      removeItem: async (key) => {
        memory.delete(key);
      },
    };
  }
  return AsyncStorage;
}

/** Null when URL or anon key is missing — do not call Supabase APIs until configured. */
export const supabase: SupabaseClient | null = configured
  ? createClient(url, anonKey, {
      auth: {
        storage: authSessionStorage(),
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return configured;
}
