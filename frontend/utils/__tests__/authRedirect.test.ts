import { describe, expect, it } from 'vitest';
import { friendlyAuthError, isCompanyEmail, safeNextPath } from '../authRedirect';

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

describe('isCompanyEmail', () => {
  it('accepts only @excredite.ng addresses', () => {
    expect(isCompanyEmail('taiwo@excredite.ng')).toBe(true);
    expect(isCompanyEmail(' Taiwo@Excredite.NG ')).toBe(true);
    expect(isCompanyEmail('taiwo@gmail.com')).toBe(false);
    expect(isCompanyEmail('taiwo@excredite.ng.evil.com')).toBe(false);
    expect(isCompanyEmail('taiwo@mail.excredite.ng')).toBe(false);
    expect(isCompanyEmail('')).toBe(false);
    expect(isCompanyEmail(null)).toBe(false);
  });
});

describe('friendlyAuthError', () => {
  it('explains the usual problems in plain English, without naming Microsoft', () => {
    const noAccess = /does not have access to EPDH/;
    expect(friendlyAuthError('Database error saving new user')).toMatch(noAccess);
    expect(friendlyAuthError('This email address does not have access to EPDH.')).toMatch(noAccess);
    expect(friendlyAuthError('Signups not allowed for this instance')).toMatch(noAccess);
    expect(friendlyAuthError('AADSTS50020: User account from identity provider does not exist in tenant')).toMatch(noAccess);
    expect(friendlyAuthError('User is banned')).toMatch(/deactivated/);
    expect(friendlyAuthError('access_denied')).toMatch(/cancelled/);
    expect(friendlyAuthError('invalid flow state, no valid flow state found')).toMatch(/expired/);
    expect(friendlyAuthError('Unsupported provider: provider is not enabled')).toMatch(/not switched on/);
    expect(friendlyAuthError('Error getting user email from external provider: unverified email')).toMatch(/could not be confirmed/);
    expect(friendlyAuthError(null)).toMatch(/did not finish/);
    expect(friendlyAuthError('something odd')).toMatch(/try again/);
    for (const m of ['Database error saving new user', 'access_denied', 'User is banned', 'odd', null]) {
      expect(friendlyAuthError(m)).not.toMatch(/Microsoft/);
    }
  });
});
