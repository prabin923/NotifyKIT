'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const links = [
  ['Dashboard', '/'], ['Notifications', '/notifications'], ['Events', '/events'], ['Templates', '/templates'], ['Workflows', '/workflows'], ['Users', '/users'], ['Devices', '/devices'], ['Channels', '/channels'], ['Providers', '/providers'], ['Webhooks', '/webhooks'], ['Analytics', '/analytics'], ['API Keys', '/api-keys'], ['Logs', '/logs'], ['Settings', '/settings'],
];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname(); const router = useRouter(); const [email, setEmail] = useState('');
  useEffect(() => { const identity = window.localStorage.getItem('notification-dashboard-user'); if (identity) setEmail(JSON.parse(identity).email ?? ''); }, []);
  const logout = () => { window.localStorage.removeItem('notification-dashboard-token'); window.localStorage.removeItem('notification-dashboard-user'); router.push('/'); window.location.reload(); };
  return <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
    <aside className="border-b border-slate-200 bg-slate-950 px-4 py-6 text-slate-300 lg:min-h-screen lg:border-b-0">
      <div className="mb-8 px-3"><div className="text-xl font-bold text-white">Notify<span className="text-indigo-400">Kit</span></div><p className="mt-1 text-xs text-slate-500">Notification operations</p></div>
      <nav className="grid grid-cols-2 gap-1 lg:grid-cols-1">{links.map(([name, href]) => <Link key={href} href={href} className={`rounded-lg px-3 py-2 text-sm transition ${pathname === href ? 'bg-indigo-500 text-white' : 'hover:bg-slate-800 hover:text-white'}`}>{name}</Link>)}</nav>
      {email && <div className="mt-8 border-t border-slate-800 px-3 pt-4 text-xs"><p className="truncate text-slate-400">{email}</p><button onClick={logout} className="mt-2 text-indigo-300 hover:text-white">Sign out</button></div>}
    </aside>
    <main className="min-w-0"><header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4"><div><p className="text-sm text-slate-500">Operations console</p><h1 className="text-lg font-semibold capitalize">{pathname === '/' ? 'Dashboard' : pathname.slice(1).replace('-', ' ')}</h1></div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">Systems operational</span></header><div className="p-5 lg:p-8">{children}</div></main>
  </div>;
}
