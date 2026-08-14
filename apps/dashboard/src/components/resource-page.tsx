'use client';

import { useCallback, useEffect, useState } from 'react';
import { dashboardFetch } from '../lib/api';
import { PageIntro, PrimaryButton, StatusPill } from './ui';

function present(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Enabled' : 'Disabled';
  if (typeof value === 'object') {
    if (Array.isArray(value) && value.every((item) => ['string', 'number', 'boolean'].includes(typeof item))) return value.join(', ');
    return JSON.stringify(value);
  }
  return String(value).replaceAll('_', ' ');
}

export function ResourcePage({ title, endpoint, description }: { title: string; endpoint: string; description: string }) {
  const [data, setData] = useState<unknown>(null); const [error, setError] = useState('');
  const load = useCallback(() => {
    const token = window.localStorage.getItem('notification-dashboard-token');
    if (!token) return;
    setError('');
    void dashboardFetch(endpoint, token).then(setData).catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to load data'));
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);
  const records = Array.isArray(data) ? data.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object') : [];
  const object = !Array.isArray(data) && data && typeof data === 'object' ? data as Record<string, unknown> : null;
  const columns = records.length ? Object.keys(records[0]).filter((key) => !['id', 'definition', 'secret', 'passwordHash', 'payload'].includes(key)).slice(0, 5) : [];
  return <><PageIntro eyebrow="Operations" title={title} description={description} action={error ? <PrimaryButton onClick={load}>Retry</PrimaryButton> : undefined} /><section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{error ? <div className="p-6 text-sm text-rose-700">{error}</div> : data === null ? <div className="p-8 text-sm text-slate-500">Loading {title.toLowerCase()}…</div> : object ? <dl className="grid divide-y divide-slate-100 sm:grid-cols-2 sm:divide-x sm:divide-y-0">{Object.entries(object).map(([key, value]) => <div key={key} className="min-w-0 p-5"><dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{key.replaceAll('_', ' ')}</dt><dd className="mt-2 break-words text-sm text-slate-700">{key === 'status' && typeof value === 'string' ? <StatusPill value={value} /> : present(value)}</dd></div>)}</dl> : !records.length ? <div className="p-8 text-sm text-slate-500">No records yet.</div> : <div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500"><tr>{columns.map((column) => <th key={column} className="px-5 py-3">{column.replaceAll('_', ' ')}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{records.map((record, index) => <tr key={String(record.id ?? index)} className="hover:bg-slate-50">{columns.map((column) => <td key={column} className="max-w-xs px-5 py-4 text-slate-600">{column === 'status' ? <StatusPill value={typeof record[column] === 'string' ? record[column] : null} /> : <span className="line-clamp-2">{present(record[column])}</span>}</td>)}</tr>)}</tbody></table></div>}</section></>;
}
