import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Allowed MIME types for document uploads
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export const maxDuration = 60; // Allow 60s max execution for large uploads

export async function POST(req: Request) {
  try {
    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    let user = null;

    // 1. Check Authorization Bearer header passed from client
    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const { data } = await adminClient.auth.getUser(token);
      if (data?.user) user = data.user;
    }

    // 2. Check Cookie session
    if (!user) {
      const supabase = await createServerClient();
      const { data } = await supabase.auth.getUser();
      if (data?.user) user = data.user;
    }

    // Strict security check: Reject unauthenticated requests
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated. Please log in to continue.' }, { status: 401 });
    }

    const userId = user.id;
    const userEmail = user.email || '';

    const contentType = req.headers.get('content-type') || '';
    let title = '';
    let documentType = '';
    let customType = '';
    let classification = '';
    let keywords: string | null = null;
    let linkedMatterId: string | null = null;
    let storagePath = '';
    let fileSize = 0;
    let fileHash = '';

    if (contentType.includes('application/json')) {
      const body = await req.json();
      title = body.title;
      documentType = body.documentType;
      customType = body.customType || '';
      classification = body.classification;
      keywords = body.keywords || null;
      linkedMatterId = body.linkedMatterId || null;
      storagePath = body.s3_key;
      fileSize = body.fileSize || 0;
      fileHash = body.fileHash || '';

      if (!storagePath || !title || !documentType || !classification) {
        return NextResponse.json({ error: 'Missing required JSON fields: s3_key, title, documentType, classification' }, { status: 400 });
      }
    } else {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      title = formData.get('title') as string;
      documentType = formData.get('documentType') as string;
      customType = formData.get('customType') as string;
      classification = formData.get('classification') as string;
      keywords = formData.get('keywords') as string | null;
      linkedMatterId = formData.get('linkedMatterId') as string | null;

      if (!file || !title || !documentType || !classification) {
        return NextResponse.json({ error: 'Missing required fields: file, title, documentType, classification' }, { status: 400 });
      }

      if (!ALLOWED_MIME_TYPES.includes(file.type)) {
        return NextResponse.json({
          error: `Invalid file type: ${file.type}. Allowed: PDF, Word, Excel, PowerPoint.`
        }, { status: 400 });
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum allowed: 50MB.`
        }, { status: 400 });
      }

      fileSize = file.size;
      const fileExt = file.name.split('.').pop() || 'bin';
      storagePath = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const crypto = await import('crypto');
      fileHash = crypto.createHash('sha256').update(buffer).digest('hex');

      // Ensure 'documents' storage bucket exists in Supabase
      try {
        const { data: bucketData, error: bucketErr } = await adminClient.storage.getBucket('documents');
        if (bucketErr || !bucketData) {
          await adminClient.storage.createBucket('documents', { public: false, fileSizeLimit: 52428800 });
        }
      } catch (bErr) {
        console.warn('Auto bucket check error:', bErr);
      }

      const { error: uploadError } = await adminClient
        .storage
        .from('documents')
        .upload(storagePath, buffer, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return NextResponse.json({ error: `Storage error: ${uploadError.message}` }, { status: 500 });
      }
    }

    // 1. Primary Check: Check if a document with exact same file size and title already exists
    if (fileSize > 0) {
      const { data: duplicateDoc } = await adminClient
        .from('documents')
        .select('id, title, created_at, file_size_bytes')
        .eq('file_size_bytes', fileSize)
        .ilike('title', title.trim())
        .limit(1)
        .maybeSingle();

      if (duplicateDoc) {
        return NextResponse.json({
          error: `Duplicate Upload Blocked: A document titled "${duplicateDoc.title}" (${(fileSize / 1024 / 1024).toFixed(2)} MB) was already uploaded on ${new Date(duplicateDoc.created_at).toLocaleDateString()}. Re-uploading duplicates is not allowed.`
        }, { status: 409 });
      }
    }

    // 2. Secondary Check: Check if exact file content (SHA-256 hash) has already been uploaded
    if (fileHash) {
      try {
        const { data: existingHashDoc } = await adminClient
          .from('documents')
          .select('id, title, created_at')
          .eq('file_hash', fileHash)
          .limit(1)
          .maybeSingle();

        if (existingHashDoc) {
          return NextResponse.json({
            error: `Duplicate Content Blocked: This exact file content has already been uploaded as "${existingHashDoc.title}". Re-uploading identical file content is not allowed.`
          }, { status: 409 });
        }
      } catch (hashErr) {
        console.warn('Duplicate hash check error:', hashErr);
      }
    }

    // Resolve document type (use custom type if "OTHER" is selected)
    const resolvedType = documentType === 'OTHER' && customType ? customType.toUpperCase().replace(/\s+/g, '_') : documentType;

    // Create document record in the database
    let insertPayload: any = {
      title,
      document_type: resolvedType,
      classification,
      s3_key: storagePath,
      file_size_bytes: fileSize,
      file_hash: fileHash || null,
      uploaded_by: userEmail,
      processing_status: 'PENDING',
      matter_id: linkedMatterId || null,
      notes: keywords || null,
    };

    let { data: doc, error: dbError } = await adminClient
      .from('documents')
      .insert(insertPayload)
      .select()
      .single();

    // Fallback if file_hash column doesn't exist yet in Supabase schema
    if (dbError && dbError.code === 'PGRST204') {
      delete insertPayload.file_hash;
      const { data: fbDoc, error: fbDbErr } = await adminClient
        .from('documents')
        .insert(insertPayload)
        .select()
        .single();
      
      if (fbDbErr) {
        dbError = fbDbErr;
      } else {
        doc = fbDoc;
        dbError = null;
      }
    }

    if (dbError || !doc) {
      console.error('Database insert error:', dbError);
      await adminClient.storage.from('documents').remove([storagePath]);
      return NextResponse.json({ error: `Database error: ${dbError?.message}` }, { status: 500 });
    }

    // Log the upload activity
    await adminClient.from('user_activity_log').insert({
      user_id: userId,
      action: 'DOCUMENT_UPLOADED',
      details: `Uploaded "${title}" (${(fileSize / 1024 / 1024).toFixed(2)} MB)`,
    });

    // Trigger document processing asynchronously in background to avoid blocking response
    import('@/utils/documentProcessor')
      .then(({ processDocumentById }) => processDocumentById(doc.id))
      .catch((procErr) => console.error('Background document processing error:', procErr));

    return NextResponse.json({
      success: true,
      document: doc,
      message: `Document "${title}" uploaded successfully. Processing in background...`,
    });

  } catch (err: any) {
    console.error('Document upload error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
