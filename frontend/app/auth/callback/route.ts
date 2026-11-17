import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { friendlyAuthError, safeNextPath } from '@/utils/authRedirect';

/**
 * Microsoft (and any other OAuth) sign-in returns here with a one-time code.
 * We swap it for a session cookie, then send the person on to the app.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNextPath(url.searchParams.get('next'));
  const toLogin = (message: string) => {
    const login = new URL('/login', url.origin);
    login.searchParams.set('error', message);
    return NextResponse.redirect(login);
  };

  const providerError = url.searchParams.get('error_description') || url.searchParams.get('error');
  if (providerError) return toLogin(friendlyAuthError(providerError));

  const code = url.searchParams.get('code');
  if (!code) return toLogin(friendlyAuthError(null));

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.session) return toLogin(friendlyAuthError(error?.message));

  // Deactivated in the Admin Panel: don't let them in.
  const { data: profile } = await supabase.from('user_profiles').select('is_active').eq('id', data.session.user.id).single();
  if (profile && profile.is_active === false) {
    await supabase.auth.signOut();
    return toLogin('Your EPDH account is deactivated. Ask an EPDH admin to reactivate it.');
  }

  await supabase.from('user_activity_log').insert({
    user_id: data.session.user.id,
    action: 'LOGIN',
    details: 'Signed in with Microsoft.',
  });

  return NextResponse.redirect(new URL(next, url.origin));
}
