import { NextResponse } from 'next/server';
import { isCompanyEmail } from '@/utils/authRedirect';
import { devMasterPasswordEnabled, isDevMasterPassword } from '@/utils/devMaster';
import { createAdminClient, startSessionFor } from '@/utils/supabase/startSession';

/**
 * ⚠️ DEVELOPMENT ONLY: sign in as any listed, active staff account with the
 * master password (DEV_MASTER_PASSWORD in frontend/.env.local).
 * Off unless running `npm run dev` with that variable set; on any production
 * build or deployment this route answers 404. REMOVE BEFORE DEPLOYMENT.
 */
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

/** Lets the login page show its "development mode" notice. */
export async function GET() {
  return NextResponse.json({ enabled: devMasterPasswordEnabled() });
}

export async function POST(req: Request) {
  if (!devMasterPasswordEnabled()) return notFound();
  try {
    const body = await req.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase().slice(0, 254);
    const password = String(body?.password ?? '').slice(0, 200);
    if (!isCompanyEmail(email) || !isDevMasterPassword(password)) {
      return NextResponse.json({ error: 'That email or master password is wrong.' }, { status: 401 });
    }

    // Same limits as everyone else: only listed, active accounts.
    const admin = createAdminClient();
    const [{ data: allowed }, { data: profile }] = await Promise.all([
      admin.from('allowed_accounts').select('email').eq('email', email).maybeSingle(),
      admin.from('user_profiles').select('id, is_active').eq('email', email).maybeSingle(),
    ]);
    if (!allowed || !profile) return NextResponse.json({ error: 'There is no EPDH account for that email.' }, { status: 401 });
    if (!profile.is_active) return NextResponse.json({ error: 'That account is deactivated.' }, { status: 401 });

    if (!(await startSessionFor(admin, email, profile.id))) {
      return NextResponse.json({ error: 'Sign-in failed. Check the server log.' }, { status: 500 });
    }
    console.warn(`⚠️  DEV master password used to sign in as ${email}. Remove DEV_MASTER_PASSWORD before deployment.`);
    await admin.from('user_activity_log').insert({
      user_id: profile.id,
      action: 'LOGIN',
      details: 'Signed in with the DEVELOPMENT master password.',
    });
    return NextResponse.json({ success: true, next: '/' });
  } catch (e) {
    console.error('dev-master-sign-in failed:', (e as Error).message);
    return NextResponse.json({ error: 'Sign-in failed. Check the server log.' }, { status: 500 });
  }
}
