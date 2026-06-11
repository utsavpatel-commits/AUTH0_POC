import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Copy, Plus, Trash2 } from 'lucide-react';
import { tcsApi, type TcsOrg, type TcsUser } from '../api';
import { OrgLogsPanel } from '../components/OrgLogsPanel';
import { OrgRolesPanel } from '../components/OrgRolesPanel';
import { OrgSecurityPanel } from '../components/OrgSecurityPanel';
import { UserAvatar } from '../components/UserAvatar';
import { OrgAvatar, OrgSubNav } from '../TcsLayout';

const ORG_NAV = [
  { id: 'overview', label: 'Overview' },
  { id: 'members', label: 'Members' },
  { id: 'roles', label: 'Roles' },
  { id: 'invitations', label: 'Invitations' },
  { id: 'security', label: 'Security' },
  { id: 'logs', label: 'Logs' },
];

export function OrganizationDetailPage() {
  const { orgId } = useParams();
  const [searchParams] = useSearchParams();
  const [org, setOrg] = useState<TcsOrg | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [tab, setTab] = useState(searchParams.get('tab') || 'overview');
  const [showAddMember, setShowAddMember] = useState(false);
  const [showAddSubOrg, setShowAddSubOrg] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('administrator');
  const [subOrgName, setSubOrgName] = useState('');
  const [subOrgTier, setSubOrgTier] = useState('essentials');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('administrator');
  const [inviteError, setInviteError] = useState('');
  const [showDemoUser, setShowDemoUser] = useState(false);
  const [demoRole, setDemoRole] = useState('administrator');
  const [demoCreds, setDemoCreds] = useState<TcsUser | null>(null);

  const load = () => {
    if (!orgId) return;
    setLoadError(false);
    tcsApi<TcsOrg>(`/api/tcs/orgs/${orgId}`)
      .then(setOrg)
      .catch(() => {
        setOrg(null);
        setLoadError(true);
      });
  };
  useEffect(() => {
    load();
  }, [orgId]);

  useEffect(() => {
    const t = searchParams.get('tab');
    if (t) setTab(t);
  }, [searchParams]);

  const addUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    await tcsApi('/api/tcs/users', {
      method: 'POST',
      body: { org_id: org.id, name, email, role, send_auth0_invite: role !== 'end_user' },
    });
    setShowAddMember(false);
    setName('');
    setEmail('');
    load();
  };

  const addSubOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    await tcsApi(`/api/tcs/orgs/${org.id}/sub-orgs`, {
      method: 'POST',
      body: { display_name: subOrgName, tier: subOrgTier },
    });
    setShowAddSubOrg(false);
    setSubOrgName('');
    load();
  };

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setInviteError('');
    try {
      await tcsApi(`/api/tcs/orgs/${org.id}/invitations`, {
        method: 'POST',
        body: { email: inviteEmail, role: inviteRole, send_auth0_invite: inviteRole !== 'end_user' },
      });
      setShowInvite(false);
      setInviteEmail('');
      load();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : 'Invitation failed.');
    }
  };

  const createDemoUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    const created = await tcsApi<TcsUser>(`/api/tcs/orgs/${org.id}/users/demo`, {
      method: 'POST',
      body: { role: demoRole },
    });
    setDemoCreds(created);
    load();
  };

  const revokeInvite = async (invitationId: number) => {
    if (!org || !confirm('Revoke this invitation?')) return;
    await tcsApi(`/api/tcs/orgs/${org.id}/invitations/${invitationId}`, { method: 'DELETE' });
    load();
  };

  if (loadError) {
    return (
      <p className="text-slate-500 text-sm">
        Could not load this organization.{' '}
        <Link to="/tcs/organizations" className="text-brand-600 hover:underline">Back to list</Link>
      </p>
    );
  }
  if (!org) return <p className="text-slate-400 text-sm">Loading organization…</p>;

  const backTo = org.parent_org_id
    ? `/tcs/organizations/${org.parent_org_id}`
    : '/tcs/organizations';
  const backLabel = org.parent_org_id ? `Back to ${org.parent_display_name}` : 'Back to Organizations';
  const entityLabel = org.is_sub_organization ? 'Sub-organization' : 'Organization';
  const canHaveSubOrgs = !org.is_sub_organization;

  return (
    <div>
      <Link
        to={backTo}
        className="text-sm text-slate-500 hover:text-navy-800 inline-flex items-center gap-1 mb-6"
      >
        <ArrowLeft size={14} /> {backLabel}
      </Link>

      <div className="flex items-center gap-4 mb-6">
        <OrgAvatar name={org.display_name} large />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-0.5">{entityLabel}</div>
          <h1 className="text-2xl font-bold text-navy-800 tracking-tight">{org.display_name}</h1>
          <div className="flex items-center gap-2 mt-1 text-sm text-slate-500">
            <span>Organization ID</span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
              {org.identifier}
              <button type="button" onClick={() => navigator.clipboard.writeText(org.identifier)} className="text-slate-400 hover:text-brand-600">
                <Copy size={12} />
              </button>
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-8 items-start">
        <OrgSubNav active={tab} onChange={setTab} items={ORG_NAV} />
        <div className="flex-1 min-w-0">

      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card label="Display Name" value={org.display_name} />
            <Card label="Internal Name" value={org.slug} />
            <Card label="Tier" value={org.tier} capitalize />
            <Card label="Type" value={org.is_sub_organization ? 'Sub-organization' : org.is_corporate ? 'Corporate' : 'Independent'} />
            <Card label="Facilities" value={String(org.facility_count ?? org.facilities?.length ?? 0)} />
            <Card label="Members" value={String(org.user_count ?? org.users?.length ?? 0)} />
            {canHaveSubOrgs && (
              <Card label="Sub-organizations" value={String(org.sub_org_count ?? org.sub_organizations?.length ?? 0)} />
            )}
          </div>

          {(org.address_line1 || org.contact_email || org.phone) && (
            <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60">
              <h2 className="text-sm font-semibold text-navy-800 mb-3">Contact &amp; Address</h2>
              <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                {org.address_line1 && (
                  <div className="sm:col-span-2">
                    <dt className="text-slate-400 text-xs font-medium uppercase tracking-wide">Address</dt>
                    <dd className="text-slate-700 mt-0.5">
                      {org.address_line1}
                      {org.address_line2 && <><br />{org.address_line2}</>}
                      {(org.city || org.state || org.postal_code) && (
                        <><br />{[org.city, org.state, org.postal_code].filter(Boolean).join(', ')}</>
                      )}
                      {org.country && org.country !== 'US' && <><br />{org.country}</>}
                    </dd>
                  </div>
                )}
                {org.phone && (
                  <div>
                    <dt className="text-slate-400 text-xs font-medium uppercase tracking-wide">Phone</dt>
                    <dd className="text-slate-700 mt-0.5">{org.phone}</dd>
                  </div>
                )}
                {org.contact_email && (
                  <div>
                    <dt className="text-slate-400 text-xs font-medium uppercase tracking-wide">Organization Email</dt>
                    <dd className="text-slate-700 mt-0.5">{org.contact_email}</dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {canHaveSubOrgs && (
            <section>
              <div className="flex justify-between items-center mb-3">
                <h2 className="text-sm font-semibold text-navy-800">Sub-organizations</h2>
                <button
                  type="button"
                  onClick={() => setShowAddSubOrg(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus size={14} /> Create Sub-organization
                </button>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-medium w-12" />
                      <th className="px-4 py-3 font-medium">Display Name</th>
                      <th className="px-4 py-3 font-medium">Name</th>
                      <th className="px-4 py-3 font-medium">Identifier</th>
                      <th className="px-4 py-3 font-medium">Members</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(org.sub_organizations || []).length === 0 && (
                      <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No sub-organizations yet.</td></tr>
                    )}
                    {(org.sub_organizations || []).map((sub) => (
                      <tr key={sub.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                        <td className="px-4 py-3"><OrgAvatar name={sub.display_name} /></td>
                        <td className="px-4 py-3">
                          <Link to={`/tcs/organizations/${sub.id}`} className="text-brand-600 font-medium hover:text-brand-700 hover:underline">
                            {sub.display_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{sub.slug}</td>
                        <td className="px-4 py-3 text-slate-500 font-mono text-xs">{sub.identifier}</td>
                        <td className="px-4 py-3 text-slate-600">{sub.user_count ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === 'roles' && org && <OrgRolesPanel orgId={org.id} />}

      {tab === 'members' && (
        <>
          <div className="flex flex-wrap justify-between items-center gap-3 mb-4">
            <p className="text-sm text-slate-500">Manage members, roles, and per-user access on Security &amp; Access.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => { setShowDemoUser(true); setDemoCreds(null); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Plus size={16} /> Create demo user
              </button>
              <button
                type="button"
                onClick={() => setShowAddMember(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm font-semibold shadow-sm"
              >
                <Plus size={16} /> Add Member
              </button>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">User ID</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Connection</th>
                  <th className="px-4 py-3 font-medium">Access</th>
                </tr>
              </thead>
              <tbody>
                {(org.users || []).length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No members yet.</td></tr>
                )}
                {(org.users || []).map((u) => (
                  <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <UserAvatar name={u.name} email={u.email} />
                        <div>
                          <Link to={`/tcs/users/${u.id}`} className="text-brand-600 font-medium hover:text-brand-700 block">
                            {u.name}
                          </Link>
                          <span className="text-xs text-slate-500">{u.email}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600">
                        platform|{String(u.id).padStart(8, '0')}
                      </span>
                    </td>
                    <td className="px-4 py-3 capitalize">{u.role.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {u.role === 'end_user' && !u.demo_password ? 'email' : u.demo_password ? 'Username-Password-Authentication (demo)' : 'Username-Password-Authentication'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2 capitalize">
                        <span>{u.website_access}</span>
                        {u.invite_pending && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 normal-case">
                            Invite pending
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'invitations' && (
        <>
          <div className="flex justify-between items-center mb-4">
            <p className="text-sm text-slate-500">Invite users to join this {entityLabel.toLowerCase()}. Staff receive an email to accept the invitation and set their password.</p>
            <button
              type="button"
              onClick={() => setShowInvite(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 text-sm font-semibold shadow-sm"
            >
              <Plus size={16} /> Invite Member
            </button>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-left text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium w-16" />
                </tr>
              </thead>
              <tbody>
                {(org.invitations || []).length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No pending invitations.</td></tr>
                )}
                {(org.invitations || []).map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                    <td className="px-4 py-3 text-slate-700">{inv.email}</td>
                    <td className="px-4 py-3 capitalize">{inv.role.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => revokeInvite(inv.id)} className="text-slate-400 hover:text-red-600" title="Revoke invitation">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'security' && org && <OrgSecurityPanel orgId={org.id} />}

      {tab === 'logs' && org && <OrgLogsPanel orgId={org.id} />}

        </div>
      </div>

      {showAddMember && (
        <Modal onClose={() => setShowAddMember(false)}>
          <form onSubmit={addUser} className="space-y-4">
            <h2 className="text-lg font-bold text-navy-800">Add member to {org.display_name}</h2>
            <Field label="Name" value={name} onChange={setName} required />
            <Field label="Email" value={email} onChange={setEmail} type="email" required />
            <RoleSelect value={role} onChange={setRole} />
            <ModalActions onCancel={() => setShowAddMember(false)} submitLabel="Add Member" />
          </form>
        </Modal>
      )}

      {showAddSubOrg && (
        <Modal onClose={() => setShowAddSubOrg(false)}>
          <form onSubmit={addSubOrg} className="space-y-4">
            <h2 className="text-lg font-bold text-navy-800">Create sub-organization</h2>
            <p className="text-sm text-slate-500">Sub-organizations inherit connections from the parent and have their own members.</p>
            <Field label="Display Name" value={subOrgName} onChange={setSubOrgName} required />
            <div>
              <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Tier</label>
              <select value={subOrgTier} onChange={(e) => setSubOrgTier(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                <option value="essentials">Essentials</option>
                <option value="professional">Professional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <ModalActions onCancel={() => setShowAddSubOrg(false)} submitLabel="Create" />
          </form>
        </Modal>
      )}

      {showDemoUser && (
        <Modal onClose={() => { setShowDemoUser(false); setDemoCreds(null); }}>
          {demoCreds ? (
            <div className="space-y-4">
              <h2 className="text-lg font-bold text-navy-800">Demo user created</h2>
              <p className="text-sm text-slate-500">Save these credentials — the password is stored for reference in Security &amp; Access.</p>
              <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm space-y-1 font-mono">
                <div>Email: {demoCreds.email}</div>
                <div>Password: {demoCreds.demo_password}</div>
                <div>Role: {demoCreds.role.replace(/_/g, ' ')}</div>
              </div>
              <div className="flex justify-end gap-2">
                <Link to={`/tcs/users/${demoCreds.id}`} className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600">
                  Open Security &amp; Access
                </Link>
                <button type="button" onClick={() => { setShowDemoUser(false); setDemoCreds(null); }} className="px-4 py-2 text-sm text-slate-600">Close</button>
              </div>
            </div>
          ) : (
            <form onSubmit={createDemoUser} className="space-y-4">
              <h2 className="text-lg font-bold text-navy-800">Create demo user</h2>
              <p className="text-sm text-slate-500">Generates a dummy email and password for testing org login and permissions.</p>
              <RoleSelect value={demoRole} onChange={setDemoRole} />
              <ModalActions onCancel={() => setShowDemoUser(false)} submitLabel="Generate credentials" />
            </form>
          )}
        </Modal>
      )}

      {showInvite && (
        <Modal onClose={() => setShowInvite(false)}>
          <form onSubmit={sendInvite} className="space-y-4">
            <h2 className="text-lg font-bold text-navy-800">Invite member</h2>
            {inviteRole === 'end_user' && (
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                End users sign in with passwordless OTP — no Auth0 password email is sent. Add them as a member instead.
              </p>
            )}
            {inviteError && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{inviteError}</p>
            )}
            <Field label="Email" value={inviteEmail} onChange={setInviteEmail} type="email" required />
            <RoleSelect value={inviteRole} onChange={setInviteRole} />
            <ModalActions onCancel={() => setShowInvite(false)} submitLabel="Send Invitation" />
          </form>
        </Modal>
      )}
    </div>
  );
}

function Card({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 ring-1 ring-slate-200/60">
      <div className="text-xs text-slate-500 uppercase tracking-wide font-medium">{label}</div>
      <div className={`mt-1 text-lg font-semibold text-navy-800 ${capitalize ? 'capitalize' : ''}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === 'sent'
      ? 'bg-blue-50 text-blue-700'
      : status === 'accepted'
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-amber-50 text-amber-700';
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${styles}`}>
      {status}
    </span>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Role</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
        <option value="customer_admin">Customer Admin</option>
        <option value="administrator">Administrator</option>
        <option value="don">DON</option>
        <option value="staff_educator">Staff Educator</option>
        <option value="corporate_leader">Corporate Leader</option>
        <option value="end_user">End User</option>
      </select>
    </div>
  );
}

function Modal({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-navy-900/30 flex items-center justify-center p-4 z-50" onClick={onClose} role="presentation">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 ring-1 ring-slate-200" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, submitLabel }: { onCancel: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate-600">Cancel</button>
      <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600">{submitLabel}</button>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-400 focus:border-brand-400" />
    </div>
  );
}
