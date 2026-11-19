/**
 * Text extraction for documents, shared by the app (upload processing) and
 * the bulk import tool, so both cut documents into the same chunks.
 *
 * - PDF: page by page with pdfjs-dist (real page numbers); pages with almost
 *   no text are reported as probably scanned (they need OCR).
 * - Word (.docx), PowerPoint (.pptx, slide by slide), Excel (.xlsx/.xls)
 *   and CSV (sheet by sheet), plain text (.txt/.md).
 * - Old binary Office formats (.doc/.ppt) are reported as unsupported.
 */

export type Unit = { text: string; page?: number; slide?: number; sheet?: string };

export type Extraction = {
  format: string;
  units: Unit[];
  pageCount: number | null;
  slideCount: number | null;
  /** PDF pages with (almost) no text: probably scanned images that need OCR. */
  emptyPages: number[];
  totalChars: number;
};

export type Chunk = {
  text: string;
  page_number?: number;
  slide_number?: number;
  sheet_name?: string;
  format: string;
};

export const SUPPORTED_EXTENSIONS = ['pdf', 'docx', 'pptx', 'xlsx', 'xls', 'csv', 'txt', 'md'] as const;
const UNSUPPORTED_HINTS: Record<string, string> = {
  doc: 'Old Word format (.doc): open it in Word and save as .docx',
  ppt: 'Old PowerPoint format (.ppt): open it in PowerPoint and save as .pptx',
};

/** Fewer letters/digits than this on a PDF page means it is probably a scanned image. */
export const MIN_PAGE_CHARS = 25;

export class UnsupportedFormatError extends Error {}

export function fileExtension(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : '';
}

export function isSupported(name: string): boolean {
  return (SUPPORTED_EXTENSIONS as readonly string[]).includes(fileExtension(name));
}

export function unsupportedReason(name: string): string {
  const ext = fileExtension(name);
  return UNSUPPORTED_HINTS[ext] ?? `.${ext || '?'} files aren't supported`;
}

function meaningfulChars(text: string): number {
  return (text.match(/[\p{L}\p{N}]/gu) ?? []).length;
}

/**
 * Remove characters the database can't store: NUL and other control characters
 * (PDFs often contain them), and half of an emoji or other surrogate pair, which
 * can be left behind when text is cut into chunks.
 */
export function cleanForDatabase(text: string): string {
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/** Split text into ~1,200-character chunks with 200 characters of overlap, preferring sentence ends. */
export function chunkText(text: string, chunkSize = 1200, overlap = 200, maxChunks = 5000): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  if (!clean) return chunks;
  if (clean.length <= chunkSize) return [clean];
  let start = 0;
  while (start < clean.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, clean.length);
    let chunk = clean.slice(start, end);
    if (end < clean.length) {
      const lastStop = Math.max(chunk.lastIndexOf('. '), chunk.lastIndexOf('? '), chunk.lastIndexOf('! '));
      if (lastStop > chunkSize * 0.6) chunk = chunk.slice(0, lastStop + 1);
    }
    chunk = chunk.trim();
    if (chunk) chunks.push(chunk);
    if (end >= clean.length) break;
    start += Math.max(100, chunk.length - overlap);
  }
  return chunks;
}

/** Chunks from extracted units, keeping each chunk's page, slide or sheet. */
export function toChunks(extraction: Pick<Extraction, 'units' | 'format'>): Chunk[] {
  const out: Chunk[] = [];
  for (const u of extraction.units) {
    for (const text of chunkText(u.text)) {
      out.push({
        text: cleanForDatabase(u.sheet ? `Sheet: ${u.sheet}\n${text}` : text),
        ...(u.page ? { page_number: u.page } : {}),
        ...(u.slide ? { slide_number: u.slide } : {}),
        ...(u.sheet ? { sheet_name: cleanForDatabase(u.sheet) } : {}),
        format: extraction.format,
      });
    }
  }
  return out;
}

type PdfTextItem = { str?: string; hasEOL?: boolean };
type PdfJs = {
  getDocument: (src: object) => {
    promise: Promise<{
      numPages: number;
      getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: PdfTextItem[] }>; cleanup: () => void }>;
      destroy: () => Promise<void>;
    }>;
  };
};

async function extractPdf(buffer: Buffer): Promise<Omit<Extraction, 'totalChars'>> {
  // pdfjs-dist (v3, legacy build for Node). The older pdf-parse package can't read
  // valid PDFs in this Node version ("bad XRef entry" / "Invalid PDF structure").
  const mod = (await import('pdfjs-dist/legacy/build/pdf.js')) as unknown as Partial<PdfJs> & { default?: PdfJs };
  const pdfjs = (mod.getDocument ? mod : mod.default) as PdfJs;
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;
  const units: Unit[] = [];
  const emptyPages: number[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const text = content.items.map((it) => (it.str ?? '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n');
      page.cleanup();
      if (meaningfulChars(text) < MIN_PAGE_CHARS) emptyPages.push(n);
      else units.push({ text, page: n });
    }
  } finally {
    await doc.destroy();
  }
  return { format: 'PDF', units, pageCount: doc.numPages || null, slideCount: null, emptyPages };
}

async function extractDocx(buffer: Buffer): Promise<Omit<Extraction, 'totalChars'>> {
  const mammoth = (await import('mammoth')) as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string }>; default?: unknown };
  const lib = (mammoth.default ?? mammoth) as typeof mammoth;
  const { value } = await lib.extractRawText({ buffer });
  return { format: 'WORD', units: value.trim() ? [{ text: value }] : [], pageCount: null, slideCount: null, emptyPages: [] };
}

function decodeXmlText(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

async function extractPptx(buffer: Buffer): Promise<Omit<Extraction, 'totalChars'>> {
  const JSZip = ((await import('jszip')) as unknown as { default: typeof import('jszip') }).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files)
    .map((name) => ({ name, n: Number(/^ppt\/slides\/slide(\d+)\.xml$/.exec(name)?.[1]) }))
    .filter((f) => Number.isFinite(f.n) && f.n > 0)
    .sort((a, b) => a.n - b.n);
  const units: Unit[] = [];
  for (const f of slideFiles) {
    const xml = await zip.file(f.name)!.async('string');
    const paragraphs = xml.split(/<\/a:p>/).map((p) => [...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => decodeXmlText(m[1])).join(''));
    const text = paragraphs.filter((p) => p.trim()).join('\n');
    if (text.trim()) units.push({ text, slide: f.n });
  }
  return { format: 'POWERPOINT', units, pageCount: null, slideCount: slideFiles.length || null, emptyPages: [] };
}

async function extractSheets(buffer: Buffer): Promise<Omit<Extraction, 'totalChars'>> {
  const XLSX = (await import('xlsx')) as unknown as {
    read: (b: Buffer, o: { type: 'buffer' }) => { SheetNames: string[]; Sheets: Record<string, unknown> };
    utils: { sheet_to_csv: (s: unknown) => string };
  };
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const units: Unit[] = [];
  for (const name of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
    if (csv.replace(/[,\s]/g, '')) units.push({ text: csv, sheet: name });
  }
  return { format: 'SPREADSHEET', units, pageCount: null, slideCount: null, emptyPages: [] };
}

/** Extracts the text of one file. Throws UnsupportedFormatError for formats it can't read. */
export async function extractDocument(buffer: Buffer, fileName: string): Promise<Extraction> {
  const ext = fileExtension(fileName);
  let result: Omit<Extraction, 'totalChars'>;
  if (ext === 'pdf') result = await extractPdf(buffer);
  else if (ext === 'docx') result = await extractDocx(buffer);
  else if (ext === 'pptx') result = await extractPptx(buffer);
  else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') result = await extractSheets(buffer);
  else if (ext === 'txt' || ext === 'md') {
    const text = buffer.toString('utf8');
    result = { format: 'TEXT', units: text.trim() ? [{ text }] : [], pageCount: null, slideCount: null, emptyPages: [] };
  } else throw new UnsupportedFormatError(unsupportedReason(fileName));
  return { ...result, totalChars: result.units.reduce((n, u) => n + u.text.length, 0) };
}
