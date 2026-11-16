'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { readSessions, sessionTime, writeSessions, type ChatSession } from '@/utils/chatSessions';
import { groupByDay } from '@/utils/news/feedView';

type Range = 'all' | '7d' | '30d';

const RANGES: { value: Range; label: string; days: number | null }[] = [
  { value: 'all', label: 'Any time', days: null },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
];

type Row = ChatSession & { published_at: string | null; time: number | null };

function clock(t: number | null) {
  return t === null ? '' : new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [search, setSearch] = useState('');
  const [range, setRange] = useState<Range>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [now, setNow] = useState(0); // set on load, so filtering stays pure during render

  // localStorage is only available in the browser.
  useEffect(() => {
    const id = window.setTimeout(() => {
      setSessions(readSessions());
      setNow(Date.now());
      setLoaded(true);
    }, 0);
    return () => window.clearTimeout(id);
  }, []);

  const rows: Row[] = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days ?? null;
    const cutoff = days === null ? null : now - days * 86_400_000;
    const q = search.trim().toLowerCase();
    return sessions
      .map((s) => {
        const time = sessionTime(s);
        return { ...s, time, published_at: time === null ? null : new Date(time).toISOString() };
      })
      .filter((s) => cutoff === null || (s.time !== null && s.time >= cutoff))
      .filter((s) => !q || s.query.toLowerCase().includes(q) || s.messages.some((m) => m.content.toLowerCase().includes(q)))
      .sort((a, b) => (b.time ?? 0) - (a.time ?? 0));
  }, [sessions, search, range, now]);

  const groups = groupByDay(rows, new Date(now || 0));
  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const deleteSelected = () => {
    if (!selected) return;
    const remaining = readSessions().filter((s) => s.id !== selected.id);
    writeSessions(remaining);
    setSessions(remaining);
    setSelectedId(null);
    setConfirmDelete(false);
  };

  const select = (id: string) => {
    setSelectedId(id);
    setConfirmDelete(false);
  };

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto flex-1 min-h-0 flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="mr-2 text-2xl font-extrabold tracking-tight text-gray-900">Conversation History</h1>
          <label htmlFor="history-search" className="sr-only">
            Search conversations
          </label>
          <input
            id="history-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions and answers…"
            className="flex-1 min-w-[180px] min-h-11 rounded-xl border border-gray-200 bg-white px-3.5 text-sm outline-none focus:ring-2 focus:ring-brand"
          />
          <label htmlFor="history-range" className="sr-only">
            Time range
          </label>
          <select
            id="history-range"
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-[13px] outline-none focus:ring-2 focus:ring-brand"
          >
            {RANGES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <Link
            href="/query"
            className="min-h-11 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover inline-flex items-center"
          >
            New conversation
          </Link>
        </header>

        <p className="text-xs text-gray-600 -mt-2">Conversations are saved in this browser only.</p>

        <div className="flex-1 min-h-0 flex gap-4 items-stretch">
          {/* List */}
          <section
            aria-label="Conversations"
            className={`scroll-panel relative bg-white rounded-2xl p-3 w-full md:w-[360px] md:shrink-0 ${selected ? 'hidden md:block' : 'block'}`}
          >
            {!loaded ? null : rows.length === 0 ? (
              <div className="p-8 text-center space-y-2">
                <p className="text-sm font-semibold text-gray-900">
                  {sessions.length === 0 ? 'No saved conversations yet.' : 'No conversations match.'}
                </p>
                <p className="text-sm text-gray-600">
                  {sessions.length === 0 ? 'Questions you ask in AI Query are saved here automatically.' : 'Try another search or time range.'}
                </p>
              </div>
            ) : (
              groups.map((g) => (
                <div key={g.key} className="mb-2">
                  <h2 className="px-2.5 pt-2 pb-1.5 text-[11px] font-extrabold tracking-wider uppercase text-gray-600">{g.label}</h2>
                  <ul className="flex flex-col gap-0.5">
                    {g.items.map((s) => {
                      const active = s.id === selectedId;
                      return (
                        <li key={s.id}>
                          <button
                            type="button"
                            onClick={() => select(s.id)}
                            aria-current={active ? 'true' : undefined}
                            className={`w-full text-left rounded-xl px-3 py-2.5 flex flex-col gap-0.5 transition-colors ${
                              active ? 'bg-brand/10' : 'hover:bg-gray-50'
                            }`}
                          >
                            <span className={`text-sm leading-snug line-clamp-2 ${active ? 'font-bold text-brand' : 'font-semibold text-gray-900'}`}>
                              {s.query}
                            </span>
                            <span className="text-xs text-gray-600">
                              {clock(s.time)}
                              {s.time !== null && ' · '}
                              {s.sessionLength} message{s.sessionLength === 1 ? '' : 's'}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>

          {/* Detail */}
          <section
            aria-label="Conversation"
            className={`flex-1 min-w-0 bg-white rounded-2xl flex-col ${selected ? 'flex' : 'hidden md:flex'}`}
          >
            {selected ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3 p-5 border-b border-gray-100">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelectedId(null)}
                      className="md:hidden mb-2 min-h-9 text-sm font-semibold text-brand"
                    >
                      ← All conversations
                    </button>
                    <h2 className="text-lg font-extrabold text-gray-900 leading-snug">{selected.query}</h2>
                    <p className="mt-1 text-sm text-gray-600">
                      {selected.time !== null &&
                        new Date(selected.time).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) + ' · '}
                      {selected.sessionLength} message{selected.sessionLength === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {confirmDelete ? (
                      <>
                        <button
                          type="button"
                          onClick={deleteSelected}
                          className="min-h-10 px-3.5 rounded-xl bg-red-700 text-white text-sm font-semibold"
                        >
                          Delete for good
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(false)}
                          className="min-h-10 px-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(true)}
                        className="min-h-10 px-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-red-700 hover:bg-red-50"
                      >
                        Delete
                      </button>
                    )}
                    <Link
                      href={`/query?session=${encodeURIComponent(selected.id)}`}
                      className="min-h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover inline-flex items-center"
                    >
                      Continue conversation
                    </Link>
                  </div>
                </div>
                <div className="scroll-panel relative flex-1 min-h-0 p-5 flex flex-col gap-3.5">
                  {selected.messages.map((m, i) => (
                    <div
                      key={i}
                      className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shrink-0 ${
                        m.role === 'user'
                          ? 'self-end bg-brand text-white rounded-2xl rounded-br-md'
                          : 'self-start bg-gray-50 text-gray-900 rounded-2xl rounded-bl-md'
                      }`}
                    >
                      {m.content}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center p-10 text-center">
                <p className="text-sm text-gray-600">Select a conversation to read it here.</p>
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
