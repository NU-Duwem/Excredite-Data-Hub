/**
 * Bulk document import for EPDH.
 *
 *   npm run import-docs -- <folder> --dry-run          # measure only, nothing sent
 *   npm run import-docs -- <folder> --limit 5          # import the first 5 files
 *   npm run import-docs -- --help
 *
 * For each supported file (PDF, Word .docx, PowerPoint .pptx, Excel, CSV, text):
 * extracts the text page by page, embeds it with the free local gte-small model,
 * uploads the original (unless --text-only), and saves the document and its
 * chunks so the AI can search them. Files already imported (same content hash)
 * are skipped, so a stopped run can simply be started again.
 *
 * Runs on the computer that holds the files. Uses the service-role key from
 * frontend/.env.local; the key is never printed.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, basename } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { UnsupportedFormatError, extractDocument, isSupported, toChunks, unsupportedReason } from '../utils/extractText';
import { embedTexts, toPgVector } from '../utils/embeddings';
import {
  USAGE,
  estimateDbBytes,
  formatBytes,
  formatDuration,
  guessDocumentType,
  parseArgs,
  storagePath,
  titleFromFileName,
  type ImportOptions,
} from '../utils/importPlan';

const STORAGE_FILE_LIMIT = 50 * 1024 * 1024; // the documents bucket's per-file limit
const SKIP_DIRS = new Set(['node_modules', '.git', '__MACOSX']);

type Outcome = 'imported' | 'would-import' | 'already-imported' | 'needs-ocr' | 'unsupported' | 'failed';

type FileResult = {
  path: string;
  outcome: Outcome;
  bytes: number;
  pages?: number | null;
  slides?: number | null;
  emptyPages?: number;
  chunks?: number;
  chunkChars?: number;
  documentId?: string;
  originalUploaded?: boolean;
  note?: string;
  ms?: number;
};

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name.startsWith('~$') || SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

async function alreadyImported(db: SupabaseClient, hash: string): Promise<string | null> {
  const { data, error } = await db.from('documents').select('id, processing_status').eq('file_hash', hash).limit(1);
  if (error) throw new Error(`Checking for duplicates failed: ${error.message}`);
  const row = data?.[0];
  return row && row.processing_status === 'COMPLETE' ? (row.id as string) : null;
}

/** Content hash -> path, for files seen earlier in this run (catches copies in two folders). */
type Seen = Map<string, string>;

async function importOne(db: SupabaseClient, opts: ImportOptions, root: string, path: string, seen: Seen): Promise<FileResult> {
  const started = Date.now();
  const rel = relative(root, path) || basename(path);
  const name = basename(path);
  const { size } = await stat(path);
  const result: FileResult = { path: rel, outcome: 'failed', bytes: size };

  if (!isSupported(name)) return { ...result, outcome: 'unsupported', note: unsupportedReason(name) };

  const buffer = await readFile(path);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const earlier = seen.get(hash);
  if (earlier) return { ...result, outcome: 'already-imported', note: `Same file as ${earlier}` };
  seen.set(hash, rel);

  if (!opts.dryRun || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const existing = await alreadyImported(db, hash);
    if (existing) return { ...result, outcome: 'already-imported', documentId: existing };
  }

  let extraction;
  try {
    extraction = await extractDocument(buffer, name);
  } catch (err) {
    if (err instanceof UnsupportedFormatError) return { ...result, outcome: 'unsupported', note: err.message };
    return { ...result, note: `Could not read the file: ${err instanceof Error ? err.message : String(err)}` };
  }
  const chunks = toChunks(extraction);
  Object.assign(result, {
    pages: extraction.pageCount,
    slides: extraction.slideCount,
    emptyPages: extraction.emptyPages.length,
    chunks: chunks.length,
    chunkChars: chunks.reduce((n, c) => n + c.text.length, 0),
  });
  if (chunks.length === 0) {
    return { ...result, outcome: 'needs-ocr', note: 'No text found: probably a scanned document. It needs OCR before the AI can read it.' };
  }
  const scannedNote = extraction.emptyPages.length
    ? `${extraction.emptyPages.length} page(s) had no text and probably need OCR: ${extraction.emptyPages.slice(0, 20).join(', ')}${extraction.emptyPages.length > 20 ? '…' : ''}`
    : null;

  if (opts.dryRun) return { ...result, outcome: 'would-import', note: scannedNote ?? undefined, ms: Date.now() - started };

  // 1. Embed first: if the model fails, nothing half-done is left in the database.
  const vectors = await embedTexts(chunks.map((c) => c.text), 32);

  // 2. Original file (optional; skipped above the bucket's size limit).
  let s3Key: string | null = null;
  let uploadNote: string | null = null;
  if (!opts.textOnly) {
    if (size > STORAGE_FILE_LIMIT) {
      uploadNote = `Original not stored: larger than ${formatBytes(STORAGE_FILE_LIMIT)}.`;
    } else {
      const key = storagePath(hash, name);
      const { error } = await db.storage.from('documents').upload(key, buffer, { upsert: true, contentType: 'application/octet-stream' });
      if (error) uploadNote = `Original not stored: ${error.message}`;
      else s3Key = key;
    }
  }

  // 3. Document row, then its chunks, then mark it complete.
  const { data: doc, error: insertError } = await db
    .from('documents')
    .insert({
      title: titleFromFileName(name),
      document_type: opts.type ?? guessDocumentType(rel),
      classification: opts.classification,
      restricted: opts.restricted,
      s3_key: s3Key,
      file_size_bytes: size > 0 ? size : null,
      file_hash: hash,
      uploaded_by: opts.uploadedBy,
      processing_status: 'PROCESSING',
      page_count: extraction.pageCount && extraction.pageCount > 0 ? extraction.pageCount : null,
      slide_count: extraction.slideCount,
      extracted_metadata: {
        source_path: rel,
        imported_at: new Date().toISOString(),
        format: extraction.format,
        empty_pages: extraction.emptyPages,
        embedding_model: 'gte-small',
      },
    })
    .select('id')
    .single();
  if (insertError || !doc) return { ...result, note: `Could not save the document: ${insertError?.message}` };
  result.documentId = doc.id;

  const rows = chunks.map((c, i) => ({
    document_id: doc.id,
    chunk_index: i,
    chunk_text: c.text,
    embedding: toPgVector(vectors[i]),
    metadata: {
      format: c.format,
      model: 'gte-small',
      ...(c.page_number ? { page_number: c.page_number } : {}),
      ...(c.slide_number ? { slide_number: c.slide_number } : {}),
      ...(c.sheet_name ? { sheet_name: c.sheet_name } : {}),
    },
  }));
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await db.from('embeddings').insert(rows.slice(i, i + 200));
    if (error) {
      await db.from('documents').update({ processing_status: 'FAILED', notes: `Saving chunks failed: ${error.message}`.slice(0, 1000) }).eq('id', doc.id);
      return { ...result, note: `Saving chunks failed: ${error.message}` };
    }
  }

  const notes = [scannedNote, uploadNote].filter(Boolean).join(' ') || null;
  const { error: doneError } = await db.from('documents').update({ processing_status: 'COMPLETE', notes }).eq('id', doc.id);
  if (doneError) return { ...result, note: `Could not mark it complete: ${doneError.message}` };

  return { ...result, outcome: 'imported', originalUploaded: !!s3Key, note: notes ?? undefined, ms: Date.now() - started };
}

const LABEL: Record<Outcome, string> = {
  imported: 'imported',
  'would-import': 'ready',
  'already-imported': 'already in library',
  'needs-ocr': 'needs OCR',
  unsupported: 'unsupported',
  failed: 'FAILED',
};

async function main() {
  let opts: ImportOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err instanceof Error ? err.message : err}\n\n${USAGE}`);
    process.exit(2);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }

  loadEnvFile(resolve('.env.local'));
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!opts.dryRun && (!url || !key)) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (in frontend/.env.local) to import. Use --dry-run to measure without them.');
    process.exit(2);
  }
  const db = createClient(url || 'http://localhost', key || 'dry-run', { auth: { persistSession: false } });

  const root = resolve(opts.folder);
  if (!existsSync(root) || !(await stat(root)).isDirectory()) {
    console.error(`Not a folder: ${root}`);
    process.exit(2);
  }
  const all = (await listFiles(root)).sort((a, b) => a.localeCompare(b));
  const files = opts.limit ? all.slice(0, opts.limit) : all;

  console.log(`${opts.dryRun ? 'DRY RUN (nothing will be uploaded or saved)' : 'IMPORT'}: ${files.length} of ${all.length} file(s) in ${root}`);
  console.log(`Classification ${opts.classification}${opts.restricted ? ', restricted' : ''}; ${opts.textOnly ? 'text only' : 'originals uploaded'}; type ${opts.type ?? 'guessed from name'}\n`);

  const started = Date.now();
  const results: FileResult[] = [];
  const seen: Seen = new Map();
  for (const [i, path] of files.entries()) {
    let r: FileResult;
    try {
      r = await importOne(db, opts, root, path, seen);
    } catch (err) {
      r = { path: relative(root, path), outcome: 'failed', bytes: 0, note: err instanceof Error ? err.message : String(err) };
    }
    results.push(r);
    const detail = [
      r.pages ? `${r.pages} pages` : r.slides ? `${r.slides} slides` : null,
      r.chunks !== undefined ? `${r.chunks} chunks` : null,
      r.emptyPages ? `${r.emptyPages} blank/scanned pages` : null,
      r.note,
    ].filter(Boolean).join(' · ');
    console.log(`[${i + 1}/${files.length}] ${LABEL[r.outcome].padEnd(18)} ${r.path}${detail ? `  (${detail})` : ''}`);
  }

  const count = (o: Outcome) => results.filter((r) => r.outcome === o).length;
  const done = results.filter((r) => r.outcome === 'imported' || r.outcome === 'would-import');
  const chunks = done.reduce((n, r) => n + (r.chunks ?? 0), 0);
  const chunkChars = done.reduce((n, r) => n + (r.chunkChars ?? 0), 0);
  const bytes = done.reduce((n, r) => n + r.bytes, 0);
  const scannedPages = results.reduce((n, r) => n + (r.emptyPages ?? 0), 0);
  const elapsed = Date.now() - started;

  const summary = {
    mode: opts.dryRun ? 'dry-run' : 'import',
    folder: root,
    files_considered: files.length,
    files_in_folder: all.length,
    [opts.dryRun ? 'ready_to_import' : 'imported']: done.length,
    already_imported: count('already-imported'),
    needs_ocr: count('needs-ocr'),
    unsupported: count('unsupported'),
    failed: count('failed'),
    pages_without_text: scannedPages,
    chunks,
    original_files_size: formatBytes(bytes),
    estimated_database_space: formatBytes(estimateDbBytes(chunks, chunkChars)),
    estimated_storage_space: opts.textOnly ? '0 B (text only)' : formatBytes(bytes),
    time_taken: formatDuration(elapsed),
  };

  console.log('\nSummary');
  for (const [k, v] of Object.entries(summary)) console.log(`  ${k.replace(/_/g, ' ').padEnd(26)} ${v}`);
  if (opts.dryRun && done.length) {
    console.log(`\nSupabase Free plan limits: 500 MB database, 1 GB file storage. Use --text-only to keep originals out of storage.`);
  }

  const reportPath = resolve(opts.report ?? `import-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(reportPath, JSON.stringify({ summary, options: { ...opts }, files: results }, null, 2));
  console.log(`\nReport: ${reportPath}`);
  if (count('failed') > 0) process.exitCode = 1;
}

void main();
