'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { dashboardFetch } from '../lib/api';
import { Input, PageIntro, PrimaryButton, StatusPill } from './ui';

interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  status: string;
  createdAt: string;
  _count?: { deliveries: number };
}

export function WebhookWorkspace() {
  const [items, setItems] = useState<WebhookRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [secret, setSecret] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('notification-dashboard-token');
    if (!token) return;
    try {
      setItems(await dashboardFetch<WebhookRecord[]>('/v1/dashboard/webhooks', token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load webhooks');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError('');
    try {
      const token = window.localStorage.getItem('notification-dashboard-token');
      if (!token) throw new Error('Sign in again to create a webhook.');
      const created = await dashboardFetch<{ secret: string }>('/v1/dashboard/webhooks', token, {
        method: 'POST',
        body: {
          url: form.get('url'),
          events: String(form.get('events')).split(',').map((value) => value.trim()).filter(Boolean),
          ...(form.get('secret') ? { secret: form.get('secret') } : {}),
        },
      });
      setSecret(created.secret);
      formElement.reset();
      setOpen(false);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create webhook');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (webhook: WebhookRecord, status: 'ACTIVE' | 'DISABLED') => {
    if (status === 'DISABLED' && !window.confirm(`Disable deliveries to ${webhook.url}?`)) return;
    setBusy(true);
    setError('');
    try {
      const token = window.localStorage.getItem('notification-dashboard-token');
      if (!token) throw new Error('Sign in again to manage webhooks.');
      await dashboardFetch(`/v1/dashboard/webhooks/${webhook.id}`, token, { method: 'PATCH', body: { status } });
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update webhook');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <PageIntro eyebrow="Outbound integration" title="Webhooks" description="Send signed delivery events back to client systems. Pause an endpoint before maintenance and reactivate it when ready." action={<PrimaryButton onClick={() => setOpen((value) => !value)}>{open ? 'Close form' : 'New webhook'}</PrimaryButton>} />
    {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {secret && <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">Copy this webhook signing secret now.</p><code className="mt-2 block overflow-auto rounded bg-white p-2 text-xs">{secret}</code><button onClick={() => setSecret(null)} className="mt-3 font-semibold text-amber-800">I saved it</button></div>}
    {open && <form onSubmit={submit} className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5"><div className="grid gap-4 md:grid-cols-2"><Input label="HTTPS endpoint" name="url" type="url" placeholder="https://client.example.com/webhooks/notifications" required /><Input label="Events" name="events" defaultValue="notification.sent" placeholder="notification.sent, notification.delivered" required /><Input label="Signing secret (optional)" name="secret" placeholder="Generated if empty" /></div><div className="mt-5"><PrimaryButton type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create webhook'}</PrimaryButton></div></form>}
    <section className="space-y-3">
      {items.map((item) => <article key={item.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate font-semibold text-slate-900">{item.url}</p><div className="mt-2 flex flex-wrap gap-2">{item.events.map((event) => <span key={event} className="rounded bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{event}</span>)}</div></div><div className="flex items-center gap-5"><div className="text-right text-xs text-slate-400"><p>{item._count?.deliveries ?? 0} attempts</p><p className="mt-1">Created {new Date(item.createdAt).toLocaleDateString()}</p></div><StatusPill value={item.status} /><button disabled={busy} onClick={() => void setStatus(item, item.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE')} className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">{item.status === 'ACTIVE' ? 'Disable' : 'Activate'}</button></div></article>)}
      {!items.length && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">No client callbacks configured.</div>}
    </section>
  </>;
}
