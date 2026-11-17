import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { findVisibleDocument } from '@/utils/documentAccess';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: documentId } = await params;
    const { question } = await req.json();

    if (!question || typeof question !== 'string') {
      return NextResponse.json({ error: 'Missing question parameter' }, { status: 400 });
    }

    // Authenticate
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // Only documents this user may see (restricted ones stay hidden).
    if (!(await findVisibleDocument(supabase as unknown as SupabaseClient, documentId))) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch Document Record
    const { data: doc, error: docError } = await adminClient
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    // 2. Fetch Relevant Chunks from public.embeddings
    // Use text search matching on question terms
    const keywords = question.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    
    let queryBuilder = adminClient
      .from('embeddings')
      .select('chunk_index, chunk_text, metadata')
      .eq('document_id', documentId);

    const { data: allChunks, error: chunksError } = await queryBuilder.limit(20);

    if (chunksError) {
      console.error('Error fetching chunks:', chunksError);
    }

    // Rank chunks based on keyword overlap
    const scoredChunks = (allChunks || []).map(chunk => {
      let score = 0;
      const lowerText = chunk.chunk_text.toLowerCase();
      keywords.forEach(kw => {
        if (lowerText.includes(kw.toLowerCase())) score += 1;
      });
      return { ...chunk, score };
    }).sort((a, b) => b.score - a.score).slice(0, 6);

    const contextSnippets = scoredChunks.map((c, i) => {
      const pageInfo = c.metadata?.page ? `[Page ${c.metadata.page}]` : c.metadata?.slide_number ? `[Slide ${c.metadata.slide_number}]` : `[Section ${i + 1}]`;
      return `${pageInfo}: ${c.chunk_text}`;
    }).join('\n\n');

    // 3. Query Gemini or Anthropic AI
    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

    let aiAnswer = '';

    if (geminiKey) {
      const prompt = `You are an executive legal and energy sector AI assistant for the Excredite Power Data Hub (EPDH).
Answer the question strictly using the provided document excerpts from "${doc.title}".
If the context does not contain enough information, state that clearly.
Always cite the specific page or slide number when providing facts.

DOCUMENT EXCERPTS:
${contextSnippets || 'No extracted text available yet.'}

USER QUESTION:
${question}

EXECUTIVE ANSWER (with page/slide citations):`;

      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      });

      if (aiRes.ok) {
        const json = await aiRes.json();
        aiAnswer = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      }
    }

    if (!aiAnswer && anthropicKey) {
      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          messages: [{
            role: 'user',
            content: `Document: "${doc.title}"\nExcerpts:\n${contextSnippets}\n\nQuestion: ${question}`
          }]
        })
      });

      if (aiRes.ok) {
        const json = await aiRes.json();
        aiAnswer = json.content?.[0]?.text || '';
      }
    }

    if (!aiAnswer) {
      aiAnswer = `Based on document "${doc.title}":\n` + (contextSnippets ? contextSnippets.slice(0, 500) + '...' : 'Processing is still pending for this document.');
    }

    const citations = scoredChunks.map(c => ({
      chunk_index: c.chunk_index,
      page_number: c.metadata?.page || null,
      slide_number: c.metadata?.slide_number || null,
      snippet: c.chunk_text.slice(0, 150) + '...'
    }));

    return NextResponse.json({
      success: true,
      documentId,
      documentTitle: doc.title,
      question,
      answer: aiAnswer,
      citations
    });

  } catch (err: any) {
    console.error('Document Q&A error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
