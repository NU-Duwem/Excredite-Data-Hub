import { describe, expect, it } from 'vitest';
import { friendlyAuthError, safeNextPath } from '../authRedirect';

describe('safeNextPath', () => {
  it('keeps paths on this site', () => {
    expect(safeNextPath('/documents')).toBe('/documents');
    expect(safeNextPath('/matters?job=5')).toBe('/matters?job=5');
  });

  it('refuses other sites and loops', () => {
    expect(safeNextPath('https://evil.example')).toBe('/query');
    expect(safeNextPath('//evil.example')).toBe('/query');
    expect(safeNextPath('/\\evil.example')).toBe('/query');
    expect(safeNextPath('/login')).toBe('/query');
    expect(safeNextPath('/auth/callback')).toBe('/query');
    expect(safeNextPath('/x\r\nSet-Cookie: a=b')).toBe('/query');
    expect(safeNextPath(null)).toBe('/query');
    expect(safeNextPath('', '/')).toBe('/');
  });
});

describe('friendlyAuthError', () => {
  it('explains the usual problems in plain English', () => {
    expect(friendlyAuthError('Database error saving new user')).toMatch(/Only @excredite\.ng/);
    expect(friendlyAuthError('Signups not allowed for this instance')).toMatch(/not been set up in EPDH/);
    expect(friendlyAuthError('User is banned')).toMatch(/deactivated/);
    expect(friendlyAuthError('access_denied')).toMatch(/cancelled/);
    expect(friendlyAuthError('invalid flow state, no valid flow state found')).toMatch(/expired/);
    expect(friendlyAuthError('Unsupported provider: provider is not enabled')).toMatch(/not switched on/);
    expect(friendlyAuthError('Error getting user email from external provider: unverified email')).toMatch(/did not confirm/);
    expect(friendlyAuthError(null)).toMatch(/did not finish/);
    expect(friendlyAuthError('something odd')).toMatch(/try again/);
  });
});
