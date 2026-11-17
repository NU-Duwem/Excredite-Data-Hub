'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { AVATAR_BUCKET, initialsOf } from '@/utils/avatars';

// The bucket is private, so pictures are shown through short-lived signed links.
// Links are shared between every Avatar on the page and renewed before they expire.
const LINK_SECONDS = 60 * 60;
const cache = new Map<string, { url: string; expires: number }>();
const pending = new Map<string, Promise<string | null>>();

async function signedUrl(path: string): Promise<string | null> {
  const hit = cache.get(path);
  if (hit && hit.expires > Date.now() + 60_000) return hit.url;
  const inFlight = pending.get(path);
  if (inFlight) return inFlight;
  const p = (async () => {
    const { data } = await createClient().storage.from(AVATAR_BUCKET).createSignedUrl(path, LINK_SECONDS);
    pending.delete(path);
    if (!data?.signedUrl) return null;
    cache.set(path, { url: data.signedUrl, expires: Date.now() + LINK_SECONDS * 1000 });
    return data.signedUrl;
  })();
  pending.set(path, p);
  return p;
}

type Props = {
  name: string | null | undefined;
  path?: string | null;
  /** Width and height in pixels. */
  size?: number;
  className?: string;
  /** Initials background and text colours, used when there's no picture. */
  tone?: string;
  /** Hide the picture and initials (e.g. the Admin Panel's "mask data"). */
  masked?: boolean;
};

/** A round profile picture, or the person's initials when there's none. Decorative: show the name next to it. */
export default function Avatar({ name, path, size = 36, className = '', tone = 'bg-accent text-brand', masked = false }: Props) {
  const [loaded, setLoaded] = useState<{ path: string; url: string | null } | null>(null);
  const [failedPath, setFailedPath] = useState<string | null>(null);

  useEffect(() => {
    if (!path || masked) return;
    let active = true;
    signedUrl(path).then((u) => active && setLoaded({ path, url: u }));
    return () => {
      active = false;
    };
  }, [path, masked]);

  const url = path && !masked && loaded?.path === path ? loaded.url : null;
  const failed = !!path && failedPath === path;

  const box = { width: size, height: size, minWidth: size, minHeight: size };
  if (url && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        aria-hidden="true"
        width={size}
        height={size}
        style={box}
        onError={() => setFailedPath(path ?? null)}
        className={`rounded-full object-cover bg-gray-100 shrink-0 ${className}`}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.36)) }}
      className={`rounded-full shrink-0 flex items-center justify-center font-extrabold leading-none ${tone} ${className}`}
    >
      {masked ? '?' : initialsOf(name)}
    </span>
  );
}
