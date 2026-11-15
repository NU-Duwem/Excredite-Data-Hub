import type { SupabaseClient } from '@supabase/supabase-js';

/** Minimum gap between pulls started from a "Refresh feeds" button. */
export const REFRESH_COOLDOWN_MS = 5 * 60_000;

/** system_settings row holding when the last pull started (ISO 8601, UTC). */
export const LAST_RUN_KEY = 'news_ingest_last_run';

export type ClaimResult =
  | { ok: true }
  | { ok: false; retryAfterSeconds: number; lastRunAt: string };

/**
 * Atomically claim the right to start a pull.
 *
 * Succeeds (and stamps the time) only if the last pull started more than
 * `cooldownMs` ago, so two people clicking at once can't both start one.
 * Timestamps are always written with toISOString(), a fixed-width UTC format,
 * so comparing them as text gives the same order as comparing the times.
 * Needs a service-role client.
 */
export async function claimIngestRun(
  admin: SupabaseClient,
  cooldownMs: number,
  now: number = Date.now(),
): Promise<ClaimResult> {
  const nowIso = new Date(now).toISOString();
  const cutoffIso = new Date(now - cooldownMs).toISOString();

  // The conditional UPDATE is a single statement, so Postgres serialises
  // competing claims on the row lock: only one of them matches.
  const { data: claimed, error } = await admin
    .from('system_settings')
    .update({ value: nowIso, updated_at: nowIso })
    .eq('key', LAST_RUN_KEY)
    .lt('value', cutoffIso)
    .select('key');
  if (error) throw new Error(`Cool-down check failed: ${error.message}`);
  if (claimed?.length) return { ok: true };

  // Not claimed: either the row is missing, the last run is recent, or the
  // stored value is unusable (edited by hand).
  const { data: row, error: readError } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', LAST_RUN_KEY)
    .maybeSingle();
  if (readError) throw new Error(`Cool-down check failed: ${readError.message}`);

  if (!row) {
    const { error: insertError } = await admin.from('system_settings').insert({ key: LAST_RUN_KEY, value: nowIso });
    // A unique-key conflict means someone else created it a moment ago: treat as just-run.
    if (!insertError) return { ok: true };
    return { ok: false, retryAfterSeconds: Math.ceil(cooldownMs / 1000), lastRunAt: nowIso };
  }

  const last = Date.parse(row.value);
  const unusable = Number.isNaN(last) || last > now + cooldownMs || row.value !== new Date(last).toISOString();
  if (unusable) {
    // Replace a malformed value, but only if nobody changed it in the meantime.
    const { data: repaired } = await admin
      .from('system_settings')
      .update({ value: nowIso, updated_at: nowIso })
      .eq('key', LAST_RUN_KEY)
      .eq('value', row.value)
      .select('key');
    if (repaired?.length) return { ok: true };
    return { ok: false, retryAfterSeconds: Math.ceil(cooldownMs / 1000), lastRunAt: nowIso };
  }

  return {
    ok: false,
    retryAfterSeconds: Math.max(1, Math.ceil((last + cooldownMs - now) / 1000)),
    lastRunAt: row.value,
  };
}
