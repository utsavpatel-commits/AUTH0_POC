const BASE = (import.meta.env.VITE_API_BASE as string) || 'http://localhost:8010';

let currentRole = 'administrator';
let currentFacilityId: number | null = null;
let currentOrgId: number | null = null;

export function setPersonaHeaders(role: string, facilityId: number | null, orgId: number | null) {
  currentRole = role;
  currentFacilityId = facilityId;
  currentOrgId = orgId;
}

function headers(extra?: Record<string, string>): HeadersInit {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Role': currentRole,
    ...extra,
  };
  if (currentFacilityId != null) h['X-Facility-Id'] = String(currentFacilityId);
  if (currentOrgId != null) h['X-Org-Id'] = String(currentOrgId);
  return h;
}

async function parseApiError(res: Response): Promise<never> {
  const text = await res.text().catch(() => '');
  try {
    const body = JSON.parse(text) as { detail?: string };
    if (body.detail) throw new Error(body.detail);
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error(text || `${res.status} ${res.statusText}`);
    }
    throw e;
  }
  throw new Error(text || `${res.status} ${res.statusText}`);
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method || 'GET',
    headers: headers(),
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) await parseApiError(res);
  return res.json() as Promise<T>;
}

export function apiUrl(path: string): string {
  return `${BASE}${path}`;
}

/** Multipart form POST (file uploads). Sends persona headers but NOT Content-Type
 *  (the browser sets the multipart boundary). */
export async function apiForm<T = unknown>(path: string, form: FormData): Promise<T> {
  const h: Record<string, string> = { 'X-Role': currentRole };
  if (currentFacilityId != null) h['X-Facility-Id'] = String(currentFacilityId);
  if (currentOrgId != null) h['X-Org-Id'] = String(currentOrgId);
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: h, body: form });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}
