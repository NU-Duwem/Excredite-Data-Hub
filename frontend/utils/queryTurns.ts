/**
 * Helpers for the AI Query page's "report thread" layout: messages are shown
 * as numbered cards, one per question with its answer, and each answer can be
 * copied or printed to PDF.
 */

export type QueryMessage = { id: number; role: string; content: string };

export type Turn = {
  index: number; // 1-based, shown as Q1, Q2…
  question: QueryMessage;
  answer: QueryMessage | null; // null while waiting for the reply
};

/**
 * Pairs each question with the reply that follows it. Assistant messages
 * before the first question (the greeting) are skipped. If several replies
 * follow one question, they are joined so nothing is lost.
 */
export function buildTurns(messages: QueryMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      turns.push({ index: turns.length + 1, question: m, answer: null });
      continue;
    }
    const last = turns[turns.length - 1];
    if (!last) continue;
    last.answer = last.answer ? { ...last.answer, content: `${last.answer.content}\n\n${m.content}` } : m;
  }
  return turns;
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(text: string): string {
  return escapeHtml(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
}

/** The same small Markdown subset the page renders (#, ##, ###, "- " lists, **bold**), as safe HTML. */
export function markdownToHtml(md: string): string {
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) out.push('</ul>');
    inList = false;
  };
  for (const raw of md.split('\n')) {
    const line = raw.trim();
    const heading = /^(#{1,3}) (.*)$/.exec(line);
    if (line.startsWith('- ')) {
      if (!inList) out.push('<ul>');
      inList = true;
      out.push(`<li>${inline(line.slice(2))}</li>`);
    } else if (heading) {
      closeList();
      const level = heading[1].length + 1; // # → h2, the page title is h1
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (line === '') {
      closeList();
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

/** Plain text for the clipboard. */
export function answerPlainText(question: string, answer: string): string {
  return `Q: ${question}\n\n${answer}`;
}

/** A standalone, printable page for one answer (printed to PDF by the browser). */
export function answerDocument(question: string, answer: string, when: Date): string {
  const date = when.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(question.slice(0, 80))}</title>
<style>
  @page { margin: 18mm; }
  body { font-family: Inter, Arial, sans-serif; color: #14201a; font-size: 12pt; line-height: 1.55; margin: 0; }
  header { border-bottom: 2px solid #0a3a22; padding-bottom: 10px; margin-bottom: 18px; }
  .brand { font-weight: 800; color: #0a3a22; font-size: 11pt; }
  .meta { color: #5b665f; font-size: 9.5pt; }
  h1 { font-size: 16pt; margin: 0 0 14px; }
  h2 { font-size: 14pt; margin: 18px 0 8px; }
  h3, h4 { font-size: 12pt; margin: 14px 0 6px; }
  p { margin: 0 0 8px; }
  ul { margin: 0 0 8px; padding-left: 20px; }
  footer { margin-top: 24px; border-top: 1px solid #d6dbd3; padding-top: 8px; color: #5b665f; font-size: 9pt; }
</style>
</head>
<body>
<header><div class="brand">Excredite Electricity Data Hub</div><div class="meta">AI Query answer · ${escapeHtml(date)}</div></header>
<h1>${escapeHtml(question)}</h1>
${markdownToHtml(answer)}
<footer>Answers are based on the Excredite Consulting Limited database.</footer>
</body>
</html>`;
}
