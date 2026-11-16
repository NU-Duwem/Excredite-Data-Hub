import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decodeBody, ingestAllSources, MAX_FEED_BYTES, readCapped, type NewsSource } from '../ingest';

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { url: string };

function fakeDb(opts: { sources: NewsSource[]; existingUrls?: string[]; upsertError?: string; sourcesError?: string }) {
  const stored = new Map<string, Row>((opts.existingUrls ?? []).map((u) => [u, { url: u }]));
  const upsertCalls: Row[][] = [];
  const statusUpdates: Record<string, unknown>[] = [];
  const client = {
    from(table: string) {
      if (table === 'news_sources') {
        return {
          select: () => ({
            eq: () => ({
              order: async () =>
                opts.sourcesError ? { data: null, error: { message: opts.sourcesError } } : { data: opts.sources, error: null },
            }),
          }),
          update: (values: Record<string, unknown>) => ({
            eq: async (_col: string, id: string) => {
              statusUpdates.push({ id, ...values });
              return { error: null };
            },
          }),
        };
      }
      if (table === 'news_articles') {
        return {
          upsert: (rows: Row[]) => ({
            select: async () => {
              upsertCalls.push(rows);
              if (opts.upsertError) return { data: null, error: { message: opts.upsertError } };
              const fresh = rows.filter((r) => !stored.has(r.url));
              fresh.forEach((r) => stored.set(r.url, r));
              return { data: fresh.map(() => ({ id: 'x' })), error: null };
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseClient, stored, upsertCalls, statusUpdates };
}

const source = (id: string, overrides: Partial<NewsSource> = {}): NewsSource => ({
  id,
  name: `Source ${id}`,
  feed_url: `https://feeds.example/${id}`,
  region: 'LOCAL',
  filter_by_keywords: false,
  ...overrides,
});

const recent = (hoursAgo: number) => new Date(Date.now() - hoursAgo * 3_600_000).toUTCString();

const feed = (items: { title: string; link: string; date?: string | null; summary?: string }[]) =>
  `<rss version="2.0"><channel><title>F</title>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link>${i.date === null ? '' : `<pubDate>${i.date ?? recent(1)}</pubDate>`}${
          i.summary ? `<description>${i.summary}</description>` : ''
        }</item>`,
    )
    .join('')}</channel></rss>`;

type Handler = (init?: RequestInit) => Response | Promise<Response>;

/** Route fetch() by URL; unknown URLs fail like a DNS error. */
function mockFetch(routes: Record<string, Handler>) {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      const handler = routes[url];
      if (!handler) throw new TypeError('fetch failed');
      return handler(init);
    }),
  );
  return calls;
}

const xml = (body: string, headers: Record<string, string> = {}) => () =>
  new Response(body, { status: 200, headers: { 'content-type': 'application/rss+xml; charset=utf-8', ...headers } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('ingestAllSources: happy path', () => {
  it('stores articles with source, region and timestamps', async () => {
    const db = fakeDb({ sources: [source('a', { region: 'FOREIGN' })] });
    mockFetch({ 'https://feeds.example/a': xml(feed([{ title: 'Grid news', link: 'https://news.example/1', summary: 'S' }])) });

    const summary = await ingestAllSources(db.client);

    expect(summary).toMatchObject({ sources: 1, inserted: 1, failed: 0 });
    const row = db.stored.get('https://news.example/1')!;
    expect(row).toMatchObject({ source: 'Source a', source_id: 'a', region: 'FOREIGN', title: 'Grid news', summary: 'S', topics: ['grid'] });
    expect(typeof row.fetched_at).toBe('string');
    expect(db.statusUpdates).toEqual([expect.objectContaining({ id: 'a', last_status: 'OK', last_item_count: 1, last_error: null })]);
  });

  it('a second run inserts nothing (de-duplication by URL)', async () => {
    const db = fakeDb({ sources: [source('a')] });
    mockFetch({ 'https://feeds.example/a': xml(feed([{ title: 'A', link: 'https://news.example/1' }])) });
    await ingestAllSources(db.client);
    const second = await ingestAllSources(db.client);
    expect(second.inserted).toBe(0);
    expect(db.stored.size).toBe(1);
  });

  it('collapses the same article repeated in one feed, including tracking-tag variants', async () => {
    const db = fakeDb({ sources: [source('a')] });
    mockFetch({
      'https://feeds.example/a': xml(
        feed([
          { title: 'A', link: 'https://news.example/1' },
          { title: 'A again', link: 'https://news.example/1?utm_source=rss' },
          { title: 'A anchor', link: 'https://news.example/1#comments' },
        ]),
      ),
    });
    const summary = await ingestAllSources(db.client);
    expect(summary.inserted).toBe(1);
    expect(db.upsertCalls[0]).toHaveLength(1);
  });

  it('uses the fetch time for undated items', async () => {
    const db = fakeDb({ sources: [source('a')] });
    mockFetch({ 'https://feeds.example/a': xml(feed([{ title: 'A', link: 'https://news.example/1', date: null }])) });
    await ingestAllSources(db.client);
    const row = db.stored.get('https://news.example/1')!;
    expect(row.published_at).toBe(row.fetched_at);
  });

  it('returns an empty summary when no sources are active', async () => {
    const db = fakeDb({ sources: [] });
    const calls = mockFetch({});
    expect(await ingestAllSources(db.client)).toMatchObject({ sources: 0, inserted: 0, failed: 0, results: [] });
    expect(calls).toEqual([]);
  });

  it('reports results sorted by source name', async () => {
    const db = fakeDb({ sources: [source('b'), source('a'), source('c')] });
    mockFetch({
      'https://feeds.example/a': xml(feed([])),
      'https://feeds.example/b': xml(feed([])),
      'https://feeds.example/c': xml(feed([])),
    });
    const { results } = await ingestAllSources(db.client);
    expect(results.map((r) => r.source)).toEqual(['Source a', 'Source b', 'Source c']);
  });
});

describe('ingestAllSources: filtering', () => {
  const items = [
    { title: 'NERC reviews tariff order', link: 'https://news.example/power' },
    { title: 'Super Eagles win in Uyo', link: 'https://news.example/football' },
  ];

  it('applies the keyword filter only to sources marked filter_by_keywords', async () => {
    const db = fakeDb({ sources: [source('general', { filter_by_keywords: true }), source('energy', { filter_by_keywords: false })] });
    mockFetch({
      'https://feeds.example/general': xml(feed(items)),
      'https://feeds.example/energy': xml(feed(items.map((i) => ({ ...i, link: `${i.link}-e` })))),
    });
    const { results } = await ingestAllSources(db.client);
    expect(results.find((r) => r.source === 'Source general')).toMatchObject({ itemsInFeed: 2, relevant: 1, inserted: 1 });
    expect(results.find((r) => r.source === 'Source energy')).toMatchObject({ itemsInFeed: 2, relevant: 2, inserted: 2 });
    expect(db.stored.has('https://news.example/football')).toBe(false);
  });

  it('skips items older than 30 days', async () => {
    const db = fakeDb({ sources: [source('a')] });
    mockFetch({
      'https://feeds.example/a': xml(
        feed([
          { title: 'Fresh', link: 'https://news.example/fresh', date: recent(24) },
          { title: 'Stale', link: 'https://news.example/stale', date: recent(24 * 45) },
        ]),
      ),
    });
    const summary = await ingestAllSources(db.client);
    expect(summary.inserted).toBe(1);
    expect(db.stored.has('https://news.example/stale')).toBe(false);
  });
});

describe('ingestAllSources: failures are isolated per source', () => {
  it('records HTTP errors and still processes the other sources', async () => {
    const db = fakeDb({ sources: [source('bad'), source('good')] });
    mockFetch({
      'https://feeds.example/bad': () => new Response('Forbidden', { status: 403 }),
      'https://feeds.example/good': xml(feed([{ title: 'A', link: 'https://news.example/1' }])),
    });
    const summary = await ingestAllSources(db.client);
    expect(summary).toMatchObject({ inserted: 1, failed: 1 });
    expect(summary.results.find((r) => r.source === 'Source bad')).toMatchObject({ status: 'ERROR', error: 'HTTP 403' });
    expect(db.statusUpdates.find((u) => u.id === 'bad')).toMatchObject({ last_status: 'ERROR', last_error: 'HTTP 403' });
  });

  it('records network errors (DNS, refused connection)', async () => {
    const db = fakeDb({ sources: [source('gone')] });
    mockFetch({});
    const { results } = await ingestAllSources(db.client);
    expect(results[0]).toMatchObject({ status: 'ERROR', error: 'fetch failed' });
  });

  it('records a bot-check HTML page served with 200 as an error', async () => {
    const db = fakeDb({ sources: [source('cf')] });
    mockFetch({ 'https://feeds.example/cf': xml('<!doctype html><html><body>Just a moment…</body></html>', { 'content-type': 'text/html' }) });
    const { results } = await ingestAllSources(db.client);
    expect(results[0]).toMatchObject({ status: 'ERROR', error: 'Not an RSS or Atom feed' });
  });

  it('times out a feed that never responds', async () => {
    const db = fakeDb({ sources: [source('slow'), source('fast')] });
    mockFetch({
      'https://feeds.example/slow': (init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
      'https://feeds.example/fast': xml(feed([{ title: 'A', link: 'https://news.example/1' }])),
    });
    // A 4 s budget leaves ~2 s for the fetch timeout.
    const started = Date.now();
    const summary = await ingestAllSources(db.client, { budgetMs: 4_000 });
    expect(Date.now() - started).toBeLessThan(4_000);
    expect(summary.results.find((r) => r.source === 'Source slow')?.status).toBe('ERROR');
    expect(summary.results.find((r) => r.source === 'Source fast')).toMatchObject({ status: 'OK', inserted: 1 });
  });

  it('skips sources it has no time left for instead of overrunning the route limit', async () => {
    const db = fakeDb({ sources: [source('a'), source('b')] });
    const calls = mockFetch({});
    const summary = await ingestAllSources(db.client, { budgetMs: 0 });
    expect(calls).toEqual([]);
    expect(summary.results.every((r) => r.error === 'Skipped: run time limit reached')).toBe(true);
  });

  it('records database errors against the source', async () => {
    const db = fakeDb({ sources: [source('a')], upsertError: 'duplicate key value violates unique constraint' });
    mockFetch({ 'https://feeds.example/a': xml(feed([{ title: 'A', link: 'https://news.example/1' }])) });
    const { results } = await ingestAllSources(db.client);
    expect(results[0]).toMatchObject({ status: 'ERROR', error: 'Database: duplicate key value violates unique constraint' });
  });

  it('throws if the source list itself cannot be loaded', async () => {
    const db = fakeDb({ sources: [], sourcesError: 'relation "news_sources" does not exist' });
    await expect(ingestAllSources(db.client)).rejects.toThrow(/news_sources/);
  });
});

describe('ingestAllSources: large feeds', () => {
  it('writes in batches of 100', async () => {
    const db = fakeDb({ sources: [source('big')] });
    const items = Array.from({ length: 250 }, (_, n) => ({ title: `Item ${n}`, link: `https://news.example/${n}` }));
    mockFetch({ 'https://feeds.example/big': xml(feed(items)) });
    const summary = await ingestAllSources(db.client);
    expect(db.upsertCalls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(summary.inserted).toBe(250);
  });

  it('rejects an oversized feed from Content-Length without downloading it', async () => {
    const db = fakeDb({ sources: [source('huge')] });
    mockFetch({ 'https://feeds.example/huge': xml('<rss/>', { 'content-length': String(MAX_FEED_BYTES + 1) }) });
    const { results } = await ingestAllSources(db.client);
    expect(results[0]).toMatchObject({ status: 'ERROR', error: 'Feed too large' });
  });
});

describe('readCapped', () => {
  it('stops reading a stream without Content-Length once it passes the limit', async () => {
    let pulled = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(1024));
        if (pulled > 1000) controller.close();
      },
    });
    await expect(readCapped(new Response(stream), 10 * 1024)).rejects.toThrow('Feed too large');
    expect(pulled).toBeLessThan(20);
  });

  it('returns the bytes when under the limit', async () => {
    const bytes = await readCapped(new Response('hello'), 1024);
    expect(new TextDecoder().decode(bytes)).toBe('hello');
  });
});

describe('decodeBody', () => {
  it('honours the charset in Content-Type', () => {
    const latin1 = new Uint8Array([0x43, 0x61, 0x66, 0xe9]); // "Café" in ISO-8859-1
    expect(decodeBody(latin1, 'application/rss+xml; charset=ISO-8859-1')).toBe('Café');
  });

  it('falls back to the XML declaration', () => {
    const bytes = new Uint8Array([
      ...new TextEncoder().encode('<?xml version="1.0" encoding="windows-1252"?><t>'),
      0x92, // right single quote in Windows-1252
      ...new TextEncoder().encode('</t>'),
    ]);
    expect(decodeBody(bytes, 'text/xml')).toContain('<t>’</t>');
  });

  it('defaults to UTF-8 and survives unknown charset labels', () => {
    const utf8 = new TextEncoder().encode('₦50bn');
    expect(decodeBody(utf8, null)).toBe('₦50bn');
    expect(decodeBody(utf8, 'text/xml; charset=not-a-charset')).toBe('₦50bn');
  });

  it('strips a UTF-8 byte-order mark', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('<rss/>')]);
    expect(decodeBody(bytes, null)).toBe('<rss/>');
  });
});
