'use client';

import { useEffect, useRef, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

type Person = { id: string; name: string; email: string | null; role: string | null };
type Grant = { user_id: string; granted_at: string | null };

/**
 * Admin-only: who can open a document.
 * - Not restricted (default): every signed-in user.
 * - Restricted: only admins and the people listed here (document_user_access).
 * The database enforces this (RLS); this dialog only edits the settings.
 */
export default function AccessDialog({
  supabase,
  doc,
  me,
  onClose,
  onSaved,
}: {
  supabase: SupabaseClient;
  doc: { id: string; title: string; restricted?: boolean };
  me: string | null;
  onClose: () => void;
  onSaved: (restricted: boolean) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [restricted, setRestricted] = useState(!!doc.restricted);
  const [people, setPeople] = useState<Person[]>([]);
  const [grants, setGrants] = useState<Grant[]>([]);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      supabase.from('user_profiles').select('id, full_name, email, role, is_active').eq('is_active', true).order('full_name'),
      supabase.from('document_user_access').select('user_id, granted_at').eq('document_id', doc.id),
    ]).then(([p, g]) => {
      if (!live) return;
      if (p.error || g.error) setError(`Couldn’t load access settings: ${(p.error ?? g.error)?.message}`);
      setPeople(((p.data ?? []) as { id: string; full_name: string | null; email: string | null; role: string | null }[]).map((x) => ({ id: x.id, name: x.full_name || x.email || 'Unnamed user', email: x.email, role: x.role })));
      setGrants((g.data ?? []) as Grant[]);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [supabase, doc.id]);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Former member';
  const grantable = people.filter((p) => p.role !== 'power_admin' && !grants.some((g) => g.user_id === p.id));

  const addGrant = async () => {
    if (!adding) return;
    setBusy(true);
    setError('');
    const { error: e } = await supabase.from('document_user_access').insert({ document_id: doc.id, user_id: adding, granted_by: me });
    setBusy(false);
    if (e) return setError(`Couldn’t give access: ${e.message}`);
    setGrants((g) => [...g, { user_id: adding, granted_at: new Date().toISOString() }]);
    setAdding('');
  };

  const removeGrant = async (userId: string) => {
    setBusy(true);
    setError('');
    const { error: e } = await supabase.from('document_user_access').delete().eq('document_id', doc.id).eq('user_id', userId);
    setBusy(false);
    if (e) return setError(`Couldn’t remove access: ${e.message}`);
    setGrants((g) => g.filter((x) => x.user_id !== userId));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    const { data, error: e } = await supabase.from('documents').update({ restricted }).eq('id', doc.id).select('restricted');
    setBusy(false);
    if (e || !data?.length) return setError(`Couldn’t save: ${e?.message ?? 'only admins can change who can open a document'}`);
    onSaved(restricted);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="access-title" className="w-full max-w-lg max-h-[calc(100vh-2rem)] overflow-y-auto bg-white rounded-2xl shadow-2xl">
        <div className="flex items-start justify-between gap-3 px-6 pt-5">
          <div className="min-w-0">
            <h2 id="access-title" className="text-lg font-extrabold text-gray-900">Who can open this document</h2>
            <p className="text-sm text-gray-600 truncate">{doc.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="min-h-10 min-w-10 rounded-lg text-gray-600 hover:bg-gray-100 text-xl leading-none">×</button>
        </div>

        <div className="px-6 pb-6 pt-4 flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className="sr-only">Access</legend>
            <label className={`flex gap-3 items-start rounded-xl border p-3 cursor-pointer ${!restricted ? 'border-brand bg-brand/5' : 'border-gray-200'}`}>
              <input type="radio" name="access" checked={!restricted} onChange={() => setRestricted(false)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-bold text-gray-900">Everyone signed in</span><span className="block text-xs text-gray-600">Any user can open it, and the AI can quote it to anyone.</span></span>
            </label>
            <label className={`flex gap-3 items-start rounded-xl border p-3 cursor-pointer ${restricted ? 'border-brand bg-brand/5' : 'border-gray-200'}`}>
              <input type="radio" name="access" checked={restricted} onChange={() => setRestricted(true)} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
              <span><span className="block text-sm font-bold text-gray-900">Restricted</span><span className="block text-xs text-gray-600">Only admins and the people listed below. Everyone else, including the AI answering them, won’t see it.</span></span>
            </label>
          </fieldset>

          {restricted && (
            <div className="flex flex-col gap-2">
              <h3 className="text-xs font-bold text-gray-700">People with access (besides admins)</h3>
              {!loaded ? (
                <p className="text-sm text-gray-600" role="status">Loading…</p>
              ) : grants.length === 0 ? (
                <p className="text-sm text-gray-600">Nobody yet: only admins can open it.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {grants.map((g) => (
                    <li key={g.user_id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="font-semibold text-gray-900">{nameOf(g.user_id)}</span>
                      <button type="button" disabled={busy} onClick={() => void removeGrant(g.user_id)} className="min-h-9 px-3 rounded-lg text-sm font-semibold text-red-700 hover:bg-red-50">Remove</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2">
                <label htmlFor="grant-person" className="sr-only">Give access to</label>
                <select id="grant-person" value={adding} onChange={(e) => setAdding(e.target.value)} disabled={busy || !loaded} className="flex-1 min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm">
                  <option value="">Give access to…</option>
                  {grantable.map((p) => <option key={p.id} value={p.id}>{p.name}{p.email ? ` (${p.email})` : ''}</option>)}
                </select>
                <button type="button" disabled={busy || !adding} onClick={() => void addGrant()} className="min-h-11 px-4 rounded-xl border border-gray-200 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50">Add</button>
              </div>
            </div>
          )}

          {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 px-4 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="button" disabled={busy} onClick={() => void save()} className="min-h-11 px-5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
