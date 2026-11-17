'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  ALERT_CATEGORIES,
  ALERT_SEVERITIES,
  EMPTY_REPORT,
  SEVERITY_LABELS,
  STATUS_GROUP_LABELS,
  TRIAGE_ROLES,
  buildTiles,
  categoryLabel,
  isOpen,
  newestFirst,
  relativeTime,
  reportToRow,
  sortAlerts,
  statusGroup,
  toAlert,
  validateReport,
  watchlist,
  type Alert,
  type AlertCategory,
  type AlertSeverity,
  type ReportDraft,
  type StatusGroup,
} from '@/utils/alerts';
import { MATTER_WRITE_ROLES } from '@/utils/matterTasks';

type Person = { id: string; name: string };
type JobOption = { id: string; label: string };
type Status = { kind: 'ok' | 'error'; text: string } | null;

const ALERT_COLUMNS = '*, power_plants(name), documents(title), matters(matter_reference, title), news_articles(title, url)';

const SEVERITY_CHIP: Record<AlertSeverity, string> = {
  CRITICAL: 'bg-red-50 text-red-700',
  HIGH: 'bg-accent-soft text-accent-ink',
  MEDIUM: 'bg-blue-50 text-blue-800',
  LOW: 'bg-gray-100 text-gray-700',
};

const inputCls = 'w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand';
const labelCls = 'block text-xs font-bold text-gray-700 mb-1';
const btnPrimary = 'min-h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50';
const btnSecondary = 'min-h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50';

function SeverityChip({ severity, className = '' }: { severity: AlertSeverity; className?: string }) {
  return <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-[11px] font-extrabold ${SEVERITY_CHIP[severity]} ${className}`}>{SEVERITY_LABELS[severity]}</span>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
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
        className="w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-2xl shadow-2xl outline-none"
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <h2 id="modal-title" className="text-lg font-extrabold text-gray-900 leading-snug">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-10 min-w-10 rounded-lg text-gray-600 hover:bg-gray-100 text-xl leading-none shrink-0">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AlertsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [status, setStatus] = useState<Status>(null);

  const [kind, setKind] = useState<AlertCategory | null>(null);
  const [group, setGroup] = useState<StatusGroup>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const [dismissReason, setDismissReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ReportDraft | null>(null);
  const [reportErrors, setReportErrors] = useState<string[]>([]);

  const canTriage = !!role && TRIAGE_ROLES.includes(role);
  const canAddTasks = !!role && MATTER_WRITE_ROLES.includes(role);

  const loadAlerts = useCallback(async () => {
    const { data, error } = await supabase.from('anomaly_alerts').select(ALERT_COLUMNS).order('created_at', { ascending: false }).limit(500);
    if (error) setStatus({ kind: 'error', text: `Couldn’t load alerts: ${error.message}` });
    else setAlerts((data ?? []).map(toAlert));
    setNow(Date.now());
  }, [supabase]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: profile } = user ? await supabase.from('user_profiles').select('role').eq('id', user.id).single() : { data: null };
    const [p, j] = await Promise.all([
      supabase.rpc('list_matter_people'),
      supabase.from('matters').select('id, matter_reference, title, status').is('deleted_at', null).neq('status', 'CLOSED').order('created_at'),
    ]);
    setMe(user?.id ?? null);
    setRole(profile?.role ?? null);
    setPeople(((p.data ?? []) as { id: string; full_name: string }[]).map((x) => ({ id: x.id, name: x.full_name })));
    setJobs(((j.data ?? []) as { id: string; matter_reference: string | null; title: string }[]).map((m) => ({ id: m.id, label: m.matter_reference ? `${m.matter_reference} · ${m.title}` : m.title })));
    await loadAlerts();
    setLoading(false);
  }, [supabase, loadAlerts]);

  useEffect(() => {
    const id = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(id);
  }, [load]);

  // Live updates: reload when any alert changes (debounced).
  useEffect(() => {
    let timer: number | undefined;
    const channel = supabase
      .channel('alerts-page')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'anomaly_alerts' }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => void loadAlerts(), 400);
      })
      .subscribe();
    return () => {
      window.clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [supabase, loadAlerts]);

  const personName = (id: string | null) => {
    if (!id) return null;
    if (id === me) return 'you';
    return people.find((p) => p.id === id)?.name ?? 'a colleague';
  };

  const critical = sortAlerts(alerts.filter((a) => isOpen(a) && a.severity === 'CRITICAL'));
  const tiles = buildTiles(alerts);
  const watch = watchlist(alerts, now);
  const groupCounts = alerts.reduce<Record<StatusGroup, number>>(
    (acc, a) => {
      if (!kind || a.category === kind) acc[statusGroup(a.status)] += 1;
      return acc;
    },
    { open: 0, investigating: 0, resolved: 0, dismissed: 0 },
  );
  const feed = (group === 'open' || group === 'investigating' ? sortAlerts : newestFirst)(
    alerts.filter((a) => statusGroup(a.status) === group && (!kind || a.category === kind)),
  );
  const selected = alerts.find((a) => a.id === openId) ?? null;
  const canActOn = (a: Alert) => canTriage || (!!me && a.assignedTo === me);

  /* ---------- actions ---------- */

  const update = async (a: Alert, patch: Record<string, unknown>, done: string) => {
    setBusy(true);
    const { data, error } = await supabase.from('anomaly_alerts').update(patch).eq('id', a.id).select(ALERT_COLUMNS);
    setBusy(false);
    if (error || !data?.length) {
      setStatus({ kind: 'error', text: `Couldn’t update the alert: ${error?.message ?? 'you don’t have permission to change it'}` });
      return false;
    }
    const saved = toAlert(data[0]);
    setAlerts((prev) => prev.map((x) => (x.id === saved.id ? saved : x)));
    setStatus({ kind: 'ok', text: done });
    return true;
  };

  const takeIt = (a: Alert) => me && update(a, { assigned_to: me, status: 'ASSIGNED' }, 'You’re now looking into this alert.');
  const assign = (a: Alert, who: string) =>
    who ? update(a, { assigned_to: who, status: 'ASSIGNED' }, `Assigned to ${personName(who)}.`) : update(a, { assigned_to: null, status: 'UNREVIEWED' }, 'Unassigned.');
  const resolve = (a: Alert) => update(a, { status: 'RESOLVED' }, 'Marked as resolved.');
  const reopen = (a: Alert) => update(a, { status: a.assignedTo ? 'ASSIGNED' : 'UNREVIEWED' }, 'Reopened.');
  const dismiss = async (a: Alert) => {
    if (!dismissReason.trim()) return;
    if (await update(a, { status: 'DISMISSED', dismiss_reason: dismissReason.trim().slice(0, 2000) }, 'Dismissed.')) {
      setDismissing(false);
      setDismissReason('');
    }
  };

  const addTask = async (a: Alert) => {
    if (!a.matterId) return;
    setBusy(true);
    const { error } = await supabase.from('matter_tasks').insert({
      matter_id: a.matterId,
      title: `Follow up alert: ${a.title}`.slice(0, 300),
      notes: [a.explanation, a.suggestedAction].filter(Boolean).join('\n\n').slice(0, 4000) || null,
      status: 'TODO',
      assignee_id: a.assignedTo,
    });
    setBusy(false);
    setStatus(error ? { kind: 'error', text: `Couldn’t add the task: ${error.message}` } : { kind: 'ok', text: 'Task added to the job on Regulatory & Advisory.' });
  };

  const submitReport = async () => {
    if (!report || !me) return;
    const errors = validateReport(report);
    setReportErrors(errors);
    if (errors.length) return;
    setBusy(true);
    const { data, error } = await supabase.from('anomaly_alerts').insert(reportToRow(report, me)).select(ALERT_COLUMNS);
    setBusy(false);
    if (error || !data?.length) {
      setReportErrors([`Couldn’t save the alert: ${error?.message ?? 'no row returned'}`]);
      return;
    }
    const saved = toAlert(data[0]);
    setAlerts((prev) => [saved, ...prev.filter((x) => x.id !== saved.id)]);
    setReport(null);
    setGroup('open');
    setStatus({ kind: 'ok', text: canTriage ? 'Alert reported.' : 'Alert reported. The team will look into it.' });
  };

  const openAlert = (id: string) => {
    setDismissing(false);
    setDismissReason('');
    setOpenId(id);
  };

  /* ---------- render ---------- */

  if (loading) {
    return (
      <main className="flex-1 p-6">
        <p className="text-sm text-gray-600" role="status">Loading alerts…</p>
      </main>
    );
  }

  const latest = alerts[0]?.createdAt;

  return (
    <main className="flex-1 min-w-0 p-4 sm:p-6">
      <div className="max-w-[1500px] mx-auto flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="mr-1 text-2xl font-extrabold tracking-tight text-gray-900">Alerts</h1>
          <span className="font-mono text-xs text-gray-600">{latest ? `Latest alert ${relativeTime(latest, now)}` : 'No alerts yet'}</span>
          <button type="button" onClick={() => { setReportErrors([]); setReport({ ...EMPTY_REPORT }); }} className={`${btnPrimary} ml-auto min-h-11`}>
            Report an alert
          </button>
        </header>

        {status && (
          <div role={status.kind === 'error' ? 'alert' : 'status'} className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${status.kind === 'error' ? 'bg-red-50 text-red-800' : 'bg-brand/10 text-brand'}`}>
            <span>{status.text}</span>
            <button type="button" onClick={() => setStatus(null)} aria-label="Dismiss message">×</button>
          </div>
        )}

        {/* Critical banner */}
        {critical.length > 0 ? (
          <section aria-labelledby="crit-h" className="bg-gray-900 text-white rounded-2xl p-4 sm:p-5 flex flex-col gap-3">
            <h2 id="crit-h" className="flex items-center gap-2.5 text-[15px] font-extrabold">
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-full bg-red-400" />
              {critical.length === 1 ? '1 critical alert needs someone today' : `${critical.length} critical alerts need someone today`}
            </h2>
            <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {critical.slice(0, 4).map((a) => (
                <li key={a.id} className="bg-white text-gray-900 rounded-2xl p-4 flex flex-col gap-2">
                  <p className="flex justify-between gap-2 text-[11px] font-extrabold uppercase tracking-wider text-red-700">
                    <span>{categoryLabel(a.category)}</span>
                    <span className="font-mono font-medium normal-case tracking-normal text-gray-600">{relativeTime(a.createdAt, now)}</span>
                  </p>
                  <h3 className="text-[17px] font-extrabold leading-snug">{a.title}</h3>
                  {a.explanation && <p className="text-sm text-gray-700 leading-relaxed line-clamp-3">{a.explanation}</p>}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {a.status === 'ASSIGNED' ? (
                      <span className="min-h-10 px-3 rounded-xl bg-accent-soft text-accent-ink text-[13px] font-bold inline-flex items-center">Investigating · {personName(a.assignedTo) ?? 'unassigned'}</span>
                    ) : (
                      canActOn(a) && (
                        <button type="button" disabled={busy} onClick={() => void takeIt(a)} className={btnPrimary}>Take it</button>
                      )
                    )}
                    <button type="button" onClick={() => openAlert(a.id)} className={btnSecondary}>
                      {a.evidence.length ? 'See evidence' : 'Open'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {critical.length > 4 && (
              <button type="button" onClick={() => { setKind(null); setGroup('open'); }} className="self-start text-sm font-semibold underline underline-offset-4">
                See all {critical.length} critical alerts below
              </button>
            )}
          </section>
        ) : (
          <p className="rounded-2xl bg-white px-5 py-3.5 text-sm text-gray-700">
            <span aria-hidden="true" className="inline-block w-2 h-2 rounded-full bg-brand mr-2 align-middle" />
            No critical alerts right now.
          </p>
        )}

        {/* Kind tiles */}
        <section aria-label="Open alerts by kind" className="grid grid-flow-col auto-cols-[minmax(160px,1fr)] gap-2.5 overflow-x-auto pb-1">
          {tiles.map((t) => (
            <button
              key={t.category}
              type="button"
              aria-pressed={kind === t.category}
              onClick={() => setKind((k) => (k === t.category ? null : t.category))}
              className={`text-left bg-white rounded-2xl p-3.5 flex flex-col gap-1 border-2 transition-colors ${kind === t.category ? 'border-brand' : 'border-transparent hover:border-gray-200'}`}
            >
              <span className="text-[13px] font-bold text-gray-900">{t.label}</span>
              <span className="font-mono text-3xl tracking-tight text-gray-900">{t.open}</span>
              <span className={`text-xs font-bold ${t.hot ? 'text-red-700' : 'text-gray-600'}`}>{t.sub}</span>
            </button>
          ))}
        </section>

        <div className="flex flex-wrap gap-4 items-start">
          {/* Feed */}
          <section aria-labelledby="feed-h" className="flex-[999_1_480px] min-w-0 bg-white rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h2 id="feed-h" className="mr-auto text-[11px] font-extrabold uppercase tracking-wider text-gray-600">
                {kind ? categoryLabel(kind, false) : 'All kinds'}
                {kind && (
                  <button type="button" onClick={() => setKind(null)} className="ml-2 normal-case tracking-normal font-semibold text-brand underline underline-offset-2">
                    show all kinds
                  </button>
                )}
              </h2>
              <div role="group" aria-label="Status" className="flex flex-wrap gap-1 bg-gray-100 rounded-xl p-1">
                {(Object.keys(STATUS_GROUP_LABELS) as StatusGroup[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={group === g}
                    onClick={() => setGroup(g)}
                    className={`min-h-9 px-3 rounded-[9px] text-[13px] font-semibold ${group === g ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-700'}`}
                  >
                    {STATUS_GROUP_LABELS[g]} · {groupCounts[g]}
                  </button>
                ))}
              </div>
            </div>
            {feed.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-600">
                {alerts.length === 0 ? 'No alerts yet. They’ll appear here as news, documents, grid data and system checks raise them, or when someone reports one.' : `Nothing ${STATUS_GROUP_LABELS[group].toLowerCase()} here.`}
              </p>
            ) : (
              <ol>
                {feed.map((a) => (
                  <li key={a.id} className="flex gap-3 items-baseline py-3 border-t border-gray-100">
                    <span className="font-mono text-xs text-gray-600 w-[78px] shrink-0">{relativeTime(a.createdAt, now)}</span>
                    <SeverityChip severity={a.severity} className="w-[70px] shrink-0" />
                    <span className="flex-1 min-w-0">
                      <button type="button" onClick={() => openAlert(a.id)} className="text-left text-sm font-semibold text-gray-900 hover:underline underline-offset-2">
                        {a.title}
                      </button>
                      <span className="block text-xs text-gray-600">
                        {categoryLabel(a.category)}
                        {a.status === 'ASSIGNED' && ` · ${personName(a.assignedTo) ?? 'unassigned'}`}
                        {a.status === 'DISMISSED' && a.dismissReason && ` · ${a.dismissReason}`}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {/* Most alerts */}
          <section aria-labelledby="watch-h" className="flex-[1_1_280px] bg-white rounded-2xl p-4 sm:p-5">
            <h2 id="watch-h" className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Most alerts · last 30 days</h2>
            <p className="mt-1 mb-3 text-[13px] text-gray-600">Companies, plants and documents that keep coming up.</p>
            {watch.length === 0 ? (
              <p className="text-sm text-gray-600">Nothing yet.</p>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {watch.map((w) => (
                  <li key={w.name} className="flex flex-col gap-1">
                    <span className="flex justify-between gap-2 text-sm"><span className="font-semibold text-gray-900 truncate">{w.name}</span><span className="font-mono text-gray-700">{w.count}</span></span>
                    <span className="block h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <span className="block h-full bg-brand rounded-full" style={{ width: `${Math.round((w.count / watch[0].count) * 100)}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Alert detail */}
      {selected && (
        <Modal title={selected.title} onClose={() => setOpenId(null)}>
          <div className="px-6 pb-6 pt-3 flex flex-col gap-4">
            <p className="flex flex-wrap items-center gap-2 text-xs">
              <SeverityChip severity={selected.severity} />
              <span className="px-2.5 py-0.5 rounded-full bg-brand/10 text-brand font-bold">{categoryLabel(selected.category)}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-gray-100 text-gray-800 font-bold">
                {STATUS_GROUP_LABELS[statusGroup(selected.status)]}
                {selected.status === 'ASSIGNED' && ` · ${personName(selected.assignedTo)}`}
              </span>
              <span className="font-mono text-gray-600">
                {selected.source === 'MANUAL' ? `Reported by ${personName(selected.reportedBy) ?? 'a colleague'}` : `Raised by ${selected.source.toLowerCase()} check`} · {relativeTime(selected.createdAt, now)}
              </span>
            </p>

            {selected.explanation && <p className="text-[15px] leading-relaxed text-gray-800 whitespace-pre-wrap">{selected.explanation}</p>}

            {selected.evidence.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Evidence</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {selected.evidence.map((e, i) => (
                    <figure key={i} className="m-0 rounded-xl border border-gray-200 p-3 flex flex-col gap-1.5">
                      <figcaption className="text-xs font-bold">
                        {e.url ? (
                          <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-brand underline underline-offset-2">{e.label}<span className="sr-only"> (opens in a new tab)</span></a>
                        ) : (
                          <span className="text-gray-900">{e.label}</span>
                        )}
                      </figcaption>
                      {e.excerpt && <blockquote className="m-0 text-sm text-gray-800 leading-relaxed">“{e.excerpt}”</blockquote>}
                    </figure>
                  ))}
                </div>
              </div>
            )}

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {selected.affects && <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Affects</dt><dd className="mt-0.5 font-semibold">{selected.affects}</dd></div>}
              {selected.plantName && <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Plant</dt><dd className="mt-0.5 font-semibold">{selected.plantName}</dd></div>}
              {selected.documentId && <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Document</dt><dd className="mt-0.5"><Link href="/documents?tab=view-document" className="font-semibold text-brand underline underline-offset-2">{selected.documentTitle ?? 'Open the library'}</Link></dd></div>}
              {selected.matterId && <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Linked job</dt><dd className="mt-0.5"><Link href="/matters" className="font-semibold text-brand underline underline-offset-2">{selected.matterLabel ?? 'Open Regulatory & Advisory'}</Link></dd></div>}
              {selected.newsTitle && (
                <div><dt className="text-[11px] font-extrabold uppercase tracking-wider text-gray-600">News story</dt><dd className="mt-0.5">
                  {selected.newsUrl ? <a href={selected.newsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">{selected.newsTitle}<span className="sr-only"> (opens in a new tab)</span></a> : <span className="font-semibold">{selected.newsTitle}</span>}
                </dd></div>
              )}
            </dl>

            {selected.suggestedAction && (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm leading-relaxed"><strong>Suggested next step:</strong> {selected.suggestedAction}</p>
            )}
            {selected.status === 'DISMISSED' && selected.dismissReason && (
              <p className="rounded-xl bg-gray-50 px-4 py-3 text-sm"><strong>Dismissed because:</strong> {selected.dismissReason}</p>
            )}

            {canActOn(selected) ? (
              <div className="flex flex-col gap-3 pt-3 border-t border-gray-100">
                {isOpen(selected) && (people.length > 0 || me) && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="min-w-[220px]">
                      <label htmlFor="assign" className={labelCls}>Assigned to</label>
                      <select id="assign" value={selected.assignedTo ?? ''} disabled={busy} onChange={(e) => void assign(selected, e.target.value)} className={inputCls}>
                        <option value="">Nobody yet</option>
                        {me && !people.some((p) => p.id === me) && <option value={me}>Me</option>}
                        {people.map((p) => <option key={p.id} value={p.id}>{p.id === me ? `${p.name} (me)` : p.name}</option>)}
                        {selected.assignedTo && selected.assignedTo !== me && !people.some((p) => p.id === selected.assignedTo) && <option value={selected.assignedTo}>A colleague</option>}
                      </select>
                    </div>
                  </div>
                )}
                {dismissing ? (
                  <div className="flex flex-col gap-2">
                    <label htmlFor="dismiss-reason" className={labelCls}>Why dismiss it?</label>
                    <textarea id="dismiss-reason" rows={2} maxLength={2000} value={dismissReason} onChange={(e) => setDismissReason(e.target.value)} className={`${inputCls} py-2.5`} placeholder="e.g. Duplicate of another alert, or the report was wrong" />
                    <div className="flex gap-2">
                      <button type="button" disabled={busy || !dismissReason.trim()} onClick={() => void dismiss(selected)} className={btnPrimary}>Dismiss alert</button>
                      <button type="button" onClick={() => setDismissing(false)} className={btnSecondary}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {isOpen(selected) ? (
                      <>
                        {selected.status === 'UNREVIEWED' && me && <button type="button" disabled={busy} onClick={() => void takeIt(selected)} className={btnPrimary}>Take it</button>}
                        <button type="button" disabled={busy} onClick={() => void resolve(selected)} className={selected.status === 'UNREVIEWED' ? btnSecondary : btnPrimary}>Mark resolved</button>
                        {selected.matterId && canAddTasks && <button type="button" disabled={busy} onClick={() => void addTask(selected)} className={btnSecondary}>Add as task on job</button>}
                        <Link href={`/query?q=${encodeURIComponent(`Explain this alert and what we should do about it: ${selected.title}`)}`} className={`${btnSecondary} inline-flex items-center`}>Ask AI</Link>
                        <button type="button" onClick={() => setDismissing(true)} className={`${btnSecondary} sm:ml-auto text-gray-700`}>Dismiss…</button>
                      </>
                    ) : (
                      <button type="button" disabled={busy} onClick={() => void reopen(selected)} className={btnSecondary}>Reopen</button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <p className="pt-3 border-t border-gray-100 text-sm text-gray-600">The legal team, analysts, the CEO and admins handle alerts. You can still report new ones.</p>
            )}
          </div>
        </Modal>
      )}

      {/* Report an alert */}
      {report && (
        <Modal title="Report an alert" onClose={() => setReport(null)}>
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submitReport();
            }}
            className="px-6 pb-6 pt-3 flex flex-col gap-4"
          >
            <fieldset disabled={busy} className="flex flex-col gap-4">
              <div>
                <label htmlFor="r-title" className={labelCls}>What happened, in one line</label>
                <input id="r-title" value={report.title} maxLength={300} onChange={(e) => setReport({ ...report, title: e.target.value })} className={inputCls} placeholder="e.g. DisCo reported billing above the approved tariff" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="r-kind" className={labelCls}>Kind</label>
                  <select id="r-kind" value={report.category} onChange={(e) => setReport({ ...report, category: e.target.value as AlertCategory })} className={inputCls}>
                    {ALERT_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.one}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="r-sev" className={labelCls}>How urgent</label>
                  <select id="r-sev" value={report.severity} onChange={(e) => setReport({ ...report, severity: e.target.value as AlertSeverity })} className={inputCls}>
                    {ALERT_SEVERITIES.map((s) => <option key={s} value={s}>{SEVERITY_LABELS[s]}{s === 'CRITICAL' ? ' – needs someone today' : ''}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="r-affects" className={labelCls}>Who or what it affects</label>
                  <input id="r-affects" value={report.affects} maxLength={300} onChange={(e) => setReport({ ...report, affects: e.target.value })} className={inputCls} placeholder="A company, plant or document" />
                </div>
                {jobs.length > 0 && (
                  <div>
                    <label htmlFor="r-job" className={labelCls}>Linked job (optional)</label>
                    <select id="r-job" value={report.matterId} onChange={(e) => setReport({ ...report, matterId: e.target.value })} className={inputCls}>
                      <option value="">None</option>
                      {jobs.map((j) => <option key={j.id} value={j.id}>{j.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div>
                <label htmlFor="r-details" className={labelCls}>Details</label>
                <textarea id="r-details" rows={3} maxLength={8000} value={report.explanation} onChange={(e) => setReport({ ...report, explanation: e.target.value })} className={`${inputCls} py-2.5`} placeholder="What you saw, and why it matters" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="r-url" className={labelCls}>Evidence link (optional)</label>
                  <input id="r-url" type="url" value={report.evidenceUrl} onChange={(e) => setReport({ ...report, evidenceUrl: e.target.value })} className={inputCls} placeholder="https://…" />
                </div>
                <div>
                  <label htmlFor="r-quote" className={labelCls}>Quote from the evidence (optional)</label>
                  <input id="r-quote" value={report.evidenceExcerpt} maxLength={1000} onChange={(e) => setReport({ ...report, evidenceExcerpt: e.target.value })} className={inputCls} />
                </div>
              </div>
            </fieldset>
            {reportErrors.length > 0 && (
              <ul role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800 list-disc pl-8">
                {reportErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}
            <div className="flex justify-end">
              <button type="submit" disabled={busy} className={`${btnPrimary} min-h-11`}>{busy ? 'Saving…' : 'Report alert'}</button>
            </div>
          </form>
        </Modal>
      )}
    </main>
  );
}
