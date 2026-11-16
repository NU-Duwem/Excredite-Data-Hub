/** Pure helpers behind the News & Updates page (kept here so they can be unit-tested). */

export type TimeRange = '24h' | '7d' | '30d' | 'all';

export const TIME_RANGES: readonly { value: TimeRange; label: string }[] = [
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All time' },
];

export const DEFAULT_TIME_RANGE: TimeRange = '7d';

const RANGE_MS: Record<Exclude<TimeRange, 'all'>, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

/** Earliest published_at to include, or null for no limit. */
export function sinceIso(range: TimeRange, now: number = Date.now()): string | null {
  return range === 'all' ? null : new Date(now - RANGE_MS[range]).toISOString();
}

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

/** "Friday 13 November" (+ " 2025" when asked), built from parts so punctuation never varies by browser. */
function longDate(d: Date, withYear: boolean): string {
  const weekday = d.toLocaleDateString('en-GB', { weekday: 'long' });
  const month = d.toLocaleDateString('en-GB', { month: 'long' });
  return `${weekday} ${d.getDate()} ${month}${withYear ? ` ${d.getFullYear()}` : ''}`;
}

/**
 * Group items (already sorted newest first) into calendar days in the
 * viewer's local time zone: "Today", "Yesterday", then "Friday 14 November".
 * Undated items go in a final "Date unknown" group.
 */
export function groupByDay<T extends { published_at: string | null }>(
  items: readonly T[],
  now: Date = new Date(),
): { key: string; label: string; items: T[] }[] {
  const today = dayKey(now);
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  const yesterday = dayKey(y);

  const groups: { key: string; label: string; items: T[] }[] = [];
  const byKey = new Map<string, { key: string; label: string; items: T[] }>();
  const undated: T[] = [];

  for (const item of items) {
    const d = item.published_at ? new Date(item.published_at) : null;
    if (!d || Number.isNaN(d.getTime())) {
      undated.push(item);
      continue;
    }
    const key = dayKey(d);
    let group = byKey.get(key);
    if (!group) {
      const label =
        key === today
          ? 'Today'
          : key === yesterday
            ? 'Yesterday'
            : longDate(d, d.getFullYear() !== now.getFullYear());
      group = { key, label, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push(item);
  }
  if (undated.length) groups.push({ key: 'undated', label: 'Date unknown', items: undated });
  return groups;
}

/** "08:52" in the viewer's local time (24-hour clock). */
export function formatClock(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** How many filter groups differ from their defaults (shown on the Filters button). */
export function activeFilterCount(opts: {
  timeRange: TimeRange;
  topicsSelected: number;
  topicsTotal: number;
  sourcesSelected: number | null; // null = all sources
  sourcesTotal: number;
}): number {
  let n = 0;
  if (opts.timeRange !== DEFAULT_TIME_RANGE) n += 1;
  if (opts.topicsSelected !== opts.topicsTotal) n += 1;
  if (opts.sourcesSelected !== null && opts.sourcesSelected !== opts.sourcesTotal) n += 1;
  return n;
}

export type SourceStatus = {
  name: string;
  last_status: 'OK' | 'ERROR' | null;
  last_fetched_at: string | null;
};

/** Latest pull time across sources, and the sources that failed on their last pull. */
export function feedHealth(sources: readonly SourceStatus[]): { lastPullAt: string | null; unreachable: string[] } {
  let latest: number | null = null;
  for (const s of sources) {
    const t = s.last_fetched_at ? Date.parse(s.last_fetched_at) : NaN;
    if (!Number.isNaN(t) && (latest === null || t > latest)) latest = t;
  }
  return {
    lastPullAt: latest === null ? null : new Date(latest).toISOString(),
    unreachable: sources.filter((s) => s.last_status === 'ERROR').map((s) => s.name),
  };
}

/** Minute past each hour the pg_cron job runs (see 08_news_schedule.sql). */
export const SCHEDULE_MINUTE = 7;

/** The next hourly pull after `now`, as a Date. */
export function nextScheduledPull(now: Date = new Date(), minute: number = SCHEDULE_MINUTE): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(minute);
  if (next.getTime() <= now.getTime()) next.setHours(next.getHours() + 1);
  return next;
}
