/**
 * Free, local text embeddings with the open-source gte-small model
 * (384 numbers per text), via transformers.js. Nothing is sent to an AI
 * provider: the model (~34 MB) is downloaded from Hugging Face once and
 * cached, then runs on this machine's CPU.
 *
 * Documents (upload processing, the bulk import tool) and search queries
 * (the AI's document search) must use the SAME model, so both go through here.
 */

export const EMBEDDING_MODEL = 'Xenova/gte-small';
export const EMBEDDING_DIMENSIONS = 384;
/** gte-small reads at most 512 tokens; longer text is cut, so keep chunks around 1,200 characters. */
export const MAX_EMBED_CHARS = 2000;

type Extractor = (texts: string[], options: { pooling: 'mean'; normalize: boolean }) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<Extractor> | null = null;

async function getExtractor(): Promise<Extractor> {
  if (!extractorPromise) {
    extractorPromise = (async () => {
      const { pipeline, env } = await import('@huggingface/transformers');
      // Serverless hosts only allow writing under /tmp.
      env.cacheDir = process.env.EMBEDDINGS_CACHE_DIR || (process.env.VERCEL ? '/tmp/epdh-models' : env.cacheDir);
      return (await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' })) as unknown as Extractor;
    })().catch((err) => {
      extractorPromise = null; // allow a retry after a failed download
      throw err;
    });
  }
  return extractorPromise;
}

/** Prepare text for the model: collapse whitespace and cap the length. */
export function prepareText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_EMBED_CHARS);
}

/** Checks a vector is usable: the right length, finite, and not all zeros. */
export function isValidEmbedding(v: unknown): v is number[] {
  return (
    Array.isArray(v) &&
    v.length === EMBEDDING_DIMENSIONS &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x)) &&
    v.some((x) => x !== 0)
  );
}

/**
 * Embeds texts in batches. Throws if the model can't load or returns
 * anything unusable: callers must never store a placeholder vector.
 */
export async function embedTexts(texts: string[], batchSize = 16): Promise<number[][]> {
  const prepared = texts.map(prepareText);
  if (prepared.some((t) => !t)) throw new Error('Cannot embed empty text');
  const extractor = await getExtractor();
  const out: number[][] = [];
  for (let i = 0; i < prepared.length; i += batchSize) {
    const batch = prepared.slice(i, i + batchSize);
    const vectors = (await extractor(batch, { pooling: 'mean', normalize: true })).tolist();
    if (vectors.length !== batch.length || !vectors.every(isValidEmbedding)) {
      throw new Error('The embedding model returned an unusable result');
    }
    out.push(...vectors);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  return (await embedTexts([text]))[0];
}

/** pgvector's text form, e.g. "[0.1,0.2,…]", for inserts and RPC arguments. */
export function toPgVector(v: number[]): string {
  return `[${v.join(',')}]`;
}
