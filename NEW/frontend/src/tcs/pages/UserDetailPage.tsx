import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Copy } from 'lucide-react';
import { tcsApi, type TcsUser } from '../api';
import { RolePermissionsEditor, SecurityAccessTabs } from '../components/RolePermissionsEditor';
import { CUSTOMER_ROLE_OPTIONS } from '../permissionSchema';

export function UserDetailPage() {
  const { userId } = useParams();
  const [user, setUser] = useState<TcsUser | null>(null);
  const [perms, setPerms] = useState<string[]>([]);
  const [roles, setRoles] = useState<{ id: string; label: string }[]>([]);
  const [tab, setTab] = useState('security-access');
  const [msg, setMsg] = useState('');

  const load = () => {
    if (!userId) return;
    tcsApi<TcsUser>(`/api/tcs/users/${userId}`).then((u) => {
      setUser(u);
      setPerms(u.permissions || []);
      if (u.org_id) {
        tcsApi<{ roles: { slug: string; name: string }[] }>(`/api/tcs/orgs/${u.org_id}/roles`).then((d) => {
          setRoles(d.roles.map((r) => ({ id: r.slug, label: r.name })));
        });
      }
    });
  };

  useEffect(load, [userId]);

  const togglePerm = (next: string[]) => setPerms(next);

  const save = async () => {
    if (!user) return;
    const updated = await tcsApi<TcsUser>(`/api/tcs/users/${user.id}`, {
      method: 'PUT',
      body: { role: user.role, is_active: user.website_access === 'enabled', permissions: perms },
    });
    setUser(updated);
    setPerms(updated.permissions);
    setMsg('Saved. Permission toggles updated without changing role.');
  };

  const resetToRole = async () => {
    if (!user) return;
    const updated = await tcsApi<TcsUser>(`/api/tcs/users/${user.id}`, {
      method: 'PUT',
      body: { reset_permissions_to_role: true },
    });
    setUser(updated);
    setPerms(updated.permissions);
    setMsg('Reset to role defaults.');
  };

  if (!user) return <p className="text-slate-400 text-sm">Loading…</p>;

  const roleOptions = roles.length ? roles : CUSTOMER_ROLE_OPTIONS;

  return (
    <div>
      <Link to={`/tcs/organizations/${user.org_id}`} className="text-sm text-slate-500 hover:text-navy-800 inline-flex items-center gap-1 mb-4">
        <ArrowLeft size={14} /> Back to organization
      </Link>
      <h1 className="text-2xl font-bold text-navy-800">{user.name}</h1>
      <p className="text-sm text-slate-500 mb-4">{user.email} · {user.org_name}</p>

      <SecurityAccessTabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'user-info', label: 'User Info' },
          { id: 'security-access', label: 'Security & Access' },
        ]}
      />

      {tab === 'user-info' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 max-w-lg space-y-3 text-sm">
          <div><span className="text-slate-500">Email</span><div className="text-navy-800">{user.email}</div></div>
          <div><span className="text-slate-500">Organization</span><div className="text-navy-800">{user.org_name}</div></div>
          <div><span className="text-slate-500">Role</span><div className="text-navy-800 capitalize">{user.role.replace(/_/g, ' ')}</div></div>
          <div><span className="text-slate-500">Platform ID</span><div className="font-mono text-xs text-slate-600">platform|{String(user.id).padStart(8, '0')}</div></div>
        </div>
      )}

      {tab === 'security-access' && (
        <>
          <div className="grid lg:grid-cols-2 gap-4">
            <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60">
              <h2 className="font-semibold text-navy-800 mb-4">Website Access</h2>
              <label className="block text-xs text-slate-500 mb-1">Website Access</label>
              <select
                value={user.website_access}
                onChange={(e) => setUser({ ...user, website_access: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm mb-4"
              >
                <option value="enabled">Enabled</option>
                <option value="disabled">Disabled</option>
              </select>

              {user.demo_password && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 text-sm mb-4">
                  <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-1">Demo credentials</div>
                  <div className="text-slate-700 text-xs">Email: {user.email}</div>
                  <div className="flex items-center gap-2 text-slate-700 text-xs mt-1">
                    Password: <code className="font-mono">{user.demo_password}</code>
                    <button type="button" onClick={() => navigator.clipboard.writeText(user.demo_password!)} className="text-slate-400 hover:text-brand-600">
                      <Copy size={14} />
                    </button>
                  </div>
                </div>
              )}

              {user.invite_pending && (
                <p className="text-xs text-amber-700 mb-3 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Invitation pending — this user has not joined the organization yet.
                </p>
              )}

              {user.role !== 'end_user' && !user.demo_password && (
                <button
                  type="button"
                  onClick={() => tcsApi<{ message?: string }>(`/api/tcs/users/${user.id}/invite`, { method: 'POST' }).then((r) => setMsg(r.message || 'Invite sent to set password.'))}
                  className="text-sm text-brand-600 font-medium hover:text-brand-700"
                >
                  {user.invite_pending ? 'Resend organization invite' : 'Send organization invite'}
                </button>
              )}
            </section>

            <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60">
              {user.has_custom_permissions && (
                <p className="text-xs text-brand-600 mb-3 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2">
                  Custom area overrides active — role assignment unchanged.
                </p>
              )}
              <RolePermissionsEditor
                accessLevelLabel="Access Level"
                accessLevelValue={user.role}
                accessLevelOptions={roleOptions}
                onAccessLevelChange={(role) => {
                  setUser({ ...user, role });
                  setPerms(user.role_permissions || user.permissions);
                }}
                permissions={perms}
                onPermissionsChange={togglePerm}
                showTcsModules={false}
              />
              <button type="button" onClick={resetToRole} className="mt-3 text-xs text-slate-500 hover:text-navy-800 underline">
                Reset permissions to role default
              </button>
            </section>
          </div>

          <button type="button" onClick={save} className="mt-6 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-5 py-2.5 text-sm font-semibold shadow-sm">
            Save changes
          </button>
          {msg && <span className="ml-3 text-sm text-slate-500">{msg}</span>}
        </>
      )}
    </div>
  );
}
