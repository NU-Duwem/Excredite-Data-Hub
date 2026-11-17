import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';

/** Server-only Supabase client with the service-role key. */
export function createAdminClient(): SupabaseClient {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Signs the browser in as this person, after the server has already decided they may
 * sign in (temporary password, or the development master password). It makes a
 * single-use sign-in token on the server (nothing is emailed) and swaps it for the
 * session cookie. Returns false if that failed.
 */
export async function startSessionFor(admin: SupabaseClient, email: string, userId: string): Promise<boolean> {
  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    console.error('startSessionFor: link failed:', linkError?.message);
    return false;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type: 'email', token_hash: tokenHash });
  if (error || !data.user || data.user.id !== userId) {
    console.error('startSessionFor: verify failed:', error?.message);
    await supabase.auth.signOut();
    return false;
  }
  return true;
}
