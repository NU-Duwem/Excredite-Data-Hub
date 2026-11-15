import type { SupabaseClient } from '@supabase/supabase-js';
import { parseFeed, type FeedItem } from './rss';
import { isElectricityRelated } from './relevance';

export type NewsSource = {
  id: string;
  name: string;
  feed_url: string;
  region: 'LOCAL' | 'FOREIGN';
  filter_by_keywords: boolean;
};

export type SourceResult = {
  source: string;
  status: 'OK' | 'ERROR';
  itemsInFeed: number;
  relevant: number;
  inserted: number;
  error?: string;
};

export type IngestSummary = {
  startedAt: string;
  finishedAt: string;
  sources: number;
  inserted: number;
  failed: number;
  results: SourceResult[];
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 5 * 1024 * 1024;
const CONCURRENCY = 5;
/** Ignore items older than this, so a first run doesn't import years of archive. */
const MAX_ITEM_AGE_DAYS = 30;
/** Generic client name: no personal or deployment details are sent to news sites. */
const USER_AGENT = 'Mozilla/5.0 (compatible; EPDH-NewsBot/1.0; RSS reader)';

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.text();
  if (body.length > MAX_FEED_BYTES) throw new Error('Feed too large');
  return body;
}

function isRecent(item: FeedItem): boolean {
  if (!item.publishedAt) return true; // undated items are kept; unique url stops repeats
  return Date.now() - new Date(item.publishedAt).getTime() <= MAX_ITEM_AGE_DAYS * 86_400_000;
}

async function ingestSource(admin: SupabaseClient, source: NewsSource): Promise<SourceResult> {
  const result: SourceResult = { source: source.name, status: 'OK', itemsInFeed: 0, relevant: 0, inserted: 0 };
  try {
    const items = parseFeed(await fetchFeed(source.feed_url));
    result.itemsInFeed = items.length;

    const relevant = items.filter(
      (i) => isRecent(i) && (!source.filter_by_keywords || isElectricityRelated(i.title, i.summary)),
    );
    result.relevant = relevant.length;

    // De-duplicate within the feed itself before upserting.
    const byUrl = new Map(relevant.map((i) => [i.link, i]));
    const fetchedAt = new Date().toISOString();
    const rows = [...byUrl.values()].map((i) => ({
      source: source.name,
      source_id: source.id,
      region: source.region,
      title: i.title,
      url: i.link,
      guid: i.guid,
      summary: i.summary,
      image_url: i.imageUrl,
      published_at: i.publishedAt ?? fetchedAt,
      fetched_at: fetchedAt,
    }));

    if (rows.length) {
      // Unique index on url: existing articles are skipped, never overwritten.
      const { data, error } = await admin
        .from('news_articles')
        .upsert(rows, { onConflict: 'url', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`Database: ${error.message}`);
      result.inserted = data?.length ?? 0;
    }
  } catch (err) {
    result.status = 'ERROR';
    result.error = err instanceof Error ? err.message : String(err);
  }

  await admin
    .from('news_sources')
    .update({
      last_fetched_at: new Date().toISOString(),
      last_status: result.status,
      last_error: result.error ?? null,
      last_item_count: result.inserted,
    })
    .eq('id', source.id);

  return result;
}

/** Pull every active source once. Needs a service-role client (writes bypass RLS). */
export async function ingestAllSources(admin: SupabaseClient): Promise<IngestSummary> {
  const startedAt = new Date().toISOString();
  const { data: sources, error } = await admin
    .from('news_sources')
    .select('id, name, feed_url, region, filter_by_keywords')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(`Could not load news_sources: ${error.message}`);

  const queue = [...((sources ?? []) as NewsSource[])];
  const results: SourceResult[] = [];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) results.push(await ingestSource(admin, s));
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  results.sort((a, b) => a.source.localeCompare(b.source));
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    sources: results.length,
    inserted: results.reduce((n, r) => n + r.inserted, 0),
    failed: results.filter((r) => r.status === 'ERROR').length,
    results,
  };
}
