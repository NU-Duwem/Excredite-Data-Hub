import { describe, expect, it } from 'vitest';
import { EMBEDDING_DIMENSIONS, MAX_EMBED_CHARS, embedTexts, isValidEmbedding, prepareText, toPgVector } from '../embeddings';

describe('embedding helpers', () => {
  it('collapses whitespace and caps length', () => {
    expect(prepareText('  NERC\n\n order\t2024  ')).toBe('NERC order 2024');
    expect(prepareText('x'.repeat(MAX_EMBED_CHARS + 50))).toHaveLength(MAX_EMBED_CHARS);
  });

  it('rejects placeholder, short or broken vectors', () => {
    const good = Array.from({ length: EMBEDDING_DIMENSIONS }, (_, i) => (i % 7) / 10 - 0.3);
    expect(isValidEmbedding(good)).toBe(true);
    expect(isValidEmbedding(new Array(EMBEDDING_DIMENSIONS).fill(0))).toBe(false); // the old silent fallback
    expect(isValidEmbedding(good.slice(1))).toBe(false);
    expect(isValidEmbedding([...good.slice(1), Number.NaN])).toBe(false);
    expect(isValidEmbedding('nope')).toBe(false);
  });

  it('formats vectors for pgvector', () => {
    expect(toPgVector([0.5, -1, 0])).toBe('[0.5,-1,0]');
  });

  it('refuses to embed empty text instead of storing a placeholder', async () => {
    await expect(embedTexts(['   '])).rejects.toThrow('Cannot embed empty text');
  });
});

// Downloads the ~34 MB model on first run; set RUN_MODEL_TESTS=1 to include it.
describe.skipIf(!process.env.RUN_MODEL_TESTS)('gte-small model', () => {
  it('ranks related sentences closer than unrelated ones', { timeout: 120_000 }, async () => {
    const [tariff, prices, football] = await embedTexts([
      'NERC approved a new tariff for Band A customers.',
      'The regulator raised electricity prices for premium feeders.',
      'Our football team won the match on Saturday.',
    ]);
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);
    expect(tariff).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(dot(tariff, prices)).toBeGreaterThan(dot(tariff, football));
  });
});
