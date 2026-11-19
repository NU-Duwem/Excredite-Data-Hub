import { describe, expect, it } from 'vitest';
import { chunkText } from '../extractText';
import { overlapLength, passagesToSections } from '../passages';

describe('overlapLength', () => {
  it('finds the repeated end', () => {
    expect(overlapLength('one two three four five six seven eight nine', 'four five six seven eight nine ten')).toBe('four five six seven eight nine'.length);
    expect(overlapLength('nothing shared here at all', 'completely different text')).toBe(0);
  });
});

describe('passagesToSections', () => {
  it('rebuilds the original text from overlapping passages', () => {
    const sentences = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} talks about tariffs and metering.`).join(' ');
    const chunks = chunkText(sentences);
    expect(chunks.length).toBeGreaterThan(1);
    const sections = passagesToSections(chunks.map((chunk_text, chunk_index) => ({ chunk_index, chunk_text })));
    expect(sections).toHaveLength(1);
    expect(sections[0].label).toBeNull();
    expect(sections[0].text).toBe(sentences);
  });

  it('groups by page, slide and sheet, in order', () => {
    const sections = passagesToSections([
      { chunk_index: 2, chunk_text: 'Second page.', metadata: { page_number: 2 } },
      { chunk_index: 0, chunk_text: 'First page.', metadata: { page_number: 1 } },
      { chunk_index: 1, chunk_text: 'More of page one.', metadata: { page_number: 1 } },
      { chunk_index: 3, chunk_text: 'Slide text.', metadata: { slide_number: 4 } },
      { chunk_index: 4, chunk_text: 'Sheet: Data\na,b', metadata: { sheet_name: 'Data' } },
    ]);
    expect(sections).toEqual([
      { label: 'Page 1', text: 'First page.\n\nMore of page one.' },
      { label: 'Page 2', text: 'Second page.' },
      { label: 'Slide 4', text: 'Slide text.' },
      { label: 'Sheet: Data', text: 'a,b' },
    ]);
  });
});
