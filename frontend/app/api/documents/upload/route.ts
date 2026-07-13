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

export async function POST(req: Request) {
  try {
    // Authenticate
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const title = formData.get('title') as string;
    const documentType = formData.get('documentType') as string;
    const customType = formData.get('customType') as string;
    const classification = formData.get('classification') as string;

    if (!file || !title || !documentType || !classification) {
      return NextResponse.json({ error: 'Missing required fields: file, title, documentType, classification' }, { status: 400 });
    }

    // Server-side file validation
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

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a unique storage path
    const fileExt = file.name.split('.').pop() || 'bin';
    const storagePath = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${fileExt}`;

    // Read file as buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to Supabase Storage
    const { error: uploadError } = await adminClient
      .storage
      .from('documents')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 });
    }

    // Resolve document type (use custom type if "OTHER" is selected)
    const resolvedType = documentType === 'OTHER' && customType ? customType.toUpperCase().replace(/\s+/g, '_') : documentType;

    // Create document record in the database
    const { data: doc, error: dbError } = await adminClient
      .from('documents')
      .insert({
        title,
        document_type: resolvedType,
        classification,
        s3_key: storagePath,
        file_size_bytes: file.size,
        uploaded_by: user.email,
        processing_status: 'PENDING',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Try to clean up the uploaded file
      await adminClient.storage.from('documents').remove([storagePath]);
      return NextResponse.json({ error: `Database error: ${dbError.message}` }, { status: 500 });
    }

    // Log the upload activity
    await adminClient.from('user_activity_log').insert({
      user_id: user.id,
      action: 'DOCUMENT_UPLOADED',
      details: `Uploaded "${title}" (${(file.size / 1024 / 1024).toFixed(2)} MB, ${file.type})`,
    });

    return NextResponse.json({
      success: true,
      document: doc,
      message: `Document "${title}" uploaded successfully.`,
    });

  } catch (err: any) {
    console.error('Document upload error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
