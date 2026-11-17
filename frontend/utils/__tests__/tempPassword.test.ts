import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, temporaryPasswordProblem, unguessablePassword } from '../tempPassword';

describe('generateTemporaryPassword', () => {
  it('makes readable, unambiguous one-time passwords', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const p = generateTemporaryPassword();
      expect(p).toMatch(/^[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}-[a-zA-Z2-9]{4}$/);
      expect(p).not.toMatch(/[01OoIl]/);
      expect(temporaryPasswordProblem(p)).toBeNull();
      seen.add(p);
    }
    expect(seen.size).toBe(500);
  });
});

describe('temporaryPasswordProblem', () => {
  it('checks admin-typed passwords', () => {
    expect(temporaryPasswordProblem('short')).toMatch(/at least 10/);
    expect(temporaryPasswordProblem('x'.repeat(73))).toMatch(/at most 72/);
    expect(temporaryPasswordProblem(' spaced-out-pw')).toMatch(/space/);
    expect(temporaryPasswordProblem('Welcome-to-EPDH-2026')).toBeNull();
  });
});

describe('unguessablePassword', () => {
  it('is long and different every time', () => {
    const a = unguessablePassword();
    expect(a.length).toBeGreaterThanOrEqual(40);
    expect(unguessablePassword()).not.toBe(a);
  });
});
