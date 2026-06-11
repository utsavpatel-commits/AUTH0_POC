export const ACCESS_LEVELS = [
  { id: 'none', label: 'None' },
  { id: 'limited', label: 'Limited' },
  { id: 'view', label: 'View / Consume' },
  { id: 'use', label: 'Use' },
  { id: 'admin', label: 'Admin' },
] as const;

export type AccessLevel = (typeof ACCESS_LEVELS)[number]['id'];

export const PERMISSION_MODULES = [
  { id: 'tcs_base', label: 'TCS Base', group: 'tcs' as const },
  { id: 'lms', label: 'LMS', group: 'customer' as const },
  { id: 'poc', label: 'POC', group: 'customer' as const },
  { id: 'survey', label: 'Mock Survey', group: 'customer' as const },
  { id: 'cafe', label: 'Document Café', group: 'customer' as const },
  { id: 'ai_search', label: 'AI Search / Chat', group: 'customer' as const },
  { id: 'compliance_dashboard', label: 'Compliance Dashboard', group: 'customer' as const },
  { id: 'customer_admin_portal', label: 'Customer Admin Portal', group: 'customer' as const },
  { id: 'marketing_site', label: 'Marketing Site', group: 'customer' as const },
  { id: 'executive_command', label: 'Executive Command Center', group: 'tcs' as const },
  { id: 'cms_library', label: 'CMS / Library / Content Dev', group: 'tcs' as const },
  { id: 'reporting', label: 'Company & User Reporting', group: 'shared' as const },
];

const LEGACY_MAP: Record<string, { module: string; level: AccessLevel }> = {
  lms: { module: 'lms', level: 'use' },
  cafe: { module: 'cafe', level: 'use' },
  survey: { module: 'survey', level: 'use' },
  dashboard: { module: 'compliance_dashboard', level: 'use' },
  users: { module: 'customer_admin_portal', level: 'admin' },
  settings: { module: 'customer_admin_portal', level: 'admin' },
};

/** Map stored permission strings to module → level for the matrix UI. */
export function permissionsToMatrix(perms: string[]): Record<string, AccessLevel> {
  const matrix: Record<string, AccessLevel> = {};
  for (const id of PERMISSION_MODULES.map((m) => m.id)) {
    matrix[id] = 'none';
  }
  for (const raw of perms) {
    if (raw.includes(':')) {
      const [module, level] = raw.split(':');
      if (module && level && module in matrix) {
        matrix[module] = level as AccessLevel;
      }
      continue;
    }
    const legacy = LEGACY_MAP[raw];
    if (legacy) matrix[legacy.module] = legacy.level;
  }
  return matrix;
}

/** Serialize matrix back to `module:level` permission strings. */
export function matrixToPermissions(matrix: Record<string, AccessLevel>): string[] {
  return Object.entries(matrix)
    .filter(([, level]) => level && level !== 'none')
    .map(([module, level]) => `${module}:${level}`)
    .sort();
}

export function setModuleLevel(
  perms: string[],
  moduleId: string,
  level: AccessLevel,
): string[] {
  const matrix = permissionsToMatrix(perms);
  matrix[moduleId] = level;
  return matrixToPermissions(matrix);
}

export const CUSTOMER_ROLE_OPTIONS = [
  { id: 'customer_admin', label: 'Customer Admin' },
  { id: 'administrator', label: 'Administrator' },
  { id: 'don', label: 'DON' },
  { id: 'staff_educator', label: 'Staff Educator' },
  { id: 'corporate_leader', label: 'Corporate Leader' },
  { id: 'end_user', label: 'End User' },
  { id: 'partner', label: 'Partner' },
];

export const TCS_ROLE_OPTIONS = [
  { id: 'tcs_admin', label: 'TCS Admin' },
  { id: 'tcs_sales_cs', label: 'TCS Sales / CS' },
  { id: 'tcs_rd', label: 'TCS R&D' },
];
