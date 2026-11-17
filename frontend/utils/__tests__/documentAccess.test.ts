import { describe, expect, it, vi } from 'vitest';

// documentAccess imports the cookie-based server client; it isn't used by the function under test.
vi.mock('@/utils/supabase/server', () => ({ createClient: vi.fn() }));

const { canManageDocument } = await import('../documentAccess');

describe('canManageDocument', () => {
  const doc = { uploaded_by: 'Ada@Example.com' };

  it('lets admins manage any document', () => {
    expect(canManageDocument('power_admin', 'someone@example.com', doc)).toBe(true);
    expect(canManageDocument('power_admin', null, { uploaded_by: null })).toBe(true);
  });

  it('lets the uploader manage their own document, ignoring email case', () => {
    expect(canManageDocument('power_legal', 'ada@example.com', doc)).toBe(true);
  });

  it('refuses everyone else, including when the uploader is unknown', () => {
    expect(canManageDocument('power_legal', 'bola@example.com', doc)).toBe(false);
    expect(canManageDocument('power_ceo', 'ceo@example.com', doc)).toBe(false);
    expect(canManageDocument('power_legal', 'ada@example.com', { uploaded_by: null })).toBe(false);
    expect(canManageDocument(null, null, doc)).toBe(false);
  });
});
