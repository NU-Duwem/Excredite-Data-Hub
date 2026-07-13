import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function POST(req: Request) {
  try {
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

    const systemInstruction = `You are the Excredite Power Data Hub AI, a helpful assistant specialized in Nigeria's electricity sector.
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
        }
      ];

      let currentMessages = messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      }));

      const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
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
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model,
            max_tokens: 2048,
            system: systemInstruction,
            messages: currentMessages,
            tools: anthropicTools,
            temperature: 0.1
          })
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error('Anthropic API error:', errText);
          return NextResponse.json({ error: `Anthropic API failed: ${response.statusText}` }, { status: 500 });
        }

        const resData = await response.json();
        const responseContent = resData.content; // array of blocks

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
          const textBlock = responseContent.find((block: any) => block.type === 'text');
          const reply = textBlock?.text || 'No response generated.';
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
