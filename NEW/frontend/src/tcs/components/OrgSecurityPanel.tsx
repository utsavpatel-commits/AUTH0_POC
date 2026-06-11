import { useEffect, useState } from 'react';
import { tcsApi } from '../api';
import { ToggleSwitch } from './ToggleSwitch';

interface OrgSecuritySettings {
  mfa_enabled: boolean;
  passwordless_enabled: boolean;
  mfa_override: boolean | null;
  passwordless_override: boolean | null;
  platform_mfa_enabled: boolean;
  platform_passwordless_enabled: boolean;
  uses_platform_defaults: boolean;
}

export function OrgSecurityPanel({ orgId }: { orgId: number }) {
  const [settings, setSettings] = useState<OrgSecuritySettings | null>(null);
  const [loadError, setLoadError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoadError('');
    tcsApi<OrgSecuritySettings>(`/api/tcs/orgs/${orgId}/security`)
      .then(setSettings)
      .catch((e) => {
        setSettings(null);
        setLoadError(e instanceof Error ? e.message : 'Could not load security settings.');
      });
  };
  useEffect(() => { load(); }, [orgId]);

  const save = async (patch: { mfa_override?: boolean | null; passwordless_override?: boolean | null; reset_to_platform_defaults?: boolean }) => {
    setBusy(true);
    setMsg('');
    try {
      const updated = await tcsApi<OrgSecuritySettings>(`/api/tcs/orgs/${orgId}/security`, { method: 'PUT', body: patch });
      setSettings(updated);
      setMsg('Organization security settings saved.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <div>
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{loadError}</p>
        <button type="button" onClick={load} className="mt-3 text-sm text-brand-600 font-medium hover:underline">Retry</button>
      </div>
    );
  }
  if (!settings) return <p className="text-slate-400 text-sm">Loading security settings…</p>;

  const setMfa = (enabled: boolean) => {
    save({ mfa_override: enabled });
  };
  const setPasswordless = (enabled: boolean) => {
    save({ passwordless_override: enabled });
  };

  return (
    <div>
      <p className="text-sm text-slate-500 mb-4">
        Configure MFA and passwordless sign-in for this organization. When not overridden, settings inherit from the platform defaults in TCS Security.
      </p>

      {settings.uses_platform_defaults ? (
        <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-4">
          Using platform defaults — MFA {settings.platform_mfa_enabled ? 'on' : 'off'}, Passwordless {settings.platform_passwordless_enabled ? 'on' : 'off'}.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            This organization has custom security overrides.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => save({ reset_to_platform_defaults: true })}
            className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
          >
            Reset to platform defaults
          </button>
        </div>
      )}

      <div className="space-y-4 max-w-2xl">
        <SecurityRow
          title="Multi-Factor Authentication (MFA)"
          description="When enabled, staff and admin users in this organization are prompted for a second factor at sign-in."
          enabled={settings.mfa_enabled}
          inherited={settings.mfa_override === null}
          platformValue={settings.platform_mfa_enabled}
          disabled={busy}
          onChange={setMfa}
        />
        <SecurityRow
          title="Passwordless (Email OTP)"
          description="When enabled, frontline learners in this organization sign in with a one-time code sent to their email."
          enabled={settings.passwordless_enabled}
          inherited={settings.passwordless_override === null}
          platformValue={settings.platform_passwordless_enabled}
          disabled={busy}
          onChange={setPasswordless}
        />
      </div>

      {msg && <p className="text-sm text-slate-600 mt-4">{msg}</p>}
    </div>
  );
}

function SecurityRow({
  title,
  description,
  enabled,
  inherited,
  platformValue,
  disabled,
  onChange,
}: {
  title: string;
  description: string;
  enabled: boolean;
  inherited: boolean;
  platformValue: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 flex items-start justify-between gap-6">
      <div>
        <h2 className="font-semibold text-navy-800">{title}</h2>
        <p className="text-sm text-slate-500 mt-1">{description}</p>
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
          {inherited ? (
            <span className="text-xs text-slate-400">Inherited from platform ({platformValue ? 'on' : 'off'})</span>
          ) : (
            <span className="text-xs text-brand-600 font-medium">Organization override</span>
          )}
        </div>
      </div>
      <ToggleSwitch enabled={enabled} onChange={onChange} disabled={disabled} />
    </div>
  );
}
