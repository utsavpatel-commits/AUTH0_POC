import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PersonaDef, Role } from './types';
import { setPersonaHeaders } from './api';

export const PERSONAS: PersonaDef[] = [
  { role: 'administrator', label: 'Administrator', group: 'customer', blurb: 'Facility leadership' },
  { role: 'don', label: 'DON', group: 'customer', blurb: 'Director of Nursing' },
  { role: 'staff_educator', label: 'Staff Educator', group: 'customer', blurb: 'Training owner' },
  { role: 'compliance_officer', label: 'Compliance Officer', group: 'customer', blurb: 'Approves policies' },
  { role: 'surveyor', label: 'Surveyor', group: 'customer', blurb: 'Search & download (read-only)' },
  { role: 'customer_admin', label: 'Customer Admin', group: 'customer', blurb: 'Manages users & docs' },
  { role: 'corporate_leader', label: 'Corporate Leader', group: 'customer', blurb: 'Multi-facility VP' },
  { role: 'end_user', label: 'End User', group: 'customer', blurb: 'Frontline staff' },
  { role: 'partner', label: 'Partner', group: 'customer', blurb: 'Limited partner access' },
  { role: 'tcs_admin', label: 'TCS Admin / Exec', group: 'tcs', blurb: 'Command Center' },
  { role: 'tcs_sales_cs', label: 'TCS Sales / CS', group: 'tcs', blurb: 'Accounts & retention' },
  { role: 'tcs_rd', label: 'TCS R&D', group: 'tcs', blurb: 'CMS & content dev' },
];

interface PersonaState {
  role: Role;
  facilityId: number | null;
  orgId: number | null;
  setRole: (r: Role) => void;
  setFacilityId: (id: number | null) => void;
  setOrgId: (id: number | null) => void;
}

const Ctx = createContext<PersonaState | null>(null);

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>(
    () => (localStorage.getItem('w3_role') as Role) || 'administrator',
  );
  const [facilityId, setFacilityId] = useState<number | null>(() => {
    const v = localStorage.getItem('w3_facility');
    return v ? Number(v) : null;
  });
  const [orgId, setOrgId] = useState<number | null>(() => {
    const v = localStorage.getItem('w3_org');
    return v ? Number(v) : null;
  });

  useEffect(() => {
    setPersonaHeaders(role, facilityId, orgId);
    localStorage.setItem('w3_role', role);
    if (facilityId != null) localStorage.setItem('w3_facility', String(facilityId));
    if (orgId != null) localStorage.setItem('w3_org', String(orgId));
  }, [role, facilityId, orgId]);

  return (
    <Ctx.Provider value={{ role, facilityId, orgId, setRole, setFacilityId, setOrgId }}>
      {children}
    </Ctx.Provider>
  );
}

export function usePersona() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider');
  return ctx;
}

export function personaLabel(role: Role): string {
  return PERSONAS.find((p) => p.role === role)?.label ?? role;
}

export function isTcs(role: Role): boolean {
  return role === 'tcs_admin' || role === 'tcs_sales_cs' || role === 'tcs_rd';
}
