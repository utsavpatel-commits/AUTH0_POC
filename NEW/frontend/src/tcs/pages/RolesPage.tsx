import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Plus } from 'lucide-react';
import { tcsApi, type TcsRoleDefinition } from '../api';
import { TcsPageHeader } from '../components/TcsPageHeader';

export function RolesPage() {
  const [roles, setRoles] = useState<TcsRoleDefinition[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = () => tcsApi<{ roles: TcsRoleDefinition[] }>('/api/tcs/platform-roles').then((d) => setRoles(d.roles));
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await tcsApi('/api/tcs/platform-roles', { method: 'POST', body: { name, description, permissions: ['lms:view'] } });
    setShowCreate(false);
    setName('');
    setDescription('');
    load();
  };

  return (
    <div>
      <TcsPageHeader
        title="Roles"
        description="Platform personas with per-module access (None → Admin). Defaults apply to all orgs; override per organization or user."
        action={
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm">
            <Plus size={16} /> Create Role
          </button>
        }
      />

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Description</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3">
                  <Link to={`/tcs/roles/${r.id}`} className="text-brand-600 font-medium hover:text-brand-700 hover:underline">
                    {r.name}
                  </Link>
                  {r.is_system && <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400 font-semibold">System</span>}
                </td>
                <td className="px-4 py-3 text-slate-500">{r.description || '—'}</td>
                <td className="px-4 py-3 text-slate-400"><MoreHorizontal size={18} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-navy-900/30 flex items-center justify-center p-4 z-50">
          <form onSubmit={create} className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4 ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-navy-800">Create Role</h2>
            <div>
              <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" required />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
              <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600">Create</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
