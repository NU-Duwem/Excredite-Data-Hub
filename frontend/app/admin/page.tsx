'use client';

import { createClient } from '@/utils/supabase/client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRoleDisplayName, PRIMARY_ROLES } from '@/utils/roles';

type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string | null;
  details: string | null;
  created_at: string;
  user_profiles: { full_name: string | null; email: string | null } | null;
};

type Section = 'users' | 'roles' | 'engine' | 'audit';
type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null;

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles & permissions' },
  { id: 'engine', label: 'Anomaly engine' },
  { id: 'audit', label: 'Audit log' },
];

const MODULES = [
  { id: 'query', name: 'AI Query' },
  { id: 'history', name: 'Conversation History' },
  { id: 'alerts', name: 'Alerts' },
  { id: 'documents', name: 'Documents' },
  { id: 'matters', name: 'Matters' },
  { id: 'news', name: 'News & Updates' },
];

const INITIAL_PERMISSIONS: Record<string, string[]> = {
  power_admin: ['query', 'history', 'alerts', 'documents', 'matters', 'news'],
  power_ceo: ['query', 'history', 'alerts', 'documents', 'matters', 'news'],
  power_legal: ['query', 'history', 'matters'],
  power_analyst: ['query', 'history', 'alerts', 'documents', 'news'],
  power_app: ['query', 'history', 'alerts', 'documents', 'matters', 'news'],
  power_ingestion: ['query', 'history', 'documents'],
  power_team: ['query', 'history'],
  power_ai: ['query'],
};

const inputCls =
  'w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand focus:border-transparent';
const labelCls = 'flex flex-col gap-1.5 text-xs font-bold text-gray-700';
const btn = 'min-h-11 px-4 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-brand hover:bg-gray-50 disabled:opacity-50';
const btnPrimary = 'min-h-11 px-4 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50';

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

async function callAdminApi(body: Record<string, unknown>): Promise<{ error?: string; message?: string; data?: unknown }> {
  try {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? json : { error: json.error || `HTTP ${res.status}` };
  } catch {
    return { error: 'Could not reach the server.' };
  }
}

function StatusBanner({ status, onClose }: { status: Status; onClose: () => void }) {
  if (!status) return null;
  const cls =
    status.kind === 'error' ? 'bg-red-50 text-red-800' : status.kind === 'ok' ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-800';
  return (
    <div role="status" className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-medium ${cls}`}>
      <span>{status.text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss message" className="shrink-0 min-h-6 px-1 opacity-70 hover:opacity-100">
        ×
      </button>
    </div>
  );
}

export default function AdminPanelPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [myId, setMyId] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('users');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [maskData, setMaskData] = useState(false);

  // Users
  const [users, setUsers] = useState<Profile[]>([]);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // Create user
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ fullName: '', email: '', role: 'power_analyst', password: '' });

  // Roles preview
  const [permissions, setPermissions] = useState<Record<string, string[]>>(INITIAL_PERMISSIONS);

  // Engine
  const [threshold, setThreshold] = useState('2.0');
  const [alertsEnabled, setAlertsEnabled] = useState(true);

  // Audit
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from('user_profiles')
      .select('id, email, full_name, role, is_active, created_at')
      .order('full_name', { ascending: true });
    return (data ?? []) as Profile[];
  }, [supabase]);

  useEffect(() => {
    let active = true;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return router.push('/login');
      const { data: me } = await supabase.from('user_profiles').select('role').eq('id', user.id).single();
      if (me?.role !== 'power_admin') return router.push('/query');

      const [list, { data: settings }] = await Promise.all([loadUsers(), supabase.from('system_settings').select('key, value')]);
      if (!active) return;
      setMyId(user.id);
      setUsers(list);
      const t = settings?.find((s) => s.key === 'anomaly_detection_threshold');
      const e = settings?.find((s) => s.key === 'anomaly_alerts_enabled');
      if (t) setThreshold(t.value);
      if (e) setAlertsEnabled(e.value === 'true');
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [supabase, router, loadUsers]);

  const mask = (value: string | null | undefined, type: 'name' | 'email') => {
    if (!value) return '';
    if (!maskData) return value;
    if (type === 'email') {
      const [n, domain] = value.split('@');
      return domain ? `${n[0]}***@${domain}` : '***';
    }
    return value
      .split(' ')
      .map((p) => `${p[0] ?? ''}***`)
      .join(' ');
  };

  const filtered = users.filter(
    (u) => (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()),
  );
  const selected = users.find((u) => u.id === selectedId) ?? null;
  const isSelf = selected?.id === myId;
  const dirty = !!selected && (editRole !== selected.role || editActive !== selected.is_active);

  const select = (u: Profile) => {
    setSelectedId(u.id);
    setEditRole(u.role);
    setEditActive(u.is_active);
    setConfirmDeactivate(false);
    setStatus(null);
  };

  const applyLocal = (id: string, patch: Partial<Profile>) => setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...patch } : u)));

  const saveUser = async () => {
    if (!selected) return;
    setBusy(true);
    setStatus({ kind: 'info', text: 'Saving…' });
    if (editRole !== selected.role) {
      const r = await callAdminApi({ action: 'set-role', targetUserId: selected.id, value: editRole });
      if (r.error) {
        setStatus({ kind: 'error', text: r.error });
        return setBusy(false);
      }
      applyLocal(selected.id, { role: editRole });
    }
    if (editActive !== selected.is_active) {
      const r = await callAdminApi({ action: 'set-status', targetUserId: selected.id, value: editActive });
      if (r.error) {
        setStatus({ kind: 'error', text: r.error });
        return setBusy(false);
      }
      applyLocal(selected.id, { is_active: editActive });
    }
    setStatus({ kind: 'ok', text: `Saved changes for ${selected.full_name || selected.email}.` });
    setBusy(false);
  };

  const runAction = async (action: 'reset-password' | 'force-logout', successText: string) => {
    if (!selected) return;
    setBusy(true);
    setStatus({ kind: 'info', text: 'Working…' });
    const r = await callAdminApi({ action, targetUserId: selected.id });
    setStatus(r.error ? { kind: 'error', text: r.error } : { kind: 'ok', text: r.message || successText });
    setBusy(false);
  };

  const toggleActive = async () => {
    if (!selected) return;
    const next = !selected.is_active;
    setBusy(true);
    const r = await callAdminApi({ action: 'set-status', targetUserId: selected.id, value: next });
    if (r.error) setStatus({ kind: 'error', text: r.error });
    else {
      applyLocal(selected.id, { is_active: next });
      setEditActive(next);
      setStatus({ kind: 'ok', text: `${selected.full_name || selected.email} is now ${next ? 'active' : 'deactivated'}.` });
    }
    setConfirmDeactivate(false);
    setBusy(false);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setStatus({ kind: 'info', text: 'Creating user…' });
    const r = await callAdminApi({ action: 'create-user', ...createForm });
    if (r.error) {
      setStatus({ kind: 'error', text: `Could not create user: ${r.error}` });
    } else {
      setStatus({ kind: 'ok', text: `Created ${createForm.fullName || createForm.email}.` });
      setShowCreate(false);
      setCreateForm({ fullName: '', email: '', role: 'power_analyst', password: '' });
      setUsers(await loadUsers());
    }
    setBusy(false);
  };

  const saveEngine = async () => {
    setBusy(true);
    setStatus({ kind: 'info', text: 'Saving engine settings…' });
    const results = await Promise.all([
      callAdminApi({ action: 'update-setting', key: 'anomaly_detection_threshold', settingValue: threshold }),
      callAdminApi({ action: 'update-setting', key: 'anomaly_alerts_enabled', settingValue: String(alertsEnabled) }),
    ]);
    const failed = results.find((r) => r.error);
    setStatus(failed ? { kind: 'error', text: `Could not save: ${failed.error}` } : { kind: 'ok', text: 'Engine settings saved.' });
    setBusy(false);
  };

  const loadAudit = useCallback(async () => {
    setAuditLoading(true);
    setAuditError(null);
    const r = await callAdminApi({ action: 'get-all-activity' });
    if (r.error) setAuditError(r.error);
    else setAudit((r.data ?? []) as AuditRow[]);
    setAuditLoading(false);
  }, []);

  const openSection = (s: Section) => {
    setSection(s);
    setStatus(null);
    if (s === 'audit') loadAudit();
  };

  const togglePermission = (role: string, moduleId: string) =>
    setPermissions((prev) => {
      const mods = prev[role] ?? [];
      return { ...prev, [role]: mods.includes(moduleId) ? mods.filter((m) => m !== moduleId) : [...mods, moduleId] };
    });

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" aria-label="Loading" />
      </main>
    );
  }

  return (
    <main className="flex-1 min-h-0 flex flex-col p-4 sm:p-6 overflow-hidden">
      <div className="max-w-[1400px] w-full mx-auto flex-1 min-h-0 flex flex-col gap-4">
        <header className="flex flex-wrap items-center gap-3">
          <h1 className="mr-2 text-2xl font-extrabold tracking-tight text-gray-900">Admin Panel</h1>
          <nav aria-label="Admin sections" className="inline-flex flex-wrap rounded-xl bg-white border border-gray-200 p-[3px]">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => openSection(s.id)}
                aria-current={section === s.id ? 'page' : undefined}
                className={`min-h-[38px] px-3.5 rounded-[9px] text-[13px] transition-colors ${
                  section === s.id ? 'bg-brand text-white font-semibold' : 'text-gray-700 font-medium hover:bg-gray-100'
                }`}
              >
                {s.label}
              </button>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <label className="inline-flex items-center gap-2 min-h-11 px-3 rounded-xl bg-white border border-gray-200 text-[13px] text-gray-700 cursor-pointer">
              <input type="checkbox" checked={maskData} onChange={(e) => setMaskData(e.target.checked)} className="h-4 w-4 accent-brand" />
              Mask names (demo)
            </label>
            <button type="button" onClick={() => setShowCreate(true)} className={btnPrimary}>
              Invite user
            </button>
          </div>
        </header>

        <StatusBanner status={status} onClose={() => setStatus(null)} />

        {/* ---------------- Users: split view ---------------- */}
        {section === 'users' && (
          <div className="flex-1 min-h-0 flex gap-4 items-stretch">
            <section
              aria-label="User directory"
              className={`scroll-panel relative bg-white rounded-2xl p-3 w-full md:w-[360px] md:shrink-0 ${selected ? 'hidden md:block' : 'block'}`}
            >
              <label htmlFor="admin-search" className="sr-only">
                Search users
              </label>
              <input
                id="admin-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email…"
                className={`${inputCls} mb-2`}
              />
              <p className="px-2 pb-1 text-[11px] font-extrabold tracking-wider uppercase text-gray-600">
                {filtered.length} user{filtered.length === 1 ? '' : 's'}
              </p>
              <ul className="flex flex-col gap-0.5">
                {filtered.map((u) => {
                  const active = u.id === selectedId;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => select(u)}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-3 ${active ? 'bg-brand/10' : 'hover:bg-gray-50'}`}
                      >
                        <span
                          aria-hidden="true"
                          className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-xs font-extrabold ${
                            u.role === 'power_admin' ? 'bg-brand text-accent' : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {maskData ? '?' : initialsOf(u.full_name || u.email)}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className={`block text-sm truncate ${active ? 'font-bold text-brand' : 'font-semibold text-gray-900'}`}>
                            {mask(u.full_name || u.email, u.full_name ? 'name' : 'email')}
                            {u.id === myId && <span className="font-normal text-gray-600"> (you)</span>}
                          </span>
                          <span className="block text-xs text-gray-600 truncate">{getRoleDisplayName(u.role)}</span>
                        </span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            u.is_active ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </span>
                      </button>
                    </li>
                  );
                })}
                {filtered.length === 0 && <li className="p-6 text-center text-sm text-gray-600">No users match.</li>}
              </ul>
            </section>

            <section aria-label="User details" className={`scroll-panel relative flex-1 min-w-0 bg-white rounded-2xl ${selected ? 'block' : 'hidden md:block'}`}>
              {!selected ? (
                <div className="h-full flex items-center justify-center p-10 text-sm text-gray-600">Select a user to manage their role and access.</div>
              ) : (
                <div className="p-6 flex flex-col gap-6">
                  <div className="flex items-center gap-4">
                    <button type="button" onClick={() => setSelectedId(null)} className="md:hidden min-h-9 text-sm font-semibold text-brand">
                      ←
                    </button>
                    <span aria-hidden="true" className="h-13 w-13 min-h-[52px] min-w-[52px] rounded-full bg-accent text-brand flex items-center justify-center text-lg font-extrabold">
                      {maskData ? '?' : initialsOf(selected.full_name || selected.email)}
                    </span>
                    <div className="min-w-0">
                      <h2 className="text-xl font-extrabold text-gray-900 truncate">{mask(selected.full_name || '(no name)', 'name')}</h2>
                      <p className="text-sm text-gray-600 truncate">
                        {mask(selected.email, 'email')} · joined {new Date(selected.created_at).toLocaleDateString('en-GB')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                    <label className={labelCls}>
                      Role
                      <select className={inputCls} value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                        {PRIMARY_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {getRoleDisplayName(r)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className={labelCls}>
                      Status
                      <select
                        className={inputCls}
                        value={editActive ? 'active' : 'inactive'}
                        onChange={(e) => setEditActive(e.target.value === 'active')}
                        disabled={isSelf}
                      >
                        <option value="active">Active</option>
                        <option value="inactive">Deactivated</option>
                      </select>
                      {isSelf && <span className="font-normal text-gray-600">You can’t deactivate your own account.</span>}
                    </label>
                  </div>

                  <div>
                    <p className="text-[11px] font-extrabold tracking-wider uppercase text-gray-600 mb-2">What this role can open</p>
                    <div className="flex flex-wrap gap-1.5">
                      {MODULES.map((m) => {
                        const on = (permissions[editRole] ?? []).includes(m.id);
                        return (
                          <span
                            key={m.id}
                            className={`px-2.5 py-1 rounded-full text-xs font-semibold ${on ? 'bg-brand/10 text-brand' : 'bg-gray-100 text-gray-500 line-through'}`}
                          >
                            {m.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  <div className="pt-5 border-t border-gray-100 flex flex-wrap gap-2.5">
                    <button type="button" onClick={saveUser} disabled={busy || !dirty} className={btnPrimary}>
                      Save changes
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction('reset-password', 'Password reset email sent.')}
                      disabled={busy}
                      className={btn}
                    >
                      Send password reset
                    </button>
                    <button
                      type="button"
                      onClick={() => runAction('force-logout', 'Signed out of all devices.')}
                      disabled={busy}
                      className={btn}
                    >
                      Sign out everywhere
                    </button>
                    {!isSelf &&
                      (confirmDeactivate && selected.is_active ? (
                        <span className="sm:ml-auto inline-flex gap-2">
                          <button type="button" onClick={toggleActive} disabled={busy} className="min-h-11 px-4 rounded-xl bg-red-700 text-white text-sm font-semibold">
                            Confirm deactivate
                          </button>
                          <button type="button" onClick={() => setConfirmDeactivate(false)} className={btn}>
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => (selected.is_active ? setConfirmDeactivate(true) : toggleActive())}
                          disabled={busy}
                          className={`sm:ml-auto min-h-11 px-4 rounded-xl border text-sm font-semibold disabled:opacity-50 ${
                            selected.is_active ? 'border-red-200 text-red-700 hover:bg-red-50' : 'border-gray-200 text-brand hover:bg-gray-50'
                          }`}
                        >
                          {selected.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        {/* ---------------- Roles & permissions ---------------- */}
        {section === 'roles' && (
          <section aria-labelledby="roles-title" className="scroll-panel relative flex-1 min-h-0 bg-white rounded-2xl p-6 overflow-x-auto">
            <h2 id="roles-title" className="text-base font-extrabold text-gray-900">
              Roles &amp; permissions
            </h2>
            <p className="mt-1 mb-4 text-sm text-gray-600">
              Preview only: changes here are not saved or enforced yet. Access is currently controlled by database security rules for each role.
            </p>
            <table className="w-full min-w-[720px] text-sm border-collapse">
              <thead>
                <tr>
                  <th scope="col" className="text-left px-3 py-2.5 text-[11px] font-extrabold tracking-wider uppercase text-gray-600 border-b border-gray-100">
                    Role
                  </th>
                  {MODULES.map((m) => (
                    <th key={m.id} scope="col" className="px-3 py-2.5 text-[11px] font-extrabold tracking-wider uppercase text-gray-600 border-b border-gray-100">
                      {m.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PRIMARY_ROLES.map((role) => (
                  <tr key={role} className="border-b border-gray-100 last:border-0">
                    <th scope="row" className="text-left px-3 py-2.5 font-semibold text-gray-900">
                      {getRoleDisplayName(role)}
                    </th>
                    {MODULES.map((m) => (
                      <td key={m.id} className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${getRoleDisplayName(role)} can open ${m.name}`}
                          checked={(permissions[role] ?? []).includes(m.id)}
                          onChange={() => togglePermission(role, m.id)}
                          disabled={role === 'power_admin'}
                          className="h-4 w-4 accent-brand"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* ---------------- Anomaly engine ---------------- */}
        {section === 'engine' && (
          <section aria-labelledby="engine-title" className="bg-white rounded-2xl p-6 max-w-2xl flex flex-col gap-6">
            <div>
              <h2 id="engine-title" className="text-base font-extrabold text-gray-900">
                Anomaly detection engine
              </h2>
              <p className="mt-1 text-sm text-gray-600">Controls how sensitive generation anomaly detection is.</p>
            </div>
            <label className="flex items-center justify-between gap-4 p-4 rounded-xl bg-gray-50 cursor-pointer">
              <span>
                <span className="block text-sm font-bold text-gray-900">Anomaly alerts</span>
                <span className="block text-xs text-gray-600">Turn detection on or off for everyone.</span>
              </span>
              <input type="checkbox" role="switch" checked={alertsEnabled} onChange={(e) => setAlertsEnabled(e.target.checked)} className="h-5 w-5 accent-brand" />
            </label>
            <label className={labelCls}>
              Detection threshold (standard deviations)
              <span className="flex items-center gap-3">
                <input
                  type="number"
                  step="0.1"
                  min="0.5"
                  max="5"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  className={`${inputCls} w-32 text-center font-mono`}
                />
                <span className="font-normal text-gray-600">Lower values flag more alerts.</span>
              </span>
            </label>
            <button type="button" onClick={saveEngine} disabled={busy} className={`${btnPrimary} self-start`}>
              Save engine settings
            </button>
          </section>
        )}

        {/* ---------------- Audit log ---------------- */}
        {section === 'audit' && (
          <section aria-labelledby="audit-title" className="flex-1 min-h-0 bg-white rounded-2xl flex flex-col">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100">
              <div>
                <h2 id="audit-title" className="text-base font-extrabold text-gray-900">
                  Audit log
                </h2>
                <p className="text-sm text-gray-600">The latest 100 actions across the platform.</p>
              </div>
              <button type="button" onClick={loadAudit} disabled={auditLoading} className={btn}>
                {auditLoading ? 'Loading…' : 'Refresh'}
              </button>
            </div>
            <div className="scroll-panel relative flex-1 min-h-0">
              {auditError ? (
                <p className="p-8 text-sm text-red-700">Could not load the audit log: {auditError}</p>
              ) : !auditLoading && audit.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-600">No activity recorded yet.</p>
              ) : (
                <ol>
                  {audit.map((row) => (
                    <li key={row.id} className="flex gap-4 px-5 py-3 border-b border-gray-100 last:border-0 text-sm">
                      <time dateTime={row.created_at} className="w-36 shrink-0 font-mono text-xs text-gray-600 pt-0.5">
                        {new Date(row.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                      </time>
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold text-gray-900">
                          {(row.action ?? 'Activity').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                          <span className="font-normal text-gray-600">
                            {' · '}
                            {mask(row.user_profiles?.full_name || row.user_profiles?.email || 'Unknown user', 'name')}
                          </span>
                        </span>
                        {row.details && <span className="block text-xs text-gray-600">{row.details}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}
      </div>

      {/* ---------------- Invite user dialog ---------------- */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-title"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowCreate(false);
            }}
            className="w-full max-w-md bg-white rounded-2xl shadow-2xl"
          >
            <div className="flex items-center justify-between px-6 pt-5">
              <h2 id="create-title" className="text-lg font-extrabold text-gray-900">
                Invite user
              </h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                aria-label="Close"
                className="h-11 w-11 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-900"
              >
                ×
              </button>
            </div>
            <form onSubmit={createUser} className="p-6 flex flex-col gap-4">
              <label className={labelCls}>
                Full name
                <input
                  autoFocus
                  required
                  className={inputCls}
                  value={createForm.fullName}
                  onChange={(e) => setCreateForm((f) => ({ ...f, fullName: e.target.value }))}
                />
              </label>
              <label className={labelCls}>
                Email
                <input
                  type="email"
                  required
                  className={inputCls}
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                />
              </label>
              <label className={labelCls}>
                Role
                <select className={inputCls} value={createForm.role} onChange={(e) => setCreateForm((f) => ({ ...f, role: e.target.value }))}>
                  {PRIMARY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {getRoleDisplayName(r)}
                    </option>
                  ))}
                </select>
              </label>
              <label className={labelCls}>
                Temporary password
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  className={inputCls}
                  value={createForm.password}
                  onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                />
                <span className="font-normal text-gray-600">At least 6 characters. Share it securely; they can change it in Profile &amp; Settings.</span>
              </label>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className={`${btn} flex-1`}>
                  Cancel
                </button>
                <button type="submit" disabled={busy} className={`${btnPrimary} flex-[2]`}>
                  {busy ? 'Creating…' : 'Create user'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
