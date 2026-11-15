import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { ingestAllSources } from '@/utils/news/ingest';
import { hasCronSecret } from '@/utils/news/auth';
import { claimIngestRun, REFRESH_COOLDOWN_MS } from '@/utils/news/cooldown';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Pull all active RSS sources into news_articles.
 *
 * Callers:
 *  - Scheduler (Supabase pg_cron hourly via pg_net POST, or Vercel Cron GET):
 *      Authorization: Bearer <CRON_SECRET>. No cool-down.
 *  - Any active signed-in user, POST only (the "Refresh feeds" button on
 *    News and the refresh icon on Overview). One pull per 5 minutes across
 *    everyone; extra clicks get 429 with Retry-After.
 */
async function activeSessionUser(): Promise<{ id: string } | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('user_profiles').select('is_active').eq('id', user.id).single();
  return profile?.is_active ? { id: user.id } : null;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && serviceKey ? createClient(url, serviceKey, { auth: { persistSession: false } }) : null;
}

async function handle(req: Request) {
  const fromScheduler = hasCronSecret(req.headers.get('authorization'), process.env.CRON_SECRET);
  // Browsers can issue GETs on their own (prefetch, link previews), so a
  // session may only trigger a pull with an explicit POST.
  const user = !fromScheduler && req.method === 'POST' ? await activeSessionUser() : null;
  if (!fromScheduler && !user) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 });
  }

  const admin = serviceClient();
  if (!admin) {
    return NextResponse.json({ error: 'Supabase service credentials are not configured' }, { status: 500 });
  }

  try {
    if (fromScheduler) {
      // Record the start so button clicks right after a scheduled pull are throttled.
      await claimIngestRun(admin, 0).catch((err) => console.warn('News ingest: could not record run time:', err));
    } else {
      const claim = await claimIngestRun(admin, REFRESH_COOLDOWN_MS);
      if (!claim.ok) {
        return NextResponse.json(
          {
            error: 'Feeds were refreshed recently.',
            retryAfterSeconds: claim.retryAfterSeconds,
            lastRunAt: claim.lastRunAt,
          },
          { status: 429, headers: { 'Retry-After': String(claim.retryAfterSeconds) } },
        );
      }
    }

    const summary = await ingestAllSources(admin);
    console.log(
      `News ingest (${fromScheduler ? 'schedule' : 'manual'}): ${summary.inserted} new articles from ${summary.sources} sources (${summary.failed} failed)`,
    );

    if (user) {
      await admin
        .from('user_activity_log')
        .insert({ user_id: user.id, action: 'NEWS_REFRESH', details: `Refreshed news feeds: ${summary.inserted} new articles` })
        .then(({ error }) => error && console.warn('News ingest: activity log failed:', error.message));
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error('News ingest error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'News ingest failed' }, { status: 500 });
  }
}

// Vercel Cron sends GET; pg_net and the refresh buttons send POST.
export const GET = handle;
export const POST = handle;
