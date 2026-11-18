/**
 * Drafting Desk: shared types and pure helpers (no I/O), used by the API
 * routes and the page. Kept separate so they can be unit-tested.
 *
 * The flow: brief -> sources -> evidence table (sources x questions, each cell
 * answered from the source with a page reference) -> outline -> draft written
 * only from the table -> revisions shown as tracked changes.
 */

export type SourceKind = 'document' | 'news' | 'job';

export type DraftSource = {
  /** Short reference used in citations and the AI prompt: S1, S2, … */
  ref: string;
  kind: SourceKind;
  /** Document id, news article id or matter id */
  id: string;
  title: string;
  detail: string;
  classification?: string | null;
  restricted?: boolean;
  url?: string | null;
  /** Why it matched (shown to the user) */
  reason?: string;
};

export type Question = { id: string; text: string };

export type CellStatus = 'found' | 'not_stated';

export type EvidenceCell = {
  sourceRef: string;
  questionId: string;
  status: CellStatus;
  answer: string;
  /** Where in the source, e.g. "p.4", "slide 3", "Sheet1", "news", "job" */
  location: string | null;
  /** Short exact quote from the source supporting the answer */
  quote: string | null;
  /** The quote was found word-for-word in the source text */
  verified: boolean;
  /** Changed by a person */
  edited?: boolean;
};

export type Conflict = { questionId: string; sourceRefs: string[]; note: string };

export type OutlineSection = { id: string; heading: string; purpose: string; evidence: string[] };

export type DraftParagraph = { text: string; cites: string[] };

export type DraftSection = {
  id: string;
  heading: string;
  paragraphs: DraftParagraph[];
  assumptions: string[];
  gaps: string[];
};

export type Draft = { title: string; sections: DraftSection[] };

export type DocumentType = 'REGULATORY_BRIEF' | 'CLIENT_MEMO' | 'SECTOR_BRIEFING' | 'JOB_STATUS' | 'LETTER' | 'OTHER';

export const DOCUMENT_TYPES: { value: DocumentType; label: string; guidance: string }[] = [
  { value: 'REGULATORY_BRIEF', label: 'Regulatory brief', guidance: 'What a regulation, order or decision changes, who it affects, key dates, and what to do. About 2 pages.' },
  { value: 'CLIENT_MEMO', label: 'Client advisory memo', guidance: 'Advice to a client on one issue: question, short answer, analysis with authorities, recommendations. 3 to 5 pages.' },
  { value: 'SECTOR_BRIEFING', label: 'Sector briefing', guidance: 'Recent power-sector developments grouped by theme, each with why it matters. About 1 to 2 pages.' },
  { value: 'JOB_STATUS', label: 'Job status report', guidance: 'Progress on one job: summary, work done, open tasks and owners, deadlines, risks. About 1 page.' },
  { value: 'LETTER', label: 'Letter', guidance: 'A formal letter with a clear purpose, the relevant facts and a requested action.' },
  { value: 'OTHER', label: 'Other', guidance: 'Follow the request.' },
];

export const READERS = ['Client (external)', 'Internal team', 'Board', 'Regulator'] as const;

// ---------------------------------------------------------------------------
// Keys and labels
// ---------------------------------------------------------------------------

/** One evidence cell, as cited in outlines and drafts: "S2:Q1". */
export const cellKey = (sourceRef: string, questionId: string) => `${sourceRef}:${questionId}`;

export function parseCellKey(key: string): { sourceRef: string; questionId: string } | null {
  const m = /^(S\d{1,3}):(Q\d{1,3})$/.exec(key.trim());
  return m ? { sourceRef: m[1], questionId: m[2] } : null;
}

/** A short source name for citations: first few words of the title. */
export function shortTitle(title: string, max = 28): string {
  const t = title.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 12)).trim()}…`;
}

/** "MYTO 2024 Minor Review… p.4" */
export function citeLabel(source: DraftSource | undefined, cell: EvidenceCell | undefined): string {
  if (!source) return 'Source';
  const where = cell?.location && !['news', 'job'].includes(cell.location) ? ` ${cell.location}` : '';
  return `${shortTitle(source.title)}${where}`;
}

// ---------------------------------------------------------------------------
// Preparing source text for the AI
// ---------------------------------------------------------------------------

export type Chunk = { text: string; index: number; page?: number | null; slide?: number | null; sheet?: string | null };

export function chunkLocation(c: Chunk): string {
  if (c.page) return `p.${c.page}`;
  if (c.slide) return `slide ${c.slide}`;
  if (c.sheet) return c.sheet;
  return `part ${c.index + 1}`;
}

const STOP = new Set(
  'the a an and or of to in on for with by from at as is are was were be been this that these those what which who whom how why when where it its their our your about into over under than then so such any all each per via not no do does did can could should would will shall may might must has have had'.split(
    ' ',
  ),
);

/** Lower-case content words, for simple matching. */
export function terms(text: string): string[] {
  return [...new Set((text.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) ?? []).filter((w) => !STOP.has(w)))];
}

/**
 * Picks the parts of a document to show the AI. Whole document when it fits
 * the budget; otherwise the parts that share the most words with the
 * questions, kept in document order.
 */
export function pickChunks(chunks: Chunk[], query: string, maxChars = 60000): Chunk[] {
  const sorted = [...chunks].sort((a, b) => a.index - b.index);
  const total = sorted.reduce((n, c) => n + c.text.length, 0);
  if (total <= maxChars) return sorted;
  const qs = terms(query);
  const scored = sorted.map((c) => {
    const words = c.text.toLowerCase();
    const hits = qs.reduce((n, t) => n + (words.includes(t) ? 1 : 0), 0);
    return { c, score: hits + (c.index === 0 ? 0.5 : 0) }; // first part often holds the title, parties and date
  });
  scored.sort((a, b) => b.score - a.score || a.c.index - b.c.index);
  const picked: Chunk[] = [];
  let used = 0;
  for (const { c } of scored) {
    if (used + c.text.length > maxChars) continue;
    picked.push(c);
    used += c.text.length;
  }
  return picked.sort((a, b) => a.index - b.index);
}

/** Source text with location markers the AI must cite, e.g. "[p.4] …". */
export function formatChunks(chunks: Chunk[]): string {
  return chunks.map((c) => `[${chunkLocation(c)}] ${c.text.replace(/\s+/g, ' ').trim()}`).join('\n\n');
}

// ---------------------------------------------------------------------------
// Checking the AI's work
// ---------------------------------------------------------------------------

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[^a-z0-9%.,'"\- ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** True when the quote appears in the source text (ignoring case, spacing and punctuation style). */
export function quoteInSource(quote: string | null | undefined, sourceText: string): boolean {
  if (!quote) return false;
  const q = norm(quote);
  if (q.length < 8) return false;
  return norm(sourceText).includes(q);
}

/** Keeps only citations that point at a real, answered cell; reports the rest. */
export function cleanCites(cites: string[], cells: EvidenceCell[]): { kept: string[]; dropped: string[] } {
  const answered = new Set(cells.filter((c) => c.status === 'found').map((c) => cellKey(c.sourceRef, c.questionId)));
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const raw of cites) {
    const key = raw.trim();
    if (answered.has(key) && !kept.includes(key)) kept.push(key);
    else if (!kept.includes(key)) dropped.push(key);
  }
  return { kept, dropped };
}

/** The evidence table as compact text for the AI: one line per answered cell. */
export function evidenceForPrompt(sources: DraftSource[], questions: Question[], cells: EvidenceCell[]): string {
  const lines: string[] = [];
  for (const q of questions) {
    lines.push(`Question ${q.id}: ${q.text}`);
    for (const s of sources) {
      const c = cells.find((x) => x.sourceRef === s.ref && x.questionId === q.id);
      if (!c) continue;
      const body = c.status === 'found' ? c.answer : '(not stated in this source)';
      lines.push(`  [${cellKey(s.ref, q.id)}] ${s.title}${c.location ? ` (${c.location})` : ''}: ${body}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Pre-send checks
// ---------------------------------------------------------------------------

export type Check = { ok: boolean; text: string };

export function preSendChecks(draft: Draft | null, sources: DraftSource[], reader: string, pendingChanges: number): Check[] {
  if (!draft) return [];
  const paragraphs = draft.sections.flatMap((s) => s.paragraphs);
  const uncited = paragraphs.filter((p) => p.cites.length === 0).length;
  const assumptions = draft.sections.reduce((n, s) => n + s.assumptions.length, 0);
  const gaps = draft.sections.reduce((n, s) => n + s.gaps.length, 0);
  const external = reader.startsWith('Client') || reader === 'Regulator';
  const privileged = sources.filter((s) => s.classification === 'LEGAL_PRIVILEGED' || s.restricted);
  return [
    { ok: uncited === 0, text: uncited === 0 ? 'Every paragraph has a source' : `${uncited} paragraph${uncited === 1 ? '' : 's'} without a source` },
    { ok: assumptions === 0, text: assumptions === 0 ? 'No assumptions to confirm' : `${assumptions} assumption${assumptions === 1 ? '' : 's'} to confirm` },
    { ok: gaps === 0, text: gaps === 0 ? 'No missing information' : `${gaps} gap${gaps === 1 ? '' : 's'} where the sources were silent` },
    {
      ok: !(external && privileged.length),
      text:
        external && privileged.length
          ? `Uses ${privileged.length} legal-privileged or restricted source${privileged.length === 1 ? '' : 's'} in a document for an outside reader`
          : 'No privileged or restricted sources going outside the firm',
    },
    { ok: pendingChanges === 0, text: pendingChanges === 0 ? 'All tracked changes reviewed' : `${pendingChanges} tracked change${pendingChanges === 1 ? '' : 's'} to accept or reject` },
  ];
}

// ---------------------------------------------------------------------------
// Tracked changes: word-level comparison
// ---------------------------------------------------------------------------

export type DiffPart = { type: 'same' | 'del' | 'ins'; text: string };

/** Splits into words and the spaces after them, so joining the parts gives the original text back. */
function tokens(s: string): string[] {
  return s.match(/\S+\s*|\s+/g) ?? [];
}

/** Word-level diff of two paragraphs (longest common subsequence), merged into runs. */
export function wordDiff(before: string, after: string): DiffPart[] {
  const a = tokens(before);
  const b = tokens(after);
  const n = a.length;
  const m = b.length;
  // Very long paragraphs: show as a whole replacement rather than an expensive table.
  if (n * m > 400000) {
    return [
      ...(before ? [{ type: 'del' as const, text: before }] : []),
      ...(after ? [{ type: 'ins' as const, text: after }] : []),
    ];
  }
  const key = (t: string) => t.trimEnd();
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = key(a[i]) === key(b[j]) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffPart[] = [];
  const push = (type: DiffPart['type'], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (key(a[i]) === key(b[j])) {
      push('same', b[j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push('del', a[i++]);
    } else {
      push('ins', b[j++]);
    }
  }
  while (i < n) push('del', a[i++]);
  while (j < m) push('ins', b[j++]);
  return out;
}

export function hasChanges(parts: DiffPart[]): boolean {
  return parts.some((p) => p.type !== 'same');
}

// ---------------------------------------------------------------------------
// Plain text (for saving to the library and searching later)
// ---------------------------------------------------------------------------

export function draftToPlainText(draft: Draft, sources: DraftSource[], cells: EvidenceCell[]): string {
  const bySource = new Map(sources.map((s) => [s.ref, s]));
  const label = (key: string) => {
    const k = parseCellKey(key);
    if (!k) return key;
    return citeLabel(bySource.get(k.sourceRef), cells.find((c) => c.sourceRef === k.sourceRef && c.questionId === k.questionId));
  };
  const out: string[] = [draft.title, ''];
  for (const s of draft.sections) {
    out.push(s.heading, '');
    for (const p of s.paragraphs) out.push(`${p.text}${p.cites.length ? ` [${p.cites.map(label).join('; ')}]` : ''}`, '');
  }
  out.push('Sources', '');
  for (const s of sources) out.push(`${s.ref}. ${s.title}${s.detail ? `, ${s.detail}` : ''}${s.url ? `, ${s.url}` : ''}`);
  return out.join('\n');
}
