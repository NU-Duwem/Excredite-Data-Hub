'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { requestFeedRefresh, type RefreshOutcome } from '@/utils/news/refreshClient';
import { TOPIC_LABELS, type TopicId } from '@/utils/news/topics';
import {
  articleTime,
  myOpenTasks,
  summariseAlerts,
  timeAgo,
  WEEK_MS,
  weeklyTopicCounts,
  type AlertSummary,
  type OverviewTask,
} from '@/utils/overview';

// ---------------------------------------------------------------------------
// The Overview shows only data that is updated every day: power-sector news
// (pulled from the feeds), alerts, the team's tasks and deadlines, and documents.
// ---------------------------------------------------------------------------

type NewsItem = {
  id: string;
  title: string;
  source: string;
  url: string | null;
  published_at: string | null;
  created_at: string | null;
  fetched_at: string | null;
  topics: string[] | null;
};
type OverviewAlert = { id: string; title: string; severity: string | null; created_at: string };
type Deadline = { id: string; title: string; reference: string | null; date: string };
type RecentDoc = { id: string; title: string; created_at: string; processing_status: string | null };
type DocCounts = { complete: number; inProgress: number; failed: number };

type OverviewData = {
  news: NewsItem[];
  sourceCount: number | null;
  alerts: OverviewAlert[];
  alertSummary: AlertSummary | null;
  tasks: OverviewTask[] | null; // null = can't see the work board
  jobTitles: Record<string, string>;
  deadlines: Deadline[] | null;
  docs: DocCounts | null;
  recentDocs: RecentDoc[];
  loadedAt: number; // when the data was loaded; used for "this week" and "overdue"
};

const EMPTY: OverviewData = {
  news: [],
  sourceCount: null,
  alerts: [],
  alertSummary: null,
  tasks: null,
  jobTitles: {},
  deadlines: null,
  docs: null,
  recentDocs: [],
  loadedAt: 0,
};

const OPEN_ALERT_STATUSES = ['UNREVIEWED', 'ASSIGNED'];
const NEWS_COLUMNS = 'id, title, source, url, published_at, created_at, fetched_at, topics';

function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', opts);
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

// ---------------------------------------------------------------------------
// Data loading: every tile degrades on its own if its query fails.
// ---------------------------------------------------------------------------
async function loadOverview(supabase: ReturnType<typeof createClient>, me: string | null): Promise<OverviewData> {
  const data: OverviewData = { ...EMPTY, loadedAt: Date.now() };
  const today = new Date(data.loadedAt).toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - WEEK_MS).toISOString();

  const [newsRes, recentNewsRes, sourcesRes, alertsRes, tasksRes, mattersRes, deadlinesRes, docsRes] = await Promise.all([
    supabase.from('news_articles').select(NEWS_COLUMNS).gte('published_at', weekAgo).order('published_at', { ascending: false }).limit(500),
    supabase.from('news_articles').select(NEWS_COLUMNS).order('published_at', { ascending: false, nullsFirst: false }).limit(5),
    supabase.from('news_sources').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('anomaly_alerts')
      .select('id, title, alert_type, severity, created_at')
      .in('status', OPEN_ALERT_STATUSES)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase.from('matter_tasks').select('id, title, status, due_date, assigned_to_team, assignee_id, matter_id').neq('status', 'DONE').limit(500),
    supabase.from('matters').select('id, title').is('deleted_at', null),
    supabase
      .from('matters')
      .select('id, title, matter_reference, next_deadline')
      .gte('next_deadline', today)
      .is('deleted_at', null)
      .order('next_deadline', { ascending: true })
      .limit(3),
    supabase.from('documents').select('id, title, created_at, processing_status').order('created_at', { ascending: false }).limit(500),
  ]);

  // News: this week's stories (for counts and topics) plus the latest headlines.
  const week = (newsRes.data ?? []) as NewsItem[];
  const latest = (recentNewsRes.data ?? []) as NewsItem[];
  data.news = latest.length ? latest : week.slice(0, 5);
  if (week.length) data.news = [...new Map([...latest, ...week].map((n) => [n.id, n])).values()];
  if (!sourcesRes.error) data.sourceCount = sourcesRes.count ?? 0;

  // Alerts
  if (!alertsRes.error && alertsRes.data) {
    data.alerts = alertsRes.data.map((a) => ({
      id: String(a.id),
      title: (a.title as string | null)?.trim() || String(a.alert_type ?? 'Alert').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()),
      severity: (a.severity as string | null) ?? null,
      created_at: String(a.created_at ?? ''),
    }));
    data.alertSummary = summariseAlerts(data.alerts);
  }

  // Tasks and jobs (only for people who can see the work board)
  if (!tasksRes.error && !mattersRes.error) {
    data.jobTitles = Object.fromEntries((mattersRes.data ?? []).map((m) => [m.id, m.title]));
    const canSeeBoard = (mattersRes.data ?? []).length > 0 || (tasksRes.data ?? []).length > 0;
    data.tasks = canSeeBoard
      ? myOpenTasks(
          (tasksRes.data ?? []).map((t) => ({
            id: t.id,
            title: t.title,
            status: t.status,
            due: t.due_date,
            team: !!t.assigned_to_team,
            assigneeId: t.assignee_id,
            matterId: t.matter_id,
          })),
          me,
        )
      : null;
  }
  if (!deadlinesRes.error && deadlinesRes.data) {
    data.deadlines = deadlinesRes.data.map((m) => ({ id: m.id, title: m.title, reference: m.matter_reference, date: m.next_deadline as string }));
  }

  // Documents
  if (!docsRes.error && docsRes.data) {
    const counts: DocCounts = { complete: 0, inProgress: 0, failed: 0 };
    docsRes.data.forEach((d) => {
      if (d.processing_status === 'COMPLETE') counts.complete += 1;
      else if (d.processing_status === 'FAILED') counts.failed += 1;
      else counts.inProgress += 1;
    });
    data.docs = counts;
    data.recentDocs = docsRes.data.slice(0, 3) as RecentDoc[];
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

function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="mt-auto text-sm font-semibold text-brand hover:underline underline-offset-4">
      {children}
    </Link>
  );
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
  const [me, setMe] = useState<string | null>(null);
  const today = data.loadedAt ? new Date(data.loadedAt).toISOString().slice(0, 10) : '';

  const refreshNews = async () => {
    setRefreshingNews(true);
    setNewsNote(null);
    const outcome = await requestFeedRefresh();
    setNewsNote(outcome);
    if (outcome.kind === 'ok') {
      const fresh = await loadOverview(supabase, me);
      setData((d) => ({ ...d, news: fresh.news, sourceCount: fresh.sourceCount, loadedAt: fresh.loadedAt }));
    }
    setRefreshingNews(false);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (user) {
        const { data: profile } = await supabase.from('user_profiles').select('full_name').eq('id', user.id).single();
        const full = (profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '').trim();
        if (active) {
          setFirstName(full.split(/\s+/)[0] || null);
          setMe(user.id);
        }
      }
      try {
        const d = await loadOverview(supabase, user?.id ?? null);
        if (active) setData(d);
      } catch (err) {
        console.error('Overview load error:', err);
      } finally {
        if (active) setLoading(false);
      }
    })();
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

  // News figures
  const now = data.loadedAt;
  const weekNews = data.news.filter((n) => now - articleTime(n) <= WEEK_MS);
  const headlines = [...data.news].sort((a, b) => articleTime(b) - articleTime(a)).slice(0, 4);
  const lastFetched = data.news.reduce<string | null>((acc, n) => (n.fetched_at && (!acc || n.fetched_at > acc) ? n.fetched_at : acc), null);
  const topics = weeklyTopicCounts(data.news, now);
  const topTopic = topics.find((t) => t.id !== 'other');
  const maxTopic = Math.max(1, ...topics.map((t) => t.count));

  const docsTotal = data.docs ? data.docs.complete + data.docs.inProgress + data.docs.failed : 0;
  const latestAlert = data.alerts[0];

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
            <p className="mt-1 text-sm text-gray-600">What’s happening in the sector, and what needs your attention.</p>
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
            <button type="submit" className="min-h-11 px-5 rounded-lg bg-accent hover:bg-accent-hover text-brand text-sm font-bold transition-colors">
              Ask
            </button>
          </form>
        </header>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {/* Power-sector news: wide green tile */}
          <section aria-label="Power-sector news" className="md:col-span-2 xl:col-span-3 bg-brand text-white rounded-2xl p-6 flex flex-col gap-4 min-h-[300px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Power-sector news</h2>
                <p className="mt-1 text-xs text-[#a9c2b3]">
                  {loading
                    ? 'Loading…'
                    : `${weekNews.length} ${weekNews.length === 1 ? 'story' : 'stories'} in the last 7 days${
                        data.sourceCount !== null ? ` from ${data.sourceCount} sources` : ''
                      }${lastFetched ? ` · feeds checked ${timeAgo(lastFetched)}` : ''}`}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshNews}
                disabled={refreshingNews}
                className="min-h-10 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-sm font-semibold flex items-center gap-2 disabled:opacity-60"
              >
                <svg className={`h-4 w-4 ${refreshingNews ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {refreshingNews ? 'Checking feeds…' : 'Refresh'}
              </button>
            </div>
            {newsNote && (
              <p role="status" className={`text-xs rounded-lg px-2.5 py-1.5 ${newsNote.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-white/10 text-white'}`}>
                {newsNote.message}
              </p>
            )}
            {loading ? (
              <div className="flex-1 rounded-xl bg-white/5 animate-pulse min-h-[160px]" aria-hidden="true" />
            ) : headlines.length ? (
              <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1">
                {headlines.map((n) => {
                  const topic = (n.topics ?? []).find((t) => t !== 'other') as TopicId | undefined;
                  return (
                    <li key={n.id} className="rounded-xl bg-white/[0.06] p-4 flex flex-col gap-2">
                      {n.url ? (
                        <a href={n.url} target="_blank" rel="noopener noreferrer" className="font-semibold leading-snug hover:underline underline-offset-4">
                          {n.title}
                        </a>
                      ) : (
                        <span className="font-semibold leading-snug">{n.title}</span>
                      )}
                      <span className="mt-auto flex flex-wrap items-center gap-2 text-xs text-[#a9c2b3]">
                        <span>{n.source}</span>
                        <span aria-hidden="true">·</span>
                        <span>{timeAgo(n.published_at ?? n.created_at)}</span>
                        {topic && <span className="rounded-full bg-accent/20 text-[#ffc24d] px-2 py-0.5 font-semibold">{TOPIC_LABELS[topic]}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-[#d6e2da]">No news yet. Use Refresh to check the feeds.</p>
            )}
            <Link href="/news" className="text-sm font-bold text-accent hover:underline underline-offset-4 self-start">
              All news →
            </Link>
          </section>

          {/* Open alerts: amber tile */}
          <section aria-label="Open alerts" className="bg-accent text-brand rounded-2xl p-6 flex flex-col gap-2">
            <h2 className="text-sm font-bold">Open alerts</h2>
            {loading ? (
              <Skeleton className="h-12 w-24 bg-white/40" />
            ) : (
              <p className="text-[52px] leading-none font-extrabold tracking-tight">{data.alertSummary?.open ?? '—'}</p>
            )}
            {!loading && data.alertSummary && (
              <p className="text-sm font-semibold">
                {data.alertSummary.open === 0
                  ? 'All clear: nothing needs review.'
                  : [
                      data.alertSummary.critical ? `${data.alertSummary.critical} critical` : null,
                      data.alertSummary.high ? `${data.alertSummary.high} high` : null,
                      'waiting for review',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
              </p>
            )}
            {latestAlert && (
              <p className="text-sm">
                <span className="font-semibold">Latest:</span> {latestAlert.title}
                <span className="opacity-80"> · {timeAgo(latestAlert.created_at)}</span>
              </p>
            )}
            <Link href="/alerts" className="mt-auto text-sm font-bold underline-offset-4 hover:underline">
              {data.alertSummary?.open ? 'Review alerts →' : 'Report an alert →'}
            </Link>
          </section>

          {/* My tasks */}
          <Tile title="My tasks">
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.tasks === null ? (
              <EmptyNote>Tasks from Regulatory &amp; Advisory Matters appear here for people on the work board.</EmptyNote>
            ) : data.tasks.length ? (
              <ul className="flex flex-col gap-2">
                {data.tasks.map((t) => {
                  const overdue = !!t.due && t.due < today;
                  return (
                    <li key={t.id} className="rounded-xl bg-gray-50 px-3 py-2.5 flex flex-col gap-0.5">
                      <span className="text-sm font-semibold text-gray-900">{t.title}</span>
                      <span className={`text-xs ${overdue ? 'text-red-700 font-semibold' : 'text-gray-600'}`}>
                        {t.due ? `${overdue ? 'Overdue · ' : 'Due '}${formatDate(t.due, { day: 'numeric', month: 'short' })}` : 'No due date'}
                        {data.jobTitles[t.matterId] ? ` · ${data.jobTitles[t.matterId]}` : ''}
                        {t.team ? ' · Whole team' : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyNote>Nothing assigned to you. Nice.</EmptyNote>
            )}
            <TileLink href="/matters">Open the work board</TileLink>
          </Tile>

          {/* Deadlines */}
          <Tile title="Next deadlines">
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.deadlines?.length ? (
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
              <EmptyNote>No upcoming job deadlines.</EmptyNote>
            )}
            <TileLink href="/matters">All matters</TileLink>
          </Tile>

          {/* This week's topics */}
          <Tile title="This week’s topics">
            {loading ? (
              <Skeleton className="h-24" />
            ) : topics.length ? (
              <>
                {topTopic && (
                  <p className="text-sm text-gray-700">
                    Most coverage: <span className="font-semibold text-gray-900">{topTopic.label}</span>
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {topics.map((t) => (
                    <li key={t.id} className="text-sm">
                      <div className="flex justify-between gap-2">
                        <Link href={`/news?topic=${t.id}`} className="text-gray-900 hover:text-brand truncate">
                          {t.label}
                        </Link>
                        <span className="font-mono text-gray-600">{t.count}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden" aria-hidden="true">
                        <div className={`h-full rounded-full ${t.id === 'other' ? 'bg-gray-300' : 'bg-brand'}`} style={{ width: `${(t.count / maxTopic) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <EmptyNote>No stories in the last 7 days.</EmptyNote>
            )}
            <TileLink href="/news">Browse by topic</TileLink>
          </Tile>

          {/* Recent documents */}
          <Tile
            title="Recent documents"
            action={data.docs && <span className="shrink-0 whitespace-nowrap text-xs text-gray-600">{docsTotal} total</span>}
          >
            {loading ? (
              <Skeleton className="h-24" />
            ) : data.recentDocs.length ? (
              <ul className="flex flex-col gap-2.5">
                {data.recentDocs.map((d) => (
                  <li key={d.id} className="flex flex-col gap-0.5">
                    <Link href={`/documents?doc=${d.id}`} className="text-sm font-semibold text-gray-900 hover:text-brand leading-snug line-clamp-2">
                      {d.title}
                    </Link>
                    <span className="text-xs text-gray-600">
                      Added {timeAgo(d.created_at)}
                      {d.processing_status === 'FAILED' ? (
                        <span className="text-red-700 font-semibold"> · Processing failed</span>
                      ) : d.processing_status !== 'COMPLETE' ? (
                        <span className="text-accent-ink font-semibold"> · Being prepared for AI search</span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyNote>No documents yet.</EmptyNote>
            )}
            {data.docs && data.docs.failed > 0 && (
              <p className="text-xs font-semibold text-red-700">
                {data.docs.failed} document{data.docs.failed === 1 ? '' : 's'} failed processing.
              </p>
            )}
            <Link
              href="/documents?tab=upload"
              className="mt-auto min-h-11 rounded-xl border border-brand text-brand text-sm font-semibold flex items-center justify-center hover:bg-brand hover:text-white transition-colors"
            >
              Upload document
            </Link>
          </Tile>
        </div>
      </div>
    </main>
  );
}
