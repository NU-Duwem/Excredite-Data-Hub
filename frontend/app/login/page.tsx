'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { MICROSOFT_SIGN_IN_ENABLED, safeNextPath } from '@/utils/authRedirect';

type Mode = 'main' | 'temporary' | 'developer';

const inputCls =
  'w-full min-h-12 rounded-xl border border-gray-300 bg-white px-4 text-[15px] text-gray-900 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/30';
const labelCls = 'block text-sm font-semibold text-gray-800 mb-1.5';
const primaryBtn =
  'w-full min-h-12 inline-flex items-center justify-center gap-2.5 rounded-xl bg-brand px-4 text-[15px] font-semibold text-white hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand disabled:opacity-60 transition-colors';

function Spinner() {
  return <span aria-hidden="true" className="h-4 w-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />;
}

function MailIcon() {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 9 6 9-6" />
    </svg>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} pr-20`}
        spellCheck={false}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-pressed={show}
        aria-label={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-1.5 right-1.5 px-3 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900"
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const next = safeNextPath(searchParams.get('next'));

  const [mode, setMode] = useState<Mode>('main');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'work' | 'password' | 'temporary' | 'developer'>(null);

  // ⚠️ Development only: is the master password on? (Never in production builds.)
  const [devMaster, setDevMaster] = useState(false);
  useEffect(() => {
    let active = true;
    fetch('/api/auth/dev-master-sign-in')
      .then((r) => (r.ok ? r.json() : { enabled: false }))
      .then((j) => active && setDevMaster(!!j.enabled))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  const [error, setError] = useState<string | null>(null);

  // Messages sent back by /auth/callback or sign-out, shown until the person tries again.
  const [touched, setTouched] = useState(false);
  const callbackError = touched ? null : searchParams.get('error')?.slice(0, 300) ?? null;
  const signedOut = !touched && searchParams.get('signed_out') === '1';
  const shownError = error ?? callbackError;

  const start = (kind: 'work' | 'password' | 'temporary' | 'developer') => {
    setTouched(true);
    setError(null);
    setBusy(kind);
  };

  const signInWithWorkEmail = async () => {
    start('work');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email',
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser leaves this page; we only get here on failure.
    if (error) {
      setError('Sign-in with email is not available right now. Please try again shortly.');
      setBusy(null);
    }
  };

  const signInWithPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    start('password');
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.session) {
      setError(error?.message === 'Invalid login credentials' ? 'That email or password is wrong.' : error?.message || 'Could not sign you in.');
      setBusy(null);
      return;
    }
    await supabase.from('user_activity_log').insert({ user_id: data.session.user.id, action: 'LOGIN', details: 'User logged in successfully.' });
    router.push(next);
    router.refresh();
  };

  const signInWithTemporaryPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    start('temporary');
    try {
      const res = await fetch('/api/auth/temporary-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not sign you in.');
        setBusy(null);
        return;
      }
      router.push(json.next || '/');
      router.refresh();
    } catch {
      setError('Could not reach EPDH. Check your connection and try again.');
      setBusy(null);
    }
  };

  const signInWithMasterPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    start('developer');
    try {
      const res = await fetch('/api/auth/dev-master-sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error || 'Could not sign you in.');
        setBusy(null);
        return;
      }
      router.push(next === '/query' ? json.next || '/' : next);
      router.refresh();
    } catch {
      setError('Could not reach EPDH.');
      setBusy(null);
    }
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setTouched(true);
    setError(null);
    setPassword('');
  };

  return (
    <div className="min-h-dvh w-full flex bg-gray-50">
      {/* Brand panel (desktop) */}
      <aside className="hidden lg:flex w-[44%] max-w-[620px] flex-col justify-between bg-brand text-white p-12 relative overflow-hidden">
        <div aria-hidden="true" className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/[0.04]" />
        <div aria-hidden="true" className="absolute left-12 bottom-28 h-1 w-16 rounded-full bg-accent" />
        <div aria-hidden="true" className="absolute -right-10 top-24 h-40 w-40 rounded-full border-[18px] border-white/5" />
        <div className="relative flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/excredite-mark.png" alt="" width={44} height={44} className="h-11 w-11 rounded-xl bg-white p-1" />
          <div className="leading-tight">
            <p className="text-lg font-extrabold tracking-tight">Excredite</p>
            <p className="text-sm text-white/70">Electricity Data Hub</p>
          </div>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            Nigeria’s power sector, <span className="text-accent">in one place.</span>
          </h1>
          <ul className="mt-8 space-y-4 text-[15px] text-white/85">
            {[
              'Answers from the firm’s own orders, judgments and reports, with sources.',
              'News, alerts and the regulatory work board, kept current for the team.',
              'Private to Excredite: only listed staff can sign in.',
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Excredite. Confidential.</p>
      </aside>

      {/* Sign-in panel */}
      <main className="flex-1 flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-8 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/excredite-wordmark.png" alt="Excredite" width={170} height={33} className="mx-auto h-auto w-[170px]" />
            <p className="mt-2 text-sm font-semibold text-gray-600">Electricity Data Hub</p>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_1px_2px_rgba(10,58,34,0.06),0_12px_32px_-12px_rgba(10,58,34,0.18)] p-7 sm:p-9">
            {devMaster && (
              <div role="note" className="mb-5 rounded-xl border border-accent bg-accent-soft px-4 py-3 text-sm text-accent-ink">
                <p className="font-bold">Development mode: master password is on</p>
                <p className="mt-0.5">Any listed account can be opened with it. Remove DEV_MASTER_PASSWORD from .env.local before deployment.</p>
              </div>
            )}

            {mode === 'main' ? (
              <>
                <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">Sign in</h2>
                <p className="mt-1.5 text-sm text-gray-600">Use your Excredite work email (@excredite.ng).</p>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => switchMode('main')}
                  className="-ml-2 mb-3 min-h-9 px-2 rounded-lg text-sm font-semibold text-brand hover:bg-gray-50"
                >
                  ← Back to sign in
                </button>
                <h2 className="text-2xl font-extrabold tracking-tight text-gray-900">{mode === 'developer' ? 'Developer sign-in' : 'First sign-in'}</h2>
                <p className={`mt-1.5 text-sm text-gray-600 ${mode === 'developer' ? 'hidden' : ''}`}>
                  Enter the temporary password an EPDH admin gave you. It works once; after that, use{' '}
                  {MICROSOFT_SIGN_IN_ENABLED ? 'Sign in with email' : 'the password you’ll choose next'}.
                </p>
              </>
            )}

            {signedOut && mode === 'main' && (
              <p role="status" className="mt-5 rounded-xl bg-brand/10 px-4 py-3 text-sm font-medium text-brand">
                You’ve signed out.
              </p>
            )}

            {shownError && (
              <div role="alert" className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
                <p className="text-sm font-semibold text-red-800">Could not sign you in</p>
                <p className="mt-0.5 text-sm text-red-700">{shownError}</p>
              </div>
            )}

            {mode === 'main' && MICROSOFT_SIGN_IN_ENABLED && (
              <div className="mt-6">
                <button type="button" onClick={signInWithWorkEmail} disabled={busy !== null} className={primaryBtn}>
                  {busy === 'work' ? <Spinner /> : <MailIcon />}
                  {busy === 'work' ? 'Opening sign-in…' : 'Sign in with email'}
                </button>
              </div>
            )}

            {mode === 'main' && !MICROSOFT_SIGN_IN_ENABLED && (
              <form onSubmit={signInWithPassword} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="email" className={labelCls}>
                    Work email
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@excredite.ng"
                    className={inputCls}
                  />
                </div>
                <div>
                  <div className="flex items-baseline justify-between">
                    <label htmlFor="password" className={labelCls}>
                      Password
                    </label>
                    <Link href="/forgot-password" className="text-sm font-semibold text-brand hover:underline">
                      Forgot?
                    </Link>
                  </div>
                  <PasswordInput id="password" value={password} onChange={setPassword} autoComplete="current-password" />
                </div>
                <button type="submit" disabled={busy !== null} className={primaryBtn}>
                  {busy === 'password' && <Spinner />}
                  {busy === 'password' ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            )}

            {mode === 'temporary' && (
              <form onSubmit={signInWithTemporaryPassword} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="temp-email" className={labelCls}>
                    Work email
                  </label>
                  <input
                    id="temp-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@excredite.ng"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="temp-password" className={labelCls}>
                    Temporary password
                  </label>
                  <PasswordInput id="temp-password" value={password} onChange={setPassword} autoComplete="one-time-code" />
                </div>
                <button type="submit" disabled={busy !== null} className={primaryBtn}>
                  {busy === 'temporary' && <Spinner />}
                  {busy === 'temporary' ? 'Checking…' : 'Continue'}
                </button>
              </form>
            )}

            {mode === 'developer' && (
              <form onSubmit={signInWithMasterPassword} className="mt-6 space-y-4">
                <p className="text-sm text-gray-600">Sign in as any listed staff member with the development master password.</p>
                <div>
                  <label htmlFor="dev-email" className={labelCls}>
                    Account email
                  </label>
                  <input
                    id="dev-email"
                    type="email"
                    autoComplete="off"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@excredite.ng"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="dev-password" className={labelCls}>
                    Master password
                  </label>
                  <PasswordInput id="dev-password" value={password} onChange={setPassword} autoComplete="off" />
                </div>
                <button type="submit" disabled={busy !== null} className={primaryBtn}>
                  {busy === 'developer' && <Spinner />}
                  {busy === 'developer' ? 'Signing in…' : 'Sign in as this person'}
                </button>
              </form>
            )}

            {mode === 'main' && devMaster && (
              <div className="mt-4 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('developer')}
                  className="min-h-10 px-3 rounded-lg text-sm font-semibold text-accent-ink hover:bg-accent-soft"
                >
                  Developer sign-in (master password)
                </button>
              </div>
            )}

            {mode === 'main' && (
              <div className="mt-6 pt-5 border-t border-gray-100 text-center">
                <button
                  type="button"
                  onClick={() => switchMode('temporary')}
                  className="min-h-10 px-3 rounded-lg text-sm font-semibold text-brand hover:bg-gray-50"
                >
                  First time? Use a temporary password
                </button>
              </div>
            )}
          </div>

          <p className="mt-6 text-center text-xs text-gray-600">
            Trouble signing in? Ask an EPDH admin. Access is limited to listed Excredite staff.
          </p>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
