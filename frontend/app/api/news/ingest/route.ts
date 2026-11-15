import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { ingestAllSources } from '@/utils/news/ingest';
import { hasCronSecret } from '@/utils/news/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pull all active RSS sources into news_articles.
 *
 * Callers:
 *  - Scheduler (Vercel Cron, or Supabase pg_cron + pg_net):
 *      Authorization: Bearer <CRON_SECRET>
 *  - A signed-in power_admin (the "Refresh feeds" button on /news).
 */
async function isAdminSession(): Promise<boolean> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'power_admin';
}

async function handle(req: Request) {
  if (!hasCronSecret(req.headers.get('authorization'), process.env.CRON_SECRET) && !(await isAdminSession())) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Supabase service credentials are not configured' }, { status: 500 });
  }

  try {
    const summary = await ingestAllSources(createClient(url, serviceKey, { auth: { persistSession: false } }));
    console.log(`News ingest: ${summary.inserted} new articles from ${summary.sources} sources (${summary.failed} failed)`);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('News ingest error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'News ingest failed' }, { status: 500 });
  }
}

// Vercel Cron sends GET; the admin button and pg_net send POST.
export const GET = handle;
export const POST = handle;
