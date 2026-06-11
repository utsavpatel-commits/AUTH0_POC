import {
  Droplets, Stethoscope, Users, Flame, ClipboardList, Shield, HeartPulse,
  BookOpen, Pill, AlertTriangle, Brain, Sparkles, Scale, Bus, type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';

/** Program (course bucket) icon key -> Lucide icon. The keys here are the palette
 *  a customer can choose from when configuring a program. */
export const PROGRAM_ICON: Record<string, LucideIcon> = {
  clipboard: ClipboardList,
  droplets: Droplets,
  stethoscope: Stethoscope,
  users: Users,
  flame: Flame,
  shield: Shield,
  heart: HeartPulse,
  book: BookOpen,
  pill: Pill,
  alert: AlertTriangle,
  brain: Brain,
  sparkles: Sparkles,
  scale: Scale,
  bus: Bus,
};

export function programIcon(iconKey: string): LucideIcon {
  return PROGRAM_ICON[iconKey] ?? ClipboardList;
}

/** Icon + color palettes offered in the Manage Programs editor. */
export const ICON_CHOICES: string[] = Object.keys(PROGRAM_ICON);
export const COLOR_CHOICES: string[] = [
  '#0ea5e9', '#06b6d4', '#8b5cf6', '#10b981', '#f97316',
  '#ef4444', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#64748b',
];

export interface ProgramMeta { key: string; name: string; icon: string; color: string }
export interface Program extends ProgramMeta { id: number; sort_order: number; course_count: number }

export const UNCATEGORIZED: ProgramMeta = { key: 'uncategorized', name: 'Uncategorized', icon: 'clipboard', color: '#64748b' };

/** Fetch the org's configurable programs (resolved from the facility's org). The
 *  returned `byKey` resolver gives any consumer the right name/icon/color for a
 *  course's program key, with an Uncategorized fallback. */
export function usePrograms(facilityId: number | null | undefined) {
  const q = useQuery({
    queryKey: ['lms-programs', facilityId],
    queryFn: () => api<Program[]>(`/api/lms/programs?facility_id=${facilityId}`),
    enabled: facilityId != null,
  });
  const programs = q.data ?? [];
  const byKey = (key: string | null | undefined): ProgramMeta =>
    programs.find((p) => p.key === key) ?? UNCATEGORIZED;
  return { programs, byKey, isLoading: q.isLoading, refetch: q.refetch };
}
