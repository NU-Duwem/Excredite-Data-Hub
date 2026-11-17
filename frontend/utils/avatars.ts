/**
 * Profile pictures: stored in the private "avatars" bucket at <user id>/<time>.<ext>
 * (see 17_profile_pictures_and_company_accounts.sql). Pictures are cropped to a
 * square and shrunk to 256×256 in the browser before upload.
 */

export const AVATAR_BUCKET = 'avatars';
export const AVATAR_SIZE = 256;
/** Largest file we accept from the picker, before shrinking. */
export const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Up to two initials from a name or email, for when there's no picture. */
export function initialsOf(nameOrEmail: string | null | undefined): string {
  const base = (nameOrEmail ?? '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const letters = parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0];
  return letters.toUpperCase();
}

/** A reason the file can't be used, or null if it's fine. */
export function avatarFileProblem(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_TYPES as readonly string[]).includes(file.type)) return 'Choose a JPG, PNG or WebP picture.';
  if (file.size > MAX_SOURCE_BYTES) return 'That picture is over 15 MB. Choose a smaller one.';
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Where a new picture for this user is stored. A new name each time, so browsers never show an old copy. */
export function newAvatarPath(userId: string, mimeType: string, now = Date.now()): string {
  const ext = mimeType === 'image/webp' ? 'webp' : mimeType === 'image/png' ? 'png' : 'jpg';
  return `${userId}/${now}.${ext}`;
}

/** True when the path belongs to this user's folder (the database enforces the same rule). */
export function isOwnAvatarPath(userId: string, path: string | null | undefined): path is string {
  return !!path && path.startsWith(`${userId}/`) && !path.includes('..') && path.length <= 200;
}

/** The centred square to crop from a picture of this size. */
export function centreSquare(width: number, height: number) {
  const side = Math.min(width, height);
  return { sx: Math.round((width - side) / 2), sy: Math.round((height - side) / 2), side };
}

/** Browser only: crop to a centred square and shrink to 256×256. WebP where supported, otherwise JPEG. */
export async function squareAvatar(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const { sx, sy, side } = centreSquare(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot resize pictures.');
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#ffffff'; // transparent PNGs get a white background
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    const toBlob = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.88));
    const webp = await toBlob('image/webp');
    if (webp && webp.type === 'image/webp') return webp;
    const jpeg = await toBlob('image/jpeg');
    if (!jpeg) throw new Error('Could not prepare the picture.');
    return jpeg;
  } finally {
    bitmap.close();
  }
}

/** Tells the sidebar and other open views that a profile changed. */
export const PROFILE_CHANGED_EVENT = 'epdh:profile-changed';
export function announceProfileChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_CHANGED_EVENT));
}
