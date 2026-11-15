import { describe, expect, it } from 'vitest';
import { normaliseUrl, parseFeed, toIso, truncate } from '../rss';

const rss = (items: string, channelLink = 'https://site.example/') =>
  `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel><title>Feed</title><link>${channelLink}</link>${items}</channel></rss>`;
const item = (inner: string) => `<item>${inner}</item>`;
const basic = (extra = '') => item(`<title>Grid update</title><link>https://site.example/a</link>${extra}`);

describe('parseFeed: formats', () => {
  it('reads RSS 2.0', () => {
    const [i] = parseFeed(
      rss(basic('<description>Summary</description><pubDate>Sat, 14 Nov 2026 10:00:00 +0100</pubDate><guid>g-1</guid>')),
    );
    expect(i).toEqual({
      title: 'Grid update',
      link: 'https://site.example/a',
      guid: 'g-1',
      summary: 'Summary',
      publishedAt: '2026-11-14T09:00:00.000Z',
      imageUrl: null,
    });
  });

  it('reads RSS 1.0 (RDF) with dc:date', () => {
    const doc = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <item><title>RDF item</title><link>https://site.example/rdf</link><dc:date>2026-11-14T08:00:00Z</dc:date></item></rdf:RDF>`;
    expect(parseFeed(doc)).toMatchObject([{ title: 'RDF item', link: 'https://site.example/rdf', publishedAt: '2026-11-14T08:00:00.000Z' }]);
  });

  it('reads Atom, preferring the alternate link over rel="self"', () => {
    const doc = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
      <title type="html">&lt;b&gt;Grid&lt;/b&gt; news</title>
      <link rel="self" href="https://site.example/self"/><link rel="alternate" href="https://site.example/a"/>
      <id>tag:site,2026:1</id><updated>2026-11-14T08:00:00Z</updated><summary>Short</summary></entry></feed>`;
    expect(parseFeed(doc)).toMatchObject([
      { title: 'Grid news', link: 'https://site.example/a', guid: 'tag:site,2026:1', summary: 'Short' },
    ]);
  });

  it('handles a feed with a single item (not an array)', () => {
    expect(parseFeed(rss(basic()))).toHaveLength(1);
  });

  it('returns [] for a feed with no items', () => {
    expect(parseFeed(rss(''))).toEqual([]);
    expect(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>x</title></feed>')).toEqual([]);
  });

  it('tolerates a byte-order mark and leading whitespace', () => {
    expect(parseFeed(`﻿\n   ${rss(basic())}`)).toHaveLength(1);
  });
});

describe('parseFeed: rejects non-feeds', () => {
  it('throws on an HTML page (e.g. a bot-check page served with 200)', () => {
    expect(() => parseFeed('<!doctype html><html><body>Just a moment...</body></html>')).toThrow(/Not an RSS or Atom feed/);
  });

  it('throws on JSON and on empty input', () => {
    expect(() => parseFeed('{"items":[]}')).toThrow();
    expect(() => parseFeed('')).toThrow();
  });

  it('does not crash on truncated XML', () => {
    expect(() => parseFeed('<rss><channel><item><title>A</title><link>https://x.e')).not.toThrow(/stack/);
  });
});

describe('parseFeed: links', () => {
  it('resolves relative links against the feed URL', () => {
    const [i] = parseFeed(rss(item('<title>A</title><link>/news/a</link>')), 'https://site.example/feed/');
    expect(i.link).toBe('https://site.example/news/a');
  });

  it('falls back to the channel link to resolve relative links', () => {
    const [i] = parseFeed(rss(item('<title>A</title><link>news/a</link>'), 'https://site.example/blog/'));
    expect(i.link).toBe('https://site.example/blog/news/a');
  });

  it('uses <guid> as the link when <link> is missing, unless isPermaLink="false"', () => {
    expect(parseFeed(rss(item('<title>A</title><guid isPermaLink="true">https://site.example/g</guid>')))[0].link).toBe(
      'https://site.example/g',
    );
    expect(parseFeed(rss(item('<title>A</title><guid isPermaLink="false">https://site.example/g</guid>')))).toEqual([]);
  });

  it('drops items whose link is not http(s)', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'mailto:a@b.c', 'ftp://site.example/a', '']) {
      expect(parseFeed(rss(item(`<title>A</title><link>${bad}</link>`)), 'https://site.example/')).toEqual([]);
    }
  });

  it('strips tracking parameters and fragments but keeps real query params', () => {
    const [i] = parseFeed(rss(item('<title>A</title><link>https://site.example/a?utm_source=rss&amp;utm_medium=rss&amp;p=5&amp;fbclid=x#comments</link>')));
    expect(i.link).toBe('https://site.example/a?p=5');
  });

  it('normaliseUrl', () => {
    expect(normaliseUrl('  https://site.example/a?utm_campaign=x  ')).toBe('https://site.example/a');
    expect(normaliseUrl('/a', 'https://site.example/feed')).toBe('https://site.example/a');
    expect(normaliseUrl('not a url')).toBeNull();
    expect(normaliseUrl('https://site.example/a?id=1&amp;utm_source=x')).toBe('https://site.example/a?id=1');
  });
});

describe('parseFeed: text cleaning', () => {
  it('decodes entities inside CDATA, including double-encoded ones', () => {
    const [i] = parseFeed(rss(item('<title><![CDATA[Tinubu&#8217;s plan &amp;amp; NERC &#x2014; Q4]]></title><link>https://site.example/a</link>')));
    expect(i.title).toBe('Tinubu’s plan & NERC — Q4');
  });

  it('strips HTML, scripts and the WordPress "appeared first on" footer from summaries', () => {
    const [i] = parseFeed(
      rss(basic('<description><![CDATA[<p>Power <b>restored</b>.</p><script>alert(1)</script><p>The post Grid update appeared first on Site.</p>]]></description>')),
    );
    expect(i.summary).toBe('Power restored.');
  });

  it('falls back to content:encoded when there is no description', () => {
    const [i] = parseFeed(rss(basic('<content:encoded><![CDATA[<p>Body text</p>]]></content:encoded>')));
    expect(i.summary).toBe('Body text');
  });

  it('removes NUL and control characters (PostgreSQL rejects NUL)', () => {
    const [i] = parseFeed(rss(item('<title>A&#0;B\u0007C</title><link>https://site.example/a</link><description>x\u0000y</description>')));
    expect(i.title).toBe('ABC');
    expect(i.summary).toBe('xy');
  });

  it('drops items with an empty or whitespace-only title', () => {
    expect(parseFeed(rss(item('<title>   </title><link>https://site.example/a</link>')))).toEqual([]);
    expect(parseFeed(rss(item('<link>https://site.example/a</link>')))).toEqual([]);
  });

  it('keeps numeric titles as text', () => {
    expect(parseFeed(rss(item('<title>2024</title><link>https://site.example/a</link>')))[0].title).toBe('2024');
  });

  it('truncates long summaries at a word boundary with an ellipsis', () => {
    const [i] = parseFeed(rss(basic(`<description>${'word '.repeat(200)}</description>`)));
    expect(Array.from(i.summary!).length).toBeLessThanOrEqual(501);
    expect(i.summary!.endsWith('word…')).toBe(true);
  });

  it('never splits an emoji when truncating', () => {
    const t = truncate(`${'a'.repeat(399)}😀😀😀`, 400);
    expect(t).toBe(`${'a'.repeat(399)}😀…`);
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(t)).toBe(false);
  });
});

describe('parseFeed: dates', () => {
  it('parses RFC 822 and ISO dates; unparseable → null', () => {
    expect(toIso('Sat, 14 Nov 2026 10:00:00 GMT')).toBe('2026-11-14T10:00:00.000Z');
    expect(toIso('2026-11-14T10:00:00+01:00')).toBe('2026-11-14T09:00:00.000Z');
    expect(toIso('yesterday')).toBeNull();
    expect(toIso('')).toBeNull();
  });

  it('clamps future dates (wrong publisher time zone) to now', () => {
    const now = Date.parse('2026-11-15T12:00:00Z');
    expect(toIso('2026-11-20T12:00:00Z', now)).toBe('2026-11-15T12:00:00.000Z');
    // Small clock skew is tolerated
    expect(toIso('2026-11-15T12:05:00Z', now)).toBe('2026-11-15T12:05:00.000Z');
  });
});

describe('parseFeed: images', () => {
  it('takes media:content images, skipping video', () => {
    const [i] = parseFeed(
      rss(basic('<media:content url="https://cdn.example/v.mp4" medium="video"/><media:content url="https://cdn.example/p.jpg" medium="image"/>')),
    );
    expect(i.imageUrl).toBe('https://cdn.example/p.jpg');
  });

  it('takes image enclosures but not audio', () => {
    expect(parseFeed(rss(basic('<enclosure url="https://cdn.example/a.mp3" type="audio/mpeg"/>')))[0].imageUrl).toBeNull();
    expect(parseFeed(rss(basic('<enclosure url="https://cdn.example/p.png" type="image/png"/>')))[0].imageUrl).toBe(
      'https://cdn.example/p.png',
    );
  });

  it('falls back to the first <img> in the HTML, resolving relative paths', () => {
    const [i] = parseFeed(rss(basic('<description><![CDATA[<img src="/img/p.jpg"> text]]></description>')), 'https://site.example/feed');
    expect(i.imageUrl).toBe('https://site.example/img/p.jpg');
  });

  it('ignores data: and javascript: image URLs', () => {
    const [i] = parseFeed(rss(basic('<description><![CDATA[<img src="data:image/png;base64,AAAA">]]></description>')));
    expect(i.imageUrl).toBeNull();
  });
});

describe('parseFeed: hostile input', () => {
  it('does not expand nested entities ("billion laughs")', () => {
    const doc = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;"><!ENTITY d "&c;&c;&c;&c;&c;&c;&c;&c;&c;&c;"><!ENTITY e "&d;&d;&d;&d;&d;&d;&d;&d;&d;&d;"><!ENTITY f "&e;&e;&e;&e;&e;&e;&e;&e;&e;&e;">]>
      <rss><channel><item><title>&f;</title><link>https://site.example/a</link></item></channel></rss>`;
    const started = Date.now();
    let items: ReturnType<typeof parseFeed> = [];
    try {
      items = parseFeed(doc);
    } catch {
      // Rejecting the document is also acceptable.
    }
    expect(Date.now() - started).toBeLessThan(1000);
    for (const i of items) expect(i.title.length).toBeLessThanOrEqual(401);
  });

  it('does not resolve external entities (XXE)', () => {
    const doc = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY x SYSTEM "file:///etc/passwd">]>
      <rss><channel><item><title>A &x; B</title><link>https://site.example/a</link></item></channel></rss>`;
    let title = '';
    try {
      title = parseFeed(doc)[0]?.title ?? '';
    } catch {
      // Rejecting is fine.
    }
    expect(title).not.toMatch(/root:/);
  });

  it('handles a 300-item feed quickly', () => {
    const items = Array.from({ length: 300 }, (_, n) => item(`<title>Item ${n}</title><link>https://site.example/${n}</link>`)).join('');
    const started = Date.now();
    expect(parseFeed(rss(items))).toHaveLength(300);
    expect(Date.now() - started).toBeLessThan(1000);
  });
});
