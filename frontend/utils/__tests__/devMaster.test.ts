import { describe, expect, it } from 'vitest';
import { devMasterPasswordEnabled, isDevMasterPassword } from '../devMaster';

const PW = 'dev-only-master-pw-123';

describe('development master password', () => {
  it('is on only in development, with a long enough password', () => {
    expect(devMasterPasswordEnabled({ NODE_ENV: 'development', DEV_MASTER_PASSWORD: PW })).toBe(true);
    expect(devMasterPasswordEnabled({ NODE_ENV: 'production', DEV_MASTER_PASSWORD: PW })).toBe(false);
    expect(devMasterPasswordEnabled({ NODE_ENV: 'development', DEV_MASTER_PASSWORD: PW, VERCEL: '1' })).toBe(false);
    expect(devMasterPasswordEnabled({ NODE_ENV: 'development', DEV_MASTER_PASSWORD: PW, VERCEL_ENV: 'preview' })).toBe(false);
    expect(devMasterPasswordEnabled({ NODE_ENV: 'development', DEV_MASTER_PASSWORD: 'short' })).toBe(false);
    expect(devMasterPasswordEnabled({ NODE_ENV: 'development' })).toBe(false);
  });

  it('matches only the exact password, and never in production', () => {
    const dev = { NODE_ENV: 'development', DEV_MASTER_PASSWORD: PW };
    expect(isDevMasterPassword(PW, dev)).toBe(true);
    expect(isDevMasterPassword(PW + ' ', dev)).toBe(false);
    expect(isDevMasterPassword('', dev)).toBe(false);
    expect(isDevMasterPassword(PW, { NODE_ENV: 'production', DEV_MASTER_PASSWORD: PW })).toBe(false);
  });
});
