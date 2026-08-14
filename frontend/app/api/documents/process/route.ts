import { NextResponse } from 'next/server';
import { processDocumentById } from '@/utils/documentProcessor';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { documentId } = await req.json();

    if (!documentId) {
      return NextResponse.json({ error: 'Missing documentId parameter' }, { status: 400 });
    }

    // Trigger processing asynchronously in background without blocking HTTP response
    processDocumentById(documentId)
      .then((doc) => console.log(`Background processing finished for document ${documentId}`))
      .catch((err) => console.error(`Background processing error for document ${documentId}:`, err));

    return NextResponse.json({
      success: true,
      documentId,
      message: `Document processing started in background.`,
    });

  } catch (err: any) {
    console.error('Document processing route error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
