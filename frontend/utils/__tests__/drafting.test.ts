import { describe, expect, it } from 'vitest';
import {
  cellKey,
  citeLabel,
  cleanCites,
  draftToPlainText,
  evidenceForPrompt,
  formatChunks,
  hasChanges,
  parseCellKey,
  pickChunks,
  preSendChecks,
  quoteInSource,
  shortTitle,
  terms,
  wordDiff,
  type Chunk,
  type Draft,
  type DraftSource,
  type EvidenceCell,
} from '../drafting/core';

const sources: DraftSource[] = [
  { ref: 'S1', kind: 'document', id: 'd1', title: 'MYTO 2024 Minor Review Order', detail: 'Regulatory order · 34 pages', classification: 'PUBLIC' },
  { ref: 'S2', kind: 'document', id: 'd2', title: 'Opinion on Band A reclassification', detail: 'Legal brief', classification: 'LEGAL_PRIVILEGED' },
];
const cell = (s: string, q: string, o: Partial<EvidenceCell> = {}): EvidenceCell => ({
  sourceRef: s,
  questionId: q,
  status: 'found',
  answer: 'An answer.',
  location: 'p.4',
  quote: null,
  verified: false,
  ...o,
});

describe('keys and labels', () => {
  it('builds and reads cell keys', () => {
    expect(cellKey('S1', 'Q2')).toBe('S1:Q2');
    expect(parseCellKey(' S12:Q3 ')).toEqual({ sourceRef: 'S12', questionId: 'Q3' });
    expect(parseCellKey('S1Q2')).toBeNull();
    expect(parseCellKey('X1:Q2')).toBeNull();
  });

  it('makes short citation labels', () => {
    expect(shortTitle('Short title')).toBe('Short title');
    expect(shortTitle('A very long document title that keeps going on and on')).toMatch(/…$/);
    expect(citeLabel(sources[0], cell('S1', 'Q1'))).toBe('MYTO 2024 Minor Review Order p.4');
    expect(citeLabel(sources[0], cell('S1', 'Q1', { location: 'news' }))).toBe('MYTO 2024 Minor Review Order');
    expect(citeLabel(undefined, undefined)).toBe('Source');
  });
});

describe('preparing source text', () => {
  const chunks: Chunk[] = [
    { index: 0, text: 'Order of the Nigerian Electricity Regulatory Commission. Title page.', page: 1 },
    { index: 1, text: 'General background on the market and history of reforms.', page: 2 },
    { index: 2, text: 'Band A tariff applies to feeders with twenty hours of supply.', page: 4 },
    { index: 3, text: 'Unrelated annex about forms and stationery.', page: 9 },
  ];

  it('keeps everything when it fits', () => {
    expect(pickChunks(chunks, 'band a tariff', 10_000)).toHaveLength(4);
  });

  it('picks the most relevant parts, in document order, when it does not fit', () => {
    const picked = pickChunks(chunks, 'band tariff feeders supply', 140);
    expect(picked.map((c) => c.index)).toEqual([0, 2]);
  });

  it('labels each part with its location', () => {
    expect(formatChunks([chunks[2]])).toBe('[p.4] Band A tariff applies to feeders with twenty hours of supply.');
    expect(formatChunks([{ index: 0, text: 'x', slide: 3 }])).toBe('[slide 3] x');
    expect(formatChunks([{ index: 4, text: 'y' }])).toBe('[part 5] y');
  });

  it('finds content words', () => {
    expect(terms('What is the Band A tariff for DisCos?')).toEqual(['band', 'tariff', 'discos']);
  });
});

describe('checking the AI', () => {
  const text = '[p.4] The Band A tariff applies to feeders that receive a minimum of 20 hours of supply daily.';

  it('accepts real quotes, ignoring case, spacing and quote styles', () => {
    expect(quoteInSource('the band A tariff applies to feeders', text)).toBe(true);
    expect(quoteInSource('receive a  minimum of 20 hours', text)).toBe(true);
  });

  it('rejects made-up or too-short quotes', () => {
    expect(quoteInSource('the Band A tariff applies to all customers', text)).toBe(false);
    expect(quoteInSource('Band', text)).toBe(false);
    expect(quoteInSource(null, text)).toBe(false);
  });

  it('keeps only citations to real, answered cells', () => {
    const cells = [cell('S1', 'Q1'), cell('S2', 'Q1', { status: 'not_stated' })];
    expect(cleanCites(['S1:Q1', 'S1:Q1', 'S2:Q1', 'S9:Q9'], cells)).toEqual({ kept: ['S1:Q1'], dropped: ['S2:Q1', 'S9:Q9'] });
  });

  it('writes the evidence table for the AI', () => {
    const text2 = evidenceForPrompt(sources, [{ id: 'Q1', text: 'Effective date?' }], [cell('S1', 'Q1', { answer: '1 April 2024', location: 'p.2' }), cell('S2', 'Q1', { status: 'not_stated' })]);
    expect(text2).toContain('Question Q1: Effective date?');
    expect(text2).toContain('[S1:Q1] MYTO 2024 Minor Review Order (p.2): 1 April 2024');
    expect(text2).toContain('[S2:Q1] Opinion on Band A reclassification (p.4): (not stated in this source)');
  });
});

describe('pre-send checks', () => {
  const draft: Draft = {
    title: 'Brief',
    sections: [
      { id: 's1', heading: 'Summary', paragraphs: [{ text: 'A.', cites: ['S1:Q1'] }, { text: 'B.', cites: [] }], assumptions: ['Used 1 April'], gaps: [] },
    ],
  };

  it('flags uncited paragraphs, assumptions, privileged sources for outside readers and pending changes', () => {
    const checks = preSendChecks(draft, sources, 'Client (external)', 2);
    expect(checks.map((c) => c.ok)).toEqual([false, false, true, false, false]);
    expect(checks[0].text).toBe('1 paragraph without a source');
    expect(checks[3].text).toMatch(/legal-privileged/);
    expect(checks[4].text).toBe('2 tracked changes to accept or reject');
  });

  it('allows privileged sources for internal readers', () => {
    expect(preSendChecks(draft, sources, 'Internal team', 0)[3].ok).toBe(true);
    expect(preSendChecks(null, sources, 'Board', 0)).toEqual([]);
  });
});

describe('tracked changes', () => {
  it('marks deleted and inserted words', () => {
    const parts = wordDiff('Challenge within a month of notice.', 'Challenge within two weeks of notice.');
    expect(parts).toEqual([
      { type: 'same', text: 'Challenge within ' },
      { type: 'del', text: 'a month ' },
      { type: 'ins', text: 'two weeks ' },
      { type: 'same', text: 'of notice.' },
    ]);
    expect(hasChanges(parts)).toBe(true);
  });

  it('rebuilds both versions exactly', () => {
    const a = 'The order raises the Band A tariff.  It takes effect on 1 April.';
    const b = 'The order raises the Band A tariff for qualifying feeders. It takes effect on 3 April.';
    const parts = wordDiff(a, b);
    expect(parts.filter((p) => p.type !== 'ins').map((p) => p.text).join('').replace(/\s+/g, ' ')).toBe(a.replace(/\s+/g, ' '));
    expect(parts.filter((p) => p.type !== 'del').map((p) => p.text).join('')).toBe(b);
  });

  it('reports no change for identical text, and handles empty sides', () => {
    expect(hasChanges(wordDiff('Same text.', 'Same text.'))).toBe(false);
    expect(wordDiff('', 'New.')).toEqual([{ type: 'ins', text: 'New.' }]);
    expect(wordDiff('Old.', '')).toEqual([{ type: 'del', text: 'Old.' }]);
  });
});

describe('plain text', () => {
  it('writes headings, paragraphs with citation labels and the sources list', () => {
    const draft: Draft = { title: 'Brief', sections: [{ id: 's1', heading: 'Summary', paragraphs: [{ text: 'The tariff rises.', cites: ['S1:Q1'] }], assumptions: [], gaps: [] }] };
    const text = draftToPlainText(draft, sources, [cell('S1', 'Q1')]);
    expect(text).toContain('The tariff rises. [MYTO 2024 Minor Review Order p.4]');
    expect(text).toContain('S2. Opinion on Band A reclassification, Legal brief');
  });
});
