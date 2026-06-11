import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Footprints, Hand, Medal, AlarmClock, Sparkles, GraduationCap, Trophy, Lock, Star, Flame,
  Map as MapIcon, Crosshair, IdCard,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { CoursePlayer } from '../CoursePlayer';
import { JourneyView } from '../views/JourneyView';
import { FocusView } from '../views/FocusView';
import { PassportView } from '../views/PassportView';

type Layout = 'focus' | 'journey' | 'passport';
const LAYOUTS: { key: Layout; label: string; icon: typeof MapIcon }[] = [
  { key: 'focus', label: 'Focus', icon: Crosshair },
  { key: 'journey', label: 'Progress', icon: MapIcon },
  { key: 'passport', label: 'Transcript', icon: IdCard },
];

interface MyCourse {
  id: number; course_id: number; course_title: string; description: string | null; training_type: string;
  duration_hours: number; status: string; source: string; due_date: string | null; completed_date: string | null;
  curriculum?: string; curriculum_key?: string;
}
interface Gamification {
  points: number; level: number; level_name: string; level_progress: number; points_to_next: number;
  completed: number; on_time: number; hours: number; streak: number; earned_count: number;
  badges: { key: string; label: string; icon: string; desc: string; earned: boolean }[];
}

const BADGE_ICON: Record<string, typeof Footprints> = {
  footprints: Footprints, hand: Hand, medal: Medal, 'alarm-clock': AlarmClock,
  sparkles: Sparkles, 'graduation-cap': GraduationCap,
};

function Ring({ pct, size = 88 }: { pct: number; size?: number }) {
  const stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
  const color = pct >= 80 ? '#0f9d6c' : pct >= 50 ? '#00a0d7' : '#d98a04';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e2e8f0" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset .6s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold text-navy-800">{pct}%</span>
        <span className="text-[9px] text-slate-400 uppercase tracking-wide">done</span>
      </div>
    </div>
  );
}

const PAGE = 6;

export function MyTraining({ userId, userName, facilityId }: { userId: number; userName: string; facilityId: number }) {
  const qc = useQueryClient();
  const [playing, setPlaying] = useState<MyCourse | null>(null);
  // Learners always land on Focus; switching is in-session only (not persisted across reloads).
  const [layout, setLayout] = useState<Layout>('focus');
  const setLayoutPersist = (l: Layout) => setLayout(l);

  const q = useQuery({ queryKey: ['my-training', userId], queryFn: () => api<MyCourse[]>(`/api/lms/my-training?user_id=${userId}`), enabled: userId != null });
  const game = useQuery({ queryKey: ['gamification', userId], queryFn: () => api<Gamification>(`/api/lms/gamification?user_id=${userId}`), enabled: userId != null });

  const rows = q.data ?? [];
  const completed = rows.filter((r) => r.status === 'completed');
  const overdue = rows.filter((r) => r.status === 'overdue');
  const todo = rows.filter((r) => r.status !== 'completed');
  const pct = rows.length ? Math.round((100 * completed.length) / rows.length) : 0;

  if (q.isLoading) return <div className="h-72 rounded-xl bg-slate-100 animate-pulse" />;

  if (playing) {
    return <CoursePlayer course={playing} userId={userId} userName={userName} onClose={() => setPlaying(null)} />;
  }

  const open = (c: MyCourse) => setPlaying(c);

  return (
    <div className="space-y-5">
      {/* prominent view switcher — three ways to see your training */}
      <div className="inline-flex bg-slate-100/80 ring-1 ring-slate-200 rounded-xl p-1.5 gap-1">
        {LAYOUTS.map((l) => {
          const Icon = l.icon;
          const active = layout === l.key;
          return (
            <button key={l.key} onClick={() => setLayoutPersist(l.key)}
              className={`inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-lg transition-all ${active ? 'bg-white text-brand-700 shadow-[0_1px_2px_rgba(11,32,53,0.06),0_4px_12px_rgba(0,160,215,0.18)] ring-1 ring-brand-200' : 'text-slate-500 hover:text-navy-800 hover:bg-white/60'}`}>
              <Icon size={17} className={active ? 'text-brand-500' : ''} /> {l.label}
            </button>
          );
        })}
      </div>

      {/* FOCUS — lean & action-first: a slim greeting strip, then the do-next hero */}
      {layout === 'focus' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <h2 className="text-xl font-bold text-navy-800">Welcome back, {userName.split(' ')[0]}</h2>
            <div className="flex flex-wrap gap-1.5">
              <Chip n={completed.length} label="done" tone="emerald" />
              <Chip n={todo.length} label="to do" tone="brand" />
              {overdue.length > 0 && <Chip n={overdue.length} label="overdue" tone="rose" />}
            </div>
            {game.data && game.data.streak > 0 && (
              <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-orange-50 ring-1 ring-orange-100 px-2.5 py-1 text-xs font-bold text-orange-600" title={`${game.data.streak}-day learning streak`}>
                <Flame size={13} className="fill-orange-400 text-orange-500" /> {game.data.streak}-day streak
              </span>
            )}
          </div>
          <FocusView todo={todo} completedCount={completed.length} total={rows.length} onOpen={open} />
        </div>
      )}

      {/* PROGRESS — your standing (profile + gamification) then your program journey */}
      {layout === 'journey' && (
        <div className="space-y-5">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-[0_1px_2px_rgba(11,32,53,0.04),0_4px_16px_rgba(11,32,53,0.06)] p-5">
            <div className="grid lg:grid-cols-[1.3fr_1.1fr_1.4fr] gap-5 items-center">
              {/* greeting + ring */}
              <div className="flex items-center gap-4">
                <Ring pct={pct} />
                <div className="min-w-0">
                  <div className="text-xs text-brand-600 font-semibold">Welcome back</div>
                  <h2 className="text-xl font-bold text-navy-800 truncate">{userName}</h2>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <Chip n={completed.length} label="done" tone="emerald" />
                    <Chip n={todo.length} label="to do" tone="brand" />
                    {overdue.length > 0 && <Chip n={overdue.length} label="overdue" tone="rose" />}
                  </div>
                </div>
              </div>

              {/* level + points */}
              {game.data && (
                <div className="lg:border-l lg:border-slate-100 lg:pl-5">
                  <div className="flex items-center gap-1.5">
                    <Trophy size={15} className="text-amber-400" />
                    <span className="text-sm font-semibold text-navy-800">{game.data.level_name}</span>
                    {game.data.streak > 0 && (
                      <span className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-orange-50 ring-1 ring-orange-100 px-2 py-0.5 text-[11px] font-bold text-orange-600" title={`${game.data.streak}-day learning streak`}>
                        <Flame size={12} className="fill-orange-400 text-orange-500" /> {game.data.streak}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-1 mt-1">
                    <span className="text-2xl font-bold text-navy-800">{game.data.points.toLocaleString()}</span>
                    <span className="text-xs text-slate-400 mb-1">pts</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-1">
                    <div className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${game.data.level_progress}%` }} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">
                    {game.data.points_to_next > 0 ? `${game.data.points_to_next} pts to next level` : 'Max level'}
                    {' · '}{game.data.hours}h learned
                  </div>
                </div>
              )}

              {/* badges inline */}
              {game.data && (
                <div className="lg:border-l lg:border-slate-100 lg:pl-5">
                  <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-2">
                    Achievements · {game.data.earned_count}/{game.data.badges.length}
                  </div>
                  <div className="flex gap-2">
                    {game.data.badges.map((b) => {
                      const Icon = BADGE_ICON[b.icon] ?? Star;
                      return (
                        <div key={b.key} className="relative group">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${b.earned ? 'bg-brand-50 ring-1 ring-brand-200 text-brand-600' : 'bg-slate-50 ring-1 ring-slate-200 text-slate-300'}`}
                          >
                            {b.earned ? <Icon size={16} /> : <Lock size={13} />}
                          </div>
                          {/* tooltip */}
                          <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-44 rounded-lg bg-navy-800 text-white text-[11px] px-2.5 py-1.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg">
                            <div className="font-semibold flex items-center gap-1">
                              {b.label}
                              {!b.earned && <span className="text-white/50 text-[10px]">· locked</span>}
                            </div>
                            <div className="text-white/70">{b.desc}</div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy-800" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <JourneyView userId={userId} onOpen={(aid) => { const c = rows.find((r) => r.id === aid); if (c) open(c); }} />
        </div>
      )}

      {/* TRANSCRIPT */}
      {layout === 'passport' && <PassportView userId={userId} onOpen={(aid) => { const c = rows.find((r) => r.id === aid); if (c) open(c); }} />}
    </div>
  );
}

function Chip({ n, label, tone }: { n: number; label: string; tone: 'emerald' | 'brand' | 'rose' }) {
  const map = {
    emerald: 'bg-emerald-50 ring-emerald-100 text-accent-emerald',
    brand: 'bg-brand-50 ring-brand-100 text-brand-600',
    rose: 'bg-rose-50 ring-rose-100 text-accent-rose',
  };
  return (
    <span className={`rounded-md ring-1 px-2 py-0.5 text-xs ${map[tone]}`}>
      <span className="font-bold">{n}</span> <span className="text-slate-500">{label}</span>
    </span>
  );
}
