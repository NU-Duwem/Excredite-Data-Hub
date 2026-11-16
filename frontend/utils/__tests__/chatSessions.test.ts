import { describe, expect, it } from 'vitest';
import { readSessions, SESSIONS_KEY, sessionTime, writeSessions, type ChatSession } from '../chatSessions';

const store = (initial?: string) => {
  const data = new Map<string, string>(initial === undefined ? [] : [[SESSIONS_KEY, initial]]);
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
};

const session = (over: Partial<ChatSession> = {}): ChatSession => ({
  id: 'session_1763290000000',
  query: 'What was Egbin capacity?',
  timestamp: 'Nov 16, 2026, 9:12 AM',
  sessionLength: 2,
  messages: [
    { role: 'user', content: 'What was Egbin capacity?' },
    { role: 'assistant', content: 'Answer' },
  ],
  ...over,
});

describe('readSessions', () => {
  it('returns [] for missing, empty, corrupt or non-array data', () => {
    expect(readSessions(store())).toEqual([]);
    expect(readSessions(store(''))).toEqual([]);
    expect(readSessions(store('{not json'))).toEqual([]);
    expect(readSessions(store('{"a":1}'))).toEqual([]);
  });

  it('skips malformed entries and stringifies numeric ids', () => {
    const raw = JSON.stringify([session(), { id: 2, query: 'q', messages: [], timestamp: '', sessionLength: 0 }, null, { id: 3 }, 'x']);
    const out = readSessions(store(raw));
    expect(out.map((s) => s.id)).toEqual(['session_1763290000000', '2']);
  });
});

describe('writeSessions', () => {
  it('round-trips', () => {
    const s = store();
    writeSessions([session()], s);
    expect(readSessions(s)).toEqual([session()]);
  });
});

describe('sessionTime', () => {
  it('prefers updatedAt', () => {
    expect(sessionTime(session({ updatedAt: '2026-11-16T09:12:00.000Z' }))).toBe(Date.parse('2026-11-16T09:12:00.000Z'));
  });
  it('falls back to the readable timestamp', () => {
    expect(sessionTime(session({ timestamp: '2026-11-15T08:00:00Z' }))).toBe(Date.parse('2026-11-15T08:00:00Z'));
  });
  it('falls back to the start time in the id', () => {
    expect(sessionTime(session({ timestamp: 'garbage' }))).toBe(1763290000000);
  });
  it('returns null when nothing is usable', () => {
    expect(sessionTime(session({ id: 'abc', timestamp: 'garbage' }))).toBeNull();
  });
});
