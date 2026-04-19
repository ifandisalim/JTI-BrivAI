import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Same behavior as `@supabase/auth-js` `parseParametersFromURL` (query + hash fragment).
 * Not re-exported from the package entrypoint in this version, so we keep the logic aligned here.
 */
function parseParametersFromURL(href: string): Record<string, string> {
  const result: Record<string, string> = {};
  const url = new URL(href);

  if (url.hash && url.hash[0] === '#') {
    try {
      const hashSearchParams = new URLSearchParams(url.hash.substring(1));
      hashSearchParams.forEach((value, key) => {
        result[key] = value;
      });
    } catch {
      // hash is not a query string
    }
  }

  url.searchParams.forEach((value, key) => {
    result[key] = value;
  });

  return result;
}

function mapRedirectOrExchangeError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('redirect') && (m.includes('not allowed') || m.includes('disallowed'))) {
    return 'This app build is not on Supabase’s allowed redirect list. Add the exact redirect URL from the dev log to Authentication → URL configuration → Redirect URLs.';
  }
  return message;
}

/**
 * Completes magic-link / OAuth redirects: PKCE `code` exchange or implicit/hash tokens.
 * Uses the same URL parameter rules as the Supabase web client (query + `#` fragment).
 */
export async function establishSessionFromCallbackUrl(
  client: SupabaseClient,
  href: string,
): Promise<void> {
  const params = parseParametersFromURL(href);

  if (params.error || params.error_description || params.error_code) {
    throw new Error(
      params.error_description ||
        params.error ||
        'Sign-in was cancelled or failed. Try requesting a new link.',
    );
  }

  if (params.code) {
    const { error } = await client.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw new Error(mapRedirectOrExchangeError(error.message));
    }
    return;
  }

  if (params.access_token && params.refresh_token) {
    const { error } = await client.auth.setSession({
      access_token: params.access_token,
      refresh_token: params.refresh_token,
    });
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  throw new Error('This sign-in link is incomplete or expired. Request a new link from the sign-in screen.');
}
