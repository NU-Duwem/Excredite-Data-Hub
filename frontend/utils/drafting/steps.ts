/**
 * Server-only: the Drafting Desk's steps. Everything that reads the library,
 * news or jobs uses the signed-in person's own session, so the database's
 * access rules apply (restricted documents stay hidden from people who can't
 * read them).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import * as z from 'zod/v4';
import { embedQuery, toPgVector } from '@/utils/embeddings';
import { generateJson } from './llm';
import {
  DOCUMENT_TYPES,
  cellKey,
  cleanCites,
  evidenceForPrompt,
  formatChunks,
  pickChunks,
  quoteInSource,
  terms,
  type Chunk,
  type Conflict,
  type Draft,
  type DraftSection,
  type DraftSource,
  type EvidenceCell,
  type OutlineSection,
  type Question,
} from './core';

export type Brief = { request: string; docType: string; reader: string; jobId: string | null; precedentId: string | null };

const HOUSE_RULES = `You work for Excredite, a Nigerian law and advisory firm specialising in the electricity sector (NERC, DisCos, GenCos, TCN, tariffs, licences, the Electricity Act 2023).
Rules that always apply:
- Use only the information you are given. Never add facts, figures, dates, names or authorities from your own knowledge.
- If the information needed is not there, say so plainly rather than guessing.
- Write in clear, plain British English, as a careful senior lawyer would.`;

const docTypeGuidance = (t: string) => DOCUMENT_TYPES.find((d) => d.value === t) ?? DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];

// ---------------------------------------------------------------------------
// 1. Sources
// ---------------------------------------------------------------------------

export async function gatherSources(db: SupabaseClient, brief: Brief): Promise<{ sources: DraftSource[]; precedentTitle: string | null }> {
  const query = brief.request.slice(0, 1000);
  const words = terms(query);
  const sources: DraftSource[] = [];

  // Library: meaning + keyword search over passages, grouped into documents.
  let vector: string | null = null;
  try {
    vector = toPgVector(await embedQuery(query));
  } catch (err) {
    console.warn('Drafting: embedding unavailable, using keywords only:', err);
  }
  const { data: chunks } = await db.rpc('match_document_chunks', { query_embedding: vector, query_text: query, match_count: 40 });
  const byDoc = new Map<string, { title: string; type: string; classification: string; score: number; hits: number }>();
  for (const c of (chunks ?? []) as { document_id: string; title: string; document_type: string; classification: string; score: number }[]) {
    if (c.document_id === brief.precedentId) continue; // the precedent guides structure only
    const d = byDoc.get(c.document_id);
    if (d) {
      d.score += c.score;
      d.hits += 1;
    } else byDoc.set(c.document_id, { title: c.title, type: c.document_type, classification: c.classification, score: c.score, hits: 1 });
  }
  const docIds = [...byDoc.keys()];
  const { data: docRows } = docIds.length
    ? await db.from('documents').select('id, title, document_type, classification, restricted, page_count, slide_count, created_at').in('id', docIds)
    : { data: [] };
  const docMeta = new Map((docRows ?? []).map((d) => [d.id as string, d]));
  [...byDoc.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, 8)
    .forEach(([id, d]) => {
      const meta = docMeta.get(id);
      const size = meta?.page_count ? `${meta.page_count} pages` : meta?.slide_count ? `${meta.slide_count} slides` : null;
      sources.push({
        ref: '',
        kind: 'document',
        id,
        title: d.title,
        detail: [humanise(d.type), size].filter(Boolean).join(' · '),
        classification: (meta?.classification as string) ?? d.classification,
        restricted: !!meta?.restricted,
        reason: `${d.hits} matching passage${d.hits === 1 ? '' : 's'}`,
      });
    });

  // News: last 120 days, ranked by shared words.
  if (words.length) {
    const since = new Date(Date.now() - 120 * 86400000).toISOString();
    const { data: news } = await db
      .from('news_articles')
      .select('id, title, summary, source, url, published_at')
      .gte('published_at', since)
      .order('published_at', { ascending: false })
      .limit(400);
    const need = words.length >= 4 ? 2 : 1;
    (news ?? [])
      .map((n) => {
        const text = `${n.title} ${n.summary ?? ''}`.toLowerCase();
        return { n, hits: words.filter((w) => text.includes(w)).length };
      })
      .filter((x) => x.hits >= need)
      .sort((a, b) => b.hits - a.hits)
      .slice(0, 5)
      .forEach(({ n, hits }) =>
        sources.push({
          ref: '',
          kind: 'news',
          id: n.id,
          title: n.title,
          detail: `${n.source}${n.published_at ? ` · ${new Date(n.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`,
          url: n.url,
          reason: `${hits} matching word${hits === 1 ? '' : 's'}`,
        }),
      );
  }

  // The linked job (only if this person can see the work board).
  if (brief.jobId) {
    const { data: job } = await db.from('matters').select('id, title, matter_reference').eq('id', brief.jobId).maybeSingle();
    if (job) {
      sources.push({ ref: '', kind: 'job', id: job.id, title: job.title, detail: `Job ${job.matter_reference ?? ''} · tasks and deadlines`.trim(), reason: 'Linked job' });
    }
  }

  let precedentTitle: string | null = null;
  if (brief.precedentId) {
    const { data: p } = await db.from('documents').select('title').eq('id', brief.precedentId).maybeSingle();
    precedentTitle = (p?.title as string) ?? null;
  }

  sources.forEach((s, i) => (s.ref = `S${i + 1}`));
  return { sources, precedentTitle };
}

const humanise = (s: string | null | undefined) =>
  (s ?? 'Document')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

// ---------------------------------------------------------------------------
// Reading a source's text (as the user)
// ---------------------------------------------------------------------------

export async function loadSourceText(db: SupabaseClient, source: DraftSource, focus: string): Promise<string | null> {
  if (source.kind === 'document') {
    const { data } = await db
      .from('embeddings')
      .select('chunk_index, chunk_text, metadata')
      .eq('document_id', source.id)
      .order('chunk_index', { ascending: true })
      .limit(2000);
    if (!data?.length) return null;
    const chunks: Chunk[] = data.map((r) => {
      const m = (r.metadata ?? {}) as { page_number?: number; slide_number?: number; sheet_name?: string };
      return { text: r.chunk_text as string, index: r.chunk_index as number, page: m.page_number ?? null, slide: m.slide_number ?? null, sheet: m.sheet_name ?? null };
    });
    return formatChunks(pickChunks(chunks, focus));
  }
  if (source.kind === 'news') {
    const { data: n } = await db.from('news_articles').select('title, summary, source, url, published_at').eq('id', source.id).maybeSingle();
    if (!n) return null;
    return `[news] ${n.title}. ${n.summary ?? ''} (${n.source}, published ${n.published_at ?? 'date unknown'})`;
  }
  const [{ data: job }, { data: tasks }] = await Promise.all([
    db.from('matters').select('title, matter_reference, matter_type, status, opened_date, next_deadline, lead_counsel, notes').eq('id', source.id).maybeSingle(),
    db.from('matter_tasks').select('title, status, due_date, assigned_to_team, notes').eq('matter_id', source.id),
  ]);
  if (!job) return null;
  const taskLines = (tasks ?? []).map(
    (t) => `- ${t.title} (status: ${t.status}${t.due_date ? `, due ${t.due_date}` : ''}${t.assigned_to_team ? ', whole team' : ''})${t.notes ? `: ${t.notes}` : ''}`,
  );
  return [
    `[job] ${job.title} (${job.matter_reference ?? 'no reference'}), status ${job.status}, opened ${job.opened_date ?? 'unknown'}, next deadline ${job.next_deadline ?? 'none'}, lead ${job.lead_counsel ?? 'not set'}.`,
    job.notes ? `[job] Notes: ${job.notes}` : '',
    taskLines.length ? `[job] Tasks:\n${taskLines.join('\n')}` : '[job] No tasks recorded.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function loadPrecedent(db: SupabaseClient, documentId: string): Promise<string | null> {
  const { data } = await db.from('embeddings').select('chunk_index, chunk_text').eq('document_id', documentId).order('chunk_index').limit(40);
  if (!data?.length) return null;
  return data
    .map((r) => r.chunk_text as string)
    .join('\n')
    .slice(0, 15000);
}

// ---------------------------------------------------------------------------
// 2. Evidence
// ---------------------------------------------------------------------------

const QuestionsSchema = z.object({ questions: z.array(z.string()) });

export async function proposeQuestions(brief: Brief, sources: DraftSource[]): Promise<Question[]> {
  const t = docTypeGuidance(brief.docType);
  const out = await generateJson({
    system: `${HOUSE_RULES}\nYou plan research for a document before it is written.`,
    prompt: `A colleague needs this document:
"${brief.request}"
Type: ${t.label} (${t.guidance})
Reader: ${brief.reader}

Available sources:
${sources.map((s) => `- ${s.title} (${s.kind})`).join('\n') || '- none'}

Write 3 to 5 short, specific questions whose answers, taken from the sources, would give the writer every fact the document needs. Each question must be answerable from a single source on its own (for example "What is the effective date?", not "Do the sources agree?"). Plain words, no numbering.`,
    schema: QuestionsSchema,
    effort: 'low',
    maxTokens: 4000,
  });
  const qs = out.questions.map((q) => q.trim()).filter(Boolean).slice(0, 6);
  if (qs.length === 0) throw new Error('The AI suggested no questions');
  return qs.map((text, i) => ({ id: `Q${i + 1}`, text }));
}

const CellsSchema = z.object({
  answers: z.array(
    z.object({
      question_id: z.string(),
      status: z.enum(['found', 'not_stated']),
      answer: z.string(),
      location: z.string().nullable(),
      quote: z.string().nullable(),
    }),
  ),
});

export async function fillEvidenceForSource(brief: Brief, questions: Question[], source: DraftSource, text: string): Promise<EvidenceCell[]> {
  const out = await generateJson({
    system: `${HOUSE_RULES}\nYou extract facts from one source. You answer each question from this source only.`,
    prompt: `Source ${source.ref}: "${source.title}" (${source.kind}${source.detail ? `, ${source.detail}` : ''})
The text is split into parts, each starting with its location in square brackets, such as [p.4], [slide 2], [news] or [job].

<source_text>
${text}
</source_text>

The document being written: "${brief.request}"

Answer each question from this source only:
${questions.map((q) => `${q.id}: ${q.text}`).join('\n')}

For each question:
- If the source answers it: status "found"; "answer" in one or two plain sentences; "location" copied exactly from the bracket before the passage you used (e.g. "p.4"); "quote" a short exact quote from the source text (5 to 30 words, copied word for word) that supports the answer.
- If it does not: status "not_stated", "answer" "Not stated in this source.", location and quote null.
Never answer from outside the source text.`,
    schema: CellsSchema,
    effort: 'medium',
    maxTokens: 8000,
  });
  return questions.map((q) => {
    const a = out.answers.find((x) => x.question_id.trim().toUpperCase() === q.id);
    if (!a || a.status === 'not_stated') {
      return { sourceRef: source.ref, questionId: q.id, status: 'not_stated', answer: 'Not stated in this source.', location: null, quote: null, verified: false };
    }
    const location = a.location?.replace(/^\[|\]$/g, '').trim() || null;
    return {
      sourceRef: source.ref,
      questionId: q.id,
      status: 'found',
      answer: a.answer.trim(),
      location,
      quote: a.quote?.trim() || null,
      verified: quoteInSource(a.quote, text),
    };
  });
}

const ConflictsSchema = z.object({ conflicts: z.array(z.object({ question_id: z.string(), source_refs: z.array(z.string()), note: z.string() })) });

export async function findConflicts(sources: DraftSource[], questions: Question[], cells: EvidenceCell[]): Promise<Conflict[]> {
  const answeredByQuestion = questions.filter((q) => cells.filter((c) => c.questionId === q.id && c.status === 'found').length >= 2);
  if (!answeredByQuestion.length) return [];
  const out = await generateJson({
    system: `${HOUSE_RULES}\nYou compare answers from different sources and point out real disagreements.`,
    prompt: `Here are answers to each question from different sources:
${evidenceForPrompt(sources, answeredByQuestion, cells)}

List only real contradictions: two or more sources giving different facts for the same question (different dates, figures, parties, obligations). Ignore answers that differ only in detail or wording, or where one source is silent. Return an empty list if there are none. "note" says what differs in one sentence.`,
    schema: ConflictsSchema,
    effort: 'low',
    maxTokens: 4000,
  });
  const validRefs = new Set(sources.map((s) => s.ref));
  const validQs = new Set(questions.map((q) => q.id));
  return out.conflicts
    .map((c) => ({ questionId: c.question_id.trim().toUpperCase(), sourceRefs: c.source_refs.map((r) => r.trim().toUpperCase()).filter((r) => validRefs.has(r)), note: c.note.trim() }))
    .filter((c) => validQs.has(c.questionId) && c.sourceRefs.length >= 2);
}

// ---------------------------------------------------------------------------
// 3. Outline
// ---------------------------------------------------------------------------

const OutlineSchema = z.object({ sections: z.array(z.object({ heading: z.string(), purpose: z.string(), evidence: z.array(z.string()) })) });

export async function proposeOutline(
  brief: Brief,
  sources: DraftSource[],
  questions: Question[],
  cells: EvidenceCell[],
  conflicts: Conflict[],
  precedentText: string | null,
): Promise<OutlineSection[]> {
  const t = docTypeGuidance(brief.docType);
  const out = await generateJson({
    system: `${HOUSE_RULES}\nYou plan the structure of a document.`,
    prompt: `Plan the outline for: "${brief.request}"
Type: ${t.label} (${t.guidance})
Reader: ${brief.reader}
${precedentText ? `\nFollow the structure, headings and tone of this precedent (its facts are out of date and must not be used):\n<precedent>\n${precedentText}\n</precedent>\n` : ''}
Evidence available (cite cells by the key in square brackets):
${evidenceForPrompt(sources, questions, cells)}
${conflicts.length ? `\nKnown conflicts between sources:\n${conflicts.map((c) => `- ${c.questionId}: ${c.note}`).join('\n')}` : ''}

Give 3 to 7 sections in order. For each: a short heading (no numbering), one sentence on what it covers, and the evidence keys (like "S1:Q2") it will draw on. Do not include a "Sources" section; it is added automatically.`,
    schema: OutlineSchema,
    effort: 'medium',
    maxTokens: 6000,
  });
  if (out.sections.length === 0) throw new Error('The AI proposed no sections');
  return out.sections.slice(0, 10).map((s, i) => ({
    id: `sec-${i + 1}`,
    heading: s.heading.replace(/^\d+[.)]\s*/, '').trim(),
    purpose: s.purpose.trim(),
    evidence: cleanCites(s.evidence, cells).kept,
  }));
}

// ---------------------------------------------------------------------------
// 4. Draft and revisions
// ---------------------------------------------------------------------------

const SectionOut = z.object({
  heading: z.string(),
  paragraphs: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })),
  assumptions: z.array(z.string()),
  gaps: z.array(z.string()),
});
const DraftSchema = z.object({ title: z.string(), sections: z.array(SectionOut) });

const DRAFT_RULES = `How to write:
- Write ONLY from the evidence lines. Every paragraph must cite the evidence keys it relies on in "cites" (e.g. ["S1:Q2","S3:Q1"]). A paragraph with no supporting evidence must not be written.
- Do not put citation markers in the paragraph text itself; use "cites".
- Where sources conflict, say so in the text and cite both; list the choice you made in "assumptions".
- Where the outline needs a fact the evidence does not give, leave it out of the text and add a short note to "gaps".
- Keep each paragraph to 2 to 5 sentences. No bullet characters at the start of paragraphs.`;

export async function writeDraft(
  brief: Brief,
  outline: OutlineSection[],
  sources: DraftSource[],
  questions: Question[],
  cells: EvidenceCell[],
  conflicts: Conflict[],
  precedentText: string | null,
): Promise<Draft> {
  const t = docTypeGuidance(brief.docType);
  const out = await generateJson({
    system: `${HOUSE_RULES}\nYou write firm documents from checked evidence.`,
    prompt: `Write the document: "${brief.request}"
Type: ${t.label} (${t.guidance})
Reader: ${brief.reader}
${precedentText ? `\nMatch the tone and level of formality of this precedent, but never its facts:\n<precedent>\n${precedentText.slice(0, 8000)}\n</precedent>\n` : ''}
Outline (write these sections, in this order, with these headings):
${outline.map((s, i) => `${i + 1}. ${s.heading}: ${s.purpose} [evidence: ${s.evidence.join(', ') || 'none planned'}]`).join('\n')}

Evidence (cite by the key in square brackets):
${evidenceForPrompt(sources, questions, cells)}
${conflicts.length ? `\nConflicts between sources:\n${conflicts.map((c) => `- ${c.questionId} (${c.sourceRefs.join(' vs ')}): ${c.note}`).join('\n')}` : ''}

${DRAFT_RULES}
Give the document a short, specific title.`,
    schema: DraftSchema,
    effort: 'high',
    maxTokens: 16000,
  });
  return {
    title: out.title.trim(),
    sections: out.sections.map((s, i) => toSection(s, outline[i]?.id ?? `sec-${i + 1}`, outline[i]?.heading, cells)),
  };
}

function toSection(s: z.infer<typeof SectionOut>, id: string, heading: string | undefined, cells: EvidenceCell[]): DraftSection {
  const gaps = s.gaps.map((g) => g.trim()).filter(Boolean);
  const paragraphs = s.paragraphs
    .map((p) => {
      const { kept, dropped } = cleanCites(p.cites, cells);
      if (dropped.length) gaps.push(`A citation (${dropped.join(', ')}) did not match the evidence table and was removed; check this paragraph.`);
      return { text: p.text.replace(/\s*\[(S\d+:Q\d+)(,\s*S\d+:Q\d+)*\]/g, '').trim(), cites: kept };
    })
    .filter((p) => p.text);
  return { id, heading: (heading ?? s.heading).trim(), paragraphs, assumptions: s.assumptions.map((a) => a.trim()).filter(Boolean), gaps };
}

export async function reviseSection(
  brief: Brief,
  section: DraftSection,
  instruction: string,
  sources: DraftSource[],
  questions: Question[],
  cells: EvidenceCell[],
): Promise<DraftSection> {
  const out = await generateJson({
    system: `${HOUSE_RULES}\nYou revise one section of a firm document as asked, keeping everything else the same.`,
    prompt: `Document: "${brief.request}" (reader: ${brief.reader})

Current section "${section.heading}":
${section.paragraphs.map((p, i) => `Paragraph ${i + 1} [cites: ${p.cites.join(', ') || 'none'}]: ${p.text}`).join('\n')}

Requested change: "${instruction}"

Evidence (cite by the key in square brackets):
${evidenceForPrompt(sources, questions, cells)}

${DRAFT_RULES}
Change only what the request needs. Keep unchanged paragraphs word for word, in the same order. Keep the heading unless the request is about it. A table request: write each row as its own short paragraph in the form "Item: value; item: value".`,
    schema: SectionOut,
    effort: 'medium',
    maxTokens: 8000,
  });
  return toSection(out, section.id, out.heading || section.heading, cells);
}


