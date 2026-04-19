import { Redirect } from 'expo-router';

import { useAuthSession } from '@/src/auth/authSession';

/**
 * Cold start: restore session from AsyncStorage-backed Supabase client, then route.
 * See docs/specs/mvp/auth-epic-126.md#jti-136 (MVP-AUTH-02).
 */
export default function Index() {
  const { initialized, session } = useAuthSession();

  if (!initialized) {
    return null;
  }

  if (session) {
    return <Redirect href="/library" />;
  }

  return <Redirect href="/sign-in" />;
}
