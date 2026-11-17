import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';
import { embedQuery, toPgVector } from '@/utils/embeddings';

// Setup Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

async function getGenerationData(args: { plant_short_name?: string; start_date: string; end_date?: string }) {
  const { plant_short_name, start_date, end_date } = args;
  const targetEndDate = end_date || start_date;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  let plantId: string | null = null;
  if (plant_short_name) {
    // 1. Find plant by short name
    const { data: plant } = await supabase
      .from('power_plants')
      .select('id')
      .ilike('short_name', plant_short_name.trim())
      .limit(1)
      .maybeSingle();
      
    if (plant) {
      plantId = plant.id;
    } else {
      // Fallback: search by name
      const { data: plantByName } = await supabase
        .from('power_plants')
        .select('id')
        .ilike('name', `%${plant_short_name.trim()}%`)
        .limit(1)
        .maybeSingle();
      if (plantByName) {
        plantId = plantByName.id;
      }
    }
  }

  let dbQuery = supabase
    .from('generation_output')
    .select('report_date, installed_capacity_mw, available_capacity_mw, actual_output_mwh, energy_sent_out_mwh, curtailed_mwh, curtailment_cause, data_source, plant_id')
    .gte('report_date', start_date)
    .lte('report_date', targetEndDate);

  if (plantId) {
    dbQuery = dbQuery.eq('plant_id', plantId);
  }

  const { data, error } = await dbQuery.order('report_date', { ascending: true }).limit(100);
  if (error) {
    return { error: error.message };
  }
  return { data };
}

async function getGeneralTimeSeriesData(args: { table_name: string; start_date: string; end_date?: string }) {
  const { table_name, start_date, end_date } = args;
  const targetEndDate = end_date || start_date;

  const validTables = ['gas_supply', 'transmission_data', 'distribution_performance'];
  if (!validTables.includes(table_name)) {
    return { error: `Invalid table name: ${table_name}` };
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data, error } = await supabase
    .from(table_name)
    .select('*')
    .gte('report_date', start_date)
    .lte('report_date', targetEndDate)
    .order('report_date', { ascending: true })
    .limit(100);

  if (error) {
    return { error: error.message };
  }
  return { data };
}
/**
 * Searches document text as the signed-in user (so restricted documents stay
 * hidden): meaning (free local gte-small embeddings) plus keywords, merged by
 * public.match_document_chunks(). Falls back to keywords only if the
 * embedding model can't load.
 */
async function searchUploadedDocuments(args: { query: string; limit?: number }, db: SupabaseClient) {
  try {
    const limit = Math.min(Math.max(Number(args.limit) || 6, 1), 12);
    const cleanQuery = (args.query || '').trim().slice(0, 500);
    if (!cleanQuery) return { status: 'empty', message: 'Query string empty.' };

    let queryEmbedding: string | null = null;
    try {
      queryEmbedding = toPgVector(await embedQuery(cleanQuery));
    } catch (err) {
      console.warn('Document search: embedding unavailable, using keywords only:', err);
    }

    const { data: chunks, error: chunkErr } = await db.rpc('match_document_chunks', {
      query_embedding: queryEmbedding,
      query_text: cleanQuery,
      match_count: limit,
    });
    if (chunkErr) return { error: `Document search error: ${chunkErr.message}` };

    if (chunks && chunks.length > 0) {
      return {
        status: 'success',
        found_count: chunks.length,
        chunks: (chunks as { title: string; document_type: string; metadata: Record<string, unknown> | null; chunk_text: string }[]).map((c) => ({
          document_title: c.title || 'Document excerpt',
          document_type: c.document_type,
          page_number: c.metadata?.page_number ?? null,
          slide_number: c.metadata?.slide_number ?? null,
          sheet_name: c.metadata?.sheet_name ?? null,
          excerpt: c.chunk_text.slice(0, 900),
        })),
      };
    }

    // Fallback: titles and notes (still as the user, so restrictions apply)
    const safe = cleanQuery.replace(/[%_,()]/g, ' ');
    const { data: docs } = await db
      .from('documents')
      .select('id, title, document_type, classification, summary, notes')
      .or(`title.ilike.%${safe}%,notes.ilike.%${safe}%`)
      .limit(limit);

    if (docs && docs.length > 0) {
      return {
        status: 'success',
        found_count: docs.length,
        documents: docs.map((d) => ({
          title: d.title,
          type: d.document_type,
          summary: d.summary || d.notes || 'Document recorded in the library.',
        })),
      };
    }

    return { status: 'empty', message: `No matching document chunks found for query "${cleanQuery}".` };
  } catch (err) {
    return { error: `Document search error: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export async function POST(req: Request) {
  try {
    // Signed-in users only; document search runs with their own permissions.
    const sessionDb = await createSessionClient();
    const { data: { user } } = await sessionDb.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Please sign in to use the AI.' }, { status: 401 });
    }

    const { messages } = await req.json();
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Invalid messages format' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;

    if (!geminiKey && !anthropicKey) {
      return NextResponse.json({ 
        error: 'No AI API key is configured. Please add GEMINI_API_KEY or ANTHROPIC_API_KEY to your .env.local file.' 
      }, { status: 500 });
    }

    // 1. Fetch DB static metadata context
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const [{ data: plants }, { data: orgs }] = await Promise.all([
      supabase.from('power_plants').select('name, short_name, installed_capacity_mw, plant_type, status'),
      supabase.from('organisations').select('name, short_name, org_type, status')
    ]);

    const plantsText = (plants || [])
      .map(p => `- ${p.name} (${p.short_name}): Type: ${p.plant_type}, Capacity: ${p.installed_capacity_mw}MW, Status: ${p.status}`)
      .join('\n');
    const orgsText = (orgs || [])
      .map(o => `- ${o.name} (${o.short_name}): Type: ${o.org_type}, Status: ${o.status}`)
      .join('\n');

    const systemInstruction = `You are the Excredite Electricity Data Hub AI, a helpful assistant specialized in Nigeria's electricity sector.
You have access to the following current state of the database structure and metadata:

Power Plants (32 Total, 14,464 MW Total Capacity):
${plantsText}

Organisations (39 Total):
${orgsText}

Generation Output:
- The database contains 87,763 daily actual/available output records for these plants from Jan 1, 2014 to Jun 30, 2024.

CRITICAL GUARDRAILS & INSTRUCTIONS:
1. You are strictly a database-grounded query assistant. You must ONLY answer using facts and data retrieved from the database context (Power Plants, Organisations metadata) or via the database tools (get_generation_data, get_general_time_series_data).
2. If the user asks for daily capacity, generation output, available/declared capacity, or actual output on a specific date (e.g. May 1, 2024), you MUST execute the get_generation_data tool. Do NOT guess, estimate, or state that you lack tools.
3. The database is your absolute source of truth. If the data is not in the database and not returned by the database tools, state clearly that you do not have that information in the database.
4. Do NOT use the internet or your general training data to search or make up facts.
5. If the user queries dates in DD/MM/YYYY format (e.g., 01/05/2024), interpret the date based on standard Nigerian/European formats (DD/MM/YYYY) as 2024-05-01, but you can also verify January 5, 2024 if there's any ambiguity.`;

    // ==========================================
    // ANTHROPIC (CLAUDE) ROUTE
    // ==========================================
    if (anthropicKey) {
      const anthropicTools = [
        {
          name: "get_generation_data",
          description: "Fetch historical daily power generation output and capacity records (actual generation output, installed capacity, declared/available capacity, energy sent out, curtailment) from the database for a specific power plant and/or date range.",
          input_schema: {
            type: "object",
            properties: {
              plant_short_name: {
                type: "string",
                description: "The short name of the power plant (e.g., 'SHIRORO', 'EGBIN', 'KAINJI', 'JEBBA')."
              },
              start_date: {
                type: "string",
                description: "The start date in YYYY-MM-DD format."
              },
              end_date: {
                type: "string",
                description: "The end date in YYYY-MM-DD format."
              }
            },
            required: ["start_date"]
          }
        },
        {
          name: "get_general_time_series_data",
          description: "Fetch general time-series records from gas_supply, transmission_data, or distribution_performance tables for a specific date range.",
          input_schema: {
            type: "object",
            properties: {
              table_name: {
                type: "string",
                description: "The table name to query: 'gas_supply', 'transmission_data', or 'distribution_performance'."
              },
              start_date: {
                type: "string",
                description: "The start date in YYYY-MM-DD format."
              },
              end_date: {
                type: "string",
                description: "The end date in YYYY-MM-DD format."
              }
            },
            required: ["table_name", "start_date"]
          }
        },
        {
          name: "search_uploaded_documents",
          description: "Search the firm's document library (regulatory orders, court judgments, policy papers, reports, presentations, spreadsheets) by meaning and keywords. Returns the most relevant excerpts with their document titles. Use it whenever the question may be answered by the firm's documents.",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "What to look for, in plain words (e.g. 'Band A tariff review', 'gas supply shortfalls at thermal plants')."
              }
            },
            required: ["query"]
          }
        }
      ];

      let currentMessages = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

      const model = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';
      const anthropicUrl = 'https://api.anthropic.com/v1/messages';

      let loopCount = 0;
      const maxLoops = 5;

      while (loopCount < maxLoops) {
        console.log(`Claude query turn ${loopCount + 1}...`);
        const response = await fetch(anthropicUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': anthropicKey,
            'anthropic-version': '2023-06-01',
            // If the model declines on safety grounds, the API retries on a fallback model.
            'anthropic-beta': 'server-side-fallback-2026-07-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: 16000,
            system: systemInstruction,
            messages: currentMessages,
            tools: anthropicTools,
            fallbacks: 'default'
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('Anthropic API error:', errText);
          return NextResponse.json({ error: `Anthropic API failed: ${response.statusText}` }, { status: 500 });
        }

        const resData = await response.json();
        const responseContent = resData.content; // array of blocks

        if (resData.stop_reason === 'refusal') {
          return NextResponse.json({ content: 'The AI declined to answer this request. Try rephrasing the question.' });
        }

        // Append assistant response to history
        currentMessages.push({
          role: 'assistant',
          content: responseContent
        });

        const toolUses = responseContent.filter((block: any) => block.type === 'tool_use');

        if (toolUses.length > 0) {
          const toolResultBlocks = [];
          
          for (const block of toolUses) {
            console.log(`Executing Claude tool: ${block.name} with args:`, block.input);
            let result;
            if (block.name === 'get_generation_data') {
              result = await getGenerationData(block.input as any);
            } else if (block.name === 'get_general_time_series_data') {
              result = await getGeneralTimeSeriesData(block.input as any);
            } else if (block.name === 'search_uploaded_documents') {
              result = await searchUploadedDocuments(block.input as any, sessionDb);
            } else {
              result = { error: `Tool ${block.name} not found.` };
            }

            toolResultBlocks.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result)
            });
          }

          // Append tool result message to history
          currentMessages.push({
            role: 'user',
            content: toolResultBlocks
          });

          loopCount++;
        } else {
          // Final text response
          const reply = responseContent
            .filter((block: any) => block.type === 'text')
            .map((block: any) => block.text)
            .join('\n\n')
            .trim() || 'No response generated.';
          return NextResponse.json({ content: reply });
        }
      }

      return NextResponse.json({ error: 'Maximum tool execution turns exceeded' }, { status: 500 });
    }

    // ==========================================
    // GEMINI ROUTE (DEFAULT)
    // ==========================================
    // Map chat history to Gemini structure
    const contents = messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }));

    // Tool declarations
    const tools = [
      {
        functionDeclarations: [
          {
            name: "get_generation_data",
            description: "Fetch historical daily power generation output and capacity records (actual generation output, installed capacity, declared/available capacity, energy sent out, curtailment) from the database for a specific power plant and/or date range.",
            parameters: {
              type: "OBJECT",
              properties: {
                plant_short_name: {
                  type: "STRING",
                  description: "The short name of the power plant (e.g., 'SHIRORO', 'EGBIN', 'KAINJI', 'JEBBA')."
                },
                start_date: {
                  type: "STRING",
                  description: "The start date in YYYY-MM-DD format."
                },
                end_date: {
                  type: "STRING",
                  description: "The end date in YYYY-MM-DD format."
                }
              },
              required: ["start_date"]
            }
          },
          {
            name: "get_general_time_series_data",
            description: "Fetch general time-series records from gas_supply, transmission_data, or distribution_performance tables for a specific date range.",
            parameters: {
              type: "OBJECT",
              properties: {
                table_name: {
                  type: "STRING",
                  description: "The table name to query: 'gas_supply', 'transmission_data', or 'distribution_performance'."
                },
                start_date: {
                  type: "STRING",
                  description: "The start date in YYYY-MM-DD format."
                },
                end_date: {
                  type: "STRING",
                  description: "The end date in YYYY-MM-DD format."
                }
              },
              required: ["table_name", "start_date"]
            }
          },
          {
            name: "search_uploaded_documents",
            description: "Search and crawl uploaded document repository (.pdf, .docx, .pptx, .xlsx) for relevant text chunks, slide contents, regulatory orders, court judgments, policy papers, or summaries matching a specific query.",
            parameters: {
              type: "OBJECT",
              properties: {
                query: {
                  type: "STRING",
                  description: "The search query or keywords to look for in uploaded documents (e.g. 'African School of Regulation', 'Tariff Order', 'Lagos Business School')."
                }
              },
              required: ["query"]
            }
          }
        ]
      }
    ];

    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    let currentContents = [...contents];
    let loopCount = 0;
    const maxLoops = 5;

    while (loopCount < maxLoops) {
      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey!
        },
        body: JSON.stringify({
          contents: currentContents,
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          tools,
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 2048
          }
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error('Gemini API error:', errText);
        return NextResponse.json({ error: `Gemini API failed: ${response.statusText}` }, { status: 500 });
      }

      const resData = await response.json();
      const modelParts = resData.candidates?.[0]?.content?.parts || [];
      const functionCalls = modelParts.filter((p: any) => p.functionCall);

      // Append model message to history
      currentContents.push({
        role: 'model',
        parts: modelParts
      });

      if (functionCalls.length > 0) {
        const toolResponseParts: any[] = [];
        
        for (const part of functionCalls) {
          const call = part.functionCall;
          console.log(`Executing tool: ${call.name} with args:`, call.args);
          
          let result;
          if (call.name === 'get_generation_data') {
            result = await getGenerationData(call.args as any);
          } else if (call.name === 'get_general_time_series_data') {
            result = await getGeneralTimeSeriesData(call.args as any);
          } else if (call.name === 'search_uploaded_documents') {
            result = await searchUploadedDocuments(call.args as any, sessionDb);
          } else {
            result = { error: `Tool ${call.name} not found.` };
          }
          
          toolResponseParts.push({
            functionResponse: {
              name: call.name,
              response: {
                result
              }
            }
          });
        }

        // Append tool responses to history
        currentContents.push({
          role: 'user',
          parts: toolResponseParts
        } as any);

        loopCount++;
      } else {
        // Final text response
        const reply = modelParts?.[0]?.text || 'No response generated.';
        return NextResponse.json({ content: reply });
      }
    }

    return NextResponse.json({ error: 'Maximum tool execution turns exceeded' }, { status: 500 });

  } catch (error: any) {
    console.error('Chat error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
