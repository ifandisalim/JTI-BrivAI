import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

/** Null when URL or anon key is missing — do not call Supabase APIs until configured. */
export const supabase: SupabaseClient | null = configured
  ? createClient(url, anonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

export function isSupabaseConfigured(): boolean {
  return configured;
}
