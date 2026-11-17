'use client';

import { useId, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import Avatar from './Avatar';
import { ACCEPTED_TYPES, AVATAR_BUCKET, announceProfileChanged, avatarFileProblem, newAvatarPath, squareAvatar } from '@/utils/avatars';

type Props = {
  userId: string;
  name: string | null | undefined;
  path: string | null | undefined;
  /** "self": your own picture (saved directly). "admin": an admin changing someone else's (saved by the server). */
  mode: 'self' | 'admin';
  onChange: (path: string | null) => void;
};

type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null;

async function saveForAdmin(userId: string, path: string | null) {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'set-avatar', targetUserId: userId, value: path }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not save the picture.');
}

/** Upload, replace or remove a profile picture. */
export default function AvatarEditor({ userId, name, path, mode, onChange }: Props) {
  const supabase = createClient();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const save = async (next: string | null) => {
    if (mode === 'admin') return saveForAdmin(userId, next);
    const { error } = await supabase
      .from('user_profiles')
      .update({ avatar_path: next, updated_at: new Date().toISOString() })
      .eq('id', userId);
    if (error) throw new Error(error.message);
  };

  const removeFile = async (old: string | null | undefined) => {
    if (old) await supabase.storage.from(AVATAR_BUCKET).remove([old]); // best effort
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    const problem = avatarFileProblem(file);
    if (problem) return setStatus({ kind: 'error', text: problem });
    setBusy(true);
    setStatus({ kind: 'info', text: 'Preparing the picture…' });
    try {
      const blob = await squareAvatar(file);
      const nextPath = newAvatarPath(userId, blob.type);
      setStatus({ kind: 'info', text: 'Uploading…' });
      const { error: upErr } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(nextPath, blob, { contentType: blob.type, upsert: false, cacheControl: '31536000' });
      if (upErr) throw new Error(upErr.message);
      try {
        await save(nextPath);
      } catch (e) {
        await removeFile(nextPath);
        throw e;
      }
      await removeFile(path);
      onChange(nextPath);
      announceProfileChanged();
      setStatus({ kind: 'ok', text: 'Picture saved.' });
    } catch (e) {
      setStatus({ kind: 'error', text: `Could not save the picture: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (!path) return;
    setBusy(true);
    setStatus({ kind: 'info', text: 'Removing…' });
    try {
      await save(null);
      await removeFile(path);
      onChange(null);
      announceProfileChanged();
      setStatus({ kind: 'ok', text: 'Picture removed.' });
    } catch (e) {
      setStatus({ kind: 'error', text: `Could not remove the picture: ${(e as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} path={path} size={72} />
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            disabled={busy}
            onChange={(e) => handleFile(e.target.files?.[0])}
          />
          <label
            htmlFor={inputId}
            aria-disabled={busy}
            className={`min-h-10 px-4 rounded-xl bg-brand text-white text-sm font-semibold flex items-center cursor-pointer hover:bg-brand-hover focus-within:ring-2 focus-within:ring-brand focus-within:ring-offset-2 ${busy ? 'opacity-50 pointer-events-none' : ''}`}
          >
            {path ? 'Change picture' : 'Upload picture'}
          </label>
          {path && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={busy}
              className="min-h-10 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>
        {mode === 'admin' && (
          <p className="text-xs text-gray-600">JPG, PNG or WebP. The picture is cropped to a square and shown to signed-in staff only.</p>
        )}
        <p role="status" aria-live="polite" className={`text-xs font-medium ${status?.kind === 'error' ? 'text-red-700' : status?.kind === 'ok' ? 'text-green-800' : 'text-gray-600'}`}>
          {status?.text ?? ''}
        </p>
      </div>
    </div>
  );
}
