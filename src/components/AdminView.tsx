import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  Download,
  Shield,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { apiFetch, downloadAuthorizedFile, getAuthToken } from '../lib/api';
import { UserProfile, UserRole } from '../types';
import { StatusText } from './StatusText';

interface AuditLogRow {
  id: number;
  user_email: string;
  action: string;
  entity_type: string;
  entity_id: string;
  details: string;
  ip_address: string;
  created_at: string;
}

export function AdminView({ currentUser }: { currentUser: UserProfile }) {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [tab, setTab] = useState<'users' | 'logs' | 'backup'>('users');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const [newUser, setNewUser] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'Safety Officer' as UserRole,
    department: 'Plant HSE',
    designation: 'Safety Officer',
  });

  async function loadAdminData() {
    try {
      const [uRes, lRes] = await Promise.all([
        apiFetch<{ users: UserProfile[] }>('/api/users'),
        apiFetch<{ logs: AuditLogRow[] }>('/api/audit-logs'),
      ]);
      setUsers(uRes.users);
      setLogs(lRes.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data.');
    }
  }

  useEffect(() => {
    loadAdminData();
  }, []);

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMsg('');
    try {
      await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(newUser),
      });
      setShowCreateUser(false);
      setNewUser({
        fullName: '',
        email: '',
        password: '',
        role: 'Safety Officer',
        department: 'Plant HSE',
        designation: 'Safety Officer',
      });
      setMsg('User account created successfully.');
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user.');
    }
  }

  async function toggleUserActive(u: UserProfile) {
    setError('');
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: u.is_active ? 0 : 1 }),
      });
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update user status.');
    }
  }

  async function changeUserRole(u: UserProfile, role: UserRole) {
    setError('');
    try {
      await apiFetch(`/api/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      });
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update role.');
    }
  }

  async function handleRestoreUpload(file: File | undefined) {
    if (!file) return;
    setError('');
    setMsg('');
    const fd = new FormData();
    fd.append('backup', file);
    try {
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${getAuthToken() || ''}` },
        body: fd,
      });
      const json = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(json.error || 'Restore upload failed.');
      setMsg(json.message || 'Backup validated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Administration, Security &amp; Audit Logs
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Manage RBAC user accounts, inspect audit trails, and download SQLite database backups.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}
      {msg && (
        <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {msg}
        </div>
      )}

      <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
        {[
          { id: 'users', label: `Users & Roles (${users.length})` },
          { id: 'logs', label: `Audit Logs (${logs.length})` },
          { id: 'backup', label: 'Database Backup & Restore' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as typeof tab)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
              tab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h2 className="font-display text-base font-bold text-slate-900">User Directory</h2>
            <button
              onClick={() => setShowCreateUser(true)}
              className="px-3.5 py-2 rounded-lg bg-[#0B2545] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4 text-amber-400" />
              Create User
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Department</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Account Control</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4 font-semibold text-slate-900">{u.full_name}</td>
                    <td className="py-3 px-4 text-xs font-mono text-slate-600">{u.email}</td>
                    <td className="py-3 px-4">
                      <select
                        value={u.role}
                        disabled={u.id === currentUser.id}
                        onChange={(e) => changeUserRole(u, e.target.value as UserRole)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded bg-white disabled:opacity-60"
                      >
                        <option value="Admin">Admin</option>
                        <option value="Safety Officer">Safety Officer</option>
                        <option value="Supervisor">Supervisor</option>
                        <option value="Viewer">Viewer</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-600">{u.department}</td>
                    <td className="py-3 px-4">
                      <StatusText status={u.is_active ? 'Completed' : 'Fail'} />
                    </td>
                    <td className="py-3 px-4 text-right">
                      {u.id !== currentUser.id ? (
                        <button
                          onClick={() => toggleUserActive(u)}
                          className={`px-3 py-1 rounded text-xs font-semibold border cursor-pointer ${
                            u.is_active
                              ? 'border-red-200 text-red-700 hover:bg-red-50'
                              : 'border-emerald-200 text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          {u.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">Current Session</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'logs' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-700" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Security &amp; Action Audit Trail
            </h2>
          </div>
          <div className="overflow-x-auto max-h-[520px]">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <th className="py-2.5 px-4">Timestamp</th>
                  <th className="py-2.5 px-4">User</th>
                  <th className="py-2.5 px-4">Action</th>
                  <th className="py-2.5 px-4">Entity</th>
                  <th className="py-2.5 px-4">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                      {l.created_at.replace('T', ' ').slice(0, 19)}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-900">{l.user_email}</td>
                    <td className="py-2.5 px-4 font-semibold text-blue-800">{l.action}</td>
                    <td className="py-2.5 px-4 font-mono text-slate-600">
                      {l.entity_type} {l.entity_id ? `(${l.entity_id})` : ''}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">{l.details || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'backup' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-blue-800">
              <Database className="w-5 h-5" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Download Database Backup
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              Creates a consistent SQLite snapshot of all observations, inspections, documents, incidents, trainings, audits, and user records.
            </p>
            <button
              onClick={() => downloadAuthorizedFile('/api/admin/backup', 'suraj_hse_backup.db')}
              className="px-4 py-2.5 rounded-lg bg-[#0B2545] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4 text-amber-400" />
              Download SQLite Backup (.db)
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-slate-800">
              <Upload className="w-5 h-5" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Validate &amp; Stage Restore Backup
              </h2>
            </div>
            <p className="text-sm text-slate-600">
              Upload a verified <code className="font-mono text-xs">.db</code> snapshot for integrity validation and staging.
            </p>
            <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-semibold cursor-pointer">
              <Upload className="w-4 h-4" />
              Select .db Backup File
              <input
                type="file"
                accept=".db,.sqlite"
                className="hidden"
                onChange={(e) => handleRestoreUpload(e.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      )}

      {showCreateUser && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <form onSubmit={handleCreateUser} className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="font-display text-base font-bold text-slate-900">Create New User</h3>
              <button type="button" onClick={() => setShowCreateUser(false)} className="text-slate-500 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <input
                required
                placeholder="Full Name"
                value={newUser.fullName}
                onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                required
                type="email"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                required
                type="password"
                minLength={8}
                placeholder="Temporary Password (min 8 chars)"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value as UserRole })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white"
              >
                <option value="Safety Officer">Safety Officer</option>
                <option value="Supervisor">Supervisor</option>
                <option value="Viewer">Viewer</option>
                <option value="Admin">Admin</option>
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  placeholder="Department"
                  value={newUser.department}
                  onChange={(e) => setNewUser({ ...newUser, department: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
                <input
                  placeholder="Designation"
                  value={newUser.designation}
                  onChange={(e) => setNewUser({ ...newUser, designation: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCreateUser(false)}
                className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B2545] text-white cursor-pointer"
              >
                Create Account
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
