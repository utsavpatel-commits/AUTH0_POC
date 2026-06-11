import {
  ACCESS_LEVELS,
  PERMISSION_MODULES,
  permissionsToMatrix,
  setModuleLevel,
  type AccessLevel,
} from '../permissionSchema';

export { ACCESS_LEVELS, PERMISSION_MODULES, permissionsToMatrix, setModuleLevel };
export type { AccessLevel };

export function SecurityAccessTabs({
  active,
  onChange,
  tabs = [{ id: 'security-access', label: 'Security & Access' }],
}: {
  active: string;
  onChange: (tab: string) => void;
  tabs?: { id: string; label: string }[];
}) {
  return (
    <div className="border-b border-slate-200 mb-6 flex gap-6 overflow-x-auto">
      {tabs.map((tab) => {
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`pb-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              isActive ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-navy-800'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function ModuleGroup({
  title,
  modules,
  permissions,
  onLevelChange,
}: {
  title: string;
  modules: typeof PERMISSION_MODULES;
  permissions: string[];
  onLevelChange: (moduleId: string, level: AccessLevel) => void;
}) {
  if (!modules.length) return null;
  const matrix = permissionsToMatrix(permissions);

  return (
    <div>
      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{title}</div>
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Module</th>
              <th className="px-3 py-2 text-left font-medium w-44">Access</th>
            </tr>
          </thead>
          <tbody>
            {modules.map((mod) => (
              <tr key={mod.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2.5 text-navy-800">{mod.label}</td>
                <td className="px-3 py-2.5">
                  <select
                    value={matrix[mod.id] || 'none'}
                    onChange={(e) => onLevelChange(mod.id, e.target.value as AccessLevel)}
                    className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm bg-white focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
                  >
                    {ACCESS_LEVELS.map((level) => (
                      <option key={level.id} value={level.id}>{level.label}</option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RolePermissionsEditor({
  accessLevelLabel,
  accessLevelValue,
  accessLevelOptions,
  onAccessLevelChange,
  accessLevelReadOnly,
  permissions,
  onPermissionsChange,
  showTcsModules = true,
}: {
  accessLevelLabel?: string;
  accessLevelValue: string;
  accessLevelOptions?: { id: string; label: string }[];
  onAccessLevelChange?: (id: string) => void;
  accessLevelReadOnly?: boolean;
  permissions: string[];
  /** Preferred — full permission list after a module level change. */
  onPermissionsChange: (perms: string[]) => void;
  showTcsModules?: boolean;
}) {
  const customerModules = PERMISSION_MODULES.filter((m) => m.group === 'customer' || m.group === 'shared');
  const tcsModules = PERMISSION_MODULES.filter((m) => m.group === 'tcs');

  const handleLevel = (moduleId: string, level: AccessLevel) => {
    onPermissionsChange(setModuleLevel(permissions, moduleId, level));
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-navy-800 mb-1.5">
          {accessLevelLabel || 'Persona / Role'}
        </label>
        {accessLevelReadOnly || !accessLevelOptions || !onAccessLevelChange ? (
          <div className="w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2.5 text-sm font-medium text-navy-800 capitalize">
            {accessLevelValue.replace(/_/g, ' ')}
          </div>
        ) : (
          <select
            value={accessLevelValue}
            onChange={(e) => onAccessLevelChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm bg-white focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          >
            {accessLevelOptions.map((r) => (
              <option key={r.id} value={r.id}>{r.label}</option>
            ))}
          </select>
        )}
      </div>

      <p className="text-xs text-slate-500 leading-relaxed">
        Set access per module: None, Limited, View, Use, or Admin. Changes apply to this role or user without reassigning the persona.
      </p>

      <ModuleGroup
        title="Customer modules"
        modules={customerModules}
        permissions={permissions}
        onLevelChange={handleLevel}
      />

      {showTcsModules && (
        <ModuleGroup
          title="TCS internal modules"
          modules={tcsModules}
          permissions={permissions}
          onLevelChange={handleLevel}
        />
      )}
    </div>
  );
}

/** @deprecated Use onPermissionsChange on RolePermissionsEditor */
export function legacyTogglePermission(perms: string[], id: string): string[] {
  return perms.includes(id) ? perms.filter((p) => p !== id) : [...perms, id];
}
