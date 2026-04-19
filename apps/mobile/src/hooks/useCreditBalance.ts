import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useAuthSession } from '@/src/auth/authSession';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';

export type CreditBalanceLoadState = 'idle' | 'loading' | 'ready' | 'error';

export function useCreditBalance() {
  const { session } = useAuthSession();
  const userId = session?.user.id ?? null;

  const [balance, setBalance] = useState<number | null>(null);
  const [loadState, setLoadState] = useState<CreditBalanceLoadState>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured() || !supabase) {
      setBalance(null);
      setLoadState('error');
      setLoadError('Supabase is not configured');
      return;
    }

    if (!userId) {
      setBalance(null);
      setLoadState('ready');
      setLoadError(null);
      return;
    }

    setLoadState('loading');
    setLoadError(null);

    const { data, error } = await supabase
      .from('profiles')
      .select('credit_balance')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      setLoadState('error');
      setLoadError(error.message);
      setBalance(null);
      return;
    }

    if (data == null) {
      setLoadState('error');
      setLoadError('Profile not found');
      setBalance(null);
      return;
    }

    setBalance(data.credit_balance);
    setLoadState('ready');
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  return { balance, loadState, loadError, refresh };
}
