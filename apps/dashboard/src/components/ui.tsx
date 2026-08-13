import type { ReactNode } from 'react';

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600">{eyebrow}</p><h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{title}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{action}</div>;
}

export function PrimaryButton({ children, type = 'button', onClick, disabled }: { children: ReactNode; type?: 'button' | 'submit'; onClick?: () => void; disabled?: boolean }) {
  return <button type={type} onClick={onClick} disabled={disabled} className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{children}</button>;
}

export function StatusPill({ value }: { value: string | null | undefined }) {
  const normalized = value?.toLowerCase() ?? 'unknown';
  const colour = normalized.includes('fail') || normalized.includes('cancel') || normalized.includes('disable') || normalized.includes('revoke') ? 'bg-rose-50 text-rose-700 ring-rose-600/20' : normalized.includes('active') || normalized.includes('sent') || normalized.includes('deliver') ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' : normalized.includes('queue') || normalized.includes('process') || normalized.includes('draft') ? 'bg-amber-50 text-amber-700 ring-amber-600/20' : 'bg-slate-100 text-slate-700 ring-slate-500/20';
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${colour}`}>{value?.replaceAll('_', ' ') ?? 'Unknown'}</span>;
}

export function Input({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<input {...props} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>;
}

export function Select({ label, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<select {...props} className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100">{children}</select></label>;
}

export function Textarea({ label, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string }) {
  return <label className="block text-sm font-medium text-slate-700">{label}<textarea {...props} className="mt-1.5 min-h-24 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" /></label>;
}
