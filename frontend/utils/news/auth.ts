import { timingSafeEqual } from 'node:crypto';

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Always false if CRON_SECRET is unset or empty, so a missing secret can
 * never be matched by an empty or "undefined" bearer token.
 */
export function hasCronSecret(authorizationHeader: string | null, secret: string | undefined): boolean {
  if (!secret || !authorizationHeader?.startsWith('Bearer ')) return false;
  const given = Buffer.from(authorizationHeader.slice(7));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
