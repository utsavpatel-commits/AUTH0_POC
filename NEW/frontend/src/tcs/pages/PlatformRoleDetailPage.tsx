import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { tcsApi, type TcsRoleDefinition } from '../api';
import { RolePermissionsEditor, SecurityAccessTabs } from '../components/RolePermissionsEditor';

export function PlatformRoleDetailPage() {
  const { roleId } = useParams();
  const [role, setRole] = useState<TcsRoleDefinition | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [tab, setTab] = useState('security-access');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!roleId) return;
    tcsApi<TcsRoleDefinition>(`/api/tcs/platform-roles/${roleId}`).then((r) => {
      setRole(r);
      setPerms(r.permissions);
    });
  }, [roleId]);

  const savePerms = (next: string[]) => setPerms(next);

  const save = async () => {
    if (!role) return;
    const updated = await tcsApi<TcsRoleDefinition>(`/api/tcs/platform-roles/${role.id}`, {
      method: 'PUT',
      body: { permissions: perms },
    });
    setRole(updated);
    setPerms(updated.permissions);
    setMsg('Role permissions saved.');
  };

  if (!role) return <p className="text-slate-400 text-sm">Loading role…</p>;

  return (
    <div>
      <Link to="/tcs/roles" className="text-sm text-slate-500 hover:text-navy-800 inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to Roles
      </Link>
      <h1 className="text-2xl font-bold text-navy-800">{role.name}</h1>
      <p className="text-sm text-slate-500 mb-4">{role.description || role.slug}</p>

      <SecurityAccessTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'role-info', label: 'Role Info' },
          { id: 'security-access', label: 'Security & Access' },
        ]}
      />

      {tab === 'role-info' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 max-w-lg space-y-3 text-sm">
          <Row label="Name" value={role.name} />
          <Row label="Slug" value={role.slug} />
          <Row label="Description" value={role.description || '—'} />
          <Row label="Type" value={role.is_system ? 'System role' : 'Custom role'} />
        </div>
      )}

      {tab === 'security-access' && (
        <div className="max-w-3xl">
          <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 mb-4">
            <p className="text-xs text-slate-500">
              Platform roles apply as defaults to all organizations unless an org overrides permissions for this role.
            </p>
          </section>
          <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60">
            <RolePermissionsEditor
              accessLevelValue={role.name}
              accessLevelReadOnly
              permissions={perms}
              onPermissionsChange={savePerms}
            />
          </section>
        </div>
      )}

      {tab === 'security-access' && (
        <div className="mt-6">
          <button type="button" onClick={save} className="rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold shadow-sm">
            Save permissions
          </button>
          {msg && <span className="ml-3 text-sm text-slate-500">{msg}</span>}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-navy-800 mt-0.5">{value}</div>
    </div>
  );
}
