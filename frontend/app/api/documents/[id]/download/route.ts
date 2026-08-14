import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId parameter' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch document metadata
    const { data: doc, error: fetchError } = await adminClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Ensure storage bucket exists
    try {
      const { data: bData, error: bErr } = await adminClient.storage.getBucket('documents');
      if (bErr || !bData) {
        await adminClient.storage.createBucket('documents', { public: true, fileSizeLimit: 52428800 });
      }
    } catch (e) {
      // Ignore if bucket already exists
    }

    // 2. Resolve download mode (inline preview vs attachment download)
    const urlObj = new URL(req.url);
    const forceDownload = urlObj.searchParams.get('download') === '1';
    const fileExt = (doc.s3_key || '').toLowerCase().split('.').pop() || 'bin';
    const safeTitle = (doc.title || 'document').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const filename = `${safeTitle}.${fileExt}`;

    // 3. High-Speed Direct CDN Access: Generate signed URL (inline preview for frames, attachment for downloads)
    if (doc.s3_key) {
      try {
        const signedOptions: any = {};
        if (forceDownload) {
          signedOptions.download = filename;
        }
        const { data: signedData } = await adminClient
          .storage
          .from('documents')
          .createSignedUrl(doc.s3_key, 3600, signedOptions);

        if (signedData?.signedUrl) {
          // Redirect browser directly to Supabase CDN endpoint (< 10ms response)
          return NextResponse.redirect(signedData.signedUrl);
        }
      } catch (signedErr) {
        console.warn('Signed URL generation warning:', signedErr);
      }
    }

    // 4. Fallback: If s3_key is missing or direct storage download fails, stream text chunks as plain text file
    const { data: chunks } = await adminClient
      .from('embeddings')
      .select('chunk_text')
      .eq('document_id', documentId)
      .order('chunk_index', { ascending: true });

    const fullText = (chunks && chunks.length > 0) 
      ? chunks.map(c => c.chunk_text).join('\n\n---\n\n') 
      : `${doc.title}\nDocument Type: ${doc.document_type}\nCreated At: ${doc.created_at}`;

    const textBuffer = Buffer.from(fullText, 'utf-8');

    return new Response(textBuffer, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeTitle}.txt"`,
        'Content-Length': textBuffer.byteLength.toString(),
      },
    });

  } catch (err: any) {
    console.error('Document download route error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
