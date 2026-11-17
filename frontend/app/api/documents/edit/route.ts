import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { canManageDocument, findVisibleDocument, getRole } from '@/utils/documentAccess';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: Request) {
  try {
    // Authenticate user
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const { action, documentId, content, title, documentType, classification, matterId } = body;

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    if (action === 'overwrite') {
      if (!documentId) {
        return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
      }

      // Only admins, or the person who uploaded it, may overwrite a document.
      const target = await findVisibleDocument(supabase as unknown as SupabaseClient, documentId);
      if (!target) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 });
      }
      if (!canManageDocument(await getRole(adminClient, user.id), user.email, target)) {
        return NextResponse.json({ error: 'Only an admin or the person who uploaded this document can overwrite it. Save a copy instead.' }, { status: 403 });
      }

      // Update document notes (representing text content)
      const { data, error } = await adminClient
        .from('documents')
        .update({
          notes: content,
          updated_at: new Date().toISOString(),
        })
        .eq('id', documentId)
        .select()
        .single();

      if (error) {
        console.error('Error overwriting document:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log activity
      await adminClient.from('user_activity_log').insert({
        user_id: user.id,
        action: 'DOCUMENT_EDITED',
        details: `Edited and overwrote document: "${data.title}"`,
      });

      return NextResponse.json({ success: true, document: data });
    } 
    
    if (action === 'new-copy') {
      if (!documentId) {
        return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
      }

      // Only documents this user may see can be copied.
      if (!(await findVisibleDocument(supabase as unknown as SupabaseClient, documentId))) {
        return NextResponse.json({ error: 'Original document not found' }, { status: 404 });
      }

      // Fetch existing document to clone metadata
      const { data: original, error: fetchErr } = await adminClient
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .single();

      if (fetchErr || !original) {
        return NextResponse.json({ error: 'Original document not found' }, { status: 404 });
      }

      // Insert new cloned copy with modified content/notes
      const { data, error } = await adminClient
        .from('documents')
        .insert({
          title: `Copy of ${original.title}`,
          document_type: original.document_type,
          classification: original.classification,
          s3_key: original.s3_key,
          file_size_bytes: original.file_size_bytes,
          uploaded_by: user.email,
          processing_status: 'COMPLETE',
          notes: content,
          matter_id: original.matter_id,
          restricted: original.restricted ?? false, // a copy of a restricted document stays restricted
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating document copy:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log activity
      await adminClient.from('user_activity_log').insert({
        user_id: user.id,
        action: 'DOCUMENT_COPIED',
        details: `Saved copy of "${original.title}" as "${data.title}"`,
      });

      return NextResponse.json({ success: true, document: data });
    }

    if (action === 'save-generated') {
      if (!title || !content) {
        return NextResponse.json({ error: 'Missing title or content' }, { status: 400 });
      }

      // Save AI generated document directly to the registry database
      const { data, error } = await adminClient
        .from('documents')
        .insert({
          title,
          document_type: documentType || 'DOCUMENT_NOTE',
          classification: classification || 'INTERNAL',
          processing_status: 'COMPLETE',
          notes: content, // Save body text as notes
          uploaded_by: user.email,
          source: 'ai_generated',
          matter_id: matterId || null,
        })
        .select()
        .single();

      if (error) {
        console.error('Error saving generated document:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Log activity
      await adminClient.from('user_activity_log').insert({
        user_id: user.id,
        action: 'DOCUMENT_GENERATED',
        details: `Saved AI generated document: "${title}"`,
      });

      return NextResponse.json({ success: true, document: data });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (err: any) {
    console.error('Document edit error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
