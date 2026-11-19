/**
 * Pure helpers for the bulk document import tool (scripts/import-documents.ts).
 */

export const CLASSIFICATIONS = ['PUBLIC', 'INTERNAL', 'LEGAL_PRIVILEGED'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];

export const DOCUMENT_TYPES = [
  'REGULATORY_ORDER',
  'COURT_JUDGMENT',
  'POLICY_PAPER',
  'TARIFF_DETERMINATION',
  'MARKET_REPORT',
  'LEGAL_BRIEF',
  'DOCUMENT_NOTE',
  'OTHER',
] as const;

export type ImportOptions = {
  folder: string;
  dryRun: boolean;
  limit: number | null;
  classification: Classification;
  type: string | null; // null = guess from the file name
  restricted: boolean;
  textOnly: boolean;
  skipSpreadsheets: boolean;
  addOriginals: boolean;
  uploadedBy: string;
  report: string | null;
  help: boolean;
};

export const USAGE = `Import documents into the EPDH library so the AI can search them.

Usage (from the frontend folder):
  npm run import-docs -- <folder> [options]

Options:
  --dry-run               Read and measure only: nothing is uploaded or saved.
  --limit N               Only the first N files (in alphabetical order of path).
  --classification X      PUBLIC, INTERNAL (default) or LEGAL_PRIVILEGED.
  --type X                Document type for every file (default: guessed from the name).
                          One of: ${DOCUMENT_TYPES.join(', ')}.
  --restricted            Mark imported documents Restricted (admins and people they choose).
  --text-only             Don't upload the original files: saves storage, but the
                          library can't show or download them.
  --skip-spreadsheets     Leave out spreadsheets (.xlsx, .xls, .xlsm, .csv). Data
                          tables use a lot of database space and help search little.
  --add-originals         After a --text-only import (e.g. on a bigger Supabase plan):
                          upload the original files for documents already in the
                          library, matched by content. Text and search are untouched.
                          Combine with --dry-run to see what would be added.
  --uploaded-by EMAIL     Recorded as the uploader (default: bulk-import).
  --report FILE           Where to write the report (default: import-report-<time>.json).
  --help                  Show this help.

Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in frontend/.env.local
(not needed for --dry-run, which then can't check for files already imported).`;

export function parseArgs(argv: string[]): ImportOptions {
  const opts: ImportOptions = {
    folder: '',
    dryRun: false,
    limit: null,
    classification: 'INTERNAL',
    type: null,
    restricted: false,
    textOnly: false,
    skipSpreadsheets: false,
    addOriginals: false,
    uploadedBy: 'bulk-import',
    report: null,
    help: false,
  };
  const value = (i: number, flag: string) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--dry-run': opts.dryRun = true; break;
      case '--restricted': opts.restricted = true; break;
      case '--text-only': opts.textOnly = true; break;
      case '--skip-spreadsheets': opts.skipSpreadsheets = true; break;
      case '--add-originals': opts.addOriginals = true; break;
      case '--help': case '-h': opts.help = true; break;
      case '--limit': {
        const n = Number(value(i, a));
        if (!Number.isInteger(n) || n < 1) throw new Error('--limit must be a whole number of at least 1');
        opts.limit = n; i++; break;
      }
      case '--classification': {
        const c = value(i, a).toUpperCase().replace(/-/g, '_');
        if (!(CLASSIFICATIONS as readonly string[]).includes(c)) throw new Error(`--classification must be one of ${CLASSIFICATIONS.join(', ')}`);
        opts.classification = c as Classification; i++; break;
      }
      case '--type': {
        const t = value(i, a).toUpperCase().replace(/[\s-]/g, '_');
        if (!(DOCUMENT_TYPES as readonly string[]).includes(t)) throw new Error(`--type must be one of ${DOCUMENT_TYPES.join(', ')}`);
        opts.type = t; i++; break;
      }
      case '--uploaded-by': opts.uploadedBy = value(i, a).slice(0, 200); i++; break;
      case '--report': opts.report = value(i, a); i++; break;
      default:
        if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
        if (opts.folder) throw new Error(`Only one folder, please (got "${opts.folder}" and "${a}")`);
        opts.folder = a;
    }
  }
  if (!opts.folder && !opts.help) throw new Error('Say which folder to import');
  if (opts.addOriginals && opts.textOnly) throw new Error('--add-originals uploads the originals, so it can’t be used with --text-only');
  return opts;
}

/** Spreadsheet files, left out by --skip-spreadsheets. */
export function isSpreadsheet(name: string): boolean {
  return /\.(xlsx|xls|xlsm|csv)$/i.test(name);
}

/** A readable title from a file name: no extension, underscores/dashes as spaces. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (base || name).slice(0, 300);
}

/** Best guess at the document type from words in the file name or folder path. */
export function guessDocumentType(path: string): string {
  const p = path.toLowerCase();
  if (/tariff|myto|\bband [a-e]\b/.test(p)) return 'TARIFF_DETERMINATION';
  if (/judg(e)?ment|ruling|court|tribunal|appeal/.test(p)) return 'COURT_JUDGMENT';
  if (/\border\b|orders|regulation|directive|nerc[-_ ]?order/.test(p)) return 'REGULATORY_ORDER';
  if (/policy|strategy|white ?paper/.test(p)) return 'POLICY_PAPER';
  if (/report|statistic|bulletin|review|outlook/.test(p)) return 'MARKET_REPORT';
  if (/brief|memo|opinion|advice|submission/.test(p)) return 'LEGAL_BRIEF';
  if (/note|minutes/.test(p)) return 'DOCUMENT_NOTE';
  return 'OTHER';
}

/** Storage path for an original file: grouped by content hash, with a safe file name. */
export function storagePath(sha256: string, fileName: string): string {
  const safe = fileName.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(-120) || 'file';
  return `imports/${sha256.slice(0, 16)}/${safe}`;
}

/**
 * Rough database space for chunks: the text, the 384-number vector (1,536 bytes)
 * plus its HNSW index entry, the full-text index and row overhead.
 */
export function estimateDbBytes(chunkCount: number, totalChunkChars: number): number {
  return Math.round(totalChunkChars * 1.6 + chunkCount * (1536 * 2 + 400));
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
