import { describe, expect, it } from 'vitest';
import {
  addDays,
  dateRange,
  draftToRow,
  filterTasks,
  groupByStatus,
  isDueThisWeek,
  isOverdue,
  jobProgress,
  localISODate,
  overdueCount,
  validateTaskDraft,
  type Task,
  type TaskDraft,
} from '../matterTasks';

const TODAY = '2026-11-16';

function task(over: Partial<Task>): Task {
  return {
    id: over.id ?? 't',
    matterId: 'm1',
    title: 'A task',
    notes: null,
    status: 'TODO',
    assigneeId: null,
    team: false,
    start: null,
    due: null,
    position: 0,
    createdAt: '2026-11-01T00:00:00Z',
    ...over,
  };
}

describe('dates', () => {
  it('formats local dates and adds days across month ends', () => {
    expect(localISODate(new Date(2026, 10, 6))).toBe('2026-11-06');
    expect(addDays('2026-11-28', 7)).toBe('2026-12-05');
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02');
  });

  it('marks a task overdue only when its due date has passed and it is not done', () => {
    expect(isOverdue(task({ due: '2026-11-15' }), TODAY)).toBe(true);
    expect(isOverdue(task({ due: '2026-11-16' }), TODAY)).toBe(false);
    expect(isOverdue(task({ due: '2026-11-15', status: 'DONE' }), TODAY)).toBe(false);
    expect(isOverdue(task({ due: null }), TODAY)).toBe(false);
  });

  it('counts due this week as today through seven days ahead', () => {
    expect(isDueThisWeek(task({ due: '2026-11-16' }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ due: '2026-11-23' }), TODAY)).toBe(true);
    expect(isDueThisWeek(task({ due: '2026-11-24' }), TODAY)).toBe(false);
    expect(isDueThisWeek(task({ due: '2026-11-15' }), TODAY)).toBe(false);
  });

  it('describes date ranges compactly', () => {
    expect(dateRange('2026-11-03', '2026-11-14', 2026)).toBe('3–14 Nov');
    expect(dateRange('2026-11-24', '2026-12-02', 2026)).toBe('24 Nov–2 Dec');
    expect(dateRange(null, '2026-12-12', 2026)).toBe('due 12 Dec');
    expect(dateRange('2026-12-01', null, 2026)).toBe('from 1 Dec');
    expect(dateRange(null, '2027-01-20', 2026)).toBe('due 20 Jan 2027');
    expect(dateRange('2026-12-12', '2026-12-12', 2026)).toBe('12 Dec');
    expect(dateRange(null, null, 2026)).toBe('');
  });
});

describe('filterTasks', () => {
  const tasks = [
    task({ id: 'mine', assigneeId: 'me', due: '2026-11-20' }),
    task({ id: 'team', team: true, due: '2026-11-10' }),
    task({ id: 'other', assigneeId: 'u2', matterId: 'm2' }),
    task({ id: 'unassigned', matterId: 'm2', due: '2026-12-20' }),
  ];
  const base = { matterId: null, who: 'everyone' as const, due: 'any' as const, me: 'me', today: TODAY };
  const ids = (ts: Task[]) => ts.map((t) => t.id);

  it('shows everything by default', () => {
    expect(ids(filterTasks(tasks, base))).toEqual(['mine', 'team', 'other', 'unassigned']);
  });

  it('narrows to one job', () => {
    expect(ids(filterTasks(tasks, { ...base, matterId: 'm2' }))).toEqual(['other', 'unassigned']);
  });

  it('"My tasks" includes whole-team tasks', () => {
    expect(ids(filterTasks(tasks, { ...base, who: 'me' }))).toEqual(['mine', 'team']);
  });

  it('"Whole team" shows only team tasks', () => {
    expect(ids(filterTasks(tasks, { ...base, who: 'team' }))).toEqual(['team']);
  });

  it('filters by due this week and overdue', () => {
    expect(ids(filterTasks(tasks, { ...base, due: 'week' }))).toEqual(['mine']);
    expect(ids(filterTasks(tasks, { ...base, due: 'overdue' }))).toEqual(['team']);
  });

  it('hides tasks of jobs that are not shown (e.g. closed) when viewing all jobs', () => {
    expect(ids(filterTasks(tasks, { ...base, visibleMatterIds: new Set(['m1']) }))).toEqual(['mine', 'team']);
  });

  it('"My tasks" with no signed-in user shows only team tasks', () => {
    expect(ids(filterTasks(tasks, { ...base, who: 'me', me: null }))).toEqual(['team']);
  });
});

describe('groupByStatus and progress', () => {
  it('puts each task in its column, overdue first then by due date', () => {
    const g = groupByStatus(
      [
        task({ id: 'late', due: '2026-11-01' }),
        task({ id: 'undated' }),
        task({ id: 'soon', due: '2026-11-20' }),
        task({ id: 'later', due: '2026-12-01' }),
        task({ id: 'doing', status: 'IN_PROGRESS' }),
        task({ id: 'done', status: 'DONE', due: '2026-11-01' }),
      ],
      TODAY,
    );
    expect(g.TODO.map((t) => t.id)).toEqual(['late', 'soon', 'later', 'undated']);
    expect(g.IN_PROGRESS.map((t) => t.id)).toEqual(['doing']);
    expect(g.IN_REVIEW).toEqual([]);
    expect(g.DONE.map((t) => t.id)).toEqual(['done']);
  });

  it('works out job progress and overdue counts', () => {
    const tasks = [
      task({ status: 'DONE' }),
      task({ status: 'DONE' }),
      task({ due: '2026-11-01' }),
      task({}),
      task({ matterId: 'm2', status: 'DONE' }),
    ];
    expect(jobProgress(tasks, 'm1')).toEqual({ done: 2, total: 4, pct: 50 });
    expect(jobProgress(tasks, 'none')).toEqual({ done: 0, total: 0, pct: 0 });
    expect(overdueCount(tasks, 'm1', TODAY)).toBe(1);
  });
});

describe('task form', () => {
  const draft: TaskDraft = { title: ' Draft memo ', matterId: 'm1', status: 'TODO', assignee: '', start: '', due: '', notes: '' };

  it('accepts a minimal task and builds the database row', () => {
    expect(validateTaskDraft(draft)).toEqual([]);
    expect(draftToRow(draft)).toEqual({
      title: 'Draft memo', matter_id: 'm1', status: 'TODO', assignee_id: null, assigned_to_team: false, start_date: null, due_date: null, notes: null,
    });
  });

  it('maps the assignee choice to a person or the whole team', () => {
    expect(draftToRow({ ...draft, assignee: 'team' })).toMatchObject({ assignee_id: null, assigned_to_team: true });
    expect(draftToRow({ ...draft, assignee: 'u-1' })).toMatchObject({ assignee_id: 'u-1', assigned_to_team: false });
  });

  it('rejects a missing title or job, and a due date before the start', () => {
    expect(validateTaskDraft({ ...draft, title: '  ', matterId: '' })).toHaveLength(2);
    expect(validateTaskDraft({ ...draft, start: '2026-12-02', due: '2026-12-01' })).toEqual(['The due date can’t be before the start date.']);
    expect(validateTaskDraft({ ...draft, start: '2026-12-01', due: '2026-12-01' })).toEqual([]);
  });
});
