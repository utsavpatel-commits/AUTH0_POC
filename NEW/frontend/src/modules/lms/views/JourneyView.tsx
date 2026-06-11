import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Flag, Check, Droplets, Stethoscope, Users, Flame, ClipboardList, Clock, PlayCircle, Award,
  ChevronRight, type LucideIcon,
} from 'lucide-react';
import { api, apiUrl } from '../../../lib/api';

interface CCourse { assignment_id: number; title: string; status: string; due_date: string | null; completed_date: string | null; source: string }
interface Curriculum {
  key: string; name: string; icon: string; color: string;
  total: number; completed: number; overdue: number; progress: number; status: string; courses: CCourse[];
}
interface CurriculaResp { curricula: Curriculum[]; done_curricula: number; total_curricula: number; fully_compliant: boolean; }

const CUR_ICON: Record<string, LucideIcon> = {
  droplets: Droplets, stethoscope: Stethoscope, users: Users, flame: Flame, clipboard: ClipboardList,
};

function dueText(c: CCourse) {
  if (c.status === 'completed') return { t: c.completed_date ? `Done ${c.completed_date}` : 'Complete', cls: 'text-slate-400' };
  if (!c.due_date) return { t: 'No due date', cls: 'text-slate-400' };
  const d = Math.ceil((new Date(c.due_date).getTime() - Date.now()) / 86400000);
  if (d < 0) return { t: `${Math.abs(d)}d overdue`, cls: 'text-accent-rose font-medium' };
  if (d <= 3) return { t: `Due in ${d}d`, cls: 'text-accent-rose font-medium' };
  if (d <= 7) return { t: `Due in ${d}d`, cls: 'text-accent-amber font-medium' };
  return { t: `Due in ${d}d`, cls: 'text-slate-400' };
}

/** Program map over ~5 parallel CURRICULA. Programs can be done in any order.
 *  Selecting a program expands its courses (also any order). Ends at Fully Compliant. */
export function JourneyView({ userId, onOpen }: { userId: number; onOpen: (assignmentId: number) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['curricula', userId],
    queryFn: () => api<CurriculaResp>(`/api/lms/curricula?user_id=${userId}`),
    enabled: userId != null,
  });
  const data = q.data;
  if (!data) return <div className="h-64 rounded-2xl bg-slate-100 animate-pulse" />;

  const curr = data.curricula;
  const N = curr.length + 1;
  const laneX = (i: number) => (N <= 1 ? 50 : 6 + (i * (88 / (N - 1))));
  const laneY = (i: number) => (i % 2 === 0 ? 34 : 70);
  const bandH = 260;
  const pts = [...curr.map((_, i) => ({ x: laneX(i), y: laneY(i) })), { x: laneX(curr.length), y: laneY(curr.length) }];
  const sel = curr.find((c) => c.key === selected);

  // course-level completion — kept identical to the profile ring above (same metric)
  const totalCourses = curr.reduce((n, c) => n + c.total, 0);
  const doneCourses = curr.reduce((n, c) => n + c.completed, 0);
  const coursePct = totalCourses ? Math.round((100 * doneCourses) / totalCourses) : 0;

  return (
    <div className="space-y-5">
      {/* program-map heading — the profile hero above carries the greeting/standing */}
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h3 className="text-base font-bold text-navy-800">Your compliance programs</h3>
          <p className="text-xs text-slate-400 mt-0.5">Complete programs in any order — tap one to see its courses</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-navy-800">{doneCourses} of {totalCourses} courses</span>
          <span className="h-2 w-28 rounded-full bg-slate-100 overflow-hidden">
            <span className="block h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500" style={{ width: `${coursePct}%` }} />
          </span>
          <span className="text-sm font-bold text-accent-emerald">{coursePct}%</span>
        </div>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-brand-50/50 to-white border border-slate-200 p-4">
      <div className="relative" style={{ height: bandH }}>
        <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
          {pts.slice(0, -1).map((p, i) => {
            const n = pts[i + 1];
            const done = curr[i]?.status === 'complete';
            return (
              <line key={i} x1={`${p.x}%`} y1={`${p.y}%`} x2={`${n.x}%`} y2={`${n.y}%`}
                stroke={done ? '#0f9d6c' : '#cbd5e1'} strokeWidth={3.5}
                strokeDasharray={done ? '0' : '2 9'} strokeLinecap="round" />
            );
          })}
        </svg>

        {curr.map((c, i) => {
          const Icon = CUR_ICON[c.icon] ?? ClipboardList;
          const isDone = c.status === 'complete';
          const isSel = c.key === selected;
          return (
            <div key={c.key} className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-40"
              style={{ left: `${laneX(i)}%`, top: `${laneY(i)}%` }}>
              <button
                onClick={() => setSelected(isSel ? null : c.key)}
                className={`relative h-16 w-16 rounded-2xl flex items-center justify-center shadow-md transition-all hover:scale-105
                  ${isDone ? 'text-white' : 'bg-white border border-slate-200'} ${isSel ? 'ring-4 ring-brand-300' : ''}`}
                style={isDone ? { background: c.color } : undefined}
              >
                {isDone ? <Check size={26} /> : <Icon size={26} style={{ color: c.color }} />}
                {/* progress chip */}
                {!isDone && (
                  <span className="absolute -bottom-2 text-[9px] font-bold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full shadow-sm">
                    {c.completed}/{c.total}
                  </span>
                )}
              </button>
              <div className="mt-3 text-center">
                <div className={`text-[12.5px] font-semibold leading-tight ${isDone ? 'text-slate-500' : 'text-navy-800'}`}>{c.name}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {isDone ? '✓ certificate ready' : `${c.progress}% complete`}
                </div>
              </div>
            </div>
          );
        })}

        {/* goal */}
        <div className="absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center w-40"
          style={{ left: `${laneX(curr.length)}%`, top: `${laneY(curr.length)}%` }}>
          <div className={`h-16 w-16 rounded-2xl flex items-center justify-center shadow-lg ${data.fully_compliant ? 'bg-gradient-to-br from-emerald-400 to-emerald-500' : 'bg-gradient-to-br from-amber-400 to-amber-500'}`}>
            <Flag size={26} className="text-white" />
          </div>
          <div className="mt-3 text-center">
            <div className="text-[12.5px] font-bold text-navy-800">Fully Compliant</div>
            <div className="text-[11px] text-slate-400 mt-0.5">{data.done_curricula}/{data.total_curricula} programs</div>
          </div>
        </div>
      </div>

      {/* expanded program courses */}
      {sel && (
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="h-7 w-7 rounded-lg flex items-center justify-center" style={{ background: `${sel.color}1a` }}>
                {(() => { const I = CUR_ICON[sel.icon] ?? ClipboardList; return <I size={16} style={{ color: sel.color }} />; })()}
              </span>
              <span className="font-semibold text-navy-800">{sel.name}</span>
              <span className="text-xs text-slate-400">· {sel.completed}/{sel.total} courses</span>
            </div>
            {sel.status === 'complete' && (
              <a href={apiUrl(`/api/lms/curricula/${sel.key}/certificate.pdf?user_id=${userId}`)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-accent-emerald hover:underline">
                <Award size={13} /> Consolidated certificate
              </a>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            {sel.courses.map((c) => {
              const isDone = c.status === 'completed';
              const dt = dueText(c);
              return (
                <button key={c.assignment_id} onClick={() => !isDone && onOpen(c.assignment_id)}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${isDone ? 'border-emerald-100 bg-emerald-50/50' : 'border-slate-200 hover:border-brand-300 hover:bg-brand-50/40'}`}>
                  <span className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 ${isDone ? 'bg-accent-emerald text-white' : 'bg-slate-100 text-slate-400'}`}>
                    {isDone ? <Check size={14} /> : <PlayCircle size={14} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-navy-800 truncate">{c.title}</span>
                    <span className={`block text-[11px] ${dt.cls}`}>{dt.t}</span>
                  </span>
                  {isDone ? (
                    <a href={apiUrl(`/api/lms/assignments/${c.assignment_id}/certificate.pdf`)} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()} className="text-xs text-brand-600 hover:underline shrink-0">Cert</a>
                  ) : (
                    <ChevronRight size={15} className="text-slate-300 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400 mt-2">
        Finishing your assigned training keeps <strong>you</strong> compliant. Facility survey-readiness aggregates
        every staff member’s training plus audits and findings — see the Compliance Dashboard.
      </p>
      </div>
    </div>
  );
}
