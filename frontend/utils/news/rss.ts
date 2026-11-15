import { XMLParser } from 'fast-xml-parser';

/** One normalised item from an RSS 2.0, RSS 1.0 (RDF) or Atom feed. */
export type FeedItem = {
  title: string;
  link: string;
  guid: string | null;
  summary: string | null;
  publishedAt: string | null; // ISO 8601
  imageUrl: string | null;
};

const SUMMARY_MAX_CHARS = 500;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false, // keep everything as strings (titles like "2024" stay text)
  isArray: (name) => ['item', 'entry', 'link', 'media:content', 'media:thumbnail', 'enclosure', 'category'].includes(name),
});

type Node = Record<string, unknown> | string | undefined | null;

/** Text content of a parsed node (handles {#text}, CDATA-merged strings and attributes-only nodes). */
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (typeof node === 'object') {
    const t = (node as Record<string, unknown>)['#text'];
    return t == null ? '' : String(t);
  }
  return '';
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', mdash: '—', ndash: '–',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', naira: '₦',
};

/** Decode HTML entities left inside CDATA blocks (e.g. &#8217; &amp;). */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === '#') {
      const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? m;
  });
}

/** Remove NUL and other control characters (PostgreSQL text rejects NUL; the rest is noise). */
export function stripControlChars(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

/** Strip tags and collapse whitespace; WordPress "The post X appeared first on Y" footers removed. */
export function cleanText(html: string): string {
  const stripped = stripControlChars(html)
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/p>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  // Two passes: some feeds double-encode ("&amp;amp;", "&amp;#8217;").
  return stripControlChars(decodeEntities(decodeEntities(stripped)))
    .replace(/The post .{0,300}? appeared first on .{0,120}?\.?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:!?])/g, '$1') // "restored ." left behind by removed tags
    .trim();
}

/** Truncate to `max` characters without splitting emoji / surrogate pairs. */
export function truncate(s: string, max: number): string {
  const chars = Array.from(s);
  if (chars.length <= max) return s;
  const cut = chars.slice(0, max).join('');
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > cut.length * 0.6 ? cut.slice(0, lastSpace).trimEnd() : cut.trimEnd()}…`;
}

/** Allowance for clock skew before a date counts as "in the future". */
const FUTURE_TOLERANCE_MS = 10 * 60_000;

/** Parse a feed date. Unparseable → null. Future dates (bad publisher time zones) are clamped to now. */
export function toIso(value: string, now = Date.now()): string | null {
  if (!value) return null;
  const t = new Date(value.trim()).getTime();
  if (Number.isNaN(t)) return null;
  return new Date(t > now + FUTURE_TOLERANCE_MS ? now : t).toISOString();
}

const TRACKING_PARAMS = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|yclid|igshid|ref_src)$/i;

/**
 * Resolve `value` (absolute or relative to `base`) to a normalised http(s) URL,
 * or null. Strips the #fragment and known tracking parameters so the same
 * article shared with different campaign tags de-duplicates to one row.
 */
export function normaliseUrl(value: string, base?: string): string | null {
  const raw = decodeEntities(value.trim());
  if (!raw) return null;
  let u: URL;
  try {
    u = base ? new URL(raw, base) : new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  u.hash = '';
  for (const key of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) u.searchParams.delete(key);
  return u.toString();
}

function attr(node: unknown, name: string): string {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    const v = (node as Record<string, unknown>)[`@_${name}`];
    return v == null ? '' : String(v);
  }
  return '';
}

function firstImage(item: Record<string, unknown>, htmlBodies: string[], base?: string): string | null {
  const candidates: string[] = [];
  for (const key of ['media:content', 'media:thumbnail']) {
    const list = item[key];
    if (Array.isArray(list)) {
      for (const m of list) {
        const medium = attr(m, 'medium');
        const type = attr(m, 'type');
        if (!medium || medium === 'image' || type.startsWith('image/')) candidates.push(attr(m, 'url'));
      }
    }
  }
  const enclosures = item.enclosure;
  if (Array.isArray(enclosures)) {
    for (const e of enclosures) if (attr(e, 'type').startsWith('image/')) candidates.push(attr(e, 'url'));
  }
  for (const body of htmlBodies) {
    const m = body.match(/<img[^>]+src=["']([^"']+)["']/i);
    if (m) candidates.push(decodeEntities(m[1]));
  }
  for (const c of candidates) {
    const url = c ? normaliseUrl(c, base) : null;
    if (url) return url;
  }
  return null;
}

function rssItem(item: Record<string, unknown>, base?: string): FeedItem | null {
  const title = cleanText(text(item.title));
  const guidNode = item.guid;
  const guid = stripControlChars(text(guidNode)).trim() || null;
  let link = normaliseUrl(text(item.link), base);
  // Some feeds omit <link> and put the permalink in <guid isPermaLink="true">.
  if (!link && guid && attr(guidNode, 'isPermaLink') !== 'false') link = normaliseUrl(guid);
  if (!title || !link) return null;

  const description = text(item.description);
  const encoded = text(item['content:encoded']);
  const summary = cleanText(description || encoded);
  return {
    title: truncate(title, 400),
    link,
    guid,
    summary: summary ? truncate(summary, SUMMARY_MAX_CHARS) : null,
    publishedAt: toIso(text(item.pubDate) || text(item['dc:date'])),
    imageUrl: firstImage(item, [description, encoded], base),
  };
}

function atomLink(entry: Record<string, unknown>): string {
  const links = Array.isArray(entry.link) ? entry.link : [];
  const alternate = links.find((l) => !attr(l, 'rel') || attr(l, 'rel') === 'alternate');
  return (attr(alternate ?? links[0], 'href') || text(links[0])).trim();
}

function atomEntry(entry: Record<string, unknown>, base?: string): FeedItem | null {
  const title = cleanText(text(entry.title));
  const link = normaliseUrl(atomLink(entry), base);
  if (!title || !link) return null;
  const summaryHtml = text(entry.summary) || text(entry.content);
  const summary = cleanText(summaryHtml);
  return {
    title: truncate(title, 400),
    link,
    guid: stripControlChars(text(entry.id)).trim() || null,
    summary: summary ? truncate(summary, SUMMARY_MAX_CHARS) : null,
    publishedAt: toIso(text(entry.published) || text(entry.updated)),
    imageUrl: firstImage(entry, [summaryHtml], base),
  };
}

/**
 * Parse an RSS/Atom document. Throws if the document is not a recognisable feed.
 * `feedUrl` (where the feed was fetched from) resolves relative article links.
 */
export function parseFeed(xml: string, feedUrl?: string): FeedItem[] {
  const doc = parser.parse(xml.replace(/^\uFEFF/, '')) as Record<string, Node>;
  const rss = doc.rss as Record<string, Record<string, unknown>> | undefined;
  const rdf = doc['rdf:RDF'] as Record<string, unknown> | undefined;
  const atom = doc.feed as Record<string, unknown> | undefined;

  let items: (FeedItem | null)[];
  if (rss?.channel) {
    const base = feedUrl ?? (normaliseUrl(text(rss.channel.link)) || undefined);
    items = ((rss.channel.item as Record<string, unknown>[]) ?? []).map((i) => rssItem(i, base));
  } else if (rdf) {
    items = ((rdf.item as Record<string, unknown>[]) ?? []).map((i) => rssItem(i, feedUrl));
  } else if (atom) {
    items = ((atom.entry as Record<string, unknown>[]) ?? []).map((e) => atomEntry(e, feedUrl));
  } else {
    throw new Error('Not an RSS or Atom feed');
  }
  return items.filter((i): i is FeedItem => i !== null);
}
