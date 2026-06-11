import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { tcsApi } from '../api';
import { RolePermissionsEditor, SecurityAccessTabs } from '../components/RolePermissionsEditor';

interface OrgRole {
  id: number | string;
  slug: string;
  name: string;
  description?: string | null;
  permissions: string[];
  is_custom?: boolean;
}

export function OrgRoleDetailPage() {
  const { orgId, roleKey } = useParams();
  const isCustom = roleKey?.startsWith('custom-');
  const customId = isCustom ? Number(roleKey?.replace('custom-', '')) : null;
  const [role, setRole] = useState<OrgRole | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tab, setTab] = useState('security-access');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!orgId) return;
    tcsApi<{ roles: OrgRole[] }>(`/api/tcs/orgs/${orgId}/roles`).then((data) => {
      const found = isCustom
        ? data.roles.find((r) => r.is_custom && r.id === customId)
        : data.roles.find((r) => !r.is_custom && (r.slug === roleKey || String(r.id) === roleKey));
      if (found) {
        setRole(found);
        setPerms(found.permissions);
        setName(found.name);
        setDescription(found.description || '');
      }
    });
  }, [orgId, roleKey, isCustom, customId]);

  const savePerms = (next: string[]) => setPerms(next);

  const save = async () => {
    if (!orgId || !role) return;
    if (isCustom && customId) {
      const updated = await tcsApi<OrgRole>(`/api/tcs/orgs/${orgId}/custom-roles/${customId}`, {
        method: 'PUT',
        body: { name, description, permissions: perms },
      });
      setRole(updated);
      setPerms(updated.permissions);
      setName(updated.name);
    } else {
      const updated = await tcsApi<OrgRole>(`/api/tcs/orgs/${orgId}/roles/${role.slug}`, {
        method: 'PUT',
        body: { permissions: perms },
      });
      setRole({ ...role, permissions: updated.permissions });
      setPerms(updated.permissions);
    }
    setMsg('Role access saved for this organization.');
  };

  if (!role) return <p className="text-slate-400 text-sm">Loading role…</p>;

  return (
    <div>
      <Link to={`/tcs/organizations/${orgId}?tab=roles`} className="text-sm text-slate-500 hover:text-navy-800 inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to organization roles
      </Link>
      <h1 className="text-2xl font-bold text-navy-800">{role.name}</h1>
      <p className="text-sm text-slate-500 mb-4">
        {isCustom ? 'Organization custom role' : 'Platform role — org-specific permission override'}
      </p>

      <SecurityAccessTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'role-info', label: 'Role Info' },
          { id: 'security-access', label: 'Security & Access' },
        ]}
      />

      {tab === 'role-info' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 max-w-lg space-y-4">
          {isCustom && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-1">Description</label>
                <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </>
          )}
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">Slug:</span> {role.slug}
          </div>
          <div className="text-sm text-slate-600">
            <span className="font-semibold text-navy-800">Type:</span> {isCustom ? 'Custom' : 'Platform (org override)'}
          </div>
        </div>
      )}

      {tab === 'security-access' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60">
            <h2 className="font-semibold text-navy-800 mb-4">Role Status</h2>
            <label className="block text-xs text-slate-500 mb-1">Assignment</label>
            <div className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm text-navy-800">
              Users keep this role — only area access changes
            </div>
            <p className="text-xs text-slate-400 mt-4">
              Toggle permissions below without reassigning users. Members with this role inherit these settings unless they have individual overrides.
            </p>
          </section>

          <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60">
            <RolePermissionsEditor
              accessLevelValue={role.name}
              accessLevelReadOnly={!isCustom}
              permissions={perms}
              onPermissionsChange={savePerms}
              showTcsModules={false}
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
