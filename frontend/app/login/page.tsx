'use client';

import { Suspense, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { MICROSOFT_SIGN_IN_ENABLED } from '@/utils/authRedirect';

function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [msLoading, setMsLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  // Errors sent back by /auth/callback (e.g. a Microsoft sign-in that didn't finish),
  // shown until the person tries again.
  const searchParams = useSearchParams();
  const [retried, setRetried] = useState(false);
  const callbackError = retried ? null : searchParams.get('error')?.slice(0, 300) ?? null;
  const shownError = error ?? callbackError;

  const handleMicrosoft = async () => {
    setRetried(true);
    setMsLoading(true);
    setError(null);
    const next = searchParams.get('next') ?? '/query';
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        scopes: 'openid profile email',
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // On success the browser leaves for Microsoft; we only get here on failure.
    if (error) {
      setError('Sign-in with email is not available right now. Please try again shortly.');
      setMsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setRetried(true);
    setIsLoading(true);
    setError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.session) {
        // Log successful login to activity table (swallows error if table not yet migrated)
        await supabase
          .from('user_activity_log')
          .insert({
            user_id: data.session.user.id,
            action: 'LOGIN',
            details: 'User logged in successfully.',
          });

        router.push('/query');
        router.refresh();
      }
    } catch (err) {
      setError('An unexpected error occurred during login.');
    } finally {
      setIsLoading(false);
    }
  };

  const errorPanel = shownError ? (
    <div role="alert" className="rounded-md bg-red-50 p-4 border border-red-100">
      <h3 className="text-sm font-medium text-red-800">Could not sign you in</h3>
      <p className="mt-2 text-sm text-red-700">{shownError}</p>
    </div>
  ) : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8 w-full">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-lg border border-gray-100">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/excredite-wordmark.png" alt="Excredite" width={180} height={35} className="mx-auto h-auto w-[180px]" />
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 tracking-tight">
            Excredite Electricity Data Hub
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Secure administrative access only
          </p>
        </div>
        
        {MICROSOFT_SIGN_IN_ENABLED && (
          <div className="mt-8 space-y-4">
            <button
              type="button"
              onClick={handleMicrosoft}
              disabled={msLoading}
              className="w-full min-h-12 flex items-center justify-center gap-3 rounded-lg bg-brand px-4 text-sm font-semibold text-white hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 shadow-sm"
            >
              <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <path strokeLinecap="round" strokeLinejoin="round" d="m3 7 9 6 9-6" />
              </svg>
              {msLoading ? 'Opening sign-in…' : 'Sign in with email'}
            </button>
            <p className="text-center text-xs text-gray-600">Use your Excredite work email (@excredite.ng).</p>
            {errorPanel}
          </div>
        )}

        {!MICROSOFT_SIGN_IN_ENABLED && (
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email-address" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-brand focus:border-brand focus:z-10 sm:text-sm"
                placeholder="you@excredite.ng"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none rounded-lg relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-brand focus:border-brand focus:z-10 sm:text-sm pr-10"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center text-xs font-semibold px-1">
            <Link href="/forgot-password" className="text-brand hover:underline font-bold">
              Forgot password?
            </Link>
          </div>

          {errorPanel}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2.5 px-4 border border-transparent text-sm font-semibold rounded-lg text-white bg-brand hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand disabled:opacity-50 transition-all shadow-sm"
            >
              {isLoading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Signing in...
                </span>
              ) : (
                'Sign in to EPDH'
              )}
            </button>
          </div>
        </form>
        )}
      </div>
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
