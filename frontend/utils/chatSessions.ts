/**
 * Saved AI conversations, kept in the browser's localStorage under
 * 'epdh_chat_sessions' (written by /query, listed by /history).
 */

export const SESSIONS_KEY = 'epdh_chat_sessions';

export type SessionMessage = { role: 'user' | 'assistant'; content: string };

export type ChatSession = {
  id: string;
  query: string; // first question
  timestamp: string; // human-readable, kept for older entries
  updatedAt?: string; // ISO 8601; added with the History redesign
  sessionLength: number;
  messages: SessionMessage[];
};

function safeParse(raw: string | null): unknown {
  try {
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/** Every saved session that has the expected shape (anything malformed is skipped). */
export function readSessions(storage: Pick<Storage, 'getItem'> = localStorage): ChatSession[] {
  const data = safeParse(storage.getItem(SESSIONS_KEY));
  if (!Array.isArray(data)) return [];
  return data
    .filter(
      (s): s is ChatSession =>
        !!s && typeof s === 'object' && 'id' in s && Array.isArray((s as ChatSession).messages) && typeof (s as ChatSession).query === 'string',
    )
    .map((s) => ({ ...s, id: String(s.id) }));
}

export function writeSessions(sessions: ChatSession[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/**
 * When a session was last active, in ms. Uses updatedAt, else the readable
 * timestamp, else the start time encoded in ids like "session_1763290000000".
 */
export function sessionTime(s: ChatSession): number | null {
  for (const candidate of [s.updatedAt, s.timestamp]) {
    if (candidate) {
      const t = Date.parse(candidate);
      if (!Number.isNaN(t)) return t;
    }
  }
  const fromId = /^session_(\d{12,})$/.exec(s.id)?.[1];
  return fromId ? Number(fromId) : null;
}
