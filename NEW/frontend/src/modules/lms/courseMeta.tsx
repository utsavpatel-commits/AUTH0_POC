import {
  Stethoscope, Syringe, Brain, Utensils, Siren, Flame, FileLock2, Users,
  ClipboardList, ShieldCheck, HeartPulse, Bandage, Droplets, type LucideIcon,
} from 'lucide-react';

export interface MyCourse {
  id: number; course_id: number; course_title: string; description: string | null; training_type: string;
  duration_hours: number; status: string; source: string; due_date: string | null; completed_date: string | null;
}

const ICONS: { kw: string[]; icon: LucideIcon; bg: string; fg: string; hex: string }[] = [
  { kw: ['wound', 'skin', 'pressure'], icon: Bandage, bg: 'bg-rose-50', fg: 'text-rose-500', hex: '#f43f5e' },
  { kw: ['infection', 'hygiene', 'ppe'], icon: Droplets, bg: 'bg-cyan-50', fg: 'text-cyan-500', hex: '#06b6d4' },
  { kw: ['medication', 'med'], icon: Syringe, bg: 'bg-violet-50', fg: 'text-violet-500', hex: '#8b5cf6' },
  { kw: ['dementia', 'cognit'], icon: Brain, bg: 'bg-fuchsia-50', fg: 'text-fuchsia-500', hex: '#d946ef' },
  { kw: ['dietary', 'nutrition', 'food'], icon: Utensils, bg: 'bg-amber-50', fg: 'text-amber-500', hex: '#f59e0b' },
  { kw: ['fall', 'elopement', 'wander'], icon: Siren, bg: 'bg-orange-50', fg: 'text-orange-500', hex: '#f97316' },
  { kw: ['emergency', 'fire', 'prepared'], icon: Flame, bg: 'bg-red-50', fg: 'text-red-500', hex: '#ef4444' },
  { kw: ['hipaa', 'privacy', 'records'], icon: FileLock2, bg: 'bg-indigo-50', fg: 'text-indigo-500', hex: '#6366f1' },
  { kw: ['rights', 'dignity', 'abuse', 'grievance'], icon: Users, bg: 'bg-emerald-50', fg: 'text-emerald-500', hex: '#10b981' },
  { kw: ['policy', 'acknowledg'], icon: ClipboardList, bg: 'bg-sky-50', fg: 'text-sky-500', hex: '#0ea5e9' },
  { kw: ['restraint', 'safety'], icon: ShieldCheck, bg: 'bg-teal-50', fg: 'text-teal-500', hex: '#14b8a6' },
  { kw: ['cpr', 'bls', 'cardiac'], icon: HeartPulse, bg: 'bg-pink-50', fg: 'text-pink-500', hex: '#ec4899' },
];

export function courseIcon(title: string) {
  const t = title.toLowerCase();
  return ICONS.find((x) => x.kw.some((k) => t.includes(k)))
    ?? { icon: Stethoscope, bg: 'bg-slate-100', fg: 'text-slate-500', hex: '#64748b' };
}

export const sourceLabel = (s: string) =>
  s === 'policy_ack' ? 'Policy update' : s === 'poc' ? 'Plan of Correction' : s === 'mock_survey' ? 'Mock Survey' : null;

export function daysUntil(date: string | null) {
  return date == null ? null : Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export function dueChip(c: MyCourse) {
  const d = daysUntil(c.due_date);
  if (c.status === 'completed') return { text: c.completed_date ? `Done ${c.completed_date}` : 'Completed', cls: 'text-slate-400' };
  if (d == null) return { text: 'No due date', cls: 'text-slate-400' };
  if (d < 0) return { text: `${Math.abs(d)}d overdue`, cls: 'text-accent-rose font-semibold' };
  if (d === 0) return { text: 'Due today', cls: 'text-accent-rose font-semibold' };
  if (d <= 3) return { text: `Due in ${d}d`, cls: 'text-accent-rose font-medium' };
  if (d <= 7) return { text: `Due in ${d}d`, cls: 'text-accent-amber font-medium' };
  return { text: `Due in ${d}d`, cls: 'text-slate-400' };
}
