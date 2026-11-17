import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processDocumentById } from '@/utils/documentProcessor';
import { canManageDocument, findVisibleDocument, getRole, getSession } from '@/utils/documentAccess';

export const maxDuration = 300; // large documents take a while to embed

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId parameter' }, { status: 400 });
    }

    // Re-processing: admins, or the person who uploaded the document.
    const { db, user } = await getSession();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const doc = await findVisibleDocument(db, documentId);
    if (!doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    if (!canManageDocument(await getRole(admin, user.id), user.email, doc)) {
      return NextResponse.json({ error: 'Only an admin or the person who uploaded this document can re-process it.' }, { status: 403 });
    }

    // Wait for the result: hosting platforms stop work once a response is sent.
    try {
      const processed = await processDocumentById(documentId);
      return NextResponse.json({ success: true, documentId, status: processed?.processing_status ?? 'COMPLETE' });
    } catch (err) {
      return NextResponse.json(
        { success: false, documentId, status: 'FAILED', error: err instanceof Error ? err.message : String(err) },
        { status: 422 },
      );
    }

  } catch (err) {
    console.error('Document processing route error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 });
  }
}
