/**
 * Turning stored passages back into readable text for the document preview.
 * Passages overlap by about 200 characters (see chunkText), so joining them
 * as they are would repeat a sentence or two at every join.
 */

export type StoredPassage = {
  chunk_index: number;
  chunk_text: string;
  metadata?: { page_number?: number; slide_number?: number; sheet_name?: string } | null;
};

export type PreviewSection = { label: string | null; text: string };

/** Length of the longest end of `a` that `b` starts with (the repeated overlap). */
export function overlapLength(a: string, b: string, max = 400, min = 20): number {
  const limit = Math.min(max, a.length, b.length);
  for (let k = limit; k >= min; k--) {
    if (a.endsWith(b.slice(0, k))) return k;
  }
  return 0;
}

function labelFor(p: StoredPassage): string | null {
  const m = p.metadata ?? {};
  if (m.page_number) return `Page ${m.page_number}`;
  if (m.slide_number) return `Slide ${m.slide_number}`;
  if (m.sheet_name) return `Sheet: ${m.sheet_name}`;
  return null;
}

/** Passages in order, grouped by page, slide or sheet, with the overlaps removed. */
export function passagesToSections(passages: StoredPassage[]): PreviewSection[] {
  const sorted = [...passages].sort((x, y) => x.chunk_index - y.chunk_index);
  const sections: PreviewSection[] = [];
  let prevText = '';
  for (const p of sorted) {
    const label = labelFor(p);
    let text = p.chunk_text;
    if (p.metadata?.sheet_name) text = text.replace(/^Sheet: [^\n]*\n/, '');
    const current = sections[sections.length - 1];
    if (current && current.label === label) {
      const k = overlapLength(prevText, text);
      const rest = text.slice(k).trimStart();
      if (rest) current.text += (k > 0 ? ' ' : '\n\n') + rest;
    } else {
      sections.push({ label, text });
    }
    prevText = text;
  }
  return sections;
}
