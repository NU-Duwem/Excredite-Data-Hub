/**
 * Helpers for "Sign in with Microsoft" (Supabase's Azure provider) and the
 * /auth/callback route.
 */

/** Microsoft sign-in shows on the login page only once it's set up (see docs/technical/microsoft-365-sign-in.md). */
export const MICROSOFT_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_MICROSOFT_SIGN_IN === 'true';

/** Where to go after signing in: only a path on this site, never another site. */
export function safeNextPath(next: string | null | undefined, fallback = '/query'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return fallback;
  if (next.startsWith('/login') || next.startsWith('/auth/')) return fallback;
  return next;
}

/** Plain-English versions of the errors Supabase or Microsoft send back. */
export function friendlyAuthError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  if (!msg) return 'Sign-in did not finish. Please try again.';
  if (msg.includes('excredite.ng') || msg.includes('database error saving new user'))
    return 'Only @excredite.ng accounts can use EPDH. Sign in with your Excredite Microsoft account.';
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled') || msg.includes('user not found'))
    return 'Your account has not been set up in EPDH yet. Ask an EPDH admin to add you, then try again.';
  if (msg.includes('banned') || msg.includes('user is banned')) return 'Your EPDH account is deactivated. Ask an EPDH admin to reactivate it.';
  if (msg.includes('access_denied') || msg.includes('cancel') || msg.includes('declined')) return 'Sign-in was cancelled.';
  if (msg.includes('code verifier') || msg.includes('flow state') || msg.includes('expired'))
    return 'The sign-in link expired. Please start again from this page.';
  if (msg.includes('unverified email') || msg.includes('email not verified') || msg.includes('email address is not verified'))
    return 'Microsoft did not confirm your email address. Ask your Microsoft 365 admin to check the EPDH app registration (see the setup guide).';
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider'))
    return 'Microsoft sign-in is not switched on yet. Use your email and password for now.';
  return 'Sign-in did not finish. Please try again, or use your email and password.';
}
