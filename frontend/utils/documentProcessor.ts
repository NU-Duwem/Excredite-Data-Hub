import { createClient } from '@supabase/supabase-js';
import { embedTexts, toPgVector } from '@/utils/embeddings';

import { UnsupportedFormatError, extractDocument, toChunks } from '@/utils/extractText';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

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

  // 3. Extract text with the shared extractor (also used by the bulk import tool).
  const fail = async (reason: string) => {
    await adminClient.from('documents').update({ processing_status: 'FAILED', notes: reason.slice(0, 1000) }).eq('id', documentId);
    throw new Error(reason);
  };
  let extraction;
  try {
    extraction = await extractDocument(buffer, doc.s3_key);
  } catch (err) {
    const reason = err instanceof UnsupportedFormatError ? err.message : `Could not read the file: ${err instanceof Error ? err.message : String(err)}`;
    await fail(reason);
    throw err;
  }
  const pageCount = extraction.pageCount;
  const slideCount = extraction.slideCount;
  const structuredChunks = toChunks(extraction).map((c) => ({
    text: c.text,
    page_number: c.page_number,
    slide_number: c.slide_number,
    metadata: { format: c.format, ...(c.sheet_name ? { sheet_name: c.sheet_name } : {}) },
  }));
  const scannedNote = extraction.emptyPages.length
    ? `${extraction.emptyPages.length} page(s) had no text and probably need OCR: ${extraction.emptyPages.slice(0, 20).join(', ')}${extraction.emptyPages.length > 20 ? '…' : ''}`
    : null;

  // 4. Embed the chunks with the free local model and save them.
  //    Any failure marks the document FAILED with a reason: never store placeholder vectors.
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
      extracted_metadata: { ...(doc.extracted_metadata || {}), empty_pages: extraction.emptyPages, format: extraction.format, embedding_model: 'gte-small' },
      notes: scannedNote ?? doc.notes,
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
