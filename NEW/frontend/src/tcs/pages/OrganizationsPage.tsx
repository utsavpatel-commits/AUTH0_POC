import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { tcsApi, type TcsOrg, type TcsUser } from '../api';
import { OrgAvatar } from '../TcsLayout';

const EMPTY_FORM = {
  display_name: '',
  tier: 'essentials',
  is_corporate: false,
  address_line1: '',
  address_line2: '',
  city: '',
  state: '',
  postal_code: '',
  country: 'US',
  phone: '',
  contact_email: '',
  admin_name: '',
  admin_email: '',
};

export function OrganizationsPage() {
  const [orgs, setOrgs] = useState<TcsOrg[]>([]);
  const [q, setQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [inviteResult, setInviteResult] = useState<{
    message: string;
    adminUserId?: number;
    adminEmail?: string;
    orgId?: number;
    orgName?: string;
    invitationUrl?: string;
    passwordSetupUrl?: string;
    postPasswordRedirectUrl?: string;
  } | null>(null);
  const [resendBusy, setResendBusy] = useState(false);

  const load = () => tcsApi<TcsOrg[]>(`/api/tcs/orgs${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setOrgs);
  useEffect(() => { load(); }, [q]);

  const set = (key: keyof typeof EMPTY_FORM, value: string | boolean) => {
    setForm((f) => ({ ...f, [key]: value }));
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const res = await tcsApi<TcsOrg & {
        message?: string;
        admin_user?: TcsUser;
        invite_email?: string;
        invitation_url?: string;
        password_setup_url?: string;
        post_password_redirect_url?: string;
      }>('/api/tcs/orgs', {
        method: 'POST',
        body: {
          ...form,
          address_line2: form.address_line2 || undefined,
          contact_email: form.contact_email || undefined,
        },
      });
      setShowCreate(false);
      setForm(EMPTY_FORM);
      setInviteResult({
        message: res.message || 'Organization created.',
        adminUserId: res.admin_user?.id,
        adminEmail: res.invite_email || res.admin_user?.email || form.admin_email,
        orgId: res.id,
        orgName: res.display_name,
        invitationUrl: res.invitation_url,
        passwordSetupUrl: res.password_setup_url,
        postPasswordRedirectUrl: res.post_password_redirect_url || 'http://localhost:5180/invite/complete',
      });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create organization.');
    } finally {
      setBusy(false);
    }
  };

  const resendInvite = async () => {
    if (!inviteResult?.adminUserId) return;
    setResendBusy(true);
    try {
      const r = await tcsApi<{ message?: string; invitation_url?: string; password_setup_url?: string }>(`/api/tcs/users/${inviteResult.adminUserId}/invite`, { method: 'POST' });
      setInviteResult((prev) => (prev ? {
        ...prev,
        message: r.message || 'Invite resent.',
        invitationUrl: r.invitation_url || prev.invitationUrl,
        passwordSetupUrl: r.password_setup_url || prev.passwordSetupUrl,
      } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resend invite.');
    } finally {
      setResendBusy(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-navy-800 tracking-tight">List of Organizations</h1>
          <p className="text-sm text-slate-500 mt-1.5 max-w-2xl">
            Manage the organizations you do business with and customize the experience their users have when accessing your applications.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setShowCreate(true); setError(''); setSuccess(''); }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 text-white px-4 py-2.5 text-sm font-semibold shadow-sm"
        >
          <Plus size={16} /> Create Organization
        </button>
      </div>

      {success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3 mb-4">{success}</p>
      )}

      <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 ring-1 ring-slate-200/60">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for organization by name"
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
            />
          </div>
          <button
            type="button"
            onClick={() => setQ('')}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <X size={14} /> Reset
          </button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Press Enter to search. Fewer than 3 characters will return exact matches.</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden ring-1 ring-slate-200/60">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-4 py-3 w-12" />
              <th className="px-4 py-3 text-left font-medium">Display Name</th>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Identifier</th>
              <th className="px-4 py-3 text-left font-medium">Sub-orgs</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {orgs.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 hover:bg-slate-50/80">
                <td className="px-4 py-3"><OrgAvatar name={o.display_name} /></td>
                <td className="px-4 py-3">
                  <Link to={`/tcs/organizations/${o.id}`} className="text-brand-600 font-medium hover:text-brand-700 hover:underline">
                    {o.display_name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-500">{o.slug}</td>
                <td className="px-4 py-3 text-slate-500 font-mono text-xs">{o.identifier}</td>
                <td className="px-4 py-3 text-slate-600">{o.sub_org_count ?? 0}</td>
                <td className="px-4 py-3 text-slate-400"><MoreHorizontal size={18} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-navy-900/30 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <form onSubmit={create} className="bg-white rounded-xl shadow-xl w-full max-w-2xl p-6 space-y-6 ring-1 ring-slate-200 my-8">
            <div>
              <h2 className="text-lg font-bold text-navy-800">Create Organization</h2>
              <p className="text-sm text-slate-500 mt-1">
                Create the organization and invite the administrator to join. They receive an email to accept and set their password.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
            )}

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Organization</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Organization Name" value={form.display_name} onChange={(v) => set('display_name', v)} required className="sm:col-span-2" />
                <div>
                  <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Tier</label>
                  <select value={form.tier} onChange={(e) => set('tier', e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
                    <option value="essentials">Essentials</option>
                    <option value="professional">Professional</option>
                    <option value="enterprise">Enterprise</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={form.is_corporate} onChange={(e) => set('is_corporate', e.target.checked)} className="rounded border-slate-300 text-brand-500" />
                    Corporate organization
                  </label>
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Address &amp; Contact</h3>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Street Address" value={form.address_line1} onChange={(v) => set('address_line1', v)} required className="sm:col-span-2" />
                <Field label="Address Line 2" value={form.address_line2} onChange={(v) => set('address_line2', v)} className="sm:col-span-2" placeholder="Suite, unit, etc. (optional)" />
                <Field label="City" value={form.city} onChange={(v) => set('city', v)} required />
                <Field label="State / Province" value={form.state} onChange={(v) => set('state', v)} required />
                <Field label="Postal Code" value={form.postal_code} onChange={(v) => set('postal_code', v)} required />
                <Field label="Country" value={form.country} onChange={(v) => set('country', v)} required />
                <Field label="Phone" value={form.phone} onChange={(v) => set('phone', v)} type="tel" />
                <Field label="Organization Email" value={form.contact_email} onChange={(v) => set('contact_email', v)} type="email" placeholder="billing@company.com (optional)" />
              </div>
            </section>

            <section className="space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400">Primary Administrator</h3>
              <p className="text-sm text-slate-500 -mt-2">
                They will be invited to join this organization as Administrator.
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Admin Name" value={form.admin_name} onChange={(v) => set('admin_name', v)} required />
                <Field label="Admin Email" value={form.admin_email} onChange={(v) => set('admin_email', v)} type="email" required />
              </div>
            </section>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 text-sm text-slate-600" disabled={busy}>Cancel</button>
              <button type="submit" disabled={busy} className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50">
                {busy ? 'Creating…' : 'Create & Send Invite'}
              </button>
            </div>
          </form>
        </div>
      )}

      {inviteResult && (
        <div className="fixed inset-0 bg-navy-900/30 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 ring-1 ring-slate-200">
            <h2 className="text-lg font-bold text-navy-800 mb-1">Organization created</h2>
            <p className="text-sm text-slate-500 mb-4">{inviteResult.orgName}</p>
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-800 mb-4">
              <p className="font-semibold mb-1">Organization invite sent</p>
              <p>{inviteResult.message}</p>
            </div>
            <ol className="text-sm text-slate-600 space-y-2 mb-4 list-decimal list-inside">
              <li><strong>{inviteResult.adminEmail}</strong> receives an invitation to join <strong>{inviteResult.orgName}</strong></li>
              <li>They set their password from the email link</li>
              <li>After password setup they see a confirmation page at <strong>{inviteResult.postPasswordRedirectUrl || 'http://localhost:5180/invite/complete'}</strong> (not the login form)</li>
            </ol>
            {(inviteResult.invitationUrl || inviteResult.passwordSetupUrl) && (
              <p className="text-xs text-slate-500 mb-4 break-all">
                Invite link (for testing):{' '}
                <a
                  href={inviteResult.invitationUrl || inviteResult.passwordSetupUrl}
                  className="text-brand-600 underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  open invitation link
                </a>
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={resendInvite}
                disabled={resendBusy || !inviteResult.adminUserId}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Mail size={14} /> {resendBusy ? 'Sending…' : 'Resend invite'}
              </button>
              {inviteResult.orgId && (
                <Link
                  to={`/tcs/organizations/${inviteResult.orgId}`}
                  onClick={() => setInviteResult(null)}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-brand-500 text-white hover:bg-brand-600"
                >
                  View organization
                </Link>
              )}
              <button type="button" onClick={() => setInviteResult(null)} className="px-4 py-2 text-sm text-slate-600">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = 'text',
  placeholder,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
        required={required}
      />
    </div>
  );
}
