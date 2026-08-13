'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { dashboardFetch } from '../lib/api';
import { Input, PageIntro, PrimaryButton, StatusPill, Textarea } from './ui';

interface EventRecord {
  id: string;
  eventType: string;
  externalEventId: string | null;
  status: string;
  createdAt: string;
}

function optionalValue(value: FormDataEntryValue | null): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

export function EventWorkspace() {
  const [items, setItems] = useState<EventRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('notification-dashboard-token');
    if (!token) return;
    try {
      setItems(await dashboardFetch<EventRecord[]>('/v1/dashboard/events', token));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load events');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget; const form = new FormData(formElement);
    const rawData = String(form.get('data') ?? '').trim();
    let data: Record<string, unknown> | undefined;
    try {
      if (rawData) {
        const parsed: unknown = JSON.parse(rawData);
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('Event data must be a JSON object.');
        data = parsed as Record<string, unknown>;
      }
      setBusy(true);
      setError('');
      const token = window.localStorage.getItem('notification-dashboard-token');
      if (!token) throw new Error('Sign in again to create an event.');
      const result = await dashboardFetch<{ event_id: string; notification_ids: string[] }>('/v1/dashboard/events', token, {
        method: 'POST',
        body: {
          event: form.get('event'),
          external_event_id: optionalValue(form.get('external_event_id')),
          idempotency_key: optionalValue(form.get('idempotency_key')),
          user: {
            id: form.get('user_id'),
            email: optionalValue(form.get('email')),
            name: optionalValue(form.get('name')),
          },
          ...(data ? { data } : {}),
        },
      });
      formElement.reset();
      setOpen(false);
      setMessage(`Event accepted${result.notification_ids.length ? ` and created ${result.notification_ids.length} notification${result.notification_ids.length === 1 ? '' : 's'}` : ''}.`);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create event');
    } finally {
      setBusy(false);
    }
  };

  return <><PageIntro eyebrow="Event intake" title="Events" description="Create universal events to trigger active workflows and notification templates for this tenant." action={<PrimaryButton onClick={() => setOpen((value) => !value)}>{open ? 'Close composer' : 'Create event'}</PrimaryButton>} />
    {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
    {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    {open && <form onSubmit={submit} className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm"><div className="grid gap-4 md:grid-cols-2"><Input label="Event type" name="event" placeholder="order.created" pattern="[a-z][a-z0-9]*(\.[a-z][a-z0-9_-]*)+" title="Use dot-separated lowercase words, for example order.created." required /><Input label="External event ID (optional)" name="external_event_id" placeholder="order_123" /><Input label="User ID" name="user_id" placeholder="user_123" required /><Input label="User name (optional)" name="name" placeholder="Aarav Sharma" /><Input label="User email (optional)" name="email" type="email" placeholder="aarav@example.com" /><Input label="Idempotency key (optional)" name="idempotency_key" placeholder="order_123.created" /><div className="md:col-span-2"><Textarea label="Event data (optional JSON object)" name="data" placeholder={'{\n  "order_total": 2500,\n  "currency": "NPR"\n}'} /></div></div><div className="mt-5"><PrimaryButton type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create event'}</PrimaryButton></div></form>}
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Event type</th><th className="px-5 py-3">External ID</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th></tr></thead><tbody className="divide-y divide-slate-100">{items.map((item) => <tr key={item.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-medium text-slate-900">{item.eventType}</td><td className="px-5 py-4 text-slate-600">{item.externalEventId ?? '—'}</td><td className="px-5 py-4"><StatusPill value={item.status} /></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{new Date(item.createdAt).toLocaleString()}</td></tr>)}{!items.length && <tr><td colSpan={4} className="px-5 py-12 text-center text-slate-500">No events have been created yet.</td></tr>}</tbody></table></div></section>
  </>;
}
