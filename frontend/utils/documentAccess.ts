import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createClient as createSessionClient } from '@/utils/supabase/server';

/**
 * Document access for API routes.
 *
 * - Reading: any signed-in user can read every document that isn't
 *   restricted; restricted ones only admins and people granted access.
 *   This is enforced by the database (RLS on documents), so routes look a
 *   document up through the user's own session before using server rights
 *   (e.g. to sign a storage link).
 * - Managing (overwrite, delete, re-process): admins, or whoever uploaded it.
 */

export type SessionContext = { db: SupabaseClient; user: User | null };

export async function getSession(): Promise<SessionContext> {
  const db = (await createSessionClient()) as unknown as SupabaseClient;
  const {
    data: { user },
  } = await db.auth.getUser();
  return { db, user };
}

export async function getRole(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('user_profiles').select('role').eq('id', userId).maybeSingle();
  return (data?.role as string | undefined) ?? null;
}

export type VisibleDocument = {
  id: string;
  title: string;
  s3_key: string | null;
  uploaded_by: string | null;
  restricted: boolean;
};

/** The document if this user may see it, otherwise null (missing and hidden look the same). */
export async function findVisibleDocument(db: SupabaseClient, id: string): Promise<VisibleDocument | null> {
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await db.from('documents').select('id, title, s3_key, uploaded_by, restricted').eq('id', id).maybeSingle();
  return (data as VisibleDocument | null) ?? null;
}

/** Admins, or the person who uploaded the document (uploaded_by holds their email). */
export function canManageDocument(role: string | null, userEmail: string | null | undefined, doc: Pick<VisibleDocument, 'uploaded_by'>): boolean {
  if (role === 'power_admin') return true;
  return !!userEmail && !!doc.uploaded_by && doc.uploaded_by.toLowerCase() === userEmail.toLowerCase();
}
