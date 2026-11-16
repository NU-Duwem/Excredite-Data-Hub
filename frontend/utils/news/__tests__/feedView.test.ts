import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  DEFAULT_TIME_RANGE,
  feedHealth,
  formatClock,
  groupByDay,
  nextScheduledPull,
  sinceIso,
} from '../feedView';

// Tests run with TZ=UTC (see vitest.config.ts), so local time = UTC here.
const NOW = new Date('2026-11-16T09:30:00Z');

describe('sinceIso', () => {
  it('computes the window start', () => {
    expect(sinceIso('24h', NOW.getTime())).toBe('2026-11-15T09:30:00.000Z');
    expect(sinceIso('7d', NOW.getTime())).toBe('2026-11-09T09:30:00.000Z');
    expect(sinceIso('30d', NOW.getTime())).toBe('2026-10-17T09:30:00.000Z');
  });
  it('returns null for all time', () => {
    expect(sinceIso('all', NOW.getTime())).toBeNull();
  });
});

describe('groupByDay', () => {
  const item = (id: string, published_at: string | null) => ({ id, published_at });

  it('labels Today, Yesterday, then the weekday and date, keeping order', () => {
    const groups = groupByDay(
      [
        item('a', '2026-11-16T08:52:00Z'),
        item('b', '2026-11-16T00:05:00Z'),
        item('c', '2026-11-15T17:30:00Z'),
        item('d', '2026-11-13T11:00:00Z'),
      ],
      NOW,
    );
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a', 'b']],
      ['Yesterday', ['c']],
      ['Friday 13 November', ['d']],
    ]);
  });

  it('adds the year for stories from another year', () => {
    expect(groupByDay([item('x', '2025-12-31T10:00:00Z')], NOW)[0].label).toBe('Wednesday 31 December 2025');
  });

  it('puts undated or unparseable items last', () => {
    const groups = groupByDay([item('a', null), item('b', '2026-11-16T08:00:00Z'), item('c', 'not a date')], NOW);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['b']],
      ['Date unknown', ['a', 'c']],
    ]);
  });

  it('handles an empty list', () => {
    expect(groupByDay([], NOW)).toEqual([]);
  });

  it('treats the first minute after midnight as a new day', () => {
    const groups = groupByDay([item('a', '2026-11-16T00:00:30Z'), item('b', '2026-11-15T23:59:30Z')], NOW);
    expect(groups.map((g) => g.label)).toEqual(['Today', 'Yesterday']);
  });
});

describe('formatClock', () => {
  it('formats 24-hour local time', () => {
    expect(formatClock('2026-11-16T08:52:00Z')).toBe('08:52');
    expect(formatClock('2026-11-16T17:05:00Z')).toBe('17:05');
  });
  it('returns empty for missing or bad dates', () => {
    expect(formatClock(null)).toBe('');
    expect(formatClock('nope')).toBe('');
  });
});

describe('activeFilterCount', () => {
  const base = { timeRange: DEFAULT_TIME_RANGE, topicsSelected: 6, topicsTotal: 6, sourcesSelected: null, sourcesTotal: 16 };
  it('is 0 with defaults', () => expect(activeFilterCount(base)).toBe(0));
  it('counts each changed group once', () => {
    expect(activeFilterCount({ ...base, timeRange: '24h' })).toBe(1);
    expect(activeFilterCount({ ...base, topicsSelected: 2 })).toBe(1);
    expect(activeFilterCount({ ...base, sourcesSelected: 3 })).toBe(1);
    expect(activeFilterCount({ ...base, timeRange: '30d', topicsSelected: 0, sourcesSelected: 0 })).toBe(3);
  });
  it('treats every source ticked as no filter', () => {
    expect(activeFilterCount({ ...base, sourcesSelected: 16 })).toBe(0);
  });
});

describe('feedHealth', () => {
  it('finds the latest pull and the unreachable sources', () => {
    expect(
      feedHealth([
        { name: 'A', last_status: 'OK', last_fetched_at: '2026-11-16T09:07:10Z' },
        { name: 'B', last_status: 'ERROR', last_fetched_at: '2026-11-16T09:07:40Z' },
        { name: 'C', last_status: null, last_fetched_at: null },
      ]),
    ).toEqual({ lastPullAt: '2026-11-16T09:07:40.000Z', unreachable: ['B'] });
  });
  it('handles no pulls yet', () => {
    expect(feedHealth([])).toEqual({ lastPullAt: null, unreachable: [] });
  });
});

describe('nextScheduledPull', () => {
  it('is later this hour when the minute has not passed', () => {
    expect(nextScheduledPull(new Date('2026-11-16T09:03:00Z')).toISOString()).toBe('2026-11-16T09:07:00.000Z');
  });
  it('rolls to the next hour once the minute has passed (or is now)', () => {
    expect(nextScheduledPull(new Date('2026-11-16T09:30:00Z')).toISOString()).toBe('2026-11-16T10:07:00.000Z');
    expect(nextScheduledPull(new Date('2026-11-16T09:07:00Z')).toISOString()).toBe('2026-11-16T10:07:00.000Z');
  });
  it('rolls over midnight', () => {
    expect(nextScheduledPull(new Date('2026-11-16T23:45:00Z')).toISOString()).toBe('2026-11-17T00:07:00.000Z');
  });
});
