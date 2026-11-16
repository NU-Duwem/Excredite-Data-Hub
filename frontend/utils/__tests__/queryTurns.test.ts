import { describe, expect, it } from 'vitest';
import { answerDocument, answerPlainText, buildTurns, escapeHtml, markdownToHtml } from '../queryTurns';

const greeting = { id: 1, role: 'assistant', content: 'Hello.' };

describe('buildTurns', () => {
  it('skips the greeting and returns nothing before the first question', () => {
    expect(buildTurns([greeting])).toEqual([]);
  });

  it('pairs each question with its answer and numbers them', () => {
    const turns = buildTurns([
      greeting,
      { id: 2, role: 'user', content: 'Q one' },
      { id: 3, role: 'assistant', content: 'A one' },
      { id: 4, role: 'user', content: 'Q two' },
      { id: 5, role: 'assistant', content: 'A two' },
    ]);
    expect(turns.map((t) => [t.index, t.question.content, t.answer?.content])).toEqual([
      [1, 'Q one', 'A one'],
      [2, 'Q two', 'A two'],
    ]);
  });

  it('leaves the answer empty while waiting for a reply', () => {
    const turns = buildTurns([greeting, { id: 2, role: 'user', content: 'Q' }]);
    expect(turns).toHaveLength(1);
    expect(turns[0].answer).toBeNull();
  });

  it('joins several replies to one question instead of dropping them', () => {
    const turns = buildTurns([
      { id: 2, role: 'user', content: 'Q' },
      { id: 3, role: 'assistant', content: 'part 1' },
      { id: 4, role: 'assistant', content: 'part 2' },
    ]);
    expect(turns[0].answer?.content).toBe('part 1\n\npart 2');
  });

  it('keeps two questions in a row as separate cards', () => {
    const turns = buildTurns([
      { id: 2, role: 'user', content: 'first' },
      { id: 3, role: 'user', content: 'second' },
      { id: 4, role: 'assistant', content: 'answer' },
    ]);
    expect(turns.map((t) => t.answer?.content ?? null)).toEqual([null, 'answer']);
  });
});

describe('markdownToHtml', () => {
  it('escapes HTML so answers cannot inject markup', () => {
    expect(markdownToHtml('<script>alert(1)</script>')).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
    expect(escapeHtml(`"a" & 'b'`)).toBe('&quot;a&quot; &amp; &#39;b&#39;');
  });

  it('renders headings, bold text and lists', () => {
    const html = markdownToHtml('# Title\nSome **bold** text\n- one\n- two\n\nAfter');
    expect(html).toBe('<h2>Title</h2>\n<p>Some <strong>bold</strong> text</p>\n<ul>\n<li>one</li>\n<li>two</li>\n</ul>\n<p>After</p>');
  });

  it('closes a list that ends the answer', () => {
    expect(markdownToHtml('- only')).toBe('<ul>\n<li>only</li>\n</ul>');
  });
});

describe('export helpers', () => {
  it('builds clipboard text with the question first', () => {
    expect(answerPlainText('Why?', 'Because.')).toBe('Q: Why?\n\nBecause.');
  });

  it('builds a printable page with the escaped question as title and heading', () => {
    const doc = answerDocument('Is 5 < 6?', 'Yes', new Date('2026-11-16T10:39:00Z'));
    expect(doc).toContain('<title>Is 5 &lt; 6?</title>');
    expect(doc).toContain('<h1>Is 5 &lt; 6?</h1>');
    expect(doc).toContain('<p>Yes</p>');
    expect(doc).toContain('16 Nov 2026');
  });
});
