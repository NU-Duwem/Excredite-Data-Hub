import { describe, expect, it } from 'vitest';
import { articleTime, myOpenTasks, summariseAlerts, timeAgo, weeklyTopicCounts, type OverviewTask } from '../overview';

const NOW = Date.parse('2026-11-17T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW - d * 86400000).toISOString();

describe('weeklyTopicCounts', () => {
  it('counts the last 7 days by topic, most covered first, Other last', () => {
    const counts = weeklyTopicCounts(
      [
        { published_at: daysAgo(1), topics: ['regulation'] },
        { published_at: daysAgo(2), topics: ['regulation', 'grid'] },
        { published_at: daysAgo(3), topics: [] },
        { published_at: daysAgo(3), topics: null },
        { published_at: daysAgo(4), topics: ['grid'] },
        { published_at: daysAgo(5), topics: ['regulation'] },
        { published_at: daysAgo(9), topics: ['renewables'] }, // too old
        { published_at: null, created_at: daysAgo(1), topics: ['nonsense'] }, // unknown topic -> Other
      ],
      NOW,
    );
    expect(counts.map((c) => [c.id, c.count])).toEqual([
      ['regulation', 3],
      ['grid', 2],
      ['other', 3],
    ]);
    expect(counts[0].label).toBe('Regulation & tariffs');
  });

  it('falls back to when the story was stored', () => {
    expect(articleTime({ published_at: null, created_at: daysAgo(1) })).toBe(NOW - 86400000);
    expect(articleTime({ published_at: null })).toBe(0);
  });
});

describe('myOpenTasks', () => {
  const t = (id: string, o: Partial<OverviewTask>): OverviewTask => ({ id, title: id, status: 'TODO', due: null, team: false, assigneeId: null, matterId: 'm', ...o });
  it('keeps my and whole-team open tasks, soonest first, undated last', () => {
    const tasks = [
      t('mine-late', { assigneeId: 'me', due: '2026-12-01' }),
      t('mine-soon', { assigneeId: 'me', due: '2026-11-10' }),
      t('team', { team: true, due: '2026-11-20' }),
      t('mine-undated', { assigneeId: 'me' }),
      t('done', { assigneeId: 'me', status: 'DONE', due: '2026-11-01' }),
      t('someone-else', { assigneeId: 'other', due: '2026-11-01' }),
    ];
    expect(myOpenTasks(tasks, 'me').map((x) => x.id)).toEqual(['mine-soon', 'team', 'mine-late', 'mine-undated']);
    expect(myOpenTasks(tasks, 'me', 2)).toHaveLength(2);
    expect(myOpenTasks(tasks, null).map((x) => x.id)).toEqual(['team']);
  });
});

describe('summariseAlerts and timeAgo', () => {
  it('counts severities', () => {
    expect(summariseAlerts([{ severity: 'CRITICAL' }, { severity: 'HIGH' }, { severity: 'HIGH' }, { severity: null }])).toEqual({ open: 4, critical: 1, high: 2 });
    expect(summariseAlerts([])).toEqual({ open: 0, critical: 0, high: 0 });
  });

  it('formats recent times', () => {
    expect(timeAgo(new Date(NOW - 20_000).toISOString(), NOW)).toBe('1m ago');
    expect(timeAgo(new Date(NOW - 5 * 60_000).toISOString(), NOW)).toBe('5m ago');
    expect(timeAgo(new Date(NOW - 3 * 3600_000).toISOString(), NOW)).toBe('3h ago');
    expect(timeAgo(daysAgo(10), NOW)).toBe('7 Nov');
    expect(timeAgo(null, NOW)).toBe('');
  });
});
