import { useEffect, useState } from 'react';
import { tcsApi } from '../api';
import { InviteEmailTemplatePanel } from '../components/InviteEmailTemplatePanel';
import { ToggleSwitch } from '../components/ToggleSwitch';
import { TcsPageHeader } from '../components/TcsPageHeader';

interface SecuritySettings {
  mfa_enabled: boolean;
  passwordless_enabled: boolean;
  updated_at?: string | null;
}

export function SecurityPage() {
  const [settings, setSettings] = useState<SecuritySettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoadError('');
    tcsApi<SecuritySettings>('/api/tcs/security')
      .then(setSettings)
      .catch((e) => {
        setSettings(null);
        setLoadError(e instanceof Error ? e.message : 'Could not load security settings.');
      });
  };
  useEffect(() => { load(); }, []);

  const save = async (patch: Partial<SecuritySettings>) => {
    setBusy(true);
    setMsg('');
    try {
      const updated = await tcsApi<SecuritySettings>('/api/tcs/security', { method: 'PUT', body: patch });
      setSettings(updated);
      setMsg('Security settings saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div>
        <TcsPageHeader title="Security" description="Platform authentication policies." />
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadError}</p>
        <button type="button" onClick={load} className="mt-3 text-sm text-brand-600 font-medium hover:underline">Retry</button>
      </div>
    );
  }
  if (!settings) return <p className="text-slate-400 text-sm">Loading security settings…</p>;

  return (
    <div>
      <TcsPageHeader
        title="Security"
        description="Platform-wide authentication defaults. Organizations can override these per org under Organization → Security."
      />

      <div className="space-y-4 max-w-2xl">
        <SecurityRow
          title="Multi-Factor Authentication (MFA)"
          description="When enabled, staff and admin users are prompted for a second factor at sign-in. Enforced via Auth0."
          enabled={settings.mfa_enabled}
          disabled={busy}
          onChange={(v) => save({ mfa_enabled: v })}
        />
        <SecurityRow
          title="Passwordless (Email OTP)"
          description="When enabled, frontline learners sign in with a one-time code sent to their email. When disabled, demo codes are used instead."
          enabled={settings.passwordless_enabled}
          disabled={busy}
          onChange={(v) => save({ passwordless_enabled: v })}
        />
      </div>

      <div className="mt-8">
        <InviteEmailTemplatePanel />
      </div>

      {settings.updated_at && (
        <p className="text-xs text-slate-400 mt-6">Last updated {new Date(settings.updated_at).toLocaleString()}</p>
      )}
      {msg && <p className="text-sm text-slate-600 mt-2">{msg}</p>}
    </div>
  );
}

function SecurityRow({
  title,
  description,
  enabled,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 flex items-start justify-between gap-6">
      <div>
        <h2 className="font-semibold text-navy-800">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
        <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {enabled ? 'Enabled' : 'Disabled'}
        </span>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} disabled={disabled} />
    </div>
  );
}
