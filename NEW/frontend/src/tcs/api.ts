const BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:8010';

async function parseError(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { detail?: string };
    if (body.detail) throw new Error(body.detail);
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(text || res.statusText);
    throw e;
  }
  throw new Error(text || res.statusText);
}

export async function tcsApi<T>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) await parseError(res);
  return res.json() as Promise<T>;
}

export interface TcsOrgGroup {
  id: number;
  name: string;
  description?: string | null;
  created_at?: string | null;
}

export interface TcsOrgInvitation {
  id: number;
  email: string;
  role: string;
  status: string;
  created_at?: string | null;
}

export interface TcsOrg {
  id: number;
  display_name: string;
  name: string;
  slug: string;
  identifier: string;
  parent_org_id?: number | null;
  parent_display_name?: string | null;
  is_sub_organization?: boolean;
  is_corporate: boolean;
  tier: string;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  facility_count?: number;
  user_count?: number;
  sub_org_count?: number;
  facilities?: { id: number; name: string; city?: string; state?: string; beds?: number }[];
  users?: TcsUser[];
  sub_organizations?: TcsOrg[];
  groups?: TcsOrgGroup[];
  invitations?: TcsOrgInvitation[];
}

export interface TcsUser {
  id: number;
  name: string;
  email: string;
  role: string;
  permissions: string[];
  role_permissions?: string[];
  custom_permissions?: string[] | null;
  has_custom_permissions?: boolean;
  demo_password?: string | null;
  password_set?: boolean;
  invite_pending?: boolean;
  website_access: string;
  is_active: boolean;
  org_id?: number | null;
  org_name?: string;
  message?: string;
}

export interface TcsRoleDefinition {
  id: number;
  slug: string;
  name: string;
  description?: string | null;
  permissions: string[];
  is_system?: boolean;
  scope?: string;
  org_id?: number | null;
}

export interface TcsOrgRole {
  id: string | number;
  slug?: string;
  label: string;
  permissions: string[];
  is_custom?: boolean;
}

export interface TcsUserListItem {
  id: number;
  name: string;
  email: string;
  user_id: string;
  org_id?: number | null;
  org_name?: string | null;
  role: string;
  connection: string;
  login_count: number;
  latest_login: string;
  website_access: string;
}

export interface TcsStaffSession {
  staff_id: number;
  email: string;
  name: string;
  role: string;
}
