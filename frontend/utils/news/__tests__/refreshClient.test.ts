import { describe, expect, it } from 'vitest';
import { describeWait, requestFeedRefresh } from '../refreshClient';

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  (async () =>
    new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    })) as unknown as typeof fetch;

describe('requestFeedRefresh', () => {
  it('POSTs to the ingest endpoint', async () => {
    let seen: [string, RequestInit | undefined] | null = null;
    const spy = (async (url: string, init?: RequestInit) => {
      seen = [url, init];
      return new Response(JSON.stringify({ sources: 1, inserted: 0, results: [] }));
    }) as unknown as typeof fetch;
    await requestFeedRefresh(spy);
    expect(seen).toEqual(['/api/news/ingest', { method: 'POST' }]);
  });

  it('summarises a successful pull, naming unreachable sources', async () => {
    const out = await requestFeedRefresh(
      respond(200, { sources: 16, inserted: 12, results: [{ source: 'Punch', status: 'ERROR' }, { source: 'ThisDay', status: 'OK' }] }),
    );
    expect(out).toEqual({ kind: 'ok', inserted: 12, message: '12 new articles from 16 sources. Could not reach: Punch.' });
  });

  it('handles singular counts and no new articles', async () => {
    expect((await requestFeedRefresh(respond(200, { sources: 1, inserted: 1, results: [] }))).message).toBe('1 new article from 1 source.');
    expect((await requestFeedRefresh(respond(200, { sources: 16, inserted: 0, results: [] }))).message).toBe('No new articles from 16 sources.');
  });

  it('explains the cool-down using the server-provided wait', async () => {
    const out = await requestFeedRefresh(respond(429, { retryAfterSeconds: 181 }));
    expect(out).toEqual({ kind: 'cooldown', message: 'Feeds were refreshed moments ago. You can refresh again in 4 minutes.' });
  });

  it('falls back to the Retry-After header', async () => {
    const out = await requestFeedRefresh(respond(429, 'Too many', { 'retry-after': '30', 'content-type': 'text/plain' }));
    expect(out.message).toContain('30 seconds');
  });

  it('tells a signed-out user to sign in again', async () => {
    expect(await requestFeedRefresh(respond(401, { error: 'Not authorised' }))).toMatchObject({ kind: 'error', message: expect.stringMatching(/Sign in again/) });
  });

  it('reports server errors, including non-JSON gateway pages', async () => {
    expect((await requestFeedRefresh(respond(500, { error: 'News ingest failed' }))).message).toBe('Refresh failed: News ingest failed');
    expect((await requestFeedRefresh(respond(504, '<html>Gateway Timeout</html>', { 'content-type': 'text/html' }))).message).toBe(
      'Refresh failed: HTTP 504',
    );
  });

  it('reports network failures', async () => {
    const offline = (async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await requestFeedRefresh(offline)).toMatchObject({ kind: 'error', message: expect.stringMatching(/Could not reach the server/) });
  });
});

describe('describeWait', () => {
  it.each([
    [0, '1 second'],
    [1, '1 second'],
    [45, '45 seconds'],
    [60, '1 minute'],
    [61, '2 minutes'],
    [300, '5 minutes'],
  ])('%i s → %s', (s, text) => expect(describeWait(s)).toBe(text));
});
