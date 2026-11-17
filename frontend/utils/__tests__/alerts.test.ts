import { describe, expect, it } from 'vitest';
import {
  EMPTY_REPORT,
  buildTiles,
  parseEvidence,
  relativeTime,
  reportToRow,
  safeUrl,
  sortAlerts,
  statusGroup,
  toAlert,
  validateReport,
  watchlist,
  type Alert,
} from '../alerts';

const NOW = Date.parse('2026-11-17T12:00:00Z');

function alert(over: Partial<Alert>): Alert {
  return {
    id: over.id ?? 'a',
    category: 'LEGAL_COMPLIANCE',
    severity: 'MEDIUM',
    status: 'UNREVIEWED',
    title: 'An alert',
    explanation: null,
    affects: null,
    suggestedAction: null,
    dismissReason: null,
    evidence: [],
    assignedTo: null,
    reportedBy: null,
    source: 'MANUAL',
    createdAt: '2026-11-17T10:00:00Z',
    plantName: null,
    documentId: null,
    documentTitle: null,
    matterId: null,
    matterLabel: null,
    newsTitle: null,
    newsUrl: null,
    ...over,
  };
}

describe('safeUrl and evidence', () => {
  it('keeps only http(s) links', () => {
    expect(safeUrl('https://example.com/a')).toBe('https://example.com/a');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,hi')).toBeNull();
    expect(safeUrl('not a url')).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });

  it('parses evidence, dropping unsafe links and empty entries', () => {
    expect(
      parseEvidence([
        { label: 'Report', url: 'https://news.example/x', excerpt: 'quote' },
        { url: 'javascript:alert(1)', excerpt: 'kept without the link' },
        { url: 'https://only.example/link' },
        {},
        'junk',
      ]),
    ).toEqual([
      { label: 'Report', url: 'https://news.example/x', excerpt: 'quote' },
      { label: 'Evidence', url: null, excerpt: 'kept without the link' },
      { label: 'only.example', url: 'https://only.example/link', excerpt: null },
    ]);
    expect(parseEvidence(null)).toEqual([]);
  });
});

describe('toAlert', () => {
  it('builds a title for plant alerts that have none', () => {
    const a = toAlert({ id: 1, alert_type: 'ZERO_OUTPUT', power_plants: { name: 'Kanem Gas Plant' }, created_at: 'x' });
    expect(a.title).toBe('Zero output at Kanem Gas Plant');
    expect(a.category).toBe('GRID_DATA');
    expect(a.severity).toBe('MEDIUM');
    expect(a.id).toBe('1');
  });

  it('keeps stored titles and links, and refuses unsafe news links', () => {
    const a = toAlert({
      id: 'x', title: 'Billing above tariff', category: 'LEGAL_COMPLIANCE', severity: 'CRITICAL',
      matters: { matter_reference: 'REG/1', title: 'MYTO' }, news_articles: [{ title: 'Story', url: 'javascript:x' }],
    });
    expect(a.title).toBe('Billing above tariff');
    expect(a.severity).toBe('CRITICAL');
    expect(a.matterLabel).toBe('REG/1 · MYTO');
    expect(a.newsTitle).toBe('Story');
    expect(a.newsUrl).toBeNull();
  });

  it('falls back safely for unknown categories and severities', () => {
    const a = toAlert({ id: 'y', category: 'NOPE', severity: 'URGENT', alert_type: 'OTHER' });
    expect([a.category, a.severity, a.title]).toEqual(['GRID_DATA', 'MEDIUM', 'Other']);
  });
});

describe('status, sorting and tiles', () => {
  it('groups database statuses', () => {
    expect(['UNREVIEWED', 'ASSIGNED', 'REVIEWED', 'RESOLVED', 'DISMISSED'].map(statusGroup)).toEqual([
      'open', 'investigating', 'resolved', 'resolved', 'dismissed',
    ]);
  });

  it('sorts by severity, then newest first', () => {
    const sorted = sortAlerts([
      alert({ id: 'med-old', severity: 'MEDIUM', createdAt: '2026-11-10T00:00:00Z' }),
      alert({ id: 'crit', severity: 'CRITICAL' }),
      alert({ id: 'med-new', severity: 'MEDIUM', createdAt: '2026-11-16T00:00:00Z' }),
      alert({ id: 'high', severity: 'HIGH' }),
    ]);
    expect(sorted.map((a) => a.id)).toEqual(['crit', 'high', 'med-new', 'med-old']);
  });

  it('counts open alerts per kind and names the worst level', () => {
    const tiles = buildTiles([
      alert({ category: 'LEGAL_COMPLIANCE', severity: 'CRITICAL' }),
      alert({ category: 'LEGAL_COMPLIANCE', severity: 'MEDIUM', status: 'ASSIGNED' }),
      alert({ category: 'LEGAL_COMPLIANCE', severity: 'CRITICAL', status: 'RESOLVED' }),
      alert({ category: 'SYSTEM', severity: 'HIGH' }),
      alert({ category: 'SYSTEM', severity: 'HIGH' }),
    ]);
    const by = Object.fromEntries(tiles.map((t) => [t.category, t]));
    expect(by.LEGAL_COMPLIANCE).toMatchObject({ open: 2, sub: '1 critical', hot: true });
    expect(by.SYSTEM).toMatchObject({ open: 2, sub: '2 high', hot: false });
    expect(by.GRID_DATA).toMatchObject({ open: 0, sub: 'None open' });
    expect(tiles).toHaveLength(5);
  });
});

describe('watchlist', () => {
  it('counts subjects in the last 30 days, case-insensitively, most first', () => {
    const list = watchlist(
      [
        alert({ affects: 'Riverline DisCo' }),
        alert({ affects: 'riverline disco' }),
        alert({ plantName: 'Kanem Gas Plant' }),
        alert({ documentTitle: 'Tariff draft' }),
        alert({ affects: 'Old Co', createdAt: '2026-09-01T00:00:00Z' }),
        alert({}),
      ],
      NOW,
    );
    expect(list).toEqual([
      { name: 'Riverline DisCo', count: 2 },
      { name: 'Kanem Gas Plant', count: 1 },
      { name: 'Tariff draft', count: 1 },
    ]);
  });
});

describe('relativeTime', () => {
  it('describes recent times plainly', () => {
    expect(relativeTime('2026-11-17T11:59:40Z', NOW)).toBe('just now');
    expect(relativeTime('2026-11-17T11:20:00Z', NOW)).toBe('40 min ago');
    expect(relativeTime('2026-11-17T07:00:00Z', NOW)).toBe('5 h ago');
    expect(relativeTime('2026-11-16T10:00:00Z', NOW)).toBe('Yesterday');
    expect(relativeTime('2026-11-13T10:00:00Z', NOW)).toBe('4 days ago');
    expect(relativeTime('2026-11-01T10:00:00Z', NOW)).toBe('1 Nov');
    expect(relativeTime('2025-11-01T10:00:00Z', NOW)).toBe('1 Nov 2025');
    expect(relativeTime('nonsense', NOW)).toBe('');
  });
});

describe('reporting an alert', () => {
  it('requires a headline and a safe evidence link', () => {
    expect(validateReport(EMPTY_REPORT)).toEqual(['Say in a line what happened.']);
    expect(validateReport({ ...EMPTY_REPORT, title: 'x', evidenceUrl: 'javascript:alert(1)' })).toEqual([
      'The evidence link must start with https:// or http://.',
    ]);
    expect(validateReport({ ...EMPTY_REPORT, title: 'x', evidenceUrl: 'https://ok.example' })).toEqual([]);
  });

  it('builds the row the report policy allows', () => {
    const row = reportToRow(
      { ...EMPTY_REPORT, category: 'DOCUMENT_CONTRADICTION', severity: 'HIGH', title: ' Capacity differs ', evidenceUrl: 'https://docs.example/a', evidenceExcerpt: '450 MW', matterId: 'm1' },
      'u1',
    );
    expect(row).toMatchObject({
      alert_type: 'DOCUMENT_DISCREPANCY', source_type: 'MANUAL', category: 'DOCUMENT_CONTRADICTION', severity: 'HIGH',
      title: 'Capacity differs', matter_id: 'm1', reported_by: 'u1', status: 'UNREVIEWED',
      evidence: [{ label: 'docs.example', url: 'https://docs.example/a', excerpt: '450 MW' }],
    });
    expect(reportToRow({ ...EMPTY_REPORT, title: 'x' }, 'u1').evidence).toEqual([]);
  });
});
