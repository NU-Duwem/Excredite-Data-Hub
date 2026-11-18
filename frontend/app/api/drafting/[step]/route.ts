import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import * as z from 'zod/v4';
import { getSession } from '@/utils/documentAccess';
import { createAdminClient } from '@/utils/supabase/startSession';
import { processDocumentById } from '@/utils/documentProcessor';
import { aiConfigured, DraftingAIError } from '@/utils/drafting/llm';
import {
  findConflicts,
  fillEvidenceForSource,
  gatherSources,
  loadPrecedent,
  loadSourceText,
  proposeOutline,
  proposeQuestions,
  reviseSection,
  writeDraft,
  type Brief,
} from '@/utils/drafting/steps';
import { draftToDocx, docxFileName } from '@/utils/drafting/docx';
import { draftToPlainText, type EvidenceCell } from '@/utils/drafting/core';

/**
 * Drafting Desk API. One route per step:
 *   sources | questions | evidence | conflicts | outline | draft | revise | export | save | alert
 * Every step needs a signed-in user; reading the library, news and jobs runs
 * as that user, so the database's access rules apply.
 */
export const maxDuration = 300;

// --- Request shapes ----------------------------------------------------------
const id = z.string().max(100);
// Any UUID-shaped id (seeded data isn't always version 4).
const uuidish = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid id');
const BriefZ = z.object({
  request: z.string().trim().min(10, 'Describe what you need in a sentence or two.').max(4000),
  docType: z.string().max(40),
  reader: z.string().max(60),
  jobId: uuidish.nullable(),
  precedentId: uuidish.nullable(),
});
const SourceZ = z.object({
  ref: z.string().regex(/^S\d{1,3}$/),
  kind: z.enum(['document', 'news', 'job']),
  id,
  title: z.string().max(400),
  detail: z.string().max(400),
  classification: z.string().max(40).nullable().optional(),
  restricted: z.boolean().optional(),
  url: z.string().max(2000).nullable().optional(),
  reason: z.string().max(200).optional(),
});
const QuestionZ = z.object({ id: z.string().regex(/^Q\d{1,3}$/), text: z.string().trim().min(3).max(400) });
const CellZ = z.object({
  sourceRef: z.string().regex(/^S\d{1,3}$/),
  questionId: z.string().regex(/^Q\d{1,3}$/),
  status: z.enum(['found', 'not_stated']),
  answer: z.string().max(4000),
  location: z.string().max(60).nullable(),
  quote: z.string().max(1000).nullable(),
  verified: z.boolean(),
  edited: z.boolean().optional(),
});
const ConflictZ = z.object({ questionId: z.string(), sourceRefs: z.array(z.string()).max(20), note: z.string().max(1000) });
const OutlineZ = z.object({ id, heading: z.string().trim().min(1).max(200), purpose: z.string().max(1000), evidence: z.array(z.string().max(20)).max(60) });
const SectionZ = z.object({
  id,
  heading: z.string().max(200),
  paragraphs: z.array(z.object({ text: z.string().max(6000), cites: z.array(z.string().max(20)).max(30) })).max(60),
  assumptions: z.array(z.string().max(1000)).max(30),
  gaps: z.array(z.string().max(1000)).max(30),
});
const DraftZ = z.object({ title: z.string().max(300), sections: z.array(SectionZ).max(20) });

const Sources = z.array(SourceZ).max(20);
const Questions = z.array(QuestionZ).min(1, 'Add at least one question.').max(8);
const Cells = z.array(CellZ).max(200);

const Bodies = {
  sources: z.object({ brief: BriefZ }),
  questions: z.object({ brief: BriefZ, sources: Sources }),
  evidence: z.object({ brief: BriefZ, sources: Sources.min(1, 'Choose at least one source.'), questions: Questions, onlyQuestionIds: z.array(z.string()).max(8).optional(), onlySourceRefs: z.array(z.string()).max(20).optional() }),
  conflicts: z.object({ sources: Sources, questions: Questions, cells: Cells }),
  outline: z.object({ brief: BriefZ, sources: Sources, questions: Questions, cells: Cells, conflicts: z.array(ConflictZ).max(40) }),
  draft: z.object({ brief: BriefZ, sources: Sources, questions: Questions, cells: Cells, conflicts: z.array(ConflictZ).max(40), outline: z.array(OutlineZ).min(1, 'The outline is empty.').max(12) }),
  revise: z.object({ brief: BriefZ, sources: Sources, questions: Questions, cells: Cells, section: SectionZ, instruction: z.string().trim().min(3).max(1000) }),
  export: z.object({ brief: BriefZ, draft: DraftZ, sources: Sources, cells: Cells, jobReference: z.string().max(60).nullable().optional() }),
  save: z.object({
    brief: BriefZ,
    draft: DraftZ,
    sources: Sources,
    cells: Cells,
    jobReference: z.string().max(60).nullable().optional(),
    classification: z.enum(['PUBLIC', 'INTERNAL', 'LEGAL_PRIVILEGED']),
    sessionId: uuidish.nullable(),
  }),
  alert: z.object({ conflict: ConflictZ, sources: Sources, questions: Questions, cells: Cells, request: z.string().max(4000) }),
} as const;
type Step = keyof typeof Bodies;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Run async work over items, a few at a time. */
async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  return out;
}

export async function POST(req: Request, { params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!(step in Bodies)) return json({ error: 'Unknown step' }, 404);

  const { db, user } = await getSession();
  if (!user) return json({ error: 'Please sign in again.' }, 401);

  const raw = await req.json().catch(() => null);
  const parsed = Bodies[step as Step].safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Some details are missing or too long.' }, 400);
  const body = parsed.data as Record<string, unknown>;

  const needsAI = ['questions', 'evidence', 'conflicts', 'outline', 'draft', 'revise'].includes(step);
  if (needsAI && !aiConfigured()) return json({ error: 'No AI service is set up. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to the server settings.' }, 500);

  try {
    switch (step as Step) {
      case 'sources': {
        const { brief } = body as z.infer<typeof Bodies.sources>;
        return json(await gatherSources(db, brief as Brief));
      }

      case 'questions': {
        const { brief, sources } = body as z.infer<typeof Bodies.questions>;
        return json({ questions: await proposeQuestions(brief as Brief, sources) });
      }

      case 'evidence': {
        const { brief, sources, questions, onlyQuestionIds, onlySourceRefs } = body as z.infer<typeof Bodies.evidence>;
        const qs = onlyQuestionIds?.length ? questions.filter((q) => onlyQuestionIds.includes(q.id)) : questions;
        const ss = onlySourceRefs?.length ? sources.filter((s) => onlySourceRefs.includes(s.ref)) : sources;
        const focus = `${brief.request}\n${qs.map((q) => q.text).join('\n')}`;
        const perSource = await inBatches(ss, 3, async (source) => {
          const text = await loadSourceText(db, source, focus);
          if (!text) {
            return qs.map<EvidenceCell>((q) => ({
              sourceRef: source.ref,
              questionId: q.id,
              status: 'not_stated',
              answer: 'This source has no readable text, or you can no longer open it.',
              location: null,
              quote: null,
              verified: false,
            }));
          }
          return fillEvidenceForSource(brief as Brief, qs, source, text);
        });
        return json({ cells: perSource.flat() });
      }

      case 'conflicts': {
        const { sources, questions, cells } = body as z.infer<typeof Bodies.conflicts>;
        return json({ conflicts: await findConflicts(sources, questions, cells) });
      }

      case 'outline': {
        const { brief, sources, questions, cells, conflicts } = body as z.infer<typeof Bodies.outline>;
        const precedent = brief.precedentId ? await loadPrecedent(db, brief.precedentId) : null;
        return json({ outline: await proposeOutline(brief as Brief, sources, questions, cells, conflicts, precedent) });
      }

      case 'draft': {
        const { brief, sources, questions, cells, conflicts, outline } = body as z.infer<typeof Bodies.draft>;
        const precedent = brief.precedentId ? await loadPrecedent(db, brief.precedentId) : null;
        const draft = await writeDraft(brief as Brief, outline, sources, questions, cells, conflicts, precedent);
        await db.from('user_activity_log').insert({ user_id: user.id, action: 'DRAFT_GENERATED', details: `Drafting Desk: "${draft.title}"` });
        return json({ draft });
      }

      case 'revise': {
        const { brief, sources, questions, cells, section, instruction } = body as z.infer<typeof Bodies.revise>;
        return json({ section: await reviseSection(brief as Brief, section, instruction, sources, questions, cells) });
      }

      case 'export': {
        const { brief, draft, sources, cells, jobReference } = body as z.infer<typeof Bodies.export>;
        const author = await authorName(db, user.id, user.email);
        const buf = await draftToDocx({ draft, sources, cells, reader: brief.reader, author, jobReference });
        return new NextResponse(new Uint8Array(buf), {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${docxFileName(draft.title)}"`,
            'Cache-Control': 'no-store',
          },
        });
      }

      case 'save': {
        const { brief, draft, sources, cells, jobReference, classification, sessionId } = body as z.infer<typeof Bodies.save>;
        const author = await authorName(db, user.id, user.email);
        const buf = await draftToDocx({ draft, sources, cells, reader: brief.reader, author, jobReference });
        const admin = createAdminClient();
        const path = `${user.id}/drafts/${Date.now()}_${docxFileName(draft.title).replace(/[^\w.-]+/g, '_')}`;
        const { error: upErr } = await admin.storage.from('documents').upload(path, buf, {
          contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          upsert: false,
        });
        if (upErr) return json({ error: `Could not store the file: ${upErr.message}` }, 500);
        const { data: doc, error: insErr } = await admin
          .from('documents')
          .insert({
            title: draft.title.slice(0, 300),
            document_type: 'DOCUMENT_NOTE',
            classification,
            s3_key: path,
            file_size_bytes: buf.length,
            uploaded_by: user.email ?? '',
            processing_status: 'PENDING',
            matter_id: brief.jobId,
            notes: `Drafted with the Drafting Desk for ${brief.reader}. Request: ${brief.request}`.slice(0, 4000),
            summary: draftToPlainText(draft, sources, cells).slice(0, 1000),
          })
          .select('id, title')
          .single();
        if (insErr || !doc) {
          await admin.storage.from('documents').remove([path]);
          return json({ error: `Could not add it to the library: ${insErr?.message ?? 'unknown error'}` }, 500);
        }
        // Make it searchable straight away (the file is small).
        let processed = true;
        try {
          await processDocumentById(doc.id);
        } catch (e) {
          processed = false;
          console.error('Drafting save: processing failed:', (e as Error).message);
        }
        if (sessionId) await db.from('drafting_sessions').update({ document_id: doc.id, updated_at: new Date().toISOString() }).eq('id', sessionId);
        await admin.from('user_activity_log').insert({ user_id: user.id, action: 'DOCUMENT_GENERATED', details: `Saved Drafting Desk document: "${doc.title}"` });
        return json({ document: doc, processed });
      }

      case 'alert': {
        const { conflict, sources, questions, cells, request } = body as z.infer<typeof Bodies.alert>;
        const q = questions.find((x) => x.id === conflict.questionId);
        const involved = sources.filter((s) => conflict.sourceRefs.includes(s.ref));
        const evidence = involved.map((s) => {
          const c = cells.find((x) => x.sourceRef === s.ref && x.questionId === conflict.questionId);
          return { label: `${s.title}${c?.location ? `, ${c.location}` : ''}`, excerpt: (c?.quote || c?.answer || '').slice(0, 500), url: s.url ?? null };
        });
        const key = `drafting-conflict:${createHash('sha256')
          .update(`${conflict.questionId}|${involved.map((s) => `${s.kind}:${s.id}`).sort().join('|')}|${conflict.note}`)
          .digest('hex')
          .slice(0, 32)}`;
        const admin = createAdminClient();
        const { data: existing } = await admin.from('anomaly_alerts').select('id').eq('dedupe_key', key).in('status', ['UNREVIEWED', 'ASSIGNED']).maybeSingle();
        if (existing) return json({ alreadyRaised: true, alertId: existing.id });
        const { data: alert, error } = await admin
          .from('anomaly_alerts')
          .insert({
            alert_type: 'DOCUMENT_DISCREPANCY',
            source_type: 'DOCUMENT',
            category: 'DOCUMENT_CONTRADICTION',
            severity: 'MEDIUM',
            title: `Sources disagree: ${q?.text ?? 'a fact'}`.slice(0, 300),
            explanation: `${conflict.note}\n\nFound while drafting: ${request}`.slice(0, 8000),
            affects: involved.map((s) => s.title).join('; ').slice(0, 300),
            suggested_action: 'Check which source is right, and correct or annotate the other.',
            evidence,
            document_id: involved.find((s) => s.kind === 'document')?.id ?? null,
            dedupe_key: key,
            reported_by: user.id,
          })
          .select('id')
          .single();
        if (error) return json({ error: `Could not raise the alert: ${error.message}` }, 500);
        return json({ alertId: alert.id });
      }
    }
  } catch (err) {
    if (err instanceof DraftingAIError) {
      console.error(`Drafting ${step}:`, err.message);
      return json({ error: err.userMessage }, err.status);
    }
    console.error(`Drafting ${step} failed:`, err);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

async function authorName(db: Awaited<ReturnType<typeof getSession>>['db'], userId: string, email: string | undefined) {
  const { data } = await db.from('user_profiles').select('full_name').eq('id', userId).maybeSingle();
  return (data?.full_name as string | undefined)?.trim() || email || 'Excredite';
}
