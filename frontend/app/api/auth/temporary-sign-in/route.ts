import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { isCompanyEmail, MICROSOFT_SIGN_IN_ENABLED } from '@/utils/authRedirect';

/**
 * First sign-in with a one-time temporary password (19_temporary_passwords.sql).
 *
 * 1. The database checks the password and spends it in the same step, so it
 *    can never work twice (and locks after 5 wrong tries).
 * 2. The server then starts the person's session with a single-use sign-in
 *    token it creates itself; no email is sent.
 * 3. Afterwards people sign in with their work email. Until that's switched on
 *    (NEXT_PUBLIC_MICROSOFT_SIGN_IN), they're asked to choose a password.
 */
const WRONG = 'That temporary password is wrong, already used or expired. Ask an EPDH admin for a new one.';

export async function POST(req: Request) {
  try {
    return await signIn(req);
  } catch (e) {
    console.error('temporary-sign-in failed:', (e as Error).message);
    return NextResponse.json({ error: 'Sign-in is not available right now. Please try again shortly.' }, { status: 500 });
  }
}

async function signIn(req: Request) {
  let email = '';
  let password = '';
  try {
    const body = await req.json();
    email = String(body?.email ?? '').trim().toLowerCase().slice(0, 254);
    password = String(body?.password ?? '').slice(0, 200);
  } catch {
    return NextResponse.json({ error: 'Enter your work email and temporary password.' }, { status: 400 });
  }
  if (!isCompanyEmail(email) || !password) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userId, error: redeemError } = await admin.rpc('redeem_temporary_password', { p_email: email, p_password: password });
  if (redeemError) {
    console.error('temporary-sign-in redeem failed:', redeemError.message);
    return NextResponse.json({ error: 'Sign-in is not available right now. Please try again shortly.' }, { status: 500 });
  }
  if (!userId) {
    return NextResponse.json({ error: WRONG }, { status: 401 });
  }

  // Start the session: a single-use token made on the server (nothing is emailed).
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('temporary-sign-in link failed:', linkError?.message);
    return NextResponse.json({ error: 'Your temporary password was accepted, but sign-in failed. Ask an EPDH admin for a new one.' }, { status: 500 });
  }
  const supabase = await createClient();
  const { data: session, error: verifyError } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (verifyError || !session.user || session.user.id !== userId) {
    console.error('temporary-sign-in verify failed:', verifyError?.message);
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'Your temporary password was accepted, but sign-in failed. Ask an EPDH admin for a new one.' }, { status: 500 });
  }

  // Until work-email sign-in is on, this person needs a password of their own to come back.
  const needsPassword = !MICROSOFT_SIGN_IN_ENABLED;
  if (needsPassword) {
    await admin.auth.admin.updateUserById(userId, { app_metadata: { must_set_password: true } });
  }

  await admin.from('user_activity_log').insert({
    user_id: userId,
    action: 'LOGIN',
    details: 'First sign-in with a one-time temporary password.',
  });

  return NextResponse.json({ success: true, next: needsPassword ? '/profile?first_sign_in=1' : '/' });
}
