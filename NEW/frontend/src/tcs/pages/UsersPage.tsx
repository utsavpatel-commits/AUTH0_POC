import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, MoreHorizontal, Plus } from 'lucide-react';
import { tcsApi, type TcsUserListItem } from '../api';
import { TcsPageHeader, TcsSearchBar } from '../components/TcsPageHeader';
import { UserAvatar } from '../components/UserAvatar';

export function UsersPage() {
  const [users, setUsers] = useState<TcsUserListItem[]>([]);
  const [q, setQ] = useState('');

  const load = () => tcsApi<TcsUserListItem[]>(`/api/tcs/users${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setUsers);
  useEffect(() => { load(); }, [q]);

  return (
    <div>
      <TcsPageHeader
        title="Users"
        description="Manage user identities across all organizations — roles, access, demo credentials, and account status."
        action={
          <button type="button" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm opacity-60 cursor-not-allowed" title="Create users from an organization's Members tab">
            <Plus size={16} /> Create User
          </button>
        }
      />

      <TcsSearchBar value={q} onChange={setQ} onReset={() => setQ('')} placeholder="Search for a user's name, email, or platform user ID" />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">User ID</th>
              <th className="px-4 py-3 text-left font-medium">Organization</th>
              <th className="px-4 py-3 text-left font-medium">Connection</th>
              <th className="px-4 py-3 text-left font-medium">Logins</th>
              <th className="px-4 py-3 text-left font-medium">Latest Login</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <UserAvatar name={u.name} email={u.email} />
                    <div>
                      <Link to={`/tcs/users/${u.id}`} className="text-brand-600 font-medium hover:text-brand-700 hover:underline block">
                        {u.name}
                      </Link>
                      <span className="text-xs text-slate-500">{u.email}</span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                    {u.user_id}
                    <button type="button" onClick={() => navigator.clipboard.writeText(u.user_id)} className="text-slate-400 hover:text-brand-600">
                      <Copy size={12} />
                    </button>
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {u.org_id ? (
                    <Link to={`/tcs/organizations/${u.org_id}`} className="text-brand-600 hover:underline">{u.org_name}</Link>
                  ) : '—'}
                </td>
                <td className="px-4 py-3 text-slate-600">{u.connection}</td>
                <td className="px-4 py-3 text-slate-600">{u.login_count}</td>
                <td className="px-4 py-3 text-slate-500">{u.latest_login}</td>
                <td className="px-4 py-3 text-slate-400"><MoreHorizontal size={18} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
