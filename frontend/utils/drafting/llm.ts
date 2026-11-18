/**
 * Server-only: asks the AI for a JSON answer of a fixed shape, for the
 * Drafting Desk. Claude (via the official Anthropic SDK, with structured
 * outputs) when ANTHROPIC_API_KEY is set; otherwise Gemini, if GEMINI_API_KEY
 * is set. Either way the answer is checked against the Zod schema before use.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import * as z from 'zod/v4';

export class DraftingAIError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

type Effort = 'low' | 'medium' | 'high';

let client: Anthropic | null = null;
function anthropic(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY;
  if (!key) return null;
  if (!client) client = new Anthropic({ apiKey: key, maxRetries: 2 });
  return client;
}

export function aiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.GEMINI_API_KEY);
}

export async function generateJson<S extends z.ZodType>(opts: {
  system: string;
  prompt: string;
  schema: S;
  effort?: Effort;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const { system, prompt, schema, effort = 'medium', maxTokens = 16000 } = opts;
  const claude = anthropic();
  if (claude) return generateWithClaude(claude, { system, prompt, schema, effort, maxTokens });
  if (process.env.GEMINI_API_KEY) return generateWithGemini({ system, prompt, schema, maxTokens });
  throw new DraftingAIError('No AI key configured', 'No AI service is set up. Add ANTHROPIC_API_KEY or GEMINI_API_KEY to the server settings.', 500);
}

async function generateWithClaude<S extends z.ZodType>(
  claude: Anthropic,
  { system, prompt, schema, effort, maxTokens }: { system: string; prompt: string; schema: S; effort: Effort; maxTokens: number },
): Promise<z.infer<S>> {
  try {
    const response = await claude.beta.messages.parse({
      model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
      max_tokens: maxTokens,
      // If the model declines on safety grounds, the API retries on a fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system,
      messages: [{ role: 'user', content: prompt }],
      output_config: { format: betaZodOutputFormat(schema), effort },
    });
    if (response.stop_reason === 'refusal') {
      throw new DraftingAIError('AI refused', 'The AI declined this request. Try rewording what you need.', 422);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new DraftingAIError('AI output cut off', 'The answer was too long and got cut off. Try a shorter document or fewer sources.', 422);
    }
    if (!response.parsed_output) {
      throw new DraftingAIError('Unparseable AI output', 'The AI’s answer could not be read. Please try again.');
    }
    return response.parsed_output as z.infer<S>;
  } catch (err) {
    if (err instanceof DraftingAIError) throw err;
    if (err instanceof Anthropic.RateLimitError) {
      throw new DraftingAIError(err.message, 'The AI service is busy. Wait a minute and try again.', 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      throw new DraftingAIError(err.message, 'The AI service key is not valid. Ask an admin to check ANTHROPIC_API_KEY.', 500);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new DraftingAIError(err.message, 'Could not reach the AI service. Check the connection and try again.');
    }
    if (err instanceof Anthropic.APIError) {
      throw new DraftingAIError(`Anthropic API error ${err.status}: ${err.message}`, 'The AI service returned an error. Please try again.');
    }
    throw err;
  }
}

async function generateWithGemini<S extends z.ZodType>({
  system,
  prompt,
  schema,
  maxTokens,
}: {
  system: string;
  prompt: string;
  schema: S;
  maxTokens: number;
}): Promise<z.infer<S>> {
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseJsonSchema: z.toJSONSchema(schema),
        maxOutputTokens: maxTokens,
      },
    }),
  });
  if (!res.ok) {
    throw new DraftingAIError(`Gemini error ${res.status}: ${await res.text()}`, 'The AI service returned an error. Please try again.');
  }
  const data = await res.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('') ?? '';
  try {
    return schema.parse(JSON.parse(text)) as z.infer<S>;
  } catch {
    throw new DraftingAIError('Unparseable Gemini output', 'The AI’s answer could not be read. Please try again.');
  }
}
