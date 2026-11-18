'use client';

/**
 * Drafting Desk: request -> cited Word draft in four checkpoints.
 *   1 Brief     what, for whom, which job, start from (precedent / template / blank); find sources
 *   2 Evidence  sources x questions table, every cell answered from the source with a page
 *   3 Outline   approve and reorder the structure
 *   4 Draft     cited draft, AI edits as tracked changes, pre-send checks, Word / library
 * Work is autosaved to drafting_sessions (private to the owner). A finished run
 * can be saved as a shared workflow and reused.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import {
  DOCUMENT_TYPES,
  READERS,
  citeLabel,
  hasChanges,
  parseCellKey,
  preSendChecks,
  wordDiff,
  type Conflict,
  type Draft,
  type DraftSection,
  type DraftSource,
  type EvidenceCell,
  type OutlineSection,
  type Question,
} from '@/utils/drafting/core';

type StartFrom = 'template' | 'precedent' | 'blank';
type Brief = { request: string; docType: string; reader: string; jobId: string | null; precedentId: string | null };
type Pending = { sectionId: string; before: DraftSection; after: DraftSection; instruction: string };
type DeskState = {
  brief: Brief;
  startFrom: StartFrom;
  sources: (DraftSource & { include: boolean })[];
  questions: Question[];
  cells: EvidenceCell[];
  conflicts: Conflict[];
  outline: OutlineSection[];
  draft: Draft | null;
  pending: Pending[];
  checkpoint: 1 | 2 | 3 | 4;
  savedDocumentId: string | null;
  workflowId: string | null;
};
type SessionRow = { id: string; title: string; checkpoint: number; updated_at: string };
type WorkflowRow = { id: string; name: string; description: string | null; doc_type: string; reader: string; request: string; questions: Question[]; outline: OutlineSection[]; precedent_id: string | null; shared: boolean; created_by: string };

const EMPTY: DeskState = {
  brief: { request: '', docType: 'REGULATORY_BRIEF', reader: READERS[0], jobId: null, precedentId: null },
  startFrom: 'template',
  sources: [],
  questions: [],
  cells: [],
  conflicts: [],
  outline: [],
  draft: null,
  pending: [],
  checkpoint: 1,
  savedDocumentId: null,
  workflowId: null,
};

const CHECKPOINTS = [
  { n: 1, label: 'Brief', desc: 'What, for whom, start from' },
  { n: 2, label: 'Evidence', desc: 'Facts table, every cell cited' },
  { n: 3, label: 'Outline', desc: 'Approve the structure' },
  { n: 4, label: 'Draft & review', desc: 'Tracked changes, then Word' },
] as const;

const input = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand';
const label = 'flex flex-col gap-1.5 text-xs font-bold text-gray-700';
const btn = 'min-h-10 px-3.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50';
const btnPrimary = 'min-h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50 inline-flex items-center gap-2';
const pill = 'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap';

async function api<T>(step: string, body: unknown): Promise<T> {
  const res = await fetch(`/api/drafting/${step}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />;
}

function classificationPill(s: DraftSource) {
  if (s.restricted) return <span className={`${pill} bg-red-50 text-red-700`}>Restricted</span>;
  if (s.classification === 'LEGAL_PRIVILEGED') return <span className={`${pill} bg-accent-soft text-accent-ink`}>Legal-privileged</span>;
  if (s.kind === 'news') return <span className={`${pill} bg-gray-100 text-gray-700`}>News</span>;
  if (s.kind === 'job') return <span className={`${pill} bg-gray-100 text-gray-700`}>Job</span>;
  return <span className={`${pill} bg-brand/10 text-brand`}>{(s.classification ?? 'Internal').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</span>;
}

export default function DraftingDesk({ initialRequest = '' }: { initialRequest?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [s, setS] = useState<DeskState>(() => ({ ...EMPTY, brief: { ...EMPTY.brief, request: initialRequest } }));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Reference data
  const [jobs, setJobs] = useState<{ id: string; title: string; matter_reference: string | null }[]>([]);
  const [precedentQuery, setPrecedentQuery] = useState('');
  const [precedents, setPrecedents] = useState<{ id: string; title: string }[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const [showDrafts, setShowDrafts] = useState(false);
  const [showSaveWorkflow, setShowSaveWorkflow] = useState(false);

  // Autosave
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const patch = useCallback((p: Partial<DeskState>) => setS((prev) => ({ ...prev, ...p })), []);
  const setBrief = (p: Partial<Brief>) => setS((prev) => ({ ...prev, brief: { ...prev.brief, ...p } }));

  const included = s.sources.filter((x) => x.include);
  const bySource = useMemo(() => new Map(s.sources.map((x) => [x.ref, x])), [s.sources]);
  const cellFor = (ref: string, qid: string) => s.cells.find((c) => c.sourceRef === ref && c.questionId === qid);
  const labelFor = (key: string) => {
    const k = parseCellKey(key);
    return k ? citeLabel(bySource.get(k.sourceRef), cellFor(k.sourceRef, k.questionId)) : key;
  };
  const job = jobs.find((j) => j.id === s.brief.jobId) ?? null;

  // ---- Load reference data ---------------------------------------------------
  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [j, ss, wf] = await Promise.all([
        supabase.from('matters').select('id, title, matter_reference').is('deleted_at', null).order('created_at', { ascending: false }).limit(100),
        supabase.from('drafting_sessions').select('id, title, checkpoint, updated_at').order('updated_at', { ascending: false }).limit(20),
        supabase.from('drafting_workflows').select('*').order('updated_at', { ascending: false }).limit(50),
      ]);
      if (!active) return;
      setMe(user?.id ?? null);
      setJobs((j.data ?? []) as typeof jobs);
      setSessions((ss.data ?? []) as SessionRow[]);
      setWorkflows((wf.data ?? []) as WorkflowRow[]);
    })();
    return () => {
      active = false;
    };
  }, [supabase]);

  useEffect(() => {
    let active = true;
    const t = window.setTimeout(async () => {
      let q = supabase.from('documents').select('id, title').eq('processing_status', 'COMPLETE').order('created_at', { ascending: false }).limit(30);
      const term = precedentQuery.trim().replace(/[%_,()]/g, ' ');
      if (term) q = q.ilike('title', `%${term}%`);
      const { data } = await q;
      if (active) setPrecedents((data ?? []) as { id: string; title: string }[]);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(t);
    };
  }, [supabase, precedentQuery]);

  // ---- Autosave (private to the owner) --------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      return;
    }
    if (!s.brief.request.trim() && !s.sources.length) return;
    const t = window.setTimeout(() => {
      const row = {
        title: (s.draft?.title || s.brief.request).slice(0, 120) || 'Untitled draft',
        checkpoint: s.checkpoint,
        state: s,
        job_id: s.brief.jobId,
        document_id: s.savedDocumentId,
        updated_at: new Date().toISOString(),
      };
      // One save at a time, so a slow first save can't create a second draft.
      saveChain.current = saveChain.current.then(async () => {
        const id = sessionIdRef.current;
        if (id) {
          const { error: e } = await supabase.from('drafting_sessions').update(row).eq('id', id);
          if (!e) setSavedAt(new Date().toISOString());
          return;
        }
        const { data, error: e } = await supabase.from('drafting_sessions').insert(row).select('id, title, checkpoint, updated_at').single();
        if (!e && data) {
          sessionIdRef.current = data.id;
          setSessionId(data.id);
          setSessions((prev) => [data as SessionRow, ...prev]);
          setSavedAt(new Date().toISOString());
        }
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [s, supabase]);

  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setError(null);
    setNotice(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // ---- Steps ---------------------------------------------------------------------
  const findSources = () =>
    run('sources', async () => {
      const brief = { ...s.brief, precedentId: s.startFrom === 'precedent' ? s.brief.precedentId : null };
      const r = await api<{ sources: DraftSource[] }>('sources', { brief });
      patch({ brief, sources: r.sources.map((x) => ({ ...x, include: true })), cells: [], conflicts: [], outline: s.workflowId ? s.outline : [], draft: null, pending: [] });
      if (!r.sources.length) setNotice('Nothing in the library, news or the job matched. Try different words, or add documents to the library first.');
    });

  const goEvidence = () =>
    run('questions', async () => {
      let questions = s.questions;
      if (!questions.length) {
        const r = await api<{ questions: Question[] }>('questions', { brief: s.brief, sources: included });
        questions = r.questions;
      }
      patch({ questions, checkpoint: 2 });
    });

  const fillTable = (onlyQuestionIds?: string[]) =>
    run('evidence', async () => {
      const qs = s.questions.filter((q) => q.text.trim());
      const r = await api<{ cells: EvidenceCell[] }>('evidence', { brief: s.brief, sources: included, questions: qs, onlyQuestionIds });
      const keep = s.cells.filter((c) => !r.cells.some((n) => n.sourceRef === c.sourceRef && n.questionId === c.questionId));
      const cells = [...keep, ...r.cells];
      const cf = await api<{ conflicts: Conflict[] }>('conflicts', { sources: included, questions: qs, cells });
      patch({ cells, conflicts: cf.conflicts, questions: qs });
    });

  const recheckConflicts = () =>
    run('conflicts', async () => {
      const cf = await api<{ conflicts: Conflict[] }>('conflicts', { sources: included, questions: s.questions, cells: s.cells });
      patch({ conflicts: cf.conflicts });
      if (!cf.conflicts.length) setNotice('No conflicts between sources.');
    });

  const raiseAlert = (c: Conflict) =>
    run(`alert-${c.questionId}`, async () => {
      const r = await api<{ alertId?: string; alreadyRaised?: boolean }>('alert', { conflict: c, sources: included, questions: s.questions, cells: s.cells, request: s.brief.request });
      setNotice(r.alreadyRaised ? 'This conflict is already an open alert.' : 'Alert raised. It is on the Alerts page for review.');
    });

  const goOutline = () =>
    run('outline', async () => {
      let outline = s.outline;
      if (!outline.length) {
        const r = await api<{ outline: OutlineSection[] }>('outline', { brief: s.brief, sources: included, questions: s.questions, cells: s.cells, conflicts: s.conflicts });
        outline = r.outline;
      }
      patch({ outline, checkpoint: 3 });
    });

  const writeDraft = () =>
    run('draft', async () => {
      const outline = s.outline.filter((o) => o.heading.trim());
      const r = await api<{ draft: Draft }>('draft', { brief: s.brief, sources: included, questions: s.questions, cells: s.cells, conflicts: s.conflicts, outline });
      patch({ draft: r.draft, pending: [], checkpoint: 4, savedDocumentId: null });
    });

  const revise = (section: DraftSection, instruction: string) =>
    run(`revise-${section.id}`, async () => {
      const r = await api<{ section: DraftSection }>('revise', { brief: s.brief, sources: included, questions: s.questions, cells: s.cells, section, instruction });
      setS((prev) => ({ ...prev, pending: [...prev.pending.filter((p) => p.sectionId !== section.id), { sectionId: section.id, before: section, after: r.section, instruction }] }));
    });

  const resolvePending = (sectionId: string, accept: boolean) =>
    setS((prev) => {
      const p = prev.pending.find((x) => x.sectionId === sectionId);
      if (!p || !prev.draft) return prev;
      return {
        ...prev,
        pending: prev.pending.filter((x) => x.sectionId !== sectionId),
        draft: accept ? { ...prev.draft, sections: prev.draft.sections.map((x) => (x.id === sectionId ? p.after : x)) } : prev.draft,
        savedDocumentId: accept ? null : prev.savedDocumentId,
      };
    });

  const exportWord = () =>
    run('export', async () => {
      if (!s.draft) return;
      const res = await fetch('/api/drafting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief: s.brief, draft: s.draft, sources: included, cells: s.cells, jobReference: job?.matter_reference ?? null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Could not make the Word file.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'Draft.docx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    });

  const [saveClass, setSaveClass] = useState<'PUBLIC' | 'INTERNAL' | 'LEGAL_PRIVILEGED'>('INTERNAL');
  const saveToLibrary = () =>
    run('save', async () => {
      if (!s.draft) return;
      const r = await api<{ document: { id: string; title: string }; processed: boolean }>('save', {
        brief: s.brief,
        draft: s.draft,
        sources: included,
        cells: s.cells,
        jobReference: job?.matter_reference ?? null,
        classification: saveClass,
        sessionId,
      });
      patch({ savedDocumentId: r.document.id });
      setNotice(r.processed ? 'Saved to the library as a Word document. The AI can now search it.' : 'Saved to the library. It is still being prepared for AI search.');
    });

  // ---- Drafts and workflows -----------------------------------------------------
  const newDraft = () => {
    setS({ ...EMPTY });
    sessionIdRef.current = null;
    setSessionId(null);
    setSavedAt(null);
    setError(null);
    setNotice(null);
  };

  const openSession = async (id: string) => {
    const { data } = await supabase.from('drafting_sessions').select('id, state').eq('id', id).single();
    if (!data) return setError('Could not open that draft.');
    loadedRef.current = false;
    setS({ ...EMPTY, ...(data.state as DeskState) });
    sessionIdRef.current = data.id;
    setSessionId(data.id);
    setShowDrafts(false);
    setNotice('Draft reopened.');
  };

  const startFromWorkflow = (w: WorkflowRow) => {
    newDraft();
    setS({
      ...EMPTY,
      brief: { request: w.request, docType: w.doc_type, reader: w.reader, jobId: null, precedentId: w.precedent_id },
      startFrom: w.precedent_id ? 'precedent' : 'template',
      questions: w.questions ?? [],
      outline: (w.outline ?? []).map((o) => ({ ...o, evidence: [] })),
      workflowId: w.id,
    });
    setNotice(`Started from the workflow “${w.name}”. Check the request, then find sources.`);
  };

  const [wfName, setWfName] = useState('');
  const [wfShared, setWfShared] = useState(true);
  const saveWorkflow = () =>
    run('workflow', async () => {
      const name = wfName.trim();
      if (!name) throw new Error('Give the workflow a name.');
      const { data, error: e } = await supabase
        .from('drafting_workflows')
        .insert({
          name,
          doc_type: s.brief.docType,
          reader: s.brief.reader,
          request: s.brief.request,
          questions: s.questions,
          outline: s.outline.map((o) => ({ id: o.id, heading: o.heading, purpose: o.purpose, evidence: [] })),
          precedent_id: s.startFrom === 'precedent' ? s.brief.precedentId : null,
          shared: wfShared,
        })
        .select('*')
        .single();
      if (e) throw new Error(e.message);
      setWorkflows((prev) => [data as WorkflowRow, ...prev]);
      setShowSaveWorkflow(false);
      setWfName('');
      setNotice(`Saved as a workflow${wfShared ? ' for the team' : ''}. Start from it next time to skip straight to the sources.`);
    });

  const deleteWorkflow = async (w: WorkflowRow) => {
    const { error: e } = await supabase.from('drafting_workflows').delete().eq('id', w.id);
    if (e) return setError(e.message);
    setWorkflows((prev) => prev.filter((x) => x.id !== w.id));
  };

  // ---- Derived -----------------------------------------------------------------------
  const canEvidence = included.length > 0 && s.brief.request.trim().length >= 10;
  const answered = s.cells.filter((c) => c.status === 'found').length;
  const canOutline = answered > 0;
  const canDraft = s.outline.some((o) => o.heading.trim());
  const reached = s.draft ? 4 : s.outline.length ? 3 : s.questions.length ? 2 : 1;
  const checks = preSendChecks(s.draft, included, s.brief.reader, s.pending.length);

  const busyText: Record<string, string> = {
    sources: 'Searching the library, news and the job…',
    questions: 'Working out what the document needs to know…',
    evidence: `Reading ${included.length} source${included.length === 1 ? '' : 's'} and filling the table… this can take a minute or two.`,
    conflicts: 'Comparing sources…',
    outline: 'Planning the outline…',
    draft: 'Writing the draft from the evidence… about a minute.',
    export: 'Making the Word file…',
    save: 'Saving to the library…',
  };

  // ---- Render -------------------------------------------------------------------------
  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2.5 px-5 py-3.5 border-b border-gray-200 bg-gray-50">
        <span className="font-extrabold text-gray-900">Drafting Desk</span>
        <span className={`${pill} bg-brand/10 text-brand`}>{DOCUMENT_TYPES.find((d) => d.value === s.brief.docType)?.label}</span>
        {job && <span className={`${pill} bg-accent-soft text-accent-ink`}>Job {job.matter_reference ?? job.title}</span>}
        <span className="flex-1" />
        <span className="text-xs text-gray-600" aria-live="polite">
          {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : 'Not saved yet'}
        </span>
        <div className="relative">
          <button type="button" className={btn} onClick={() => setShowDrafts((v) => !v)} aria-expanded={showDrafts}>
            My drafts &amp; workflows
          </button>
          {showDrafts && (
            <div className="absolute right-0 z-20 mt-2 w-[min(92vw,380px)] rounded-2xl border border-gray-200 bg-white shadow-xl p-3 flex flex-col gap-3 max-h-[70vh] overflow-y-auto">
              <div>
                <p className="px-1 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-gray-600">Workflows</p>
                {workflows.length === 0 ? (
                  <p className="px-1 text-sm text-gray-600">None yet. Finish a draft, then use “Save as workflow”.</p>
                ) : (
                  workflows.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-gray-50">
                      <button type="button" className="flex-1 text-left" onClick={() => { startFromWorkflow(w); setShowDrafts(false); }}>
                        <span className="block text-sm font-semibold text-gray-900">{w.name}</span>
                        <span className="block text-xs text-gray-600">
                          {DOCUMENT_TYPES.find((d) => d.value === w.doc_type)?.label ?? w.doc_type} · {w.questions?.length ?? 0} questions{w.shared ? '' : ' · only you'}
                        </span>
                      </button>
                      {w.created_by === me && (
                        <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => deleteWorkflow(w)}>
                          Delete
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div>
                <p className="px-1 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-gray-600">My recent drafts</p>
                {sessions.length === 0 ? (
                  <p className="px-1 text-sm text-gray-600">Drafts are saved here automatically as you work.</p>
                ) : (
                  sessions.map((x) => (
                    <button key={x.id} type="button" onClick={() => openSession(x.id)} className="w-full text-left rounded-xl px-2 py-2 hover:bg-gray-50">
                      <span className="block text-sm font-semibold text-gray-900 truncate">{x.title}</span>
                      <span className="block text-xs text-gray-600">
                        Checkpoint {x.checkpoint} · {new Date(x.updated_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        <button type="button" className={btn} onClick={() => setShowSaveWorkflow(true)} disabled={!s.questions.length}>
          Save as workflow
        </button>
        <button type="button" className={btn} onClick={newDraft}>
          New draft
        </button>
      </div>

      {/* Checkpoints */}
      <div role="tablist" aria-label="Checkpoints" className="grid grid-cols-2 md:grid-cols-4 border-b border-gray-200">
        {CHECKPOINTS.map((c) => {
          const current = s.checkpoint === c.n;
          const open = c.n <= reached;
          return (
            <button
              key={c.n}
              type="button"
              role="tab"
              aria-selected={current}
              disabled={!open || !!busy}
              onClick={() => patch({ checkpoint: c.n })}
              className={`text-left px-4 py-3 border-r last:border-r-0 border-gray-200 disabled:cursor-not-allowed ${current ? 'bg-brand text-white' : open ? 'bg-white hover:bg-gray-50' : 'bg-white text-gray-400'}`}
            >
              <span className={`block font-mono text-[11px] ${current ? 'text-white/80' : 'text-gray-500'}`}>
                CHECKPOINT {c.n}
                {c.n < reached && !current ? ' ✓' : ''}
              </span>
              <span className="block text-sm font-bold">{c.label}</span>
              <span className={`block text-xs ${current ? 'text-white/80' : 'text-gray-500'}`}>{c.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="p-5 flex flex-col gap-4">
        {busy && busyText[busy] && (
          <p role="status" className="rounded-xl bg-brand/10 text-brand px-4 py-3 text-sm font-medium flex items-center gap-2">
            <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
            {busyText[busy]}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-xl bg-red-50 text-red-800 px-4 py-3 text-sm font-medium">
            {error}
          </p>
        )}
        {notice && !error && (
          <p role="status" className="rounded-xl bg-accent-soft text-accent-ink px-4 py-3 text-sm font-medium">
            {notice}
          </p>
        )}

        {/* 1 BRIEF */}
        {s.checkpoint === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-start">
            <div className="flex flex-col gap-4">
              <label className={label} htmlFor="dd-request">
                What do you need?
                <textarea
                  id="dd-request"
                  className={`${input} min-h-[96px]`}
                  value={s.brief.request}
                  onChange={(e) => setBrief({ request: e.target.value })}
                  placeholder="e.g. A two-page brief for a DisCo client on what the MYTO 2024 minor review changes for Band A customers, and what they should do before it takes effect."
                  maxLength={4000}
                />
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className={label} htmlFor="dd-type">
                  Document type
                  <select id="dd-type" className={input} value={s.brief.docType} onChange={(e) => setBrief({ docType: e.target.value })}>
                    {DOCUMENT_TYPES.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={label} htmlFor="dd-reader">
                  Reader
                  <select id="dd-reader" className={input} value={s.brief.reader} onChange={(e) => setBrief({ reader: e.target.value })}>
                    {READERS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className={label} htmlFor="dd-job">
                  Job (optional)
                  <select id="dd-job" className={input} value={s.brief.jobId ?? ''} onChange={(e) => setBrief({ jobId: e.target.value || null })}>
                    <option value="">None</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.matter_reference ? `${j.matter_reference} · ` : ''}
                        {j.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="flex flex-col gap-2">
                <legend className="text-xs font-bold text-gray-700 mb-1.5">Start from</legend>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {(
                    [
                      { v: 'template', t: 'Firm template', d: DOCUMENT_TYPES.find((d) => d.value === s.brief.docType)?.guidance ?? '' },
                      { v: 'precedent', t: 'A precedent', d: 'A past document sets the structure and tone. Its facts are never reused.' },
                      { v: 'blank', t: 'Blank', d: 'The AI proposes a structure from the request.' },
                    ] as { v: StartFrom; t: string; d: string }[]
                  ).map((o) => (
                    <button
                      key={o.v}
                      type="button"
                      aria-pressed={s.startFrom === o.v}
                      onClick={() => patch({ startFrom: o.v })}
                      className={`text-left rounded-xl border p-3 ${s.startFrom === o.v ? 'border-brand ring-2 ring-brand/15' : 'border-gray-200 hover:bg-gray-50'}`}
                    >
                      <span className="block text-sm font-bold text-gray-900">{o.t}</span>
                      <span className="block text-xs text-gray-600">{o.d}</span>
                    </button>
                  ))}
                </div>
                {s.startFrom === 'precedent' && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className={label} htmlFor="dd-prec-q">
                      Find a precedent
                      <input id="dd-prec-q" className={input} value={precedentQuery} onChange={(e) => setPrecedentQuery(e.target.value)} placeholder="Search the library by title" />
                    </label>
                    <label className={label} htmlFor="dd-prec">
                      Precedent
                      <select id="dd-prec" className={input} value={s.brief.precedentId ?? ''} onChange={(e) => setBrief({ precedentId: e.target.value || null })}>
                        <option value="">Choose a document…</option>
                        {precedents.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </fieldset>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={findSources} disabled={!!busy || s.brief.request.trim().length < 10 || (s.startFrom === 'precedent' && !s.brief.precedentId)}>
                  {busy === 'sources' && <Spinner />}
                  {s.sources.length ? 'Search again' : 'Find sources'}
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-gray-50 p-4 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-gray-900">Sources</h3>
              {s.sources.length === 0 ? (
                <p className="text-sm text-gray-600">Describe what you need, then “Find sources”. EPDH searches the library, recent news and the linked job. Only documents you can open are used.</p>
              ) : (
                <>
                  <ul className="flex flex-col gap-2">
                    {s.sources.map((x) => (
                      <li key={x.ref}>
                        <label className="flex items-start gap-3 rounded-xl bg-white border border-gray-200 p-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="mt-0.5 h-4 w-4 accent-brand"
                            checked={x.include}
                            onChange={(e) => patch({ sources: s.sources.map((y) => (y.ref === x.ref ? { ...y, include: e.target.checked } : y)), cells: [], conflicts: [] })}
                          />
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-semibold text-gray-900">{x.title}</span>
                            <span className="block text-xs text-gray-600">
                              {x.detail}
                              {x.reason ? ` · ${x.reason}` : ''}
                            </span>
                          </span>
                          {classificationPill(x)}
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className={btnPrimary} onClick={goEvidence} disabled={!!busy || !canEvidence}>
                    {busy === 'questions' && <Spinner />}
                    Next: evidence
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        {/* 2 EVIDENCE */}
        {s.checkpoint === 2 && (
          <div className="flex flex-col gap-4">
            <div className="rounded-2xl bg-gray-50 p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-bold text-gray-900">Questions the document needs answered</h3>
                <span className="text-xs text-gray-600">Edit, add or remove before filling the table.</span>
              </div>
              <ol className="flex flex-col gap-2">
                {s.questions.map((q, i) => (
                  <li key={q.id} className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500 w-7">{q.id}</span>
                    <label className="sr-only" htmlFor={`dd-q-${q.id}`}>
                      Question {i + 1}
                    </label>
                    <input
                      id={`dd-q-${q.id}`}
                      className={input}
                      value={q.text}
                      maxLength={400}
                      onChange={(e) => patch({ questions: s.questions.map((x) => (x.id === q.id ? { ...x, text: e.target.value } : x)) })}
                    />
                    <button
                      type="button"
                      className="text-xs font-semibold text-red-700 hover:underline whitespace-nowrap"
                      onClick={() => patch({ questions: s.questions.filter((x) => x.id !== q.id), cells: s.cells.filter((c) => c.questionId !== q.id) })}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn}
                  disabled={s.questions.length >= 8}
                  onClick={() => {
                    const n = Math.max(0, ...s.questions.map((q) => Number(q.id.slice(1)))) + 1;
                    patch({ questions: [...s.questions, { id: `Q${n}`, text: '' }] });
                  }}
                >
                  + Add a question
                </button>
                <button type="button" className={btnPrimary} onClick={() => fillTable()} disabled={!!busy || !s.questions.some((q) => q.text.trim().length >= 3)}>
                  {busy === 'evidence' && <Spinner />}
                  {s.cells.length ? 'Refill the whole table' : 'Fill the table'}
                </button>
                {s.cells.length > 0 && s.questions.some((q) => q.text.trim() && !s.cells.some((c) => c.questionId === q.id)) && (
                  <button
                    type="button"
                    className={btn}
                    disabled={!!busy}
                    onClick={() => fillTable(s.questions.filter((q) => q.text.trim() && !s.cells.some((c) => c.questionId === q.id)).map((q) => q.id))}
                  >
                    Fill new questions only
                  </button>
                )}
              </div>
            </div>

            {s.cells.length > 0 && (
              <>
                <p className="text-sm text-gray-600">
                  Each source is a row and each question a column. Click any answer to correct it. The draft is written only from this table.
                </p>
                <div className="overflow-x-auto rounded-2xl border border-gray-200">
                  <table className="min-w-[760px] w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th scope="col" className="p-3 border-b border-r border-gray-200 text-xs font-bold text-gray-600 w-56">
                          Source
                        </th>
                        {s.questions.map((q) => (
                          <th key={q.id} scope="col" className="p-3 border-b border-r last:border-r-0 border-gray-200 text-xs font-bold text-gray-900 align-top">
                            <span className="font-mono text-gray-500">{q.id}</span> {q.text}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {included.map((src) => (
                        <tr key={src.ref} className="align-top">
                          <th scope="row" className="p-3 border-b border-r border-gray-200 text-left font-normal">
                            <span className="block font-semibold text-gray-900">{src.title}</span>
                            <span className="mt-1 flex flex-wrap gap-1">{classificationPill(src)}</span>
                          </th>
                          {s.questions.map((q) => (
                            <EvidenceCellView
                              key={q.id}
                              cell={cellFor(src.ref, q.id)}
                              conflict={s.conflicts.some((c) => c.questionId === q.id && c.sourceRefs.includes(src.ref))}
                              onSave={(answer, notStated) =>
                                patch({
                                  cells: s.cells.map((c) =>
                                    c.sourceRef === src.ref && c.questionId === q.id
                                      ? { ...c, answer: notStated ? 'Not stated in this source.' : answer, status: notStated ? 'not_stated' : 'found', edited: true }
                                      : c,
                                  ),
                                  outline: [],
                                  draft: null,
                                  pending: [],
                                })
                              }
                            />
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {s.conflicts.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {s.conflicts.map((c, i) => (
                      <div key={`${c.questionId}-${i}`} className="border-l-4 border-accent bg-accent-soft text-accent-ink rounded-r-xl px-4 py-3 text-sm flex flex-wrap items-center gap-3">
                        <span className="flex-1 min-w-[220px]">
                          <b>Sources disagree ({c.questionId}):</b> {c.note} Correct one of the cells, or keep both and the draft will point out the difference.
                        </span>
                        <button type="button" className={btn} disabled={!!busy} onClick={() => raiseAlert(c)}>
                          Raise an alert
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 justify-between items-center">
                  <span className="text-xs text-gray-600">
                    {answered} of {s.cells.length} cells answered · {s.cells.filter((c) => c.status === 'found' && !c.verified && !c.edited).length} answers whose quote could not be matched to the source word for word
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" className={btn} onClick={recheckConflicts} disabled={!!busy}>
                      Check for conflicts
                    </button>
                    <button type="button" className={btnPrimary} onClick={goOutline} disabled={!!busy || !canOutline}>
                      {busy === 'outline' && <Spinner />}
                      Next: outline
                    </button>
                  </span>
                </div>
              </>
            )}
          </div>
        )}

        {/* 3 OUTLINE */}
        {s.checkpoint === 3 && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-start">
            <div className="flex flex-col gap-2">
              {s.outline.map((o, i) => (
                <div key={o.id} className="rounded-2xl bg-gray-50 p-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-500 w-5">{i + 1}.</span>
                    <label className="sr-only" htmlFor={`dd-h-${o.id}`}>
                      Heading {i + 1}
                    </label>
                    <input
                      id={`dd-h-${o.id}`}
                      className={`${input} font-semibold`}
                      value={o.heading}
                      maxLength={200}
                      onChange={(e) => patch({ outline: s.outline.map((x) => (x.id === o.id ? { ...x, heading: e.target.value } : x)) })}
                    />
                    <button type="button" className={btn} aria-label={`Move section ${i + 1} up`} disabled={i === 0} onClick={() => patch({ outline: move(s.outline, i, -1) })}>
                      ↑
                    </button>
                    <button type="button" className={btn} aria-label={`Move section ${i + 1} down`} disabled={i === s.outline.length - 1} onClick={() => patch({ outline: move(s.outline, i, 1) })}>
                      ↓
                    </button>
                    <button type="button" className="text-xs font-semibold text-red-700 hover:underline" onClick={() => patch({ outline: s.outline.filter((x) => x.id !== o.id) })}>
                      Remove
                    </button>
                  </div>
                  <label className="sr-only" htmlFor={`dd-p-${o.id}`}>
                    What section {i + 1} covers
                  </label>
                  <input
                    id={`dd-p-${o.id}`}
                    className={input}
                    value={o.purpose}
                    maxLength={1000}
                    placeholder="What this section covers"
                    onChange={(e) => patch({ outline: s.outline.map((x) => (x.id === o.id ? { ...x, purpose: e.target.value } : x)) })}
                  />
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    {o.evidence.length ? (
                      o.evidence.map((k) => (
                        <span key={k} className={`${pill} bg-brand/10 text-brand font-mono`} title={cellFor(k.split(':')[0], k.split(':')[1])?.answer}>
                          {labelFor(k)}
                        </span>
                      ))
                    ) : (
                      <span className="text-gray-600">No evidence planned. The draft will leave this section out or mark it as a gap.</span>
                    )}
                  </div>
                </div>
              ))}
              <button
                type="button"
                className={btn}
                onClick={() => patch({ outline: [...s.outline, { id: `sec-${Date.now()}`, heading: '', purpose: '', evidence: [] }] })}
              >
                + Add a section
              </button>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4 flex flex-col gap-3">
              <h3 className="text-sm font-bold text-gray-900">Approve the outline</h3>
              <p className="text-sm text-gray-600">Fixing the structure here takes seconds; fixing it after the draft means rewriting. Each section shows the evidence it will use.</p>
              <button type="button" className={btnPrimary} onClick={writeDraft} disabled={!!busy || !canDraft}>
                {busy === 'draft' && <Spinner />}
                {s.draft ? 'Rewrite the draft' : 'Write the draft'}
              </button>
              {s.draft && <p className="text-xs text-gray-600">Rewriting replaces the current draft and any tracked changes.</p>}
            </div>
          </div>
        )}

        {/* 4 DRAFT */}
        {s.checkpoint === 4 && s.draft && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-5 items-start">
            <article className="rounded-2xl border border-gray-200 p-5 sm:p-7 flex flex-col gap-4">
              <label className="sr-only" htmlFor="dd-title">
                Document title
              </label>
              <input
                id="dd-title"
                className="text-xl font-extrabold text-gray-900 bg-transparent outline-none rounded-lg focus:ring-2 focus:ring-brand/30 px-1 -mx-1"
                value={s.draft.title}
                maxLength={300}
                onChange={(e) => patch({ draft: { ...s.draft!, title: e.target.value }, savedDocumentId: null })}
              />
              {s.draft.sections.map((sec, i) => (
                <SectionView
                  key={sec.id}
                  index={i}
                  section={sec}
                  pending={s.pending.find((p) => p.sectionId === sec.id) ?? null}
                  labelFor={labelFor}
                  answerFor={(k) => {
                    const p = parseCellKey(k);
                    const c = p ? cellFor(p.sourceRef, p.questionId) : undefined;
                    return c ? `${c.answer}${c.quote ? `\n“${c.quote}”` : ''}` : '';
                  }}
                  busy={busy === `revise-${sec.id}`}
                  disabled={!!busy}
                  onRevise={(instr) => revise(sec, instr)}
                  onResolve={(accept) => resolvePending(sec.id, accept)}
                  onEditParagraph={(pi, text) =>
                    patch({
                      draft: { ...s.draft!, sections: s.draft!.sections.map((x) => (x.id === sec.id ? { ...x, paragraphs: x.paragraphs.map((p, j) => (j === pi ? { ...p, text } : p)) } : x)) },
                      savedDocumentId: null,
                    })
                  }
                />
              ))}
              <section aria-label="Sources">
                <h4 className="text-sm font-bold text-gray-900 mt-2">Sources</h4>
                <ol className="mt-1 list-decimal pl-5 text-sm text-gray-700">
                  {included.map((x) => (
                    <li key={x.ref}>
                      {x.title}
                      <span className="text-gray-500"> · {x.detail}</span>
                    </li>
                  ))}
                </ol>
              </section>
            </article>

            <aside className="rounded-2xl bg-gray-50 p-4 flex flex-col gap-4 lg:sticky lg:top-4">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Before it goes out</h3>
                <ul className="mt-2 flex flex-col gap-1.5 text-sm">
                  {checks.map((c) => (
                    <li key={c.text} className="flex gap-2">
                      <span aria-hidden="true" className={c.ok ? 'text-green-700 font-bold' : 'text-accent-ink font-bold'}>
                        {c.ok ? '✓' : '!'}
                      </span>
                      <span className={c.ok ? 'text-gray-800' : 'text-gray-900 font-semibold'}>{c.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <button type="button" className={btnPrimary} onClick={exportWord} disabled={!!busy || s.pending.length > 0}>
                {busy === 'export' && <Spinner />}
                Download Word
              </button>
              <div className="flex flex-col gap-2 border-t border-gray-200 pt-4">
                <label className={label} htmlFor="dd-class">
                  Save to the library as
                  <select id="dd-class" className={input} value={saveClass} onChange={(e) => setSaveClass(e.target.value as typeof saveClass)}>
                    <option value="INTERNAL">Internal</option>
                    <option value="LEGAL_PRIVILEGED">Legal-privileged</option>
                    <option value="PUBLIC">Public</option>
                  </select>
                </label>
                <button type="button" className={btn} onClick={saveToLibrary} disabled={!!busy || s.pending.length > 0 || !!s.savedDocumentId}>
                  {s.savedDocumentId ? 'Saved to the library' : busy === 'save' ? 'Saving…' : `Save to the library${job ? ' and job' : ''}`}
                </button>
                {s.savedDocumentId && (
                  <a className="text-sm font-semibold text-brand hover:underline" href={`/documents?doc=${s.savedDocumentId}`}>
                    Open it in Documents
                  </a>
                )}
                {s.pending.length > 0 && <p className="text-xs text-gray-600">Accept or reject the tracked changes first.</p>}
              </div>
            </aside>
          </div>
        )}
      </div>

      {showSaveWorkflow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="wf-title" className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-6 flex flex-col gap-4" onKeyDown={(e) => e.key === 'Escape' && setShowSaveWorkflow(false)}>
            <h2 id="wf-title" className="text-lg font-extrabold text-gray-900">
              Save as workflow
            </h2>
            <p className="text-sm text-gray-600">Saves the document type, reader, request wording, questions, outline and precedent. Next time, start from it and go straight to the sources.</p>
            <label className={label} htmlFor="wf-name">
              Name
              <input id="wf-name" className={input} value={wfName} onChange={(e) => setWfName(e.target.value)} maxLength={120} placeholder="e.g. Weekly sector briefing" autoFocus />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input type="checkbox" className="h-4 w-4 accent-brand" checked={wfShared} onChange={(e) => setWfShared(e.target.checked)} />
              Share with the team
            </label>
            <div className="flex gap-2 justify-end">
              <button type="button" className={btn} onClick={() => setShowSaveWorkflow(false)}>
                Cancel
              </button>
              <button type="button" className={btnPrimary} onClick={saveWorkflow} disabled={!!busy}>
                Save workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function move<T>(arr: T[], i: number, d: number): T[] {
  const out = [...arr];
  const j = i + d;
  if (j < 0 || j >= out.length) return out;
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

// ---------------------------------------------------------------------------
// Evidence cell
// ---------------------------------------------------------------------------
function EvidenceCellView({ cell, conflict, onSave }: { cell: EvidenceCell | undefined; conflict: boolean; onSave: (answer: string, notStated: boolean) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const base = `p-3 border-b border-r last:border-r-0 border-gray-200 ${conflict ? 'bg-accent-soft' : ''}`;
  if (!cell) return <td className={`${base} text-xs text-gray-500`}>Not filled yet</td>;
  if (editing) {
    return (
      <td className={base}>
        <label className="sr-only" htmlFor={`cell-${cell.sourceRef}-${cell.questionId}`}>
          Correct the answer
        </label>
        <textarea id={`cell-${cell.sourceRef}-${cell.questionId}`} className={`${input} min-h-[80px] text-sm`} value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus maxLength={4000} />
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btnPrimary} onClick={() => { onSave(draft.trim(), !draft.trim()); setEditing(false); }}>
            Save
          </button>
          <button type="button" className={btn} onClick={() => { onSave('', true); setEditing(false); }}>
            Not stated
          </button>
          <button type="button" className={btn} onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </td>
    );
  }
  return (
    <td className={base}>
      <button
        type="button"
        className="w-full text-left rounded-lg hover:bg-black/[0.03] focus-visible:outline-2 p-0.5"
        onClick={() => { setDraft(cell.status === 'found' ? cell.answer : ''); setEditing(true); }}
        title="Click to correct"
      >
        <span className={`block ${cell.status === 'found' ? 'text-gray-900' : 'text-gray-500 italic'}`}>{cell.answer}</span>
        <span className="mt-1.5 flex flex-wrap gap-1">
          {cell.location && cell.status === 'found' && <span className={`${pill} bg-brand/10 text-brand font-mono`}>{cell.location}</span>}
          {cell.status === 'found' && !cell.verified && !cell.edited && <span className={`${pill} bg-accent-soft text-accent-ink`}>Check quote</span>}
          {cell.edited && <span className={`${pill} bg-gray-100 text-gray-700`}>Edited</span>}
          {conflict && <span className={`${pill} bg-accent text-brand`}>Conflict</span>}
        </span>
        {cell.quote && cell.status === 'found' && <span className="mt-1 block text-xs text-gray-600 line-clamp-3">“{cell.quote}”</span>}
      </button>
    </td>
  );
}

// ---------------------------------------------------------------------------
// Draft section with tracked changes
// ---------------------------------------------------------------------------
function SectionView({
  index,
  section,
  pending,
  labelFor,
  answerFor,
  busy,
  disabled,
  onRevise,
  onResolve,
  onEditParagraph,
}: {
  index: number;
  section: DraftSection;
  pending: Pending | null;
  labelFor: (k: string) => string;
  answerFor: (k: string) => string;
  busy: boolean;
  disabled: boolean;
  onRevise: (instruction: string) => void;
  onResolve: (accept: boolean) => void;
  onEditParagraph: (index: number, text: string) => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const cites = (keys: string[]) =>
    keys.map((k) => (
      <span key={k} className={`${pill} ml-1 bg-brand/10 text-brand font-mono align-middle`} title={answerFor(k)}>
        {labelFor(k)}
      </span>
    ));

  return (
    <section className="flex flex-col gap-2.5" aria-labelledby={`h-${section.id}`}>
      <h4 id={`h-${section.id}`} className="text-[15px] font-bold text-gray-900">
        {index + 1}. {pending ? pending.after.heading : section.heading}
      </h4>

      {pending ? (
        <>
          {Array.from({ length: Math.max(pending.before.paragraphs.length, pending.after.paragraphs.length) }).map((_, i) => {
            const a = pending.before.paragraphs[i]?.text ?? '';
            const b = pending.after.paragraphs[i]?.text ?? '';
            const parts = wordDiff(a, b);
            return (
              <p key={i} className="text-sm leading-relaxed text-gray-800">
                {parts.map((p, j) =>
                  p.type === 'same' ? (
                    <span key={j}>{p.text}</span>
                  ) : p.type === 'del' ? (
                    <del key={j} className="text-red-700 bg-red-50">
                      {p.text}
                    </del>
                  ) : (
                    <ins key={j} className="text-green-800 bg-green-50 no-underline border-b-2 border-green-700">
                      {p.text}
                    </ins>
                  ),
                )}
                {cites(pending.after.paragraphs[i]?.cites ?? [])}
              </p>
            );
          })}
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span className={`${pill} bg-brand/10 text-brand`}>Change by EPDH: “{pending.instruction}”</span>
            {!pending.before.paragraphs.some((p, i) => hasChanges(wordDiff(p.text, pending.after.paragraphs[i]?.text ?? ''))) &&
              pending.before.paragraphs.length === pending.after.paragraphs.length && <span>No wording changed.</span>}
            <button type="button" className={btn} onClick={() => onResolve(true)}>
              Accept
            </button>
            <button type="button" className={btn} onClick={() => onResolve(false)}>
              Reject
            </button>
          </div>
        </>
      ) : (
        section.paragraphs.map((p, i) =>
          editing === i ? (
            <div key={i} className="flex flex-col gap-2">
              <label className="sr-only" htmlFor={`edit-${section.id}-${i}`}>
                Edit paragraph
              </label>
              <textarea id={`edit-${section.id}-${i}`} className={`${input} min-h-[100px]`} value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
              <div className="flex gap-2">
                <button type="button" className={btnPrimary} onClick={() => { onEditParagraph(i, editText.trim()); setEditing(null); }}>
                  Save
                </button>
                <button type="button" className={btn} onClick={() => setEditing(null)}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p key={i} className={`group text-sm leading-relaxed ${p.cites.length ? 'text-gray-800' : 'text-gray-800 border-l-2 border-accent pl-2'}`}>
              {p.text}
              {cites(p.cites)}
              {!p.cites.length && <span className={`${pill} ml-1 bg-accent-soft text-accent-ink`}>No source</span>}
              <button type="button" className="ml-2 text-xs font-semibold text-brand opacity-60 group-hover:opacity-100 hover:underline" onClick={() => { setEditText(p.text); setEditing(i); }}>
                Edit
              </button>
            </p>
          ),
        )
      )}

      {[...section.assumptions.map((a) => ({ k: 'Assumption', t: a })), ...section.gaps.map((g) => ({ k: 'Missing', t: g }))].map((f, i) => (
        <p key={i} className="border-l-4 border-accent bg-accent-soft text-accent-ink rounded-r-lg px-3 py-2 text-xs">
          <b>{f.k}:</b> {f.t}
        </p>
      ))}

      {!pending && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (instruction.trim().length >= 3) {
              onRevise(instruction.trim());
              setInstruction('');
            }
          }}
        >
          <label className="sr-only" htmlFor={`rev-${section.id}`}>
            Ask for a change to section {index + 1}
          </label>
          <input id={`rev-${section.id}`} className={`${input} text-xs`} value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder="Ask for a change, e.g. “shorter”, “more formal”, “add the deadline”" maxLength={1000} />
          <button type="submit" className={btn} disabled={disabled || instruction.trim().length < 3}>
            {busy ? 'Revising…' : 'Revise'}
          </button>
        </form>
      )}
    </section>
  );
}

