'use client';

import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setToken(window.localStorage.getItem('notification-dashboard-token'));
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-screen bg-slate-950" />;
  }

  if (token) return <>{children}</>;

  const login = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      let response: Response;
      try {
        response = await fetch(`${apiUrl}/v1/auth/login`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        throw new Error('Cannot reach NotifyKIT through the dashboard proxy. Check that the dashboard and API services are running.');
      }
      if (!(response.headers.get('content-type') ?? '').includes('application/json')) {
        throw new Error(response.ok ? 'The NotifyKIT API returned an invalid response.' : `The NotifyKIT API request failed (${response.status}).`);
      }
      const result = (await response.json()) as { success: boolean; data?: { access_token: string; user: unknown }; error?: { message: string } };
      if (!result.success || !result.data) throw new Error(result.error?.message ?? 'Unable to sign in');
      window.localStorage.setItem('notification-dashboard-token', result.data.access_token);
      window.localStorage.setItem('notification-dashboard-user', JSON.stringify(result.data.user));
      setToken(result.data.access_token);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5">
      <form onSubmit={login} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <h1 className="text-2xl font-bold text-slate-950">
          Notify<span className="text-indigo-600">Kit</span>
        </h1>
        <p className="mb-6 mt-2 text-sm text-slate-500">Sign in to your notification operations console.</p>
        <label className="mb-4 block text-sm font-medium">
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" required />
        </label>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <button disabled={loading} className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 font-medium text-white disabled:opacity-50">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </main>
  );
}
