'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { dashboardFetch } from '../lib/api';
import { Input, PageIntro, PrimaryButton, Select, StatusPill } from './ui';

interface UserRecord {
  id: string;
  externalId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  _count?: { devices?: number; notifications?: number };
}

export function UserWorkspace() {
  const [items, setItems] = useState<UserRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const token = window.localStorage.getItem('notification-dashboard-token');
    if (!token) return;
    try {
      const data = await dashboardFetch<UserRecord[]>('/v1/dashboard/users', token);
      setItems(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load users');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submitCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const token = window.localStorage.getItem('notification-dashboard-token');
      if (!token) throw new Error('Sign in again to add a user.');
      await dashboardFetch('/v1/dashboard/users', token, {
        method: 'POST',
        body: {
          external_id: form.get('external_id'),
          name: form.get('name') || undefined,
          email: form.get('email') || undefined,
          phone: form.get('phone') || undefined,
        },
      });
      setOpen(false);
      setMessage('User created/updated successfully.');
      formElement.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to create user');
    } finally {
      setBusy(false);
    }
  };

  const submitUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingUser) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const token = window.localStorage.getItem('notification-dashboard-token');
      if (!token) throw new Error('Sign in again to edit a user.');
      await dashboardFetch(`/v1/dashboard/users/${editingUser.id}`, token, {
        method: 'PATCH',
        body: {
          name: form.get('name') || undefined,
          email: form.get('email') || undefined,
          phone: form.get('phone') || undefined,
          status: form.get('status') || undefined,
        },
      });
      setEditingUser(null);
      setMessage('User updated successfully.');
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to update user');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageIntro
        eyebrow="Identity & Devices"
        title="Users"
        description="Manage tenant end users, configure email/phone credentials, and monitor device activity."
        action={
          <PrimaryButton onClick={() => { setEditingUser(null); setOpen((value) => !value); }}>
            {open ? 'Close form' : 'Add user'}
          </PrimaryButton>
        }
      />
      {message && <div className="mb-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}

      {/* Create Form */}
      {open && (
        <form onSubmit={submitCreate} className="mb-6 rounded-xl border border-indigo-100 bg-indigo-50/50 p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-slate-900">Add New User</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="External User ID" name="external_id" placeholder="usr_12345" required />
            <Input label="Full Name" name="name" placeholder="Jane Doe" />
            <Input label="Email Address" name="email" type="email" placeholder="jane@example.com" />
            <Input label="Phone Number" name="phone" placeholder="+1234567890" />
          </div>
          <div className="mt-5 flex gap-3">
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Create User'}
            </PrimaryButton>
          </div>
        </form>
      )}

      {/* Edit Form Modal/Panel */}
      {editingUser && (
        <form onSubmit={submitUpdate} className="mb-6 rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Edit User: <span className="font-mono text-indigo-600">{editingUser.externalId}</span>
            </h2>
            <button type="button" onClick={() => setEditingUser(null)} className="text-xs font-semibold text-slate-500 hover:text-slate-700">
              Cancel
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Input label="Full Name" name="name" defaultValue={editingUser.name ?? ''} placeholder="Jane Doe" />
            <Input label="Email Address" name="email" type="email" defaultValue={editingUser.email ?? ''} placeholder="jane@example.com" />
            <Input label="Phone Number" name="phone" defaultValue={editingUser.phone ?? ''} placeholder="+1234567890" />
            <Select label="Status" name="status" defaultValue={editingUser.status}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="BLOCKED">Blocked</option>
            </Select>
          </div>
          <div className="mt-5 flex gap-3">
            <PrimaryButton type="submit" disabled={busy}>
              {busy ? 'Updating…' : 'Save Changes'}
            </PrimaryButton>
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Users Table */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-5 py-3">External ID</th>
                <th className="px-5 py-3">Name</th>
                <th className="px-5 py-3">Email</th>
                <th className="px-5 py-3">Phone</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Devices</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-5 py-4 font-mono font-medium text-slate-900">{item.externalId}</td>
                  <td className="px-5 py-4 text-slate-700">{item.name ?? '—'}</td>
                  <td className="px-5 py-4 text-slate-600">{item.email ?? <span className="text-xs text-slate-400">No email</span>}</td>
                  <td className="px-5 py-4 text-slate-600">{item.phone ?? '—'}</td>
                  <td className="px-5 py-4">
                    <StatusPill value={item.status} />
                  </td>
                  <td className="px-5 py-4 text-slate-500">{item._count?.devices ?? 0}</td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => { setOpen(false); setEditingUser(item); }}
                      className="text-sm font-semibold text-indigo-600 hover:text-indigo-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    No users created yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
