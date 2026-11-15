'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

interface NewsArticle {
  id: string;
  source: string;
  title: string;
  url: string | null;
  summary: string | null;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
  region: 'LOCAL' | 'FOREIGN' | null;
}

type RegionFilter = 'ALL' | 'LOCAL' | 'FOREIGN';

type IngestSummary = {
  sources: number;
  inserted: number;
  failed: number;
  results: { source: string; status: 'OK' | 'ERROR'; inserted: number; error?: string }[];
};

const PAGE_SIZE = 30;

const REGION_TABS: { value: RegionFilter; label: string }[] = [
  { value: 'ALL', label: 'All news' },
  { value: 'LOCAL', label: 'Nigeria' },
  { value: 'FOREIGN', label: 'International' },
];

function formatRelative(dateStr: string | null) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const diffHours = Math.floor((Date.now() - date.getTime()) / 3_600_000);
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Thumbnail from the feed; hides itself if the publisher blocks hot-linking. */
function Thumb({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="hidden sm:block h-24 w-36 shrink-0 rounded-xl object-cover bg-gray-100"
    />
  );
}

export default function NewsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [region, setRegion] = useState<RegionFilter>('ALL');
  const [source, setSource] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sources, setSources] = useState<string[]>([]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  // Admin check (for the "Refresh feeds" button) and the source list for the filter.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
      setIsAdmin(data?.role === 'power_admin');
    });
    supabase
      .from('news_sources')
      .select('name')
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => setSources((data ?? []).map((s) => s.name)));
  }, [supabase]);

  const fetchPage = useCallback(
    async (offset: number) => {
      let query = supabase
        .from('news_articles')
        .select('id, source, title, url, summary, image_url, published_at, created_at, region')
        .order('published_at', { ascending: false, nullsFirst: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (region !== 'ALL') query = query.eq('region', region);
      if (source !== 'All') query = query.eq('source', source);
      const q = searchQuery.trim().replace(/[%,()]/g, ' ');
      if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);

      const { data, error: err } = await query;
      if (err) throw err;
      const rows = (data ?? []) as NewsArticle[];

      // Mark articles that an anomaly alert points at.
      if (rows.length) {
        const { data: flags } = await supabase
          .from('anomaly_alerts')
          .select('news_id')
          .in('news_id', rows.map((r) => r.id));
        if (flags?.length) {
          setFlaggedIds((prev) => new Set([...prev, ...flags.map((f) => f.news_id as string)]));
        }
      }
      return rows;
    },
    [supabase, region, source, searchQuery],
  );

  // Reload from the top whenever a filter changes (search is debounced).
  useEffect(() => {
    let active = true;
    const id = window.setTimeout(async () => {
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
    }, searchQuery ? 300 : 0);
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
    try {
      const res = await fetch('/api/news/ingest', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      const s = body as IngestSummary;
      const failedNames = s.results.filter((r) => r.status === 'ERROR').map((r) => r.source);
      setRefreshNote({
        kind: 'ok',
        text:
          `${s.inserted} new article${s.inserted === 1 ? '' : 's'} from ${s.sources} source${s.sources === 1 ? '' : 's'}.` +
          (failedNames.length ? ` Could not reach: ${failedNames.join(', ')}.` : ''),
      });
      const rows = await fetchPage(0);
      setArticles(rows);
      setHasMore(rows.length === PAGE_SIZE);
    } catch (err) {
      setRefreshNote({ kind: 'error', text: err instanceof Error ? err.message : 'Refresh failed' });
    } finally {
      setRefreshing(false);
    }
  };

  const filtersActive = region !== 'ALL' || source !== 'All' || searchQuery.trim() !== '';

  return (
    <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-gray-200 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">News &amp; Updates</h1>
            <p className="mt-1 text-sm text-gray-600">
              Electricity-sector news from Nigerian outlets and international trade press, pulled automatically from RSS feeds.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={refreshFeeds}
              disabled={refreshing}
              className="shrink-0 inline-flex items-center gap-2 min-h-11 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover transition-colors disabled:opacity-60"
            >
              <svg className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {refreshing ? 'Fetching feeds…' : 'Refresh feeds'}
            </button>
          )}
        </div>

        {refreshNote && (
          <div
            role="status"
            className={`rounded-xl px-4 py-3 text-sm ${
              refreshNote.kind === 'ok' ? 'bg-accent-soft text-accent-ink' : 'bg-red-50 text-red-700'
            }`}
          >
            {refreshNote.text}
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div role="tablist" aria-label="Region" className="inline-flex rounded-xl bg-white border border-gray-200 p-1">
            {REGION_TABS.map((t) => (
              <button
                key={t.value}
                type="button"
                role="tab"
                aria-selected={region === t.value}
                onClick={() => setRegion(t.value)}
                className={`min-h-9 px-3 rounded-lg text-sm font-medium transition-colors ${
                  region === t.value ? 'bg-brand text-white' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <label htmlFor="news-source" className="sr-only">
            Source
          </label>
          <select
            id="news-source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="min-h-11 rounded-xl bg-white border border-gray-200 px-3 text-sm text-gray-900 focus:ring-2 focus:ring-brand outline-none"
          >
            <option value="All">All sources</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="relative flex-1 min-w-[200px] max-w-md">
            <label htmlFor="news-search" className="sr-only">
              Search news
            </label>
            <input
              id="news-search"
              type="search"
              placeholder="Search news…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-11 pl-9 pr-3 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-brand focus:border-transparent outline-none"
            />
            <svg className="absolute left-3 top-3.5 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* News feed */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" aria-label="Loading" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-xl border border-red-200 p-8 text-center">
            <p className="text-sm font-semibold text-red-700">Could not load news: {error}</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center space-y-2">
            <p className="text-sm font-semibold text-gray-900">
              {filtersActive ? 'No articles match these filters.' : 'No news has been pulled in yet.'}
            </p>
            {!filtersActive && (
              <p className="text-sm text-gray-600">
                {isAdmin
                  ? 'Use “Refresh feeds” to fetch the latest articles now.'
                  : 'Articles appear here automatically once the feeds have been fetched.'}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {articles.map((article) => {
              const flagged = flaggedIds.has(article.id);
              return (
                <article
                  key={article.id}
                  className={`bg-white rounded-xl border overflow-hidden transition-shadow hover:shadow-md ${
                    flagged ? 'border-red-200' : 'border-gray-200'
                  }`}
                >
                  <div className="p-5 sm:p-6 flex gap-5">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold bg-gray-100 text-gray-800">
                          {article.source}
                        </span>
                        {article.region && (
                          <span
                            className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                              article.region === 'LOCAL' ? 'bg-brand/10 text-brand' : 'bg-accent-soft text-accent-ink'
                            }`}
                          >
                            {article.region === 'LOCAL' ? 'Nigeria' : 'International'}
                          </span>
                        )}
                        <span className="text-[11px] font-medium text-gray-600">{formatRelative(article.published_at)}</span>
                        {flagged && (
                          <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold bg-red-50 text-red-700">
                            Anomaly flagged
                          </span>
                        )}
                      </div>

                      <h2 className="text-base font-bold text-gray-900 leading-snug mb-1.5">
                        {article.url ? (
                          <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:text-brand">
                            {article.title}
                          </a>
                        ) : (
                          article.title
                        )}
                      </h2>

                      {article.summary && <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">{article.summary}</p>}

                      {article.url && (
                        <a
                          href={article.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline"
                        >
                          Read at {article.source}
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>
                      )}
                    </div>
                    {article.image_url && <Thumb src={article.image_url} />}
                  </div>
                </article>
              );
            })}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="min-h-11 px-6 rounded-xl border border-brand text-brand text-sm font-semibold hover:bg-brand hover:text-white transition-colors disabled:opacity-60"
                >
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
