import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { canManageDocument, getRole } from '@/utils/documentAccess';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    const { documentIds } = await req.json();

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return NextResponse.json({ error: 'Missing or empty documentIds array' }, { status: 400 });
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

    // 1. Fetch metadata (s3_keys & titles) for selected document IDs
    const { data: docs, error: fetchError } = await adminClient
      .from('documents')
      .select('id, title, s3_key, uploaded_by')
      .in('id', documentIds);

    if (fetchError || !docs || docs.length === 0) {
      return NextResponse.json({ error: 'No matching documents found to delete' }, { status: 404 });
    }

    // Only admins, or the person who uploaded each document, may delete. All or nothing.
    const role = await getRole(adminClient, userId);
    const notAllowed = docs.filter((d) => !canManageDocument(role, user.email, d));
    if (notAllowed.length > 0) {
      return NextResponse.json(
        { error: `You can't delete ${notAllowed.length} of the selected documents: only an admin or the person who uploaded a document can delete it. Nothing was deleted.` },
        { status: 403 },
      );
    }

    // 2. Collect storage keys to remove
    const s3KeysToRemove = docs.map(d => d.s3_key).filter(Boolean) as string[];
    if (s3KeysToRemove.length > 0) {
      const { error: storageErr } = await adminClient.storage.from('documents').remove(s3KeysToRemove);
      if (storageErr) {
        console.warn('Bulk storage cleanup warning:', storageErr);
      }
    }

    // 3. Delete embeddings associated with these documents
    await adminClient.from('embeddings').delete().in('document_id', documentIds);

    // 4. Delete document records from PostgreSQL database
    const { error: deleteErr } = await adminClient.from('documents').delete().in('id', documentIds);

    if (deleteErr) {
      return NextResponse.json({ error: `Bulk delete database error: ${deleteErr.message}` }, { status: 500 });
    }

    // 5. Log activity
    await adminClient.from('user_activity_log').insert({
      user_id: userId,
      action: 'BULK_DOCUMENTS_DELETED',
      details: `Bulk deleted ${docs.length} documents`,
    });

    return NextResponse.json({
      success: true,
      deletedCount: docs.length,
      message: `Successfully deleted ${docs.length} documents.`,
    });

  } catch (err: any) {
    console.error('Bulk delete error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
