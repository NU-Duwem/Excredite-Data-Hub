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
export const MAX_FEED_BYTES = 5 * 1024 * 1024;
const CONCURRENCY = 5;
/** Whole-run budget, kept under the API route's 60 s limit. */
const RUN_BUDGET_MS = 50_000;
/** Rows per database request. */
const UPSERT_BATCH = 100;
/** Ignore items older than this, so a first run doesn't import years of archive. */
const MAX_ITEM_AGE_DAYS = 30;
/** Generic client name: no personal or deployment details are sent to news sites. */
const USER_AGENT = 'Mozilla/5.0 (compatible; EPDH-NewsBot/1.0; RSS reader)';

/** Read a response body, aborting as soon as it exceeds `maxBytes`. */
export async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error('Feed too large');
  if (!res.body) {
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > maxBytes) throw new Error('Feed too large');
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error('Feed too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Decode using the charset from Content-Type, else the XML declaration, else UTF-8. */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  const fromHeader = contentType?.match(/charset\s*=\s*"?([\w.:-]+)/i)?.[1];
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 256));
  const fromXml = head.match(/<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i)?.[1];
  for (const label of [fromHeader, fromXml, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // Unknown label: try the next candidate.
    }
  }
  return new TextDecoder('utf-8').decode(bytes);
}

async function fetchFeed(url: string, timeoutMs: number): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
    cache: 'no-store',
  });
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new Error(`HTTP ${res.status}`);
  }
  return decodeBody(await readCapped(res, MAX_FEED_BYTES), res.headers.get('content-type'));
}

function isRecent(item: FeedItem): boolean {
  if (!item.publishedAt) return true; // undated items are kept; unique url stops repeats
  return Date.now() - new Date(item.publishedAt).getTime() <= MAX_ITEM_AGE_DAYS * 86_400_000;
}

async function ingestSource(admin: SupabaseClient, source: NewsSource, timeoutMs: number): Promise<SourceResult> {
  const result: SourceResult = { source: source.name, status: 'OK', itemsInFeed: 0, relevant: 0, inserted: 0 };
  try {
    const items = parseFeed(await fetchFeed(source.feed_url, timeoutMs), source.feed_url);
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

    // Unique index on url: existing articles are skipped, never overwritten.
    for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
      const { data, error } = await admin
        .from('news_articles')
        .upsert(rows.slice(i, i + UPSERT_BATCH), { onConflict: 'url', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`Database: ${error.message}`);
      result.inserted += data?.length ?? 0;
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

export type IngestOptions = {
  /** Total time allowed for the run; sources not started in time are reported as skipped. */
  budgetMs?: number;
  concurrency?: number;
};

/** Pull every active source once. Needs a service-role client (writes bypass RLS). */
export async function ingestAllSources(admin: SupabaseClient, options: IngestOptions = {}): Promise<IngestSummary> {
  const startedAt = new Date().toISOString();
  const deadline = Date.now() + (options.budgetMs ?? RUN_BUDGET_MS);
  const { data: sources, error } = await admin
    .from('news_sources')
    .select('id, name, feed_url, region, filter_by_keywords')
    .eq('is_active', true)
    .order('name');
  if (error) throw new Error(`Could not load news_sources: ${error.message}`);

  const queue = [...((sources ?? []) as NewsSource[])];
  const results: SourceResult[] = [];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      // Leave ~2 s per source for the database writes after the fetch.
      const remaining = deadline - Date.now() - 2_000;
      if (remaining < 1_000) {
        results.push({ source: s.name, status: 'ERROR', itemsInFeed: 0, relevant: 0, inserted: 0, error: 'Skipped: run time limit reached' });
        continue;
      }
      results.push(await ingestSource(admin, s, Math.min(FETCH_TIMEOUT_MS, remaining)));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, options.concurrency ?? CONCURRENCY) }, worker));

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
