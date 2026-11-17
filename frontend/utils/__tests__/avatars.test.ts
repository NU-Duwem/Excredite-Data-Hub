import { describe, expect, it } from 'vitest';
import { avatarFileProblem, centreSquare, initialsOf, isOwnAvatarPath, newAvatarPath } from '../avatars';

const ID = '255b616b-1591-4b3b-bdb1-5692b3e60158';

describe('initialsOf', () => {
  it('uses first and last names, or an email', () => {
    expect(initialsOf('Phillip Ekpo')).toBe('PE');
    expect(initialsOf('Osefan Ada Anegbe')).toBe('OA');
    expect(initialsOf('duwem@excredite.ng')).toBe('DU');
    expect(initialsOf('eyo.ekpo@excredite.ng')).toBe('EE');
    expect(initialsOf('')).toBe('?');
    expect(initialsOf(null)).toBe('?');
  });
});

describe('avatarFileProblem', () => {
  it('accepts normal photos and refuses everything else', () => {
    expect(avatarFileProblem({ type: 'image/jpeg', size: 2_000_000 })).toBeNull();
    expect(avatarFileProblem({ type: 'image/webp', size: 10 })).toBeNull();
    expect(avatarFileProblem({ type: 'image/gif', size: 10 })).toMatch(/JPG, PNG or WebP/);
    expect(avatarFileProblem({ type: 'image/svg+xml', size: 10 })).toMatch(/JPG, PNG or WebP/);
    expect(avatarFileProblem({ type: 'image/png', size: 16 * 1024 * 1024 })).toMatch(/15 MB/);
    expect(avatarFileProblem({ type: 'image/png', size: 0 })).toMatch(/empty/);
  });
});

describe('paths', () => {
  it('stores pictures in the owner’s folder with a fresh name', () => {
    expect(newAvatarPath(ID, 'image/webp', 1700)).toBe(`${ID}/1700.webp`);
    expect(newAvatarPath(ID, 'image/jpeg', 1700)).toBe(`${ID}/1700.jpg`);
    expect(newAvatarPath(ID, 'image/png', 1700)).toBe(`${ID}/1700.png`);
  });

  it('only treats paths in the person’s own folder as theirs', () => {
    expect(isOwnAvatarPath(ID, `${ID}/1700.webp`)).toBe(true);
    expect(isOwnAvatarPath(ID, `other-user/1700.webp`)).toBe(false);
    expect(isOwnAvatarPath(ID, `${ID}/../other/x.webp`)).toBe(false);
    expect(isOwnAvatarPath(ID, `${ID}x/1.webp`)).toBe(false);
    expect(isOwnAvatarPath(ID, null)).toBe(false);
    expect(isOwnAvatarPath(ID, `${ID}/${'a'.repeat(300)}`)).toBe(false);
  });
});

describe('centreSquare', () => {
  it('crops the middle of wide and tall pictures', () => {
    expect(centreSquare(400, 300)).toEqual({ sx: 50, sy: 0, side: 300 });
    expect(centreSquare(300, 500)).toEqual({ sx: 0, sy: 100, side: 300 });
    expect(centreSquare(256, 256)).toEqual({ sx: 0, sy: 0, side: 256 });
  });
});
