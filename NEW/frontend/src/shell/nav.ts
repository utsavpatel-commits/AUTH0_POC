import {
  LayoutDashboard,
  GraduationCap,
  FolderOpen,
  ClipboardCheck,
  Gauge,
  LineChart,
  LifeBuoy,
  Search,
  MessageSquare,
  FileWarning,
  PanelsTopLeft,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../lib/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles?: Role[]; // undefined = all
  stub?: boolean;
  group: string;
}

export const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Compliance Dashboard', icon: LayoutDashboard, group: 'Workspace' },
  { to: '/lms', label: 'LMS', icon: GraduationCap, group: 'Modules' },
  { to: '/cafe', label: 'Document Café', icon: FolderOpen, group: 'Modules' },
  { to: '/survey', label: 'Survey Readiness', icon: ClipboardCheck, group: 'Modules' },
  { to: '/cms-dms', label: 'Content Platform', icon: PanelsTopLeft, group: 'Modules' },
  {
    to: '/command-center',
    label: 'Command Center',
    icon: Gauge,
    roles: ['tcs_admin', 'tcs_sales_cs'],
    group: 'TCS Internal',
  },
  {
    to: '/command-center/analytics',
    label: 'Search & Chat Analytics',
    icon: LineChart,
    roles: ['tcs_admin', 'tcs_sales_cs'],
    group: 'TCS Internal',
  },
  { to: '/ai-search', label: 'AI Search', icon: Search, stub: true, group: 'Coming Soon' },
  { to: '/ai-chat', label: 'AI Chat', icon: MessageSquare, stub: true, group: 'Coming Soon' },
  { to: '/ticketing', label: 'Ticketing', icon: LifeBuoy, stub: true, group: 'Coming Soon' },
  { to: '/poc', label: 'POC Advanced', icon: FileWarning, stub: true, group: 'Coming Soon' },
];

export function navForRole(role: Role): NavItem[] {
  return NAV.filter((n) => !n.roles || n.roles.includes(role));
}
