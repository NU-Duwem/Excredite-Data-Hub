import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { claimIngestRun, LAST_RUN_KEY, REFRESH_COOLDOWN_MS } from '../cooldown';

/**
 * Minimal stand-in for the system_settings table supporting exactly the
 * query shapes claimIngestRun uses: update().eq().lt|eq().select(),
 * select().eq().maybeSingle() and insert().
 */
function settingsTable(initial: string | null, opts: { failUpdate?: boolean } = {}) {
  const rows = new Map<string, string>();
  if (initial !== null) rows.set(LAST_RUN_KEY, initial);

  const client = {
    from() {
      return {
        update(values: { value: string }) {
          const filters: ((v: string) => boolean)[] = [];
          let key = '';
          const chain = {
            eq(col: string, val: string) {
              if (col === 'key') key = val;
              else filters.push((v) => v === val);
              return chain;
            },
            lt(_col: string, val: string) {
              filters.push((v) => v < val); // text comparison, like Postgres on fixed-width ISO strings
              return chain;
            },
            async select() {
              if (opts.failUpdate) return { data: null, error: { message: 'relation does not exist' } };
              const current = rows.get(key);
              if (current === undefined || !filters.every((f) => f(current))) return { data: [], error: null };
              rows.set(key, values.value);
              return { data: [{ key }], error: null };
            },
          };
          return chain;
        },
        select() {
          let key = '';
          const chain = {
            eq(_col: string, val: string) {
              key = val;
              return chain;
            },
            async maybeSingle() {
              const v = rows.get(key);
              return { data: v === undefined ? null : { value: v }, error: null };
            },
          };
          return chain;
        },
        async insert(row: { key: string; value: string }) {
          if (rows.has(row.key)) return { error: { message: 'duplicate key' } };
          rows.set(row.key, row.value);
          return { error: null };
        },
      };
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

const T0 = Date.parse('2026-11-15T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('claimIngestRun', () => {
  it('claims when the last run is older than the cool-down, and stamps the time', async () => {
    const t = settingsTable(iso(T0 - 6 * 60_000));
    expect(await claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0)).toEqual({ ok: true });
    expect(t.rows.get(LAST_RUN_KEY)).toBe(iso(T0));
  });

  it('refuses within the cool-down and says how long to wait', async () => {
    const t = settingsTable(iso(T0 - 2 * 60_000));
    expect(await claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0)).toEqual({
      ok: false,
      retryAfterSeconds: 180,
      lastRunAt: iso(T0 - 2 * 60_000),
    });
    expect(t.rows.get(LAST_RUN_KEY)).toBe(iso(T0 - 2 * 60_000)); // unchanged
  });

  it('works from the seeded 1970 value', async () => {
    const t = settingsTable('1970-01-01T00:00:00.000Z');
    expect((await claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0)).ok).toBe(true);
  });

  it('lets only one of two simultaneous clicks through', async () => {
    const t = settingsTable(iso(T0 - 10 * 60_000));
    const [a, b] = await Promise.all([
      claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0),
      claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0),
    ]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
  });

  it('a zero cool-down (scheduler) always claims and records the time', async () => {
    const t = settingsTable(iso(T0 - 1_000));
    expect(await claimIngestRun(t.client, 0, T0)).toEqual({ ok: true });
    expect(t.rows.get(LAST_RUN_KEY)).toBe(iso(T0));
  });

  it('creates the row if it is missing', async () => {
    const t = settingsTable(null);
    expect(await claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0)).toEqual({ ok: true });
    expect(t.rows.get(LAST_RUN_KEY)).toBe(iso(T0));
  });

  it.each([
    ['garbage', 'not a date'],
    ['a far-future date', '2099-01-01T00:00:00.000Z'],
    ['a non-canonical date format', '2026-11-15 11:00:00+00'],
  ])('repairs %s instead of blocking refreshes forever', async (_label, value) => {
    const t = settingsTable(value);
    expect(await claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0)).toEqual({ ok: true });
    expect(t.rows.get(LAST_RUN_KEY)).toBe(iso(T0));
  });

  it('never asks anyone to wait less than 1 second', async () => {
    const t = settingsTable(iso(T0 - REFRESH_COOLDOWN_MS + 200));
    const r = await claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0);
    expect(r).toMatchObject({ ok: false, retryAfterSeconds: 1 });
  });

  it('throws a clear error if the settings table is unavailable', async () => {
    const t = settingsTable(iso(T0), { failUpdate: true });
    await expect(claimIngestRun(t.client, REFRESH_COOLDOWN_MS, T0)).rejects.toThrow(/Cool-down check failed/);
  });
});
