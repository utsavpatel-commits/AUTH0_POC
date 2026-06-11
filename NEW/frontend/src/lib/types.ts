export type Role =
  | 'customer_admin'
  | 'administrator'
  | 'don'
  | 'staff_educator'
  | 'compliance_officer'
  | 'surveyor'
  | 'corporate_leader'
  | 'end_user'
  | 'partner'
  | 'tcs_admin'
  | 'tcs_sales_cs'
  | 'tcs_rd';

export interface PersonaDef {
  role: Role;
  label: string;
  group: 'customer' | 'tcs';
  blurb: string;
}

export interface Facility {
  id: number;
  org_id: number | null;
  name: string;
  city?: string;
  state?: string;
  beds?: number;
}

export interface Org {
  id: number;
  name: string;
  is_corporate: boolean;
  tier: string;
}
