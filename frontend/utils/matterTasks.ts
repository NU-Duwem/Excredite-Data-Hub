/**
 * Regulatory & Advisory work board: jobs (matters) and their tasks.
 * Pure helpers, so the page logic can be unit-tested.
 */

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  IN_REVIEW: 'In review',
  DONE: 'Done',
};

/** Values allowed by matters.check_matter_type, with readable labels. */
export const MATTER_TYPES: { value: string; label: string }[] = [
  { value: 'REGULATORY_ADVISORY', label: 'Regulatory advisory' },
  { value: 'TARIFF_DISPUTE', label: 'Tariff dispute' },
  { value: 'LICENSING', label: 'Licensing' },
  { value: 'LITIGATION', label: 'Litigation' },
  { value: 'ARBITRATION', label: 'Arbitration' },
  { value: 'OTHER', label: 'Other' },
];

/** Values allowed by matters.check_matter_status. */
export const MATTER_STATUSES: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'CLOSED', label: 'Closed' },
];

/** Roles that can see jobs and tasks, and roles that can change them (mirrors the RLS policies). */
export const MATTER_READ_ROLES = ['power_admin', 'power_ceo', 'power_legal', 'power_app'];
export const MATTER_WRITE_ROLES = ['power_admin', 'power_legal', 'power_app'];

export function matterTypeLabel(value: string | null | undefined): string {
  return MATTER_TYPES.find((t) => t.value === value)?.label ?? (value ? value.replace(/_/g, ' ').toLowerCase() : '');
}

export function matterStatusLabel(value: string | null | undefined): string {
  return MATTER_STATUSES.find((s) => s.value === value)?.label ?? (value ?? '');
}

export type Job = {
  id: string;
  ref: string | null;
  title: string;
  type: string;
  status: string;
  client: string | null;
  clientId: string | null;
  leadUserId: string | null;
  leadName: string | null; // free-text lead from older records
  opened: string | null; // YYYY-MM-DD
  closed: string | null;
  deadline: string | null;
  notes: string | null;
};

export type Task = {
  id: string;
  matterId: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  assigneeId: string | null;
  team: boolean; // assigned to the whole team
  start: string | null; // YYYY-MM-DD
  due: string | null;
  position: number;
  createdAt: string;
};

export type Person = { id: string; name: string; role: string };

export type WhoFilter = 'everyone' | 'me' | 'team';
export type DueFilter = 'any' | 'week' | 'overdue';

/** Today's date as YYYY-MM-DD in local time. */
export function localISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return localISODate(new Date(y, m - 1, d + days));
}

export function isOverdue(task: Pick<Task, 'due' | 'status'>, today: string): boolean {
  return !!task.due && task.status !== 'DONE' && task.due < today;
}

export function isDueThisWeek(task: Pick<Task, 'due' | 'status'>, today: string): boolean {
  return !!task.due && task.status !== 'DONE' && task.due >= today && task.due <= addDays(today, 7);
}

export function filterTasks(
  tasks: Task[],
  opts: { matterId: string | null; who: WhoFilter; due: DueFilter; me: string | null; today: string; visibleMatterIds?: Set<string> },
): Task[] {
  return tasks.filter((t) => {
    if (opts.matterId && t.matterId !== opts.matterId) return false;
    if (!opts.matterId && opts.visibleMatterIds && !opts.visibleMatterIds.has(t.matterId)) return false;
    if (opts.who === 'me' && (!opts.me || t.assigneeId !== opts.me) && !t.team) return false;
    if (opts.who === 'team' && !t.team) return false;
    if (opts.due === 'week' && !isDueThisWeek(t, opts.today)) return false;
    if (opts.due === 'overdue' && !isOverdue(t, opts.today)) return false;
    return true;
  });
}

/** Overdue first, then by due date (undated last), then by position and age. */
export function sortTasks(tasks: Task[], today: string): Task[] {
  return [...tasks].sort((a, b) => {
    const oa = isOverdue(a, today) ? 0 : 1;
    const ob = isOverdue(b, today) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    if (a.due !== b.due) return a.due === null ? 1 : b.due === null ? -1 : a.due < b.due ? -1 : 1;
    if (a.position !== b.position) return a.position - b.position;
    return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0;
  });
}

export function groupByStatus(tasks: Task[], today: string): Record<TaskStatus, Task[]> {
  const out = { TODO: [], IN_PROGRESS: [], IN_REVIEW: [], DONE: [] } as Record<TaskStatus, Task[]>;
  for (const t of sortTasks(tasks, today)) out[t.status].push(t);
  return out;
}

export function jobProgress(tasks: Task[], matterId: string): { done: number; total: number; pct: number } {
  const mine = tasks.filter((t) => t.matterId === matterId);
  const done = mine.filter((t) => t.status === 'DONE').length;
  return { done, total: mine.length, pct: mine.length ? Math.round((done / mine.length) * 100) : 0 };
}

export function overdueCount(tasks: Task[], matterId: string, today: string): number {
  return tasks.filter((t) => t.matterId === matterId && isOverdue(t, today)).length;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Dec", or "12 Dec 2027" when not in `currentYear`. */
export function shortDate(iso: string, currentYear: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${y !== currentYear ? ` ${y}` : ''}`;
}

/** "3–14 Nov", "24 Nov–2 Dec", "due 12 Dec", "from 1 Dec", or "" when undated. */
export function dateRange(start: string | null, due: string | null, currentYear: number): string {
  if (start && due) {
    if (start === due) return shortDate(due, currentYear);
    const [sy, sm] = start.split('-').map(Number);
    const [dy, dm] = due.split('-').map(Number);
    if (sy === dy && sm === dm) return `${Number(start.slice(8))}–${shortDate(due, currentYear)}`;
    return `${shortDate(start, currentYear)}–${shortDate(due, currentYear)}`;
  }
  if (due) return `due ${shortDate(due, currentYear)}`;
  if (start) return `from ${shortDate(start, currentYear)}`;
  return '';
}

export type TaskDraft = {
  title: string;
  matterId: string;
  status: TaskStatus;
  assignee: string; // '' = unassigned, 'team' = whole team, otherwise a user id
  start: string;
  due: string;
  notes: string;
};

/** Problems with a task form, or [] when it can be saved. */
export function validateTaskDraft(d: TaskDraft): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push('Give the task a title.');
  if (d.title.trim().length > 300) errors.push('Keep the title under 300 characters.');
  if (!d.matterId) errors.push('Choose the job this task belongs to.');
  if (d.start && d.due && d.due < d.start) errors.push('The due date can’t be before the start date.');
  if (d.notes.length > 4000) errors.push('Keep notes under 4,000 characters.');
  return errors;
}

/** The row to insert or update in public.matter_tasks for a form draft. */
export function draftToRow(d: TaskDraft) {
  return {
    title: d.title.trim(),
    matter_id: d.matterId,
    status: d.status,
    assignee_id: d.assignee && d.assignee !== 'team' ? d.assignee : null,
    assigned_to_team: d.assignee === 'team',
    start_date: d.start || null,
    due_date: d.due || null,
    notes: d.notes.trim() || null,
  };
}
