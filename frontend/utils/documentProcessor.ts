import { createClient } from '@supabase/supabase-js';

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

// Helper to generate embedding using Gemini Embedding API
async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Array(768).fill(0);
  }

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'models/text-embedding-004',
        content: { parts: [{ text }] },
      }),
    });

    if (!res.ok) {
      return new Array(768).fill(0);
    }

    const json = await res.json();
    return json.embedding?.values || new Array(768).fill(0);
  } catch (err) {
    console.error('Embedding generation error:', err);
    return new Array(768).fill(0);
  }
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

  // 4. Generate Embeddings & Save Chunks to Supabase DB
  if (structuredChunks.length > 0) {
    await adminClient.from('embeddings').delete().eq('document_id', documentId);

    const embeddingRecords = [];
    for (let i = 0; i < structuredChunks.length; i++) {
      const item = structuredChunks[i];
      const vector = await generateEmbedding(item.text);

      embeddingRecords.push({
        document_id: documentId,
        chunk_index: i,
        chunk_text: item.text,
        embedding: vector,
        metadata: item.metadata || {},
      });
    }

    let { error: embedInsertError } = await adminClient
      .from('embeddings')
      .insert(embeddingRecords);

    // Fallback: If 'embedding' vector column doesn't exist yet in Supabase schema, insert text chunks without vector
    if (embedInsertError && embedInsertError.code === 'PGRST204') {
      console.warn('Embedding vector column missing, inserting text chunks fallback...');
      const fallbackRecords = embeddingRecords.map(({ embedding, ...rest }) => rest);
      const { error: fbErr } = await adminClient.from('embeddings').insert(fallbackRecords);
      if (fbErr) console.error('Fallback embeddings insert error:', fbErr);
    } else if (embedInsertError) {
      console.error('Error inserting embeddings:', embedInsertError);
    }
  }

  // 5. Generate summary using Gemini if available
  let docSummary = '';
  const apiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (apiKey && extractedText.length > 50) {
    try {
      const summaryRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Summarize the following document in 2 concise sentences for a legal and power sector executive dashboard:\n\n${extractedText.slice(0, 4000)}`
            }]
          }]
        })
      });
      if (summaryRes.ok) {
        const sumJson = await summaryRes.json();
        docSummary = sumJson.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    } catch (sumErr) {
      console.error('Summary generation error:', sumErr);
    }
  }

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
