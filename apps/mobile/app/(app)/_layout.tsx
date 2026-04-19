import { Redirect, Stack } from 'expo-router';

import { useAuthSession } from '@/src/auth/authSession';

export default function AppGroupLayout() {
  const { initialized, session } = useAuthSession();

  if (!initialized) {
    return null;
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return <Stack />;
}

