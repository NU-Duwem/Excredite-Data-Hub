'use client';

import { createClient } from '@/utils/supabase/client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { User } from '@supabase/supabase-js';
import { getRoleDisplayName } from '@/utils/roles';
import AvatarEditor from '@/app/components/AvatarEditor';
import { announceProfileChanged } from '@/utils/avatars';

type ActivityRow = { id: string; action: string | null; details: string | null; created_at: string };
type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null;

const SECTIONS = [
  { id: 'account', label: 'Account' },
  { id: 'password', label: 'Password' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'activity', label: 'My activity' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

const NOTIFICATION_OPTIONS = [
  { id: 'n1', label: 'Email anomaly alerts', desc: 'Get notified when grid anomalies are detected.' },
  { id: 'n2', label: 'Weekly briefing digest', desc: 'A summary of sector performance every Monday.' },
  { id: 'n3', label: 'Legal matter updates', desc: 'Reminders for upcoming deadlines in your matters.' },
];

const inputCls =
  'w-full min-h-11 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-brand focus:border-transparent disabled:bg-gray-50 disabled:text-gray-600';
const labelCls = 'flex flex-col gap-1.5 text-xs font-bold text-gray-700';

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  const cls = status.kind === 'error' ? 'text-red-700' : status.kind === 'ok' ? 'text-green-800' : 'text-gray-600';
  return (
    <p role="status" className={`text-sm font-medium ${cls}`}>
      {status.text}
    </p>
  );
}

/** How this person can sign in, from their linked identities. */
function signInMethods(user: User | null) {
  const providers = new Set((user?.identities ?? []).map((i) => i.provider));
  const parts = [];
  if (providers.has('azure')) parts.push('Microsoft account');
  if (providers.has('email') || providers.size === 0) parts.push('Email and password');
  return parts.join(' or ');
}

function formatWhen(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** A settings section: description on the left, controls on the right (stacks on narrow screens). */
function Section({ id, title, desc, children }: { id: SectionId; title: string; desc: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-4 bg-white rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-5">
      <div>
        <h2 id={`${id}-title`} className="text-base font-extrabold text-gray-900">
          {title}
        </h2>
        <p className="mt-1 text-sm text-gray-600">{desc}</p>
      </div>
      <div className="md:col-span-2 min-w-0">{children}</div>
    </section>
  );
}

export default function ProfilePage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const scrollRef = useRef<HTMLElement>(null);

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState('power_team');
  const isAdmin = role === 'power_admin';

  // Account
  const [savedName, setSavedName] = useState('');
  const [nameDraft, setNameDraft] = useState('');
  const [nameSaving, setNameSaving] = useState(false);
  const [nameStatus, setNameStatus] = useState<Status>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);

  // Password
  const [isForceReset, setIsForceReset] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<Status>(null);

  // Activity
  const [activity, setActivity] = useState<ActivityRow[]>([]);

  // "On this page" index
  const [activeSection, setActiveSection] = useState<SectionId>('account');

  useEffect(() => {
    let active = true;
    const forceReset = new URLSearchParams(window.location.search).get('force_reset') === 'true';

    (async () => {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      if (!active) return;
      if (!u) {
        router.push('/login');
        return;
      }
      const [{ data: profile }, { data: logs }] = await Promise.all([
        supabase.from('user_profiles').select('role, full_name, avatar_path').eq('id', u.id).single(),
        supabase
          .from('user_activity_log')
          .select('id, action, details, created_at')
          .eq('user_id', u.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);
      if (!active) return;
      const name = (profile?.full_name || u.user_metadata?.full_name || u.email?.split('@')[0] || '').trim();
      setUser(u);
      setRole(profile?.role || 'power_team');
      setAvatarPath(profile?.avatar_path ?? null);
      setSavedName(name);
      setNameDraft(name);
      setActivity((logs ?? []) as ActivityRow[]);
      setIsForceReset(forceReset);
      setLoading(false);
      if (forceReset) {
        setActiveSection('password');
        window.setTimeout(() => document.getElementById('password')?.scrollIntoView({ block: 'start' }), 0);
      }
    })();
    return () => {
      active = false;
    };
  }, [supabase, router]);

  // Highlight the section currently in view.
  useEffect(() => {
    const root = scrollRef.current;
    if (loading || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveSection(visible[0].target.id as SectionId);
      },
      { root, rootMargin: '0px 0px -60% 0px', threshold: 0 },
    );
    SECTIONS.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [loading]);

  const logActivity = (action: string, details: string) =>
    user ? supabase.from('user_activity_log').insert({ user_id: user.id, action, details }) : Promise.resolve();

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = nameDraft.trim();
    if (!user || !name || name === savedName) return;
    setNameSaving(true);
    setNameStatus({ kind: 'info', text: 'Saving…' });
    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from('user_profiles').update({ full_name: name, updated_at: new Date().toISOString() }).eq('id', user.id),
      supabase.auth.updateUser({ data: { full_name: name } }),
    ]);
    if (profileError || authError) {
      setNameStatus({ kind: 'error', text: `Could not save: ${(profileError || authError)?.message}` });
    } else {
      setSavedName(name);
      setNameStatus({ kind: 'ok', text: 'Name updated.' });
      announceProfileChanged();
      await logActivity('PROFILE_UPDATED', 'Changed display name.');
      router.refresh();
    }
    setNameSaving(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!currentPassword) return setPasswordStatus({ kind: 'error', text: 'Enter your current password.' });
    if (newPassword.length < 6) return setPasswordStatus({ kind: 'error', text: 'The new password must be at least 6 characters.' });
    if (newPassword !== confirmPassword) return setPasswordStatus({ kind: 'error', text: 'The new passwords do not match.' });

    setPasswordSaving(true);
    setPasswordStatus({ kind: 'info', text: 'Checking your current password…' });
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email ?? '', password: currentPassword });
    if (signInError) {
      setPasswordStatus({ kind: 'error', text: 'Your current password is incorrect.' });
      setPasswordSaving(false);
      return;
    }

    setPasswordStatus({ kind: 'info', text: 'Updating password…' });
    const { error } = await supabase.auth.updateUser({ password: newPassword, data: { force_password_reset: null } });
    if (error) {
      setPasswordStatus({ kind: 'error', text: error.message });
    } else {
      setPasswordStatus({ kind: 'ok', text: 'Password updated.' });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setIsForceReset(false);
      await logActivity('PASSWORD_CHANGED', 'User changed their password.');
    }
    setPasswordSaving(false);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const jumpTo = (id: SectionId) => (e: React.MouseEvent) => {
    e.preventDefault();
    setActiveSection(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" aria-label="Loading" />
      </main>
    );
  }

  const mismatch = confirmPassword !== '' && confirmPassword !== newPassword;

  return (
    <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6">
      <div className="max-w-[1200px] mx-auto flex flex-col gap-4">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Profile &amp; Settings</h1>

        {isForceReset && (
          <div role="alert" className="rounded-xl bg-accent-soft text-accent-ink px-4 py-3 text-sm font-medium">
            Your administrator asked you to set a new password before continuing. Use the Password section below.
          </div>
        )}

        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            <Section id="account" title="Account" desc="Your name and picture appear on documents, the work board and in the activity log.">
              {user && (
                <div className="mb-5 pb-5 border-b border-gray-100">
                  <AvatarEditor userId={user.id} name={savedName || user.email} path={avatarPath} mode="self" onChange={setAvatarPath} />
                </div>
              )}
              <form onSubmit={handleSaveName} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className={labelCls}>
                  Full name
                  <input className={inputCls} value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} maxLength={120} autoComplete="name" />
                </label>
                <label className={labelCls}>
                  Email
                  <input className={inputCls} value={user?.email ?? ''} disabled />
                </label>
                <label className={labelCls}>
                  Role
                  <input className={inputCls} value={getRoleDisplayName(role)} disabled />
                </label>
                <div className="flex items-end gap-3">
                  <button
                    type="submit"
                    disabled={nameSaving || !nameDraft.trim() || nameDraft.trim() === savedName}
                    className="min-h-11 px-5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50"
                  >
                    {nameSaving ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-11 px-4 rounded-xl border border-red-200 text-red-700 text-sm font-semibold hover:bg-red-50"
                  >
                    Sign out
                  </button>
                </div>
                <div className="sm:col-span-2">
                  <StatusLine status={nameStatus} />
                </div>
              </form>
              <dl className="mt-5 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-gray-600">Last sign-in</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">
                    {user?.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('en-GB') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-600">Sign-in method</dt>
                  <dd className="mt-0.5 font-medium text-gray-900">{signInMethods(user)}</dd>
                </div>
                {/* "Joined" is shown to admins only, per the requirements. */}
                {isAdmin && user?.created_at && (
                  <div>
                    <dt className="text-xs text-gray-600">Joined</dt>
                    <dd className="mt-0.5 font-medium text-gray-900">{new Date(user.created_at).toLocaleDateString('en-GB')}</dd>
                  </div>
                )}
              </dl>
            </Section>

            <Section id="password" title="Password" desc="Your current password is checked first. Changing it signs out your other devices.">
              <form onSubmit={handleUpdatePassword} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <label className={labelCls}>
                  Current password
                  <input type="password" className={inputCls} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" required />
                </label>
                <label className={labelCls}>
                  New password
                  <input type="password" className={inputCls} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" minLength={6} required />
                  <span className="font-normal text-gray-600">At least 6 characters.</span>
                </label>
                <label className={labelCls}>
                  Confirm new password
                  <input
                    type="password"
                    className={`${inputCls} ${mismatch ? 'border-red-400' : ''}`}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={mismatch}
                    required
                  />
                  {mismatch && <span className="font-medium text-red-700">Passwords do not match.</span>}
                </label>
                <div className="lg:col-span-3 flex flex-wrap items-center gap-4">
                  <button
                    type="submit"
                    disabled={passwordSaving || !currentPassword || !newPassword || mismatch}
                    className="min-h-11 px-5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-hover disabled:opacity-50"
                  >
                    {passwordSaving ? 'Updating…' : 'Update password'}
                  </button>
                  <Link href="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
                    Forgot your current password?
                  </Link>
                </div>
                <div className="lg:col-span-3">
                  <StatusLine status={passwordStatus} />
                </div>
              </form>
            </Section>

            <Section id="notifications" title="Notifications" desc="Choose what reaches you.">
              <div className="flex flex-col divide-y divide-gray-100">
                {NOTIFICATION_OPTIONS.map((n) => (
                  <label key={n.id} htmlFor={n.id} className="flex items-start justify-between gap-4 py-3 cursor-pointer">
                    <span>
                      <span className="block text-sm font-semibold text-gray-900">{n.label}</span>
                      <span className="block text-xs text-gray-600">{n.desc}</span>
                    </span>
                    <input id={n.id} type="checkbox" defaultChecked className="mt-1 h-5 w-5 rounded accent-brand shrink-0" />
                  </label>
                ))}
              </div>
            </Section>

            <Section id="activity" title="My activity" desc="Your last 20 actions. Only you and admins can see this.">
              {activity.length === 0 ? (
                <p className="text-sm text-gray-600 py-2">No activity recorded yet.</p>
              ) : (
                <ol className="flex flex-col">
                  {activity.map((a) => (
                    <li key={a.id} className="flex gap-4 py-2.5 border-b border-gray-100 last:border-0 text-sm">
                      <time dateTime={a.created_at} className="w-24 shrink-0 font-mono text-xs text-gray-600 pt-0.5">
                        {formatWhen(a.created_at)}
                      </time>
                      <span className="min-w-0">
                        <span className="block font-semibold text-gray-900">
                          {(a.action ?? 'Activity').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}
                        </span>
                        {a.details && <span className="block text-xs text-gray-600">{a.details}</span>}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Section>
          </div>

          {/* "On this page" index — right side, matching the News filter rail */}
          <nav aria-label="On this page" className="hidden lg:flex w-[200px] shrink-0 sticky top-0 bg-white rounded-2xl p-3.5 flex-col gap-0.5">
            <p className="px-2.5 pb-1.5 text-[11px] font-extrabold tracking-wider uppercase text-gray-600">On this page</p>
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={jumpTo(s.id)}
                aria-current={activeSection === s.id ? 'true' : undefined}
                className={`min-h-9 px-2.5 rounded-lg text-sm flex items-center ${
                  activeSection === s.id ? 'bg-brand/10 text-brand font-bold' : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </main>
  );
}
