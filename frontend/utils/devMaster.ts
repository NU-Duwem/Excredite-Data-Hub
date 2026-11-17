import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * ⚠️ DEVELOPMENT ONLY: a master password that signs in as any listed staff account.
 *
 * It's on only when BOTH are true:
 *   - the app runs with `npm run dev` (NODE_ENV is not "production"), and
 *   - DEV_MASTER_PASSWORD (at least 16 characters) is set in frontend/.env.local.
 *
 * Any production build or deployment ignores it, and `next build` / `next start`
 * refuse to run while it's set (see next.config.ts), so it can't be deployed by accident.
 * REMOVE DEV_MASTER_PASSWORD (and this feature) BEFORE DEPLOYMENT.
 */
export const DEV_MASTER_MIN_LENGTH = 16;

type Env = Record<string, string | undefined>;

export function devMasterPasswordEnabled(env: Env = process.env): boolean {
  if (env.NODE_ENV === 'production') return false;
  if (env.VERCEL || env.VERCEL_ENV) return false; // never on a hosted deployment
  return (env.DEV_MASTER_PASSWORD ?? '').length >= DEV_MASTER_MIN_LENGTH;
}

/** Constant-time comparison, so response time doesn't leak how much matched. */
export function isDevMasterPassword(input: string, env: Env = process.env): boolean {
  if (!devMasterPasswordEnabled(env)) return false;
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(env.DEV_MASTER_PASSWORD ?? '').digest();
  return timingSafeEqual(a, b);
}
