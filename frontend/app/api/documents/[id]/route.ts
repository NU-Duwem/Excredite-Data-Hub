import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { canManageDocument, getRole } from '@/utils/documentAccess';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId parameter' }, { status: 400 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);
    let user = null;

    const authHeader = req.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '').trim();
      const { data } = await adminClient.auth.getUser(token);
      if (data?.user) user = data.user;
    }

    if (!user) {
      const supabase = await createServerClient();
      const { data } = await supabase.auth.getUser();
      if (data?.user) user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: 'Not authenticated. Please log in to continue.' }, { status: 401 });
    }

    const userId = user.id;

    // 1. Fetch document metadata
    const { data: doc, error: fetchError } = await adminClient
      .from('documents')
      .select('id, title, s3_key, uploaded_by')
      .eq('id', documentId)
      .single();

    if (fetchError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // Only admins, or the person who uploaded it, may delete a document.
    if (!canManageDocument(await getRole(adminClient, userId), user.email, doc)) {
      return NextResponse.json({ error: 'Only an admin or the person who uploaded this document can delete it.' }, { status: 403 });
    }

    // 2. Remove file from Supabase Storage if s3_key exists
    if (doc.s3_key) {
      const { error: storageErr } = await adminClient.storage.from('documents').remove([doc.s3_key]);
      if (storageErr) {
        console.warn('Storage cleanup warning:', storageErr);
      }
    }

    // 3. Delete embeddings associated with this document
    await adminClient.from('embeddings').delete().eq('document_id', documentId);

    // 4. Delete document record
    const { error: deleteErr } = await adminClient.from('documents').delete().eq('id', documentId);

    if (deleteErr) {
      return NextResponse.json({ error: `Delete database error: ${deleteErr.message}` }, { status: 500 });
    }

    // 5. Log activity
    await adminClient.from('user_activity_log').insert({
      user_id: userId,
      action: 'DOCUMENT_DELETED',
      details: `Deleted document "${doc.title}"`,
    });

    return NextResponse.json({
      success: true,
      documentId,
      message: `Document "${doc.title}" deleted successfully.`,
    });

  } catch (err: any) {
    console.error('Delete document error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
