/**
 * Pure helpers for the Overview page. Everything here works on data the team
 * and the news feeds update every day (news, alerts, tasks, documents),
 * not on generation data, which isn't regularly available.
 */
import { TOPIC_LABELS, type TopicId } from './news/topics';

export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Dated = { published_at: string | null; created_at?: string | null };

/** When an article counts as published: its own date, or when we stored it. */
export function articleTime(a: Dated): number {
  const t = Date.parse(a.published_at ?? a.created_at ?? '');
  return Number.isNaN(t) ? 0 : t;
}

/** Stories per topic over the last 7 days, most covered first ("Other" last). */
export function weeklyTopicCounts(
  articles: (Dated & { topics: string[] | null })[],
  now = Date.now(),
): { id: TopicId; label: string; count: number }[] {
  const counts = new Map<TopicId, number>();
  for (const a of articles) {
    if (now - articleTime(a) > WEEK_MS) continue;
    const topics = a.topics?.length ? a.topics : ['other'];
    for (const t of topics) {
      const id = (t in TOPIC_LABELS ? t : 'other') as TopicId;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([id, count]) => ({ id, label: TOPIC_LABELS[id], count }))
    .sort((a, b) => (a.id === 'other' ? 1 : b.id === 'other' ? -1 : b.count - a.count));
}

export type OverviewTask = {
  id: string;
  title: string;
  status: string;
  due: string | null;
  team: boolean;
  assigneeId: string | null;
  matterId: string;
};

/** Open tasks for this person (assigned to them or the whole team): overdue first, then by due date, undated last. */
export function myOpenTasks(tasks: OverviewTask[], me: string | null, limit = 4): OverviewTask[] {
  return tasks
    .filter((t) => t.status !== 'DONE' && (t.team || (!!me && t.assigneeId === me)))
    .sort((a, b) => (a.due ?? '9999-12-31').localeCompare(b.due ?? '9999-12-31'))
    .slice(0, limit);
}

export type AlertSummary = { open: number; critical: number; high: number };

export function summariseAlerts(alerts: { severity: string | null }[]): AlertSummary {
  return {
    open: alerts.length,
    critical: alerts.filter((a) => a.severity === 'CRITICAL').length,
    high: alerts.filter((a) => a.severity === 'HIGH').length,
  };
}

/** "5m ago", "3h ago", "2 Nov" */
export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const mins = Math.round((now - t) / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
