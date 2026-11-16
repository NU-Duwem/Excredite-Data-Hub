'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { readSessions, writeSessions, type ChatSession } from '@/utils/chatSessions';
import { answerDocument, answerPlainText, buildTurns, type QueryMessage } from '@/utils/queryTurns';

const initialMessage: QueryMessage = {
  id: 1,
  role: 'assistant',
  content: 'Hello. I am the Excredite Electricity Data Hub AI. How can I assist you with power sector analytics today?',
};

const STARTERS = [
  { topic: 'Generation', text: "What was Egbin's available capacity on 01/05/2024?" },
  { topic: 'News', text: 'Summarise the most important electricity news from this week.' },
  { topic: 'Legal', text: 'Which legal matters are still open, and what are their next deadlines?' },
  { topic: 'Documents', text: 'Generate a one-page brief on grid performance last month.' },
];

const SHORTCUTS = [
  { href: '/documents?tab=upload', label: 'Upload document' },
  { href: '/documents?tab=view-document', label: 'Library' },
  { href: '/documents?tab=document-generator', label: 'Document Generator' },
  { href: '/matters', label: 'Legal Matters' },
  { href: '/news', label: 'News' },
];

function parseInlineMarkdown(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-bold text-gray-900">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function renderMarkdown(content: string) {
  return content.split('\n').map((line, idx) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('### ')) {
      return <h4 key={idx} className="text-base font-bold text-gray-900 mt-4 mb-2 first:mt-0">{parseInlineMarkdown(trimmed.slice(4))}</h4>;
    }
    if (trimmed.startsWith('## ')) {
      return <h4 key={idx} className="text-[17px] font-bold text-gray-900 mt-5 mb-2 first:mt-0">{parseInlineMarkdown(trimmed.slice(3))}</h4>;
    }
    if (trimmed.startsWith('# ')) {
      return <h3 key={idx} className="text-lg font-extrabold text-gray-900 mt-5 mb-3 first:mt-0">{parseInlineMarkdown(trimmed.slice(2))}</h3>;
    }
    if (trimmed.startsWith('- ')) {
      return <li key={idx} className="ml-5 list-disc text-[15px] leading-relaxed mb-1">{parseInlineMarkdown(trimmed.slice(2))}</li>;
    }
    if (trimmed === '') return <div key={idx} className="h-2" />;
    return <p key={idx} className="text-[15px] leading-relaxed mb-2 last:mb-0">{parseInlineMarkdown(line)}</p>;
  });
}

/** Prints one answer through a hidden iframe; the browser's print dialog offers "Save as PDF". */
function printAnswer(question: string, answer: string) {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  frame.srcdoc = answerDocument(question, answer, new Date());
  frame.onload = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    window.setTimeout(() => frame.remove(), 60_000);
  };
  document.body.appendChild(frame);
}

/** Unique id for a new message (time-based, so it can't clash with ids of reopened sessions). */
let lastMessageId = 0;
function newMessageId() {
  lastMessageId = Math.max(lastMessageId + 1, Date.now());
  return lastMessageId;
}

const actionBtn =
  'min-h-9 px-3 rounded-[10px] border border-gray-200 bg-white text-[13px] font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1.5';

export default function QueryPage() {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [messages, setMessages] = useState<QueryMessage[]>([initialMessage]);
  const [sessionId, setSessionId] = useState<string>(() => `session_${Date.now()}`);
  // Which question produced a document, so its card can link to the Generator.
  const [docNotification, setDocNotification] = useState<{ questionId: number; title: string } | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Accept a question handed over from the Overview page (/query?q=...): fill the box
  // through the DOM and submit it the same way a user would, exactly once.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get('q');
    const el = textareaRef.current;
    if (!q || !q.trim() || !el) return;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setValue?.call(el, q);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    const id = window.setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      formRef.current?.requestSubmit();
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Reopen a saved conversation handed over from History (/query?session=<id>).
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('session');
    if (!wanted) return;
    const id = window.setTimeout(() => {
      window.history.replaceState(null, '', window.location.pathname);
      const saved = readSessions().find((s) => s.id === wanted);
      if (!saved || saved.messages.length === 0) return;
      setSessionId(saved.id);
      setMessages(saved.messages.map((m, i) => ({ id: i + 1, role: m.role, content: m.content })));
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  // Persist the live conversation to localStorage (listed by Conversation History).
  useEffect(() => {
    if (messages.length <= 1) return;
    try {
      const now = new Date();
      const userQuery = messages.find((m) => m.role === 'user')?.content || 'AI Query Session';
      const currentSession: ChatSession = {
        id: sessionId,
        query: userQuery,
        timestamp: now.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
        updatedAt: now.toISOString(),
        sessionLength: messages.length,
        messages: messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      };
      writeSessions([currentSession, ...readSessions().filter((s) => s.id !== sessionId)]);
    } catch (err) {
      console.error('Error saving chat history session:', err);
    }
  }, [messages, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, isSubmitting, docNotification]);

  const ask = async (text: string) => {
    const userQuery = text.trim();
    if (!userQuery || isSubmitting) return;

    const userMessage: QueryMessage = { id: newMessageId(), role: 'user', content: userQuery };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setQuery('');
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: newMessageId(), role: 'assistant', content: data.error || 'An error occurred while connecting to the AI service.' },
        ]);
      } else {
        setMessages((prev) => [...prev, { id: newMessageId(), role: 'assistant', content: data.content }]);
        // If the question asks for a document or report, offer the Generator (the chat itself doesn't create files).
        if (/generate|document|report|create/i.test(userQuery)) {
          setDocNotification({ questionId: userMessage.id, title: userQuery });
        }
      }
    } catch {
      setMessages((prev) => [...prev, { id: newMessageId(), role: 'assistant', content: 'Failed to connect to the server.' }]);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void ask(query);
  };

  const handleNewConversation = () => {
    setQuery('');
    setIsSubmitting(false);
    setSessionId(`session_${Date.now()}`);
    setMessages([{ ...initialMessage }]);
    setDocNotification(null);
    textareaRef.current?.focus();
  };

  const copyAnswer = async (id: number, question: string, answer: string) => {
    try {
      await navigator.clipboard.writeText(answerPlainText(question, answer));
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  const turns = buildTurns(messages);
  const title = turns[0]?.question.content;

  return (
    <main className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="scroll-panel relative flex-1 min-h-0 px-4 sm:px-6 pt-4 sm:pt-6">
        <div className="max-w-[860px] mx-auto flex flex-col gap-4 pb-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">AI Query</h1>
              <p className="mt-0.5 text-[13px] text-gray-600 truncate max-w-[60ch]">
                {title
                  ? `${title} · ${turns.length} question${turns.length === 1 ? '' : 's'}`
                  : 'Ask questions and analyse power sector data.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/history"
                className="min-h-[42px] px-3.5 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-900 hover:bg-gray-50 inline-flex items-center"
              >
                History
              </Link>
              <button
                type="button"
                onClick={handleNewConversation}
                className="min-h-[42px] px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover"
              >
                New conversation
              </button>
            </div>
          </header>

          {turns.length === 0 ? (
            <section aria-labelledby="start-heading" className="bg-white rounded-2xl p-6 sm:p-8">
              <h2 id="start-heading" className="text-lg font-extrabold text-gray-900">What do you need to know?</h2>
              <p className="mt-1 text-sm text-gray-600">{initialMessage.content}</p>
              <p className="mt-5 mb-2 text-[11px] font-extrabold tracking-wider uppercase text-gray-600">Try one of these</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {STARTERS.map((s) => (
                  <li key={s.text}>
                    <button
                      type="button"
                      onClick={() => void ask(s.text)}
                      className="w-full h-full text-left rounded-xl border border-gray-200 bg-gray-50 hover:bg-brand/5 hover:border-brand/30 px-4 py-3 transition-colors"
                    >
                      <span className="block text-[11px] font-bold uppercase tracking-wider text-accent-ink">{s.topic}</span>
                      <span className="block mt-0.5 text-sm font-semibold text-gray-900 leading-snug">{s.text}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <ol className="flex flex-col gap-4" aria-label="Questions and answers">
              {turns.map((t) => {
                const latest = t.index === turns.length && turns.length > 1;
                const waiting = !t.answer && isSubmitting && t.index === turns.length;
                const doc = docNotification?.questionId === t.question.id ? docNotification : null;
                return (
                  <li
                    key={t.question.id}
                    className={`bg-white rounded-2xl overflow-hidden ${latest ? 'ring-2 ring-accent' : ''}`}
                  >
                    <div className="px-5 sm:px-6 pt-5 flex items-baseline gap-3">
                      <span className="font-mono text-xs font-medium text-gray-600 shrink-0">Q{t.index}</span>
                      <h2 className="text-[17px] sm:text-lg font-bold text-gray-900 leading-snug whitespace-pre-wrap break-words min-w-0">
                        {t.question.content}
                      </h2>
                    </div>

                    <div className="px-5 sm:px-6 sm:pl-[52px] pt-3 pb-5 text-gray-800">
                      {t.answer ? (
                        <div>{renderMarkdown(t.answer.content)}</div>
                      ) : waiting ? (
                        <div className="flex items-center gap-2" role="status">
                          <span className="w-2 h-2 bg-brand rounded-full animate-bounce" />
                          <span className="w-2 h-2 bg-brand rounded-full animate-bounce [animation-delay:0.2s]" />
                          <span className="w-2 h-2 bg-brand rounded-full animate-bounce [animation-delay:0.4s]" />
                          <span className="ml-1 text-sm text-gray-600 font-medium">Querying database…</span>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-600">No answer was saved for this question.</p>
                      )}

                      {doc && (
                        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3">
                          <span
                            aria-hidden="true"
                            className="w-10 h-12 rounded-lg bg-white border border-accent/40 flex items-center justify-center text-[10px] font-bold text-accent-ink"
                          >
                            DOC
                          </span>
                          <div className="flex-1 min-w-[180px]">
                            <p className="text-sm font-bold text-gray-900">Make this a document</p>
                            <p className="text-xs text-accent-ink">Opens the Document Generator with this request as the title.</p>
                          </div>
                          <Link
                            href={`/documents?tab=document-generator&title=${encodeURIComponent(doc.title.slice(0, 120))}`}
                            className="min-h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover inline-flex items-center"
                          >
                            Open Generator
                          </Link>
                        </div>
                      )}
                    </div>

                    {t.answer && (
                      <footer className="flex flex-wrap gap-1.5 px-5 sm:px-6 sm:pl-[52px] py-3 border-t border-gray-100 bg-gray-50/60">
                        <button
                          type="button"
                          onClick={() => void copyAnswer(t.question.id, t.question.content, t.answer!.content)}
                          className={actionBtn}
                        >
                          <span aria-live="polite">{copiedId === t.question.id ? 'Copied' : 'Copy'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => printAnswer(t.question.content, t.answer!.content)}
                          className={actionBtn}
                        >
                          Download PDF
                        </button>
                        <Link
                          href={`/documents?tab=document-generator&title=${encodeURIComponent(t.question.content.slice(0, 120))}`}
                          className={actionBtn}
                        >
                          Turn into document
                        </Link>
                      </footer>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="px-4 sm:px-6 pb-4 sm:pb-6 pt-2">
        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="max-w-[860px] mx-auto bg-white rounded-2xl p-3 shadow-[0_10px_30px_rgba(10,58,34,0.12)] flex flex-col gap-2"
        >
          <div className="flex items-end gap-2">
            <label htmlFor="query-input" className="sr-only">
              {turns.length ? 'Ask a follow-up' : 'Ask a question'}
            </label>
            <textarea
              id="query-input"
              ref={textareaRef}
              rows={2}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void ask(query);
                }
              }}
              placeholder={turns.length ? 'Ask a follow-up, or describe a document to generate…' : 'Ask about plants, tariffs, matters or news…'}
              className="flex-1 resize-none border-0 bg-transparent px-2.5 py-2 text-[15px] leading-relaxed text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-0 max-h-40"
              disabled={isSubmitting}
            />
            <button
              type="submit"
              disabled={!query.trim() || isSubmitting}
              className="min-h-11 px-5 rounded-xl bg-accent text-gray-900 text-sm font-bold hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Ask
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-0.5 text-xs">
            {SHORTCUTS.map((s) => (
              <Link key={s.href} href={s.href} className="font-semibold text-brand hover:underline">
                {s.label}
              </Link>
            ))}
            <span className="sm:ml-auto text-gray-600">Answers come from the Excredite Consulting database.</span>
          </div>
        </form>
      </div>
    </main>
  );
}
