'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { createClient } from '@/utils/supabase/client';
import { requestFeedRefresh, type RefreshOutcome } from '@/utils/news/refreshClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type GenerationDay = { date: string; label: string; gwh: number; flagged: boolean };
type OverviewAlert = { id: string; title: string; date: string };
type Deadline = { id: string; title: string; reference: string | null; date: string };
type NewsItem = { id: string; title: string; source: string; url: string | null; published_at: string | null };
type DocCounts = { complete: number; inProgress: number; failed: number };

type OverviewData = {
  plantCount: number | null;
  capacityMw: number | null;
  orgCount: number | null;
  generation: GenerationDay[];
  generationEnd: string | null;
  openAlertCount: number | null;
  alerts: OverviewAlert[];
  deadlines: Deadline[];
  docs: DocCounts | null;
  news: NewsItem[];
};

const EMPTY: OverviewData = {
  plantCount: null,
  capacityMw: null,
  orgCount: null,
  generation: [],
  generationEnd: null,
  openAlertCount: null,
  alerts: [],
  deadlines: [],
  docs: null,
  news: [],
};

const GENERATION_WINDOW_DAYS = 14;
const OPEN_ALERT_STATUSES = ['UNREVIEWED', 'ASSIGNED'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const nf = new Intl.NumberFormat('en-NG');

function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', opts);
}

function timeAgo(iso: string | null) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return formatDate(iso, { day: 'numeric', month: 'short' });
}

function addDays(isoDate: string, days: number) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const humanise = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Data loading — every tile degrades independently if its query fails.
// ---------------------------------------------------------------------------
async function loadOverview(supabase: ReturnType<typeof createClient>): Promise<OverviewData> {
  const data: OverviewData = { ...EMPTY };
  const today = new Date().toISOString().slice(0, 10);

  const [plantsRes, orgsRes, alertCountRes, alertsRes, mattersRes, newsRes, docsRes, latestGenRes] = await Promise.all([
    supabase.from('power_plants').select('id, name, short_name, installed_capacity_mw'),
    supabase.from('organisations').select('id', { count: 'exact', head: true }),
    supabase.from('anomaly_alerts').select('id', { count: 'exact', head: true }).in('status', OPEN_ALERT_STATUSES),
    supabase
      .from('anomaly_alerts')
      .select('*')
      .in('status', OPEN_ALERT_STATUSES)
      .order('alert_date', { ascending: false })
      .limit(3),
    supabase
      .from('matters')
      .select('id, title, matter_reference, next_deadline, deleted_at')
      .gte('next_deadline', today)
      .is('deleted_at', null)
      .order('next_deadline', { ascending: true })
      .limit(3),
    supabase
      .from('news_articles')
      .select('id, title, source, url, published_at')
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(2),
    supabase.from('documents').select('processing_status'),
    supabase.from('generation_output').select('report_date').order('report_date', { ascending: false }).limit(1),
  ]);

  // Plants & organisations
  const plants = plantsRes.data ?? [];
  const plantName = new Map<string, string>();
  if (!plantsRes.error) {
    data.plantCount = plants.length;
    data.capacityMw = plants.reduce((sum, p) => sum + (Number(p.installed_capacity_mw) || 0), 0);
    plants.forEach((p) => plantName.set(p.id, p.short_name || p.name));
  }
  if (!orgsRes.error) data.orgCount = orgsRes.count ?? 0;

  // Alerts
  if (!alertCountRes.error) data.openAlertCount = alertCountRes.count ?? 0;
  if (!alertsRes.error && alertsRes.data) {
    data.alerts = alertsRes.data.map((a: Record<string, unknown>) => {
      const subject = typeof a.plant_id === 'string' ? plantName.get(a.plant_id) : null;
      const kind = humanise(String(a.alert_type ?? a.source_type ?? 'Anomaly'));
      return {
        id: String(a.id),
        title: subject ? `${kind} · ${subject}` : kind,
        date: String(a.alert_date ?? ''),
      };
    });
  }

  // Deadlines
  if (!mattersRes.error && mattersRes.data) {
    data.deadlines = mattersRes.data.map((m) => ({
      id: m.id,
      title: m.title,
      reference: m.matter_reference,
      date: m.next_deadline as string,
    }));
  }

  // News
  if (!newsRes.error && newsRes.data) data.news = newsRes.data as NewsItem[];

  // Document processing
  if (!docsRes.error && docsRes.data) {
    const counts: DocCounts = { complete: 0, inProgress: 0, failed: 0 };
    docsRes.data.forEach((d) => {
      if (d.processing_status === 'COMPLETE') counts.complete += 1;
      else if (d.processing_status === 'FAILED') counts.failed += 1;
      else counts.inProgress += 1;
    });
    data.docs = counts;
  }

  // Generation: the most recent 14 days that exist in the database
  const end = latestGenRes.data?.[0]?.report_date as string | undefined;
  if (end) {
    const start = addDays(end, -(GENERATION_WINDOW_DAYS - 1));
    const [genRes, flagRes] = await Promise.all([
      supabase
        .from('generation_output')
        .select('report_date, actual_output_mwh')
        .gte('report_date', start)
        .lte('report_date', end)
        .limit(5000),
      supabase.from('anomaly_alerts').select('alert_date').gte('alert_date', start).lte('alert_date', end),
    ]);
    if (!genRes.error && genRes.data) {
      const flagged = new Set((flagRes.data ?? []).map((r) => r.alert_date as string));
      const totals = new Map<string, number>();
      for (let i = 0; i < GENERATION_WINDOW_DAYS; i++) totals.set(addDays(start, i), 0);
      genRes.data.forEach((r) => {
        totals.set(r.report_date, (totals.get(r.report_date) ?? 0) + (Number(r.actual_output_mwh) || 0));
      });
      data.generation = [...totals.entries()].map(([date, mwh]) => ({
        date,
        label: formatDate(date, { day: 'numeric', month: 'short' }),
        gwh: Math.round(mwh / 100) / 10,
        flagged: flagged.has(date),
      }));
      data.generationEnd = end;
    }
  }

  return data;
}

// ---------------------------------------------------------------------------
// UI pieces
// ---------------------------------------------------------------------------
function Tile({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`bg-surface rounded-2xl p-6 flex flex-col gap-3 ${className}`} aria-label={title}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 ${className}`} aria-hidden="true" />;
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-600 py-2">{children}</p>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OverviewPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [firstName, setFirstName] = useState<string | null>(null);
  const [data, setData] = useState<OverviewData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState('');
  const [refreshingNews, setRefreshingNews] = useState(false);
  const [newsNote, setNewsNote] = useState<RefreshOutcome | null>(null);

  const refreshNews = async () => {
    setRefreshingNews(true);
    setNewsNote(null);
    const outcome = await requestFeedRefresh();
    setNewsNote(outcome);
    if (outcome.kind === 'ok') {
      const { data: latest } = await supabase
        .from('news_articles')
        .select('id, title, source, url, published_at')
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(2);
      if (latest) setData((d) => ({ ...d, news: latest as NewsItem[] }));
    }
    setRefreshingNews(false);
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!active || !user) return;
      const full = (user.user_metadata?.full_name || user.email?.split('@')[0] || '').trim();
      setFirstName(full.split(/\s+/)[0] || null);
    });
    loadOverview(supabase)
      .then((d) => active && setData(d))
      .catch((err) => console.error('Overview load error:', err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [supabase]);

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    router.push(`/query?q=${encodeURIComponent(q)}`);
  };

  const docsTotal = data.docs ? data.docs.complete + data.docs.inProgress + data.docs.failed : 0;
  const pct = (n: number) => (docsTotal ? `${(n / docsTotal) * 100}%` : '0%');

  return (
    <main className="flex-1 overflow-y-auto bg-background p-4 sm:p-6">
      <div className="max-w-7xl mx-auto flex flex-col gap-5">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 px-1">
          <div>
            <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-gray-900">
              {greeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="mt-1 text-sm text-gray-600">Here is the state of the sector and your workload.</p>
          </div>
          <form onSubmit={ask} className="flex-1 sm:flex-none sm:w-[420px] flex items-center gap-2 bg-surface rounded-xl pl-4 pr-1.5 py-1.5">
            <label htmlFor="overview-ask" className="sr-only">
              Quick question to the data hub
            </label>
            <input
              id="overview-ask"
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Quick question to the data hub…"
              className="flex-1 min-w-0 bg-transparent text-sm text-gray-900 placeholder:text-gray-500 outline-none min-h-11"
            />
            <button
              type="submit"
              className="min-h-11 px-5 rounded-lg bg-accent hover:bg-accent-hover text-brand text-sm font-bold transition-colors"
            >
              Ask
            </button>
          </form>
        </header>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {/* Generation chart — wide green tile */}
          <section aria-label="Daily generation" className="md:col-span-2 xl:col-span-3 bg-brand text-white rounded-2xl p-6 flex flex-col gap-4 min-h-[300px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold">Daily generation</h2>
              <span className="text-xs text-[#a9c2b3]">
                {data.generationEnd
                  ? `GWh, all plants · ${GENERATION_WINDOW_DAYS} days to ${formatDate(data.generationEnd)}`
                  : 'GWh, all plants'}
              </span>
            </div>
            <div className="flex-1 min-h-[180px]">
              {loading ? (
                <div className="h-full rounded-xl bg-white/5 animate-pulse" aria-hidden="true" />
              ) : data.generation.length ? (
                <ResponsiveContainer width="100%" height="100%" minHeight={180}>
                  <BarChart data={data.generation} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#a9c2b3' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: '#a9c2b3' }} axisLine={false} tickLine={false} width={48} />
                    <Tooltip
                      cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                      contentStyle={{ borderRadius: 12, border: 'none', color: '#0f1f17', fontSize: 12 }}
                      formatter={(v) => [`${nf.format(Number(v))} GWh`, 'Generation']}
                    />
                    <Bar dataKey="gwh" radius={[6, 6, 0, 0]}>
                      {data.generation.map((d) => (
                        <Cell key={d.date} fill={d.flagged ? 'var(--accent)' : 'var(--brand-soft)'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-sm text-[#d6e2da]">No generation records available yet.</p>
              )}
            </div>
            <p className="text-xs text-[#ffc24d] flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" /> Day with an anomaly flag
            </p>
          </section>

          {/* Capacity — amber tile */}
          <section aria-label="Installed capacity" className="bg-accent text-brand rounded-2xl p-6 flex flex-col gap-2">
            <h2 className="text-sm font-bold">Installed capacity</h2>
            {loading ? (
              <Skeleton className="h-12 w-40 bg-white/40" />
            ) : (
              <p className="text-[44px] leading-none font-extrabold tracking-tight">
                {data.capacityMw !== null ? nf.format(Math.round(data.capacityMw)) : '—'}
                <span className="text-lg font-semibold"> MW</span>
              </p>
            )}
            <p className="text-sm font-medium">
              Across {data.plantCount ?? '—'} power plants and {data.orgCount ?? '—'} organisations
            </p>
            <Link href="/query" className="mt-auto text-sm font-bold underline-offset-4 hover:underline text-brand">
              Ask about plants →
            </Link>
          </section>

          {/* Alerts */}
          <Tile
            title="Anomaly alerts"
            action={
              data.openAlertCount !== null && (
                <span className="font-mono text-xs bg-accent-soft text-accent-ink px-2 py-1 rounded-full">{data.openAlertCount} open</span>
              )
            }
          >
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.alerts.length ? (
              <ul className="divide-y divide-gray-100">
                {data.alerts.map((a) => (
                  <li key={a.id} className="flex justify-between gap-3 py-2.5 text-sm">
                    <span className="text-gray-900 truncate">{a.title}</span>
                    <span className="text-gray-600 shrink-0">{a.date ? formatDate(a.date, { day: 'numeric', month: 'short' }) : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>No open alerts. All clear.</EmptyNote>
            )}
            <Link href="/alerts" className="mt-auto text-sm font-semibold text-brand hover:underline underline-offset-4">
              Review alerts
            </Link>
          </Tile>

          {/* Deadlines */}
          <Tile title="Next deadlines">
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.deadlines.length ? (
              <ul className="flex flex-col gap-2">
                {data.deadlines.map((d) => (
                  <li key={d.id} className="rounded-xl bg-gray-50 px-3 py-2.5 flex flex-col gap-0.5">
                    <span className="text-sm font-semibold text-gray-900">{d.title}</span>
                    <span className="text-xs text-gray-600">
                      {formatDate(d.date)}
                      {d.reference ? ` · ${d.reference}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>No upcoming deadlines.</EmptyNote>
            )}
            <Link href="/matters" className="mt-auto text-sm font-semibold text-brand hover:underline underline-offset-4">
              All matters
            </Link>
          </Tile>

          {/* Documents */}
          <Tile title="Document processing">
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.docs ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-900">Complete</span>
                  <span className="font-mono">{data.docs.complete}</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 flex overflow-hidden" role="img" aria-label={`${data.docs.complete} of ${docsTotal} documents processed`}>
                  <div className="bg-brand" style={{ width: pct(data.docs.complete) }} />
                  <div className="bg-accent" style={{ width: pct(data.docs.inProgress) }} />
                  <div className="bg-red-600" style={{ width: pct(data.docs.failed) }} />
                </div>
                <div className="flex justify-between text-sm text-gray-600">
                  <span>Processing / pending</span>
                  <span className="font-mono">{data.docs.inProgress}</span>
                </div>
                {data.docs.failed > 0 && (
                  <div className="flex justify-between text-sm text-red-700">
                    <span>Failed</span>
                    <span className="font-mono">{data.docs.failed}</span>
                  </div>
                )}
              </>
            ) : (
              <EmptyNote>Document status unavailable.</EmptyNote>
            )}
            <Link
              href="/documents?tab=upload"
              className="mt-auto min-h-11 rounded-xl border border-brand text-brand text-sm font-semibold flex items-center justify-center hover:bg-brand hover:text-white transition-colors"
            >
              Upload document
            </Link>
          </Tile>

          {/* News */}
          <Tile
            title="Latest news"
            action={
              <button
                type="button"
                onClick={refreshNews}
                disabled={refreshingNews}
                aria-label="Refresh news feeds"
                title="Refresh news feeds"
                className="-my-2 -mr-2 h-11 w-11 flex items-center justify-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-brand transition-colors disabled:opacity-60"
              >
                <svg className={`h-4 w-4 ${refreshingNews ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            }
          >
            {newsNote && (
              <p role="status" className={`text-xs rounded-lg px-2.5 py-1.5 ${newsNote.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-accent-soft text-accent-ink'}`}>
                {newsNote.message}
              </p>
            )}
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.news.length ? (
              <ul className="flex flex-col gap-3">
                {data.news.map((n) => (
                  <li key={n.id} className="flex flex-col gap-0.5">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-gray-900 hover:text-brand leading-snug">
                        {n.title}
                      </a>
                    ) : (
                      <span className="text-sm font-semibold text-gray-900 leading-snug">{n.title}</span>
                    )}
                    <span className="text-xs text-gray-600">
                      {n.source}
                      {n.published_at ? ` · ${timeAgo(n.published_at)}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>No news yet.</EmptyNote>
            )}
            <Link href="/news" className="mt-auto text-sm font-semibold text-brand hover:underline underline-offset-4">
              All news
            </Link>
          </Tile>
        </div>
      </div>
    </main>
  );
}
