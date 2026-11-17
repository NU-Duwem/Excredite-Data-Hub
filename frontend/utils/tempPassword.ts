import { randomInt, randomBytes } from 'node:crypto';

/**
 * One-time temporary passwords for a person's first sign-in
 * (see 19_temporary_passwords.sql). Server only.
 */

/** Letters and digits that can't be mistaken for each other when read aloud or copied (no 0/O, 1/l/I). */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** How long a new temporary password works, in hours. */
export const TEMP_PASSWORD_HOURS = 72;
export const TEMP_PASSWORD_MIN_LENGTH = 10;

/** e.g. "kfx7-Qm3r-Tb9w": 12 random characters (about 69 bits), easy to read out. */
export function generateTemporaryPassword(): string {
  const groups: string[] = [];
  for (let g = 0; g < 3; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(s);
  }
  return groups.join('-');
}

/** A reason an admin-typed temporary password can't be used, or null. */
export function temporaryPasswordProblem(password: string): string | null {
  if (password.length < TEMP_PASSWORD_MIN_LENGTH) return `A temporary password must be at least ${TEMP_PASSWORD_MIN_LENGTH} characters.`;
  if (password.length > 72) return 'A temporary password must be at most 72 characters.';
  if (/^\s|\s$/.test(password)) return 'A temporary password can’t start or end with a space.';
  return null;
}

/**
 * A long random password nobody knows, for the person's Supabase sign-in record.
 * People never use it: they sign in with their work email, or once with a temporary password.
 */
export function unguessablePassword(): string {
  return randomBytes(32).toString('base64url');
}
