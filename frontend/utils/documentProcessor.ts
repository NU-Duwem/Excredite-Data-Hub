import { createClient } from '@supabase/supabase-js';
import { embedTexts, toPgVector } from '@/utils/embeddings';

// Dynamic requires to prevent Webpack/Turbopack runtime bundling errors
let pdfParse: any;
let mammoth: any;
let officeParser: any;
let XLSX: any;

try { pdfParse = require('pdf-parse'); } catch (e) { console.warn('pdf-parse not available'); }
try { mammoth = require('mammoth'); } catch (e) { console.warn('mammoth not available'); }
try { officeParser = require('officeparser'); } catch (e) { console.warn('officeparser not available'); }
try { XLSX = require('xlsx'); } catch (e) { console.warn('xlsx not available'); }

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Helper function to chunk text semantically (~1000-1500 chars per chunk with 200 char overlap)
function chunkText(text: string, chunkSize = 1200, overlap = 200) {
  const chunks: string[] = [];
  const cleanText = text.replace(/\s+/g, ' ').trim();
  
  if (!cleanText) return chunks;

  let start = 0;
  const maxChunks = 3000;

  while (start < cleanText.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, cleanText.length);
    let chunk = cleanText.slice(start, end);

    if (end < cleanText.length) {
      const lastPeriod = chunk.lastIndexOf('.');
      if (lastPeriod > chunkSize * 0.6) {
        chunk = chunk.slice(0, lastPeriod + 1);
      }
    }

    const trimmed = chunk.trim();
    if (trimmed) {
      chunks.push(trimmed);
    }

    // Always advance by at least 100 characters to prevent infinite loops when chunk.length <= overlap
    const step = Math.max(100, chunk.length - overlap);
    start += step;

    if (start >= cleanText.length) break;
  }

  return chunks;
}

export async function processDocumentById(documentId: string) {
  const adminClient = createClient(supabaseUrl, supabaseServiceKey);

  // 1. Fetch document record
  const { data: doc, error: docError } = await adminClient
    .from('documents')
    .select('*')
    .eq('id', documentId)
    .single();

  if (docError || !doc) {
    throw new Error(`Document not found: ${docError?.message}`);
  }

  // Update status to PROCESSING
  await adminClient
    .from('documents')
    .update({ processing_status: 'PROCESSING' })
    .eq('id', documentId);

  if (!doc.s3_key) {
    await adminClient.from('documents').update({ processing_status: 'FAILED', notes: 'No file path found' }).eq('id', documentId);
    throw new Error('Document missing storage key');
  }

  // 2. Download file from Supabase Storage 'documents' bucket
  const { data: fileBlob, error: downloadError } = await adminClient
    .storage
    .from('documents')
    .download(doc.s3_key);

  if (downloadError || !fileBlob) {
    await adminClient.from('documents').update({ processing_status: 'FAILED' }).eq('id', documentId);
    throw new Error(`File download failed: ${downloadError?.message}`);
  }

  const arrayBuffer = await fileBlob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const fileExt = doc.s3_key.split('.').pop()?.toLowerCase() || '';

  let extractedText = '';
  let pageCount: number | null = null;
  let slideCount: number | null = null;
  const structuredChunks: { text: string; page_number?: number; slide_number?: number; metadata?: any }[] = [];

  // 3. Multi-Format Text Extraction
  if (fileExt === 'pdf') {
    try {
      if (!pdfParse) pdfParse = require('pdf-parse');
      const parsedPdf = await pdfParse(buffer);
      extractedText = parsedPdf.text || '';
      pageCount = parsedPdf.numpages || null;

      const pages = extractedText.split(/\f|\n\n\n+/);
      pages.forEach((pageContent, idx) => {
        if (pageContent.trim()) {
          const chunks = chunkText(pageContent);
          chunks.forEach(c => {
            structuredChunks.push({
              text: c,
              page_number: idx + 1,
              metadata: { page: idx + 1, format: 'PDF' }
            });
          });
        }
      });
    } catch (err) {
      console.error('PDF parsing error:', err);
      extractedText = doc.title || 'Scanned PDF document';
      structuredChunks.push({ text: extractedText, metadata: { format: 'PDF_SCAN' } });
    }
  } 
  else if (fileExt === 'docx' || fileExt === 'doc') {
    try {
      if (!mammoth) mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ buffer });
      extractedText = result.value || '';
      const chunks = chunkText(extractedText);
      chunks.forEach((c, idx) => {
        structuredChunks.push({
          text: c,
          metadata: { chunk_index: idx, format: 'WORD' }
        });
      });
    } catch (err) {
      console.error('Word parsing error:', err);
      try {
        if (!officeParser) officeParser = require('officeparser');
        const text = await officeParser.parseOfficeAsync(buffer);
        extractedText = typeof text === 'string' ? text : String(text);
        const chunks = chunkText(extractedText);
        chunks.forEach((c, idx) => structuredChunks.push({ text: c, metadata: { format: 'WORD_OFFICEPARSER' } }));
      } catch (e2) {
        console.error('OfficeParser Word error:', e2);
        extractedText = doc.title || 'Word Document';
        structuredChunks.push({ text: extractedText, metadata: { format: 'WORD_FALLBACK' } });
      }
    }
  } 
  else if (fileExt === 'pptx' || fileExt === 'ppt') {
    try {
      if (!officeParser) officeParser = require('officeparser');
      const parsedText = await officeParser.parseOfficeAsync(buffer);
      extractedText = typeof parsedText === 'string' ? parsedText : String(parsedText);
      
      const slideParts = extractedText.split(/(?:Slide \d+|--------------------)/i).filter(Boolean);
      slideCount = Math.max(1, slideParts.length);

      slideParts.forEach((slideText, idx) => {
        if (slideText.trim()) {
          const chunks = chunkText(slideText);
          chunks.forEach(c => {
            structuredChunks.push({
              text: c,
              slide_number: idx + 1,
              metadata: { slide_number: idx + 1, format: 'POWERPOINT' }
            });
          });
        }
      });

      if (structuredChunks.length === 0 && extractedText.trim()) {
        const chunks = chunkText(extractedText);
        chunks.forEach((c, idx) => structuredChunks.push({ text: c, slide_number: idx + 1, metadata: { format: 'POWERPOINT' } }));
      }
    } catch (err) {
      console.error('PowerPoint parsing error:', err);
      extractedText = doc.title || 'PowerPoint Presentation';
      structuredChunks.push({ text: extractedText, slide_number: 1, metadata: { format: 'PPT_FALLBACK' } });
    }
  } 
  else if (fileExt === 'xlsx' || fileExt === 'xls' || fileExt === 'csv') {
    try {
      if (!XLSX) XLSX = require('xlsx');
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      
      sheetNames.forEach((name: string) => {
        const sheet = workbook.Sheets[name];
        const csvText = XLSX.utils.sheet_to_csv(sheet);
        if (csvText.trim()) {
          extractedText += `\n--- Sheet: ${name} ---\n` + csvText;
          const chunks = chunkText(csvText);
          chunks.forEach((c: string) => {
            structuredChunks.push({
              text: `Sheet: ${name}\n` + c,
              metadata: { sheet_name: name, format: 'EXCEL' }
            });
          });
        }
      });
    } catch (err) {
      console.error('Spreadsheet parsing error:', err);
      extractedText = doc.title || 'Spreadsheet Document';
      structuredChunks.push({ text: extractedText, metadata: { format: 'CSV_FALLBACK' } });
    }
  }
  else {
    extractedText = buffer.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, ' ');
    const chunks = chunkText(extractedText);
    chunks.forEach(c => structuredChunks.push({ text: c, metadata: { format: 'TEXT' } }));
  }

  // 4. Embed the chunks with the free local model and save them.
  //    Any failure marks the document FAILED with a reason: never store placeholder vectors.
  const fail = async (reason: string) => {
    await adminClient.from('documents').update({ processing_status: 'FAILED', notes: reason.slice(0, 1000) }).eq('id', documentId);
    throw new Error(reason);
  };
  const usable = structuredChunks.filter((c) => c.text && c.text.trim().length > 0);
  if (usable.length === 0) {
    await fail('No text could be extracted. The file may be scanned images; scanned pages will be handled by the bulk import tool (OCR).');
  }

  let vectors: number[][] = [];
  try {
    vectors = await embedTexts(usable.map((c) => c.text));
  } catch (err) {
    await fail(`Could not create search embeddings: ${err instanceof Error ? err.message : String(err)}`);
  }

  const { error: deleteOldError } = await adminClient.from('embeddings').delete().eq('document_id', documentId);
  if (deleteOldError) await fail(`Could not replace old chunks: ${deleteOldError.message}`);

  const records = usable.map((item, i) => ({
    document_id: documentId,
    chunk_index: i,
    chunk_text: item.text,
    embedding: toPgVector(vectors[i]),
    metadata: { ...(item.metadata || {}), page_number: item.page_number, slide_number: item.slide_number, model: 'gte-small' },
  }));
  for (let i = 0; i < records.length; i += 200) {
    const { error: insertError } = await adminClient.from('embeddings').insert(records.slice(i, i + 200));
    if (insertError) await fail(`Could not save chunks: ${insertError.message}`);
  }

  // 5. Summaries used to be written by Gemini; document text is no longer sent there.
  const docSummary = doc.summary || '';

  // 6. Update Document Status to COMPLETE
  let { data: updatedDoc, error: updateError } = await adminClient
    .from('documents')
    .update({
      processing_status: 'COMPLETE',
      page_count: pageCount || doc.page_count,
      slide_count: slideCount,
      summary: docSummary || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)
    .select()
    .single();

  // Fallback: If slide_count or summary columns don't exist yet in Supabase, update basic fields
  if (updateError && updateError.code === 'PGRST204') {
    console.warn('Custom columns (slide_count/summary) missing in documents table, running fallback update...');
    const { data: fbDoc, error: fbUpdateErr } = await adminClient
      .from('documents')
      .update({
        processing_status: 'COMPLETE',
        page_count: pageCount || doc.page_count,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select()
      .single();
    
    if (fbUpdateErr) {
      console.error('Fallback document status update error:', fbUpdateErr);
    } else {
      updatedDoc = fbDoc;
    }
  } else if (updateError) {
    console.error('Error updating document status:', updateError);
  }

  return updatedDoc || doc;
}
