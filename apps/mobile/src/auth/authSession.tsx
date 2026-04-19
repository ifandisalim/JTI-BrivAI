import type { Session } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { supabase } from '@/src/lib/supabase';

type AuthContextValue = {
  /** False until the first `getSession` finishes (or we know there is no client). */
  initialized: boolean;
  session: Session | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initialized, setInitialized] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!supabase) {
      setSession(null);
      setInitialized(true);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session: next } }) => {
      if (cancelled) return;
      setSession(next);
      setInitialized(true);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setInitialized(true);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ initialized, session }), [initialized, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthSession(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuthSession must be used within AuthProvider');
  }
  return ctx;
}
