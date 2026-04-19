import { Redirect } from 'expo-router';

/**
 * Entry: auth-first. Real auth gate replaces this in the Auth epic (TODO(JTI-AUTH)).
 */
export default function Index() {
  return <Redirect href="/sign-in" />;
}
