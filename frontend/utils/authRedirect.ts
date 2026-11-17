/**
 * Helpers for "Sign in with email". On screen it's called signing in with your
 * work email; behind the scenes it is Excredite's Microsoft 365 (Supabase's
 * Azure provider), and only addresses on public.allowed_accounts get in.
 */

/** The button shows on the login page only once Microsoft 365 is set up (see docs/technical/microsoft-365-sign-in.md). */
export const MICROSOFT_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_MICROSOFT_SIGN_IN === 'true';

/** An @excredite.ng address (the database also requires it to be on the allowed list). */
export function isCompanyEmail(email: string | null | undefined): boolean {
  return /^[^@\s]+@excredite\.ng$/.test((email ?? '').trim().toLowerCase());
}

/** Where to go after signing in: only a path on this site, never another site. */
export function safeNextPath(next: string | null | undefined, fallback = '/query'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || /[\r\n]/.test(next)) return fallback;
  if (next.startsWith('/login') || next.startsWith('/auth/')) return fallback;
  return next;
}

const NO_ACCESS = 'This email address does not have access to EPDH. Sign in with your Excredite work email, or ask an EPDH admin to add you.';

/** Plain-English versions of the errors Supabase or Microsoft send back. */
export function friendlyAuthError(raw: string | null | undefined): string {
  const msg = (raw ?? '').toLowerCase();
  if (!msg) return 'Sign-in did not finish. Please try again.';
  if (msg.includes('does not have access') || msg.includes('excredite.ng') || msg.includes('database error saving new user')) return NO_ACCESS;
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled') || msg.includes('user not found')) return NO_ACCESS;
  if (msg.includes('aadsts50020') || msg.includes('not in the directory') || msg.includes('does not exist in tenant')) return NO_ACCESS;
  if (msg.includes('banned') || msg.includes('user is banned')) return 'Your EPDH account is deactivated. Ask an EPDH admin to reactivate it.';
  if (msg.includes('access_denied') || msg.includes('cancel') || msg.includes('declined')) return 'Sign-in was cancelled.';
  if (msg.includes('code verifier') || msg.includes('flow state') || msg.includes('expired'))
    return 'The sign-in link expired. Please start again from this page.';
  if (msg.includes('unverified email') || msg.includes('email not verified') || msg.includes('email address is not verified'))
    return 'Your work email could not be confirmed. Ask your Microsoft 365 admin to check the EPDH setup (see the setup guide).';
  if (msg.includes('provider is not enabled') || msg.includes('unsupported provider'))
    return 'Sign-in with email is not switched on yet. Please try again later.';
  return 'Sign-in did not finish. Please try again.';
}
