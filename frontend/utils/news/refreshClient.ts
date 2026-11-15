/** Browser-side helper shared by the News page button and the Overview refresh icon. */

export type RefreshOutcome =
  | { kind: 'ok'; inserted: number; message: string }
  | { kind: 'cooldown'; message: string }
  | { kind: 'error'; message: string };

type Summary = {
  sources: number;
  inserted: number;
  results?: { source: string; status: 'OK' | 'ERROR' }[];
};

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeWait(seconds: number): string {
  if (seconds < 60) return plural(Math.max(1, Math.ceil(seconds)), 'second');
  return plural(Math.ceil(seconds / 60), 'minute');
}

export async function requestFeedRefresh(fetchImpl: typeof fetch = fetch): Promise<RefreshOutcome> {
  let res: Response;
  try {
    res = await fetchImpl('/api/news/ingest', { method: 'POST' });
  } catch {
    return { kind: 'error', message: 'Could not reach the server. Check your connection and try again.' };
  }

  let body: Record<string, unknown> = {};
  try {
    body = await res.json();
  } catch {
    // Non-JSON error page (e.g. a gateway timeout); handled below by status.
  }

  if (res.status === 429) {
    const wait = Number(body.retryAfterSeconds ?? res.headers.get('retry-after') ?? 300);
    return { kind: 'cooldown', message: `Feeds were refreshed moments ago. You can refresh again in ${describeWait(wait)}.` };
  }
  if (res.status === 401) {
    return { kind: 'error', message: 'Your session has expired. Sign in again to refresh feeds.' };
  }
  if (!res.ok) {
    const detail = typeof body.error === 'string' ? body.error : `HTTP ${res.status}`;
    return { kind: 'error', message: `Refresh failed: ${detail}` };
  }

  const s = body as unknown as Summary;
  const failed = (s.results ?? []).filter((r) => r.status === 'ERROR').map((r) => r.source);
  const message =
    `${s.inserted ? plural(s.inserted, 'new article') : 'No new articles'} from ${plural(s.sources, 'source')}.` +
    (failed.length ? ` Could not reach: ${failed.join(', ')}.` : '');
  return { kind: 'ok', inserted: s.inserted, message };
}
