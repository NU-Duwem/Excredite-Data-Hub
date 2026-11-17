'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { requestFeedRefresh, type RefreshOutcome } from '@/utils/news/refreshClient';
import { ALL_TOPIC_IDS, TOPIC_LABELS, type TopicId } from '@/utils/news/topics';
import {
  activeFilterCount,
  DEFAULT_TIME_RANGE,
  feedHealth,
  formatClock,
  groupByDay,
  nextScheduledPull,
  sinceIso,
  TIME_RANGES,
  type SourceStatus,
  type TimeRange,
} from '@/utils/news/feedView';
import FilterPanel from './FilterPanel';

interface NewsArticle {
  id: string;
  source: string;
  title: string;
  url: string | null;
  summary: string | null;
  published_at: string | null;
  region: 'LOCAL' | 'FOREIGN' | null;
  topics: TopicId[] | null;
}

type RegionFilter = 'ALL' | 'LOCAL' | 'FOREIGN';

const PAGE_SIZE = 30;
const MAX_TOPIC_CHIPS = 2;

const REGION_TABS: { value: RegionFilter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'LOCAL', label: 'Nigeria' },
  { value: 'FOREIGN', label: 'International' },
];

const RefreshIcon = ({ spinning }: { spinning: boolean }) => (
  <svg className={`h-4 w-4 ${spinning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export default function NewsPage() {
  return (
    <Suspense fallback={null}>
      <NewsContent />
    </Suspense>
  );
}

function NewsContent() {
  const supabase = useMemo(() => createClient(), []);
  // ?topic=<id> (e.g. from the Overview) opens the page filtered to that topic.
  const searchParams = useSearchParams();

  // --- Data -----------------------------------------------------------------
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [scheduleConnected, setScheduleConnected] = useState(false);

  // --- Filters --------------------------------------------------------------
  const [region, setRegion] = useState<RegionFilter>('ALL');
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [searchQuery, setSearchQuery] = useState('');
  const [topics, setTopics] = useState<Set<TopicId>>(() => {
    const t = searchParams.get('topic') as TopicId | null;
    return t && ALL_TOPIC_IDS.includes(t) ? new Set([t]) : new Set(ALL_TOPIC_IDS);
  });
  const [selectedSources, setSelectedSources] = useState<Set<string> | null>(null); // null = all

  // --- UI -------------------------------------------------------------------
  const [signedIn, setSignedIn] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<RefreshOutcome | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const filtersButtonRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const [now, setNow] = useState(() => new Date());

  // Keep "Today" / next-pull labels correct if the page stays open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  /** Active sources with their last-pull status, and whether the hourly job has an app URL to call. */
  const fetchSourceStatus = useCallback(async () => {
    const [{ data: srcs }, { data: setting }] = await Promise.all([
      supabase.from('news_sources').select('name, last_status, last_fetched_at').eq('is_active', true).order('name'),
      supabase.from('system_settings').select('value').eq('key', 'news_ingest_url').maybeSingle(),
    ]);
    return { list: (srcs ?? []) as SourceStatus[], connected: Boolean(setting?.value?.trim()) };
  }, [supabase]);

  const applySourceStatus = ({ list, connected }: { list: SourceStatus[]; connected: boolean }) => {
    setSources(list);
    setScheduleConnected(connected);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setSignedIn(!!user));
    fetchSourceStatus().then(applySourceStatus);
  }, [supabase, fetchSourceStatus]);

  const noTopics = topics.size === 0;
  const noSources = selectedSources !== null && selectedSources.size === 0;

  const fetchPage = useCallback(
    async (offset: number) => {
      if (noTopics || noSources) return [] as NewsArticle[];
      let query = supabase
        .from('news_articles')
        .select('id, source, title, url, summary, published_at, region, topics')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (region !== 'ALL') query = query.eq('region', region);
      const since = sinceIso(timeRange);
      if (since) query = query.gte('published_at', since);
      if (topics.size < ALL_TOPIC_IDS.length) query = query.overlaps('topics', [...topics]);
      if (selectedSources !== null && selectedSources.size < sources.length) query = query.in('source', [...selectedSources]);
      const q = searchQuery.trim().replace(/[%,()]/g, ' ');
      if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);

      const { data, error: err } = await query;
      if (err) throw err;
      const rows = (data ?? []) as NewsArticle[];

      if (rows.length) {
        const { data: flags } = await supabase.from('anomaly_alerts').select('news_id').in('news_id', rows.map((r) => r.id));
        if (flags?.length) setFlaggedIds((prev) => new Set([...prev, ...flags.map((f) => f.news_id as string)]));
      }
      return rows;
    },
    [supabase, region, timeRange, topics, selectedSources, sources.length, searchQuery, noTopics, noSources],
  );

  // Reload from the top whenever a filter changes (typing in search is debounced).
  useEffect(() => {
    let active = true;
    const id = window.setTimeout(
      async () => {
        setLoading(true);
        setError(null);
        try {
          const rows = await fetchPage(0);
          if (!active) return;
          setArticles(rows);
          setHasMore(rows.length === PAGE_SIZE);
        } catch (err) {
          if (active) setError(err instanceof Error ? err.message : 'Could not load news');
        } finally {
          if (active) setLoading(false);
        }
      },
      searchQuery ? 300 : 0,
    );
    return () => {
      active = false;
      window.clearTimeout(id);
    };
  }, [fetchPage, searchQuery]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const rows = await fetchPage(articles.length);
      setArticles((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more news');
    } finally {
      setLoadingMore(false);
    }
  };

  const refreshFeeds = async () => {
    setRefreshing(true);
    setRefreshNote(null);
    const outcome = await requestFeedRefresh();
    setRefreshNote(outcome);
    if (outcome.kind === 'ok') {
      try {
        const rows = await fetchPage(0);
        setArticles(rows);
        setHasMore(rows.length === PAGE_SIZE);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not load news');
      }
    }
    applySourceStatus(await fetchSourceStatus());
    setRefreshing(false);
  };

  // --- Filter handlers --------------------------------------------------------
  const toggleTopic = (id: TopicId) =>
    setTopics((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleSource = (name: string) =>
    setSelectedSources((prev) => {
      const next = new Set(prev ?? sources.map((s) => s.name));
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next.size === sources.length ? null : next;
    });

  const resetFilters = () => {
    setTimeRange(DEFAULT_TIME_RANGE);
    setTopics(new Set(ALL_TOPIC_IDS));
    setSelectedSources(null);
  };

  // --- Drawer (narrow screens) -------------------------------------------------
  useEffect(() => {
    if (drawerOpen) drawerCloseRef.current?.focus();
  }, [drawerOpen]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    filtersButtonRef.current?.focus();
  };

  // --- Derived ----------------------------------------------------------------
  const { lastPullAt, unreachable } = feedHealth(sources);
  const nextPullAt = scheduleConnected ? nextScheduledPull(now) : null;
  const filterCount = activeFilterCount({
    timeRange,
    topicsSelected: topics.size,
    topicsTotal: ALL_TOPIC_IDS.length,
    sourcesSelected: selectedSources?.size ?? null,
    sourcesTotal: sources.length,
  });
  const filtersActive = filterCount > 0 || region !== 'ALL' || searchQuery.trim() !== '';
  const groups = groupByDay(articles, now);

  const panelProps = {
    timeRange,
    onTimeRange: setTimeRange,
    topics,
    onToggleTopic: toggleTopic,
    sources,
    selectedSources,
    onToggleSource: toggleSource,
    onSelectAllSources: () => setSelectedSources(null),
    onClear: resetFilters,
    lastPullAt,
    nextPullAt,
  };

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto flex-1 min-h-0 flex flex-col gap-4">
        {/* Toolbar: the everyday filters */}
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="mr-2 text-2xl font-extrabold tracking-tight text-gray-900">News &amp; Updates</h1>

          <div role="tablist" aria-label="Region" className="inline-flex rounded-xl bg-white border border-gray-200 p-[3px]">
            {REGION_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={region === t.value}
                onClick={() => setRegion(t.value)}
                className={`min-h-[38px] px-3.5 rounded-[9px] text-[13px] transition-colors ${
                  region === t.value ? 'bg-brand text-white font-semibold' : 'text-gray-700 font-medium hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label htmlFor="news-time" className="sr-only">
            Time range
          </label>
          <select
            id="news-time"
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="hidden md:block min-h-11 rounded-xl bg-white border border-gray-200 px-3 text-[13px] text-gray-900 focus:ring-2 focus:ring-brand outline-none"
          >
            {TIME_RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[180px]">
            <label htmlFor="news-search" className="sr-only">
              Search news
            </label>
            <input
              id="news-search"
              type="search"
              placeholder="Search headlines, plants, companies…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-11 pl-9 pr-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
            />
            <svg className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button
            ref={filtersButtonRef}
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            aria-controls="news-filter-drawer"
            className="xl:hidden min-h-11 px-3.5 rounded-xl border border-brand bg-white text-brand text-sm font-semibold inline-flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeWidth={2.2} d="M4 6h16M7 12h10M10 18h4" />
            </svg>
            Filters
            {filterCount > 0 && (
              <span className="rounded-full bg-accent text-brand px-1.5 text-xs font-extrabold" aria-label={`${filterCount} active`}>
                {filterCount}
              </span>
            )}
          </button>

          {signedIn && (
            <button
              type="button"
              onClick={refreshFeeds}
              disabled={refreshing}
              aria-label="Refresh feeds"
              className="min-h-11 px-3 sm:px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-60 inline-flex items-center gap-2"
            >
              <RefreshIcon spinning={refreshing} />
              <span className="hidden sm:inline">{refreshing ? 'Fetching…' : 'Refresh feeds'}</span>
            </button>
          )}
        </header>

        {refreshNote && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${refreshNote.kind === 'error' ? 'bg-red-50 text-red-700' : 'bg-accent-soft text-accent-ink'}`}
          >
            {refreshNote.message}
          </div>
        )}

        {/* Below the toolbar: the news list and the filter rail scroll independently. */}
        <div className="flex-1 min-h-0 flex gap-4 items-start">
          {/* News list */}
          <section aria-label="News stories" className="scroll-panel relative flex-1 min-w-0 h-full flex flex-col gap-4 pr-1 [&>*]:shrink-0">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" aria-label="Loading" />
              </div>
            ) : error ? (
              <div className="bg-white rounded-2xl border border-red-200 p-8 text-center">
                <p className="text-sm font-semibold text-red-700">Could not load news: {error}</p>
              </div>
            ) : noTopics || noSources ? (
              <div className="bg-white rounded-2xl p-12 text-center space-y-2">
                <p className="text-sm font-semibold text-gray-900">Select at least one {noTopics ? 'topic' : 'source'} to see stories.</p>
                <button type="button" onClick={resetFilters} className="min-h-11 text-sm font-semibold text-brand hover:underline">
                  Reset filters
                </button>
              </div>
            ) : articles.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center space-y-2">
                <p className="text-sm font-semibold text-gray-900">
                  {filtersActive ? 'No stories match these filters.' : 'No news has been pulled in yet.'}
                </p>
                <p className="text-sm text-gray-600">
                  {filtersActive
                    ? 'Try a longer time range or fewer filters.'
                    : signedIn
                      ? 'Use “Refresh feeds” to fetch the latest articles now.'
                      : 'Articles appear here automatically once the feeds have been fetched.'}
                </p>
                {filtersActive && (
                  <button type="button" onClick={resetFilters} className="min-h-11 text-sm font-semibold text-brand hover:underline">
                    Reset filters
                  </button>
                )}
              </div>
            ) : (
              <>
                {groups.map((g) => (
                  <section key={g.key} aria-label={g.label} className="bg-white rounded-2xl overflow-hidden">
                    <h2 className="px-5 py-3 text-xs font-extrabold tracking-wider uppercase text-gray-600 bg-gray-50 border-b border-gray-100">
                      {g.label} · {g.items.length} {g.items.length === 1 ? 'story' : 'stories'}
                    </h2>
                    <ul>
                      {g.items.map((a) => {
                        const flagged = flaggedIds.has(a.id);
                        const topicIds = (a.topics ?? []).filter((t) => t !== 'other').slice(0, MAX_TOPIC_CHIPS);
                        return (
                          <li
                            key={a.id}
                            className={`flex gap-4 items-baseline px-5 py-3.5 border-t border-gray-100 first:border-t-0 ${flagged ? 'bg-red-50/60' : ''}`}
                          >
                            <time dateTime={a.published_at ?? undefined} className="w-12 shrink-0 font-mono text-xs text-gray-600">
                              {formatClock(a.published_at)}
                            </time>
                            <div className="flex-1 min-w-0 flex flex-col gap-1">
                              {a.url ? (
                                <a
                                  href={a.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[15px] font-bold text-gray-900 leading-snug hover:text-brand"
                                >
                                  {a.title}
                                  <span className="sr-only"> (opens {a.source} in a new tab)</span>
                                </a>
                              ) : (
                                <span className="text-[15px] font-bold text-gray-900 leading-snug">{a.title}</span>
                              )}
                              {a.summary && <p className="text-[13px] text-gray-600 leading-snug line-clamp-1">{a.summary}</p>}
                              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                <span className="font-bold text-brand">{a.source}</span>
                                {a.region && (
                                  <span
                                    className={`px-2 py-px rounded-full font-semibold ${
                                      a.region === 'LOCAL' ? 'bg-brand/10 text-brand' : 'bg-accent-soft text-accent-ink'
                                    }`}
                                  >
                                    {a.region === 'LOCAL' ? 'Nigeria' : 'International'}
                                  </span>
                                )}
                                {topicIds.map((t) => (
                                  <span key={t} className="px-2 py-px rounded-full bg-gray-100 text-gray-700">
                                    {TOPIC_LABELS[t]}
                                  </span>
                                ))}
                                {flagged && <span className="px-2 py-px rounded-full bg-red-100 text-red-800 font-bold">Anomaly flagged</span>}
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                {hasMore && (
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="min-h-11 px-6 rounded-xl border border-brand bg-white text-brand text-sm font-semibold hover:bg-brand hover:text-white transition-colors disabled:opacity-60"
                    >
                      {loadingMore ? 'Loading…' : 'Load earlier stories'}
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {/* Filter rail: wide screens only, on the RIGHT so it never sits beside the app sidebar */}
          <aside
            aria-label="More filters"
            className="scroll-panel relative hidden xl:block w-[260px] shrink-0 max-h-full bg-white rounded-2xl p-5"
          >
            <h2 className="mb-4 text-sm font-extrabold text-gray-900">Filters</h2>
            <FilterPanel {...panelProps} showTimeRange={false} idPrefix="rail" />
            {unreachable.length > 0 && (
              <p className="mt-3 text-xs text-orange-800">
                {unreachable.length} source{unreachable.length === 1 ? '' : 's'} not reached on the last pull.
              </p>
            )}
          </aside>
        </div>
      </div>

      {/* Filter drawer: narrower screens */}
      {drawerOpen && (
        <div className="xl:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-gray-950/40" aria-hidden="true" onClick={closeDrawer} />
          <div
            id="news-filter-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="news-filter-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') closeDrawer();
            }}
            className="absolute inset-y-0 right-0 w-full sm:w-[360px] bg-white shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 id="news-filter-title" className="text-lg font-extrabold text-gray-900">
                Filters
              </h2>
              <button
                ref={drawerCloseRef}
                type="button"
                onClick={closeDrawer}
                aria-label="Close filters"
                className="h-11 w-11 rounded-xl bg-gray-50 hover:bg-gray-100 flex items-center justify-center text-gray-900"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeWidth={2.2} d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
            <div className="scroll-panel flex-1 min-h-0 px-6 pb-4">
              <FilterPanel {...panelProps} showTimeRange idPrefix="drawer" />
            </div>
            <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={resetFilters}
                className="flex-1 min-h-12 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900"
              >
                Reset
              </button>
              <button type="button" onClick={closeDrawer} className="flex-[2] min-h-12 rounded-xl bg-brand text-white text-sm font-bold">
                {loading ? 'Loading…' : `Show ${articles.length}${hasMore ? '+' : ''} ${articles.length === 1 ? 'story' : 'stories'}`}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
