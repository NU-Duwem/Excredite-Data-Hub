'use client';

import Avatar from '@/app/components/Avatar';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  MATTER_READ_ROLES,
  MATTER_STATUSES,
  MATTER_TYPES,
  MATTER_WRITE_ROLES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  dateRange,
  draftToRow,
  filterTasks,
  groupByStatus,
  isOverdue,
  jobProgress,
  localISODate,
  matterStatusLabel,
  matterTypeLabel,
  overdueCount,
  shortDate,
  validateTaskDraft,
  type DueFilter,
  type Job,
  type Person,
  type Task,
  type TaskDraft,
  type TaskStatus,
  type WhoFilter,
} from '@/utils/matterTasks';

type Org = { id: string; name: string };
type Doc = { id: string; title: string; document_type: string | null; created_at: string };
type Status = { kind: 'ok' | 'error'; text: string } | null;

type JobDraft = {
  title: string;
  clientId: string;
  ref: string;
  type: string;
  status: string;
  leadUserId: string;
  opened: string;
  deadline: string;
  notes: string;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase rows are untyped in this project */
function toJob(m: any): Job {
  const org = Array.isArray(m.organisations) ? m.organisations[0] : m.organisations;
  return {
    id: m.id,
    ref: m.matter_reference,
    title: m.title,
    type: m.matter_type,
    status: m.status,
    client: org?.short_name || org?.name || null,
    clientId: m.client_id,
    leadUserId: m.lead_user_id,
    leadName: m.lead_counsel,
    opened: m.date_opened,
    closed: m.date_closed,
    deadline: m.next_deadline,
    notes: m.notes,
  };
}

function toTask(t: any): Task {
  return {
    id: t.id,
    matterId: t.matter_id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    assigneeId: t.assignee_id,
    team: t.assigned_to_team,
    start: t.start_date,
    due: t.due_date,
    position: t.position ?? 0,
    createdAt: t.created_at,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const MATTER_COLUMNS =
  'id, matter_reference, matter_type, title, status, lead_counsel, lead_user_id, date_opened, date_closed, next_deadline, notes, client_id, organisations(short_name, name)';
const TASK_COLUMNS = 'id, matter_id, title, notes, status, assignee_id, assigned_to_team, start_date, due_date, position, created_at';

const inputCls =
  'w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand';
const labelCls = 'block text-xs font-bold text-gray-700 mb-1';
const chipBase = 'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold whitespace-nowrap';

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus the first editable field; for read-only views, the dialog itself (so Escape still works).
    const field = ref.current?.querySelector<HTMLElement>('input:not(:disabled), select:not(:disabled), textarea:not(:disabled)');
    (field ?? ref.current)?.focus();
  }, []);
  // Escape closes the dialog even when focus has left it (e.g. the clicked button was replaced).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
        className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-2xl shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 pt-5">
          <h2 id="modal-title" className="text-lg font-extrabold text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-10 min-w-10 rounded-lg text-gray-600 hover:bg-gray-100 text-xl leading-none">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatusBanner({ status, onClose }: { status: Status; onClose: () => void }) {
  if (!status) return null;
  return (
    <div role={status.kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${status.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-brand/10 text-brand'}`}>
      <span>{status.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss" className="text-current/70 hover:text-current">×</button>
    </div>
  );
}

export default function MattersPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [today, setToday] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [status, setStatus] = useState<Status>(null);

  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [who, setWho] = useState<WhoFilter>('everyone');
  const [due, setDue] = useState<DueFilter>('any');
  const [showClosed, setShowClosed] = useState(false);

  const [taskDraft, setTaskDraft] = useState<(TaskDraft & { id?: string }) | null>(null);
  const [taskErrors, setTaskErrors] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [jobDraft, setJobDraft] = useState<(JobDraft & { id?: string }) | null>(null);
  const [jobError, setJobError] = useState('');
  const [saving, setSaving] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null);

  // Roles decide access, plus a per-person grant (20_matter_access.sql) that lets
  // someone see everything and work on tasks, but not create or edit jobs.
  const [hasGrant, setHasGrant] = useState(false);
  const canRead = (!!role && MATTER_READ_ROLES.includes(role)) || hasGrant;
  const canEdit = !!role && MATTER_WRITE_ROLES.includes(role); // jobs
  const canWorkTasks = canEdit || hasGrant;

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const [{ data: profile }, { data: grant }] = user
      ? await Promise.all([
          supabase.from('user_profiles').select('role').eq('id', user.id).single(),
          supabase.from('matter_access_grants').select('user_id').eq('user_id', user.id).maybeSingle(),
        ])
      : [{ data: null }, { data: null }];
    const [m, t, p, o] = await Promise.all([
      supabase.from('matters').select(MATTER_COLUMNS).is('deleted_at', null).order('created_at', { ascending: true }),
      supabase.from('matter_tasks').select(TASK_COLUMNS),
      supabase.rpc('list_matter_people'),
      supabase.from('organisations').select('id, short_name, name').is('deleted_at', null).order('short_name'),
    ]);
    setMe(user?.id ?? null);
    setRole(profile?.role ?? null);
    setHasGrant(!!grant);
    setToday(localISODate(new Date()));
    setJobs((m.data ?? []).map(toJob));
    setTasks((t.data ?? []).map(toTask));
    setPeople(((p.data ?? []) as { id: string; full_name: string; role: string; avatar_path: string | null }[]).map((x) => ({ id: x.id, name: x.full_name, role: x.role, avatarPath: x.avatar_path })));
    setOrgs(((o.data ?? []) as { id: string; short_name: string | null; name: string | null }[]).map((x) => ({ id: x.id, name: x.short_name || x.name || 'Unnamed' })));
    const err = m.error || t.error;
    if (err) setStatus({ kind: 'error', text: `Couldn’t load the board: ${err.message}` });
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  // Related documents for the selected job
  useEffect(() => {
    if (!selectedJobId) return;
    let live = true;
    supabase
      .from('documents')
      .select('id, title, document_type, created_at')
      .eq('matter_id', selectedJobId)
      .order('created_at', { ascending: false })
      .limit(6)
      .then(({ data }) => {
        if (live) setDocs((data ?? []) as Doc[]);
      });
    return () => {
      live = false;
    };
  }, [selectedJobId, supabase]);

  const personName = useCallback((id: string | null) => people.find((p) => p.id === id)?.name ?? null, [people]);
  const year = today ? Number(today.slice(0, 4)) : new Date(0).getFullYear();

  const shownJobs = jobs.filter((j) => showClosed || j.status !== 'CLOSED');
  const selectedJob = jobs.find((j) => j.id === selectedJobId) ?? null;
  const visibleMatterIds = new Set(shownJobs.map((j) => j.id));
  const filtered = filterTasks(tasks, { matterId: selectedJobId, who, due, me, today, visibleMatterIds });
  const columns = groupByStatus(filtered, today);
  const allOverdue = tasks.filter((t) => visibleMatterIds.has(t.matterId) && isOverdue(t, today)).length;

  /* ---------- tasks ---------- */

  const openNewTask = (statusFor: TaskStatus = 'TODO') => {
    setTaskErrors([]);
    setConfirmDelete(false);
    setTaskDraft({
      title: '',
      matterId: selectedJobId ?? shownJobs[0]?.id ?? '',
      status: statusFor,
      assignee: '',
      start: '',
      due: '',
      notes: '',
    });
  };

  const openTask = (t: Task) => {
    setTaskErrors([]);
    setConfirmDelete(false);
    setTaskDraft({
      id: t.id,
      title: t.title,
      matterId: t.matterId,
      status: t.status,
      assignee: t.team ? 'team' : t.assigneeId ?? '',
      start: t.start ?? '',
      due: t.due ?? '',
      notes: t.notes ?? '',
    });
  };

  const saveTask = async () => {
    if (!taskDraft) return;
    const errors = validateTaskDraft(taskDraft);
    setTaskErrors(errors);
    if (errors.length) return;
    setSaving(true);
    const row = draftToRow(taskDraft);
    const res = taskDraft.id
      ? await supabase.from('matter_tasks').update(row).eq('id', taskDraft.id).select(TASK_COLUMNS).single()
      : await supabase
          .from('matter_tasks')
          .insert({ ...row, position: tasks.filter((t) => t.matterId === row.matter_id && t.status === row.status).length })
          .select(TASK_COLUMNS)
          .single();
    setSaving(false);
    if (res.error || !res.data) {
      setTaskErrors([`Couldn’t save the task: ${res.error?.message ?? 'no row returned'}`]);
      return;
    }
    const saved = toTask(res.data);
    setTasks((prev) => (taskDraft.id ? prev.map((t) => (t.id === saved.id ? saved : t)) : [...prev, saved]));
    setTaskDraft(null);
    setStatus({ kind: 'ok', text: taskDraft.id ? 'Task updated.' : 'Task added.' });
  };

  const deleteTask = async () => {
    if (!taskDraft?.id) return;
    setSaving(true);
    const { error } = await supabase.from('matter_tasks').delete().eq('id', taskDraft.id);
    setSaving(false);
    if (error) {
      setTaskErrors([`Couldn’t delete the task: ${error.message}`]);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== taskDraft.id));
    setTaskDraft(null);
    setStatus({ kind: 'ok', text: 'Task deleted.' });
  };

  const moveTask = async (id: string, to: TaskStatus) => {
    const before = tasks.find((t) => t.id === id);
    if (!before || before.status === to) return;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, status: to } : t)));
    const { error } = await supabase.from('matter_tasks').update({ status: to }).eq('id', id);
    if (error) {
      setTasks((prev) => prev.map((t) => (t.id === id ? before : t)));
      setStatus({ kind: 'error', text: `Couldn’t move the task: ${error.message}` });
    }
  };

  /* ---------- jobs ---------- */

  const openNewJob = () => {
    setJobError('');
    setJobDraft({ title: '', clientId: '', ref: '', type: 'REGULATORY_ADVISORY', status: 'ACTIVE', leadUserId: me && people.some((p) => p.id === me) ? me : '', opened: today, deadline: '', notes: '' });
  };

  const openEditJob = (j: Job) => {
    setJobError('');
    setJobDraft({
      id: j.id,
      title: j.title,
      clientId: j.clientId ?? '',
      ref: j.ref ?? '',
      type: j.type,
      status: j.status,
      leadUserId: j.leadUserId ?? '',
      opened: j.opened ?? today,
      deadline: j.deadline ?? '',
      notes: j.notes ?? '',
    });
  };

  const saveJob = async () => {
    if (!jobDraft) return;
    if (!jobDraft.title.trim()) return setJobError('Give the job a title.');
    if (!jobDraft.clientId) return setJobError('Choose the client.');
    if (jobDraft.deadline && jobDraft.opened && jobDraft.deadline < jobDraft.opened) return setJobError('The deadline can’t be before the date the job was opened.');
    const existing = jobDraft.id ? jobs.find((j) => j.id === jobDraft.id) : null;
    const closing = jobDraft.status === 'CLOSED';
    const closedOn = closing ? existing?.closed ?? (today < (jobDraft.opened || today) ? jobDraft.opened : today) : null;
    const row = {
      title: jobDraft.title.trim(),
      client_id: jobDraft.clientId,
      matter_reference: jobDraft.ref.trim() || null,
      matter_type: jobDraft.type,
      status: jobDraft.status,
      lead_user_id: jobDraft.leadUserId || null,
      lead_counsel: personName(jobDraft.leadUserId || null) ?? existing?.leadName ?? null,
      date_opened: jobDraft.opened || today,
      date_closed: closedOn,
      next_deadline: jobDraft.deadline || null,
      notes: jobDraft.notes.trim() || null,
    };
    setSaving(true);
    const res = jobDraft.id
      ? await supabase.from('matters').update(row).eq('id', jobDraft.id).select(MATTER_COLUMNS).single()
      : await supabase.from('matters').insert(row).select(MATTER_COLUMNS).single();
    setSaving(false);
    if (res.error || !res.data) return setJobError(`Couldn’t save the job: ${res.error?.message ?? 'no row returned'}`);
    const saved = toJob(res.data);
    setJobs((prev) => (jobDraft.id ? prev.map((j) => (j.id === saved.id ? saved : j)) : [...prev, saved]));
    if (!jobDraft.id) setSelectedJobId(saved.id);
    setJobDraft(null);
    setStatus({ kind: 'ok', text: jobDraft.id ? 'Job updated.' : 'Job created. Add its tasks next.' });
  };

  /* ---------- render ---------- */

  if (loading) {
    return (
      <main className="flex-1 p-6">
        <p className="text-sm text-gray-600" role="status">Loading the board…</p>
      </main>
    );
  }

  if (!canRead) {
    return (
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-xl bg-white rounded-2xl p-8">
          <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Regulatory &amp; Advisory</h1>
          <p className="mt-2 text-sm text-gray-700">This board is open to the legal team, the CEO and admins. Ask an admin if you need access.</p>
        </div>
      </main>
    );
  }

  const whoOptions: { value: WhoFilter; label: string }[] = [
    { value: 'everyone', label: 'Everyone' },
    { value: 'me', label: 'My tasks' },
    { value: 'team', label: 'Whole team' },
  ];

  const assigneeChip = (t: Task) => {
    if (t.team) return <span className={`${chipBase} bg-gray-900 text-white`}>Whole team</span>;
    const name = personName(t.assigneeId);
    if (name)
      return (
        <span className={`${chipBase} bg-gray-100 text-gray-800 inline-flex items-center gap-1.5 pl-0.5`}>
          <Avatar name={name} path={people.find((p) => p.id === t.assigneeId)?.avatarPath} size={18} tone="bg-brand/15 text-brand" />
          {t.assigneeId === me ? `${name} (you)` : name}
        </span>
      );
    if (t.assigneeId) return <span className={`${chipBase} bg-gray-100 text-gray-600`}>Former member</span>;
    return <span className={`${chipBase} border border-dashed border-gray-300 text-gray-600`}>Unassigned</span>;
  };

  const jobCard = (
    key: string,
    pressed: boolean,
    onClick: () => void,
    top: React.ReactNode,
    titleText: string,
    sub: string,
    pct: number,
    flag: string,
  ) => (
    <button
      key={key}
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`flex-none w-[230px] text-left rounded-2xl bg-white px-3.5 py-3 flex flex-col gap-1 border-2 transition-colors ${pressed ? 'border-brand' : 'border-transparent hover:border-gray-200'}`}
    >
      <span className="flex justify-between gap-2 text-[11px]">
        <span className="font-mono font-medium text-gray-600 truncate">{top}</span>
        {flag && <span className="font-bold text-red-700 whitespace-nowrap">{flag}</span>}
      </span>
      <span className="text-sm font-bold text-gray-900 leading-snug line-clamp-2">{titleText}</span>
      <span className="text-xs text-gray-600 truncate">{sub}</span>
      <span className="mt-1 block h-[5px] rounded-full bg-gray-100 overflow-hidden">
        <span className="block h-full bg-brand rounded-full" style={{ width: `${pct}%` }} />
      </span>
    </button>
  );

  const allProgress = (() => {
    const shown = tasks.filter((t) => visibleMatterIds.has(t.matterId));
    const done = shown.filter((t) => t.status === 'DONE').length;
    return { total: shown.length, pct: shown.length ? Math.round((done / shown.length) * 100) : 0 };
  })();

  return (
    <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-2.5">
          <h1 className="mr-2 text-2xl font-extrabold tracking-tight text-gray-900">Regulatory &amp; Advisory</h1>
          <div role="group" aria-label="Assigned to" className="flex gap-1 bg-white rounded-xl p-1">
            {whoOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                aria-pressed={who === o.value}
                onClick={() => setWho(o.value)}
                className={`min-h-9 px-3 rounded-[9px] text-[13px] font-semibold ${who === o.value ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-50'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <label htmlFor="due-filter" className="sr-only">Due</label>
          <select id="due-filter" value={due} onChange={(e) => setDue(e.target.value as DueFilter)} className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] font-semibold outline-none focus:ring-2 focus:ring-brand">
            <option value="any">Any due date</option>
            <option value="week">Due this week</option>
            <option value="overdue">Overdue</option>
          </select>
          <label className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl bg-white text-[13px] font-semibold text-gray-700 cursor-pointer">
            <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Show closed jobs
          </label>
          {canEdit && (
            <div className="ml-auto flex gap-2">
              <button type="button" onClick={openNewJob} className="min-h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50">
                New job
              </button>
              <button type="button" onClick={() => openNewTask()} disabled={shownJobs.length === 0} className="min-h-11 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50">
                Add task
              </button>
            </div>
          )}
        </header>

        <StatusBanner status={status} onClose={() => setStatus(null)} />

        <section aria-label="Jobs" className="flex gap-2.5 overflow-x-auto pb-1">
          {jobCard(
            'all',
            selectedJobId === null,
            () => setSelectedJobId(null),
            'ALL JOBS',
            shownJobs.length === 1 ? 'The current job' : 'Every current job',
            `${shownJobs.length} job${shownJobs.length === 1 ? '' : 's'} · ${allProgress.total} task${allProgress.total === 1 ? '' : 's'}`,
            allProgress.pct,
            allOverdue ? `${allOverdue} overdue` : '',
          )}
          {shownJobs.map((j) => {
            const p = jobProgress(tasks, j.id);
            const late = overdueCount(tasks, j.id, today);
            const deadline = j.status === 'CLOSED' ? 'closed' : j.deadline ? `due ${shortDate(j.deadline, year)}` : 'no deadline';
            return jobCard(
              j.id,
              selectedJobId === j.id,
              () => setSelectedJobId(j.id),
              j.ref || matterTypeLabel(j.type),
              j.title,
              `${j.client ?? 'No client'} · ${deadline} · ${p.done}/${p.total}`,
              p.pct,
              late ? `${late} overdue` : j.status === 'ON_HOLD' ? 'On hold' : '',
            );
          })}
        </section>

        {shownJobs.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center">
            <p className="text-sm font-semibold text-gray-900">No current jobs.</p>
            <p className="mt-1 text-sm text-gray-600">{canEdit ? 'Create a job, then add its tasks.' : 'Jobs the firm takes on will appear here.'}</p>
          </div>
        )}

        {selectedJob && (
          <section aria-label="Job details" className="bg-white rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-mono text-xs text-gray-600">
                  {[selectedJob.ref, matterTypeLabel(selectedJob.type)].filter(Boolean).join(' · ')}
                </p>
                <h2 className="mt-0.5 text-lg font-extrabold text-gray-900">{selectedJob.title}</h2>
                <p className="text-sm text-gray-700">Client: {selectedJob.client ?? '—'}</p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <button type="button" onClick={() => openEditJob(selectedJob)} className="min-h-10 px-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 hover:bg-gray-50">
                    Edit job
                  </button>
                  <button type="button" onClick={() => openNewTask()} className="min-h-10 px-3.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover">
                    Add task to this job
                  </button>
                </div>
              )}
            </div>
            <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Status</dt><dd className="mt-0.5 font-semibold text-gray-900">{matterStatusLabel(selectedJob.status)}</dd></div>
              <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Lead</dt><dd className="mt-0.5 font-semibold text-gray-900 flex items-center gap-2">{personName(selectedJob.leadUserId) && <Avatar name={personName(selectedJob.leadUserId)} path={people.find((p) => p.id === selectedJob.leadUserId)?.avatarPath} size={22} />}{personName(selectedJob.leadUserId) ?? selectedJob.leadName ?? '—'}</dd></div>
              <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Opened</dt><dd className="mt-0.5 font-semibold text-gray-900">{selectedJob.opened ? shortDate(selectedJob.opened, year) : '—'}</dd></div>
              <div>
                <dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">{selectedJob.status === 'CLOSED' ? 'Closed' : 'Deadline'}</dt>
                <dd className={`mt-0.5 font-semibold ${selectedJob.status !== 'CLOSED' && selectedJob.deadline && selectedJob.deadline < today ? 'text-red-700' : 'text-gray-900'}`}>
                  {selectedJob.status === 'CLOSED' ? (selectedJob.closed ? shortDate(selectedJob.closed, year) : '—') : selectedJob.deadline ? shortDate(selectedJob.deadline, year) : '—'}
                </dd>
              </div>
            </dl>
            {selectedJob.notes && <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedJob.notes}</p>}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Documents</span>
              {docs.length === 0 ? (
                <span className="text-gray-600">None linked to this job yet.</span>
              ) : (
                docs.map((d) => (
                  <Link key={d.id} href="/documents?tab=view-document" className="px-2.5 py-1 rounded-lg bg-gray-50 border border-gray-200 text-gray-900 font-medium hover:bg-gray-100">
                    {d.title}
                  </Link>
                ))
              )}
            </div>
          </section>
        )}

        {shownJobs.length > 0 && (
          <section aria-label="Tasks by status" className="grid grid-flow-col auto-cols-[minmax(250px,1fr)] gap-3 overflow-x-auto pb-2 items-start">
            {TASK_STATUSES.map((s) => (
              <div
                key={s}
                onDragOver={(e) => {
                  if (!canWorkTasks) return;
                  e.preventDefault();
                  setDragOver(s);
                }}
                onDragLeave={() => setDragOver((d) => (d === s ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(null);
                  const id = e.dataTransfer.getData('text/plain');
                  if (id) void moveTask(id, s);
                }}
                className={`rounded-2xl p-2.5 flex flex-col gap-2 transition-colors ${dragOver === s ? 'bg-brand/15 ring-2 ring-brand/40' : 'bg-[#e4e8e1]'}`}
              >
                <h2 className="px-1.5 pt-1 flex justify-between text-[13px] font-extrabold text-gray-900">
                  <span>{TASK_STATUS_LABELS[s]}</span>
                  <span className="font-mono font-medium text-gray-700">{columns[s].length}</span>
                </h2>
                {/* Long columns scroll inside themselves, with a visible scroll bar, so "+ Add task" stays in view. */}
                <ul className="scroll-panel scroll-panel-strong flex flex-col gap-2 max-h-[min(60vh,640px)] -mr-1.5 pr-0.5" aria-label={TASK_STATUS_LABELS[s]}>
                  {columns[s].map((t) => {
                    const job = jobs.find((j) => j.id === t.matterId);
                    const late = isOverdue(t, today);
                    const when = dateRange(t.start, t.due, year);
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          draggable={canWorkTasks}
                          onDragStart={(e) => {
                            e.dataTransfer.setData('text/plain', t.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          onClick={() => openTask(t)}
                          className="w-full text-left bg-white rounded-[14px] p-3 flex flex-col gap-2 shadow-[0_1px_2px_rgba(20,32,26,0.06)] hover:shadow-md transition-shadow"
                        >
                          {!selectedJobId && job && (
                            <span className={`${chipBase} self-start bg-brand/10 text-brand max-w-full truncate`}>{job.ref || job.title}</span>
                          )}
                          <span className={`text-sm font-bold leading-snug ${s === 'DONE' ? 'text-gray-600 line-through decoration-gray-400' : 'text-gray-900'}`}>{t.title}</span>
                          <span className="flex flex-wrap items-center justify-between gap-2">
                            {assigneeChip(t)}
                            {when && (
                              <span className={`font-mono text-xs whitespace-nowrap ${late ? 'text-red-700 font-bold' : 'text-gray-700'}`}>
                                {late ? `was ${when}` : when}
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {columns[s].length === 0 && <p className="px-1.5 py-2 text-xs text-gray-700">Nothing here.</p>}
                {canWorkTasks && (
                  <button type="button" onClick={() => openNewTask(s)} aria-label={`Add task to ${TASK_STATUS_LABELS[s]}`} className="min-h-10 rounded-xl border border-dashed border-gray-400 text-[13px] font-semibold text-gray-800 hover:bg-white/60">
                    + Add task
                  </button>
                )}
              </div>
            ))}
          </section>
        )}
        {canWorkTasks && shownJobs.length > 0 && (
          <p className="text-xs text-gray-600">Drag a card to another column to change its status, or open it to edit.</p>
        )}
      </div>

      {taskDraft && (
        <Modal title={taskDraft.id ? (canWorkTasks ? 'Edit task' : 'Task') : 'Add task'} onClose={() => setTaskDraft(null)}>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void saveTask();
            }}
            className="px-6 pb-6 pt-4 flex flex-col gap-4"
          >
            <fieldset disabled={!canWorkTasks || saving} className="flex flex-col gap-4">
              <div>
                <label htmlFor="task-title" className={labelCls}>Task</label>
                <input id="task-title" value={taskDraft.title} maxLength={300} onChange={(e) => setTaskDraft({ ...taskDraft, title: e.target.value })} className={inputCls} placeholder="e.g. Draft the tariff application" />
              </div>
              <div>
                <label htmlFor="task-job" className={labelCls}>Job</label>
                <select id="task-job" value={taskDraft.matterId} onChange={(e) => setTaskDraft({ ...taskDraft, matterId: e.target.value })} className={inputCls}>
                  <option value="">Choose a job…</option>
                  {jobs.filter((j) => j.status !== 'CLOSED' || j.id === taskDraft.matterId).map((j) => (
                    <option key={j.id} value={j.id}>{j.ref ? `${j.ref} · ${j.title}` : j.title}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="task-who" className={labelCls}>Assigned to</label>
                  <select id="task-who" value={taskDraft.assignee} onChange={(e) => setTaskDraft({ ...taskDraft, assignee: e.target.value })} className={inputCls}>
                    <option value="">Unassigned</option>
                    <option value="team">Whole team</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (you)` : p.name}</option>
                    ))}
                    {taskDraft.assignee && taskDraft.assignee !== 'team' && !people.some((p) => p.id === taskDraft.assignee) && (
                      <option value={taskDraft.assignee}>Former member</option>
                    )}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-status" className={labelCls}>Status</label>
                  <select id="task-status" value={taskDraft.status} onChange={(e) => setTaskDraft({ ...taskDraft, status: e.target.value as TaskStatus })} className={inputCls}>
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="task-start" className={labelCls}>Start</label>
                  <input id="task-start" type="date" value={taskDraft.start} onChange={(e) => setTaskDraft({ ...taskDraft, start: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="task-due" className={labelCls}>Due</label>
                  <input id="task-due" type="date" value={taskDraft.due} min={taskDraft.start || undefined} onChange={(e) => setTaskDraft({ ...taskDraft, due: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="task-notes" className={labelCls}>Notes</label>
                <textarea id="task-notes" rows={3} maxLength={4000} value={taskDraft.notes} onChange={(e) => setTaskDraft({ ...taskDraft, notes: e.target.value })} className={`${inputCls} py-2.5`} />
              </div>
            </fieldset>
            {taskErrors.length > 0 && (
              <ul role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 list-disc pl-8">
                {taskErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            {canWorkTasks && (
              <div className="flex flex-wrap items-center gap-2">
                {taskDraft.id &&
                  (confirmDelete ? (
                    <>
                      <button type="button" onClick={() => void deleteTask()} disabled={saving} className="min-h-11 px-4 rounded-xl bg-red-700 text-white text-sm font-semibold">Delete for good</button>
                      <button type="button" onClick={() => setConfirmDelete(false)} className="min-h-11 px-3 rounded-xl text-sm font-semibold text-gray-700">Keep it</button>
                    </>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)} className="min-h-11 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-red-700 hover:bg-red-50">Delete</button>
                  ))}
                <button type="submit" disabled={saving} className="ml-auto min-h-11 px-5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50">
                  {saving ? 'Saving…' : taskDraft.id ? 'Save task' : 'Add task'}
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}

      {jobDraft && (
        <Modal title={jobDraft.id ? 'Edit job' : 'New job'} onClose={() => setJobDraft(null)}>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void saveJob();
            }}
            className="px-6 pb-6 pt-4 flex flex-col gap-4"
          >
            <fieldset disabled={saving} className="flex flex-col gap-4">
              <div>
                <label htmlFor="job-title" className={labelCls}>Job</label>
                <input id="job-title" value={jobDraft.title} onChange={(e) => setJobDraft({ ...jobDraft, title: e.target.value })} className={inputCls} placeholder="e.g. MYTO minor review application" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="job-client" className={labelCls}>Client</label>
                  <select id="job-client" value={jobDraft.clientId} onChange={(e) => setJobDraft({ ...jobDraft, clientId: e.target.value })} className={inputCls}>
                    <option value="">Choose a client…</option>
                    {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="job-ref" className={labelCls}>Reference</label>
                  <input id="job-ref" value={jobDraft.ref} maxLength={50} onChange={(e) => setJobDraft({ ...jobDraft, ref: e.target.value })} className={inputCls} placeholder="e.g. REG/2026/041" />
                </div>
                <div>
                  <label htmlFor="job-type" className={labelCls}>Type</label>
                  <select id="job-type" value={jobDraft.type} onChange={(e) => setJobDraft({ ...jobDraft, type: e.target.value })} className={inputCls}>
                    {MATTER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="job-status" className={labelCls}>Status</label>
                  <select id="job-status" value={jobDraft.status} onChange={(e) => setJobDraft({ ...jobDraft, status: e.target.value })} className={inputCls}>
                    {MATTER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="job-lead" className={labelCls}>Lead</label>
                  <select id="job-lead" value={jobDraft.leadUserId} onChange={(e) => setJobDraft({ ...jobDraft, leadUserId: e.target.value })} className={inputCls}>
                    <option value="">{jobDraft.id && jobs.find((j) => j.id === jobDraft.id)?.leadName ? `Keep “${jobs.find((j) => j.id === jobDraft.id)?.leadName}”` : 'No lead yet'}</option>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="job-opened" className={labelCls}>Opened</label>
                  <input id="job-opened" type="date" value={jobDraft.opened} onChange={(e) => setJobDraft({ ...jobDraft, opened: e.target.value })} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="job-deadline" className={labelCls}>Deadline</label>
                  <input id="job-deadline" type="date" value={jobDraft.deadline} min={jobDraft.opened || undefined} onChange={(e) => setJobDraft({ ...jobDraft, deadline: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div>
                <label htmlFor="job-notes" className={labelCls}>Notes</label>
                <textarea id="job-notes" rows={3} value={jobDraft.notes} onChange={(e) => setJobDraft({ ...jobDraft, notes: e.target.value })} className={`${inputCls} py-2.5`} placeholder="Forum, regulatory instrument, scope…" />
              </div>
            </fieldset>
            {jobError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{jobError}</p>}
            <div className="flex justify-end">
              <button type="submit" disabled={saving} className="min-h-11 px-5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50">
                {saving ? 'Saving…' : jobDraft.id ? 'Save job' : 'Create job'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
