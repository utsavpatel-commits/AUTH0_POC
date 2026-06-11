import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BadgeCheck, Lock, Award, Clock, ChevronLeft, ChevronRight, ScrollText, FileText,
} from 'lucide-react';
import { api, apiUrl } from '../../../lib/api';
import { courseIcon } from '../courseMeta';

interface CCourse {
  assignment_id: number; course_id: number; title: string; status: string;
  version: number; current_version: number; due_date: string | null; completed_date: string | null;
}
interface Curriculum {
  key: string; name: string; color: string; total: number; completed: number; progress: number; status: string; courses: CCourse[];
}
interface CurriculaResp { curricula: Curriculum[]; done_curricula: number; total_curricula: number; fully_compliant: boolean }

/** Compliance Passport organized by CURRICULUM. Each program shows its consolidated
 *  certificate (when complete) + its member course credentials. Paginated by program. */
export function PassportView({ userId, onOpen }: { userId: number; onOpen: (assignmentId: number) => void }) {
  const [idx, setIdx] = useState(0);
  const q = useQuery({
    queryKey: ['curricula', userId],
    queryFn: () => api<CurriculaResp>(`/api/lms/curricula?user_id=${userId}`),
    enabled: userId != null,
  });
  const data = q.data;
  if (!data) return <div className="h-72 rounded-2xl bg-slate-100 animate-pulse" />;

  const programs = data.curricula;
  // Transcript measures CREDENTIALS (individual course certificates), not programs.
  const totalCourses = programs.reduce((n, p) => n + p.total, 0);
  const earnedCourses = programs.reduce((n, p) => n + p.completed, 0);
  const credPct = totalCourses ? Math.round(100 * earnedCourses / totalCourses) : 0;
  const safe = Math.min(idx, programs.length - 1);
  const program = programs[safe];

  return (
    <div className="space-y-5">
      {/* passport header */}
      <div className="rounded-2xl text-white p-6 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #006f97 0%, #00a0d7 55%, #0f9d6c 130%)' }}>
        <div>
          <div className="text-xs uppercase tracking-widest text-brand-200 font-semibold">My Training Transcript</div>
          <div className="text-2xl font-bold mt-1">{earnedCourses} certificates earned</div>
          <div className="text-sm text-white/60 mt-0.5">
            {data.done_curricula} of {data.total_curricula} programs fully certified · consolidated certificate per program
          </div>
        </div>
        <div className="text-right">
          <div className="text-4xl font-bold">{earnedCourses}<span className="text-xl text-white/60">/{totalCourses}</span></div>
          <div className="text-xs text-white/60 uppercase tracking-wide">courses certified</div>
          <div className="mt-2 h-2 w-40 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-400" style={{ width: `${credPct}%` }} />
          </div>
        </div>
      </div>

      {/* program selector tabs (curriculum pagination) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {programs.map((p, i) => (
          <button key={p.key} onClick={() => setIdx(i)}
            className={`shrink-0 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${i === safe ? 'bg-white shadow-sm ring-slate-200 text-navy-800' : 'bg-slate-50 ring-transparent text-slate-500 hover:text-slate-700'}`}>
            <span className="h-2 w-2 rounded-full" style={{ background: p.status === 'complete' ? '#10b981' : p.status === 'in_progress' ? p.color : '#cbd5e1' }} />
            {p.name}
            <span className="text-[10px] text-slate-400">{p.completed}/{p.total}</span>
          </button>
        ))}
      </div>

      {/* current program */}
      {program && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-lg font-bold text-navy-800">{program.name}</div>
              <div className="text-xs text-slate-400">{program.completed} of {program.total} courses complete</div>
            </div>
            {program.status === 'complete' ? (
              <a href={apiUrl(`/api/lms/curricula/${program.key}/certificate.pdf?user_id=${userId}`)} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-emerald text-white text-sm font-medium px-3.5 py-2 hover:brightness-95">
                <ScrollText size={15} /> Consolidated certificate
              </a>
            ) : (
              <div className="text-right">
                <div className="h-2 w-32 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${program.progress}%`, background: program.color }} />
                </div>
                <div className="text-[11px] text-slate-400 mt-1">{program.progress}% complete</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {groupByCourse(program.courses).map((g) =>
              g.versions.length > 0
                ? <CertifiedCard key={g.course_id} g={g} color={program.color} onOpen={onOpen} />
                : <LockedCard key={g.course_id} c={g.pending!} onOpen={onOpen} />
            )}
          </div>
        </div>
      )}

      {/* footer pager */}
      {programs.length > 1 && (
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
          <button onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={safe <= 0}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft size={13} /> Prev</button>
          <span>Program {safe + 1} of {programs.length}</span>
          <button onClick={() => setIdx((i) => Math.min(programs.length - 1, i + 1))} disabled={safe >= programs.length - 1}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 disabled:opacity-40 hover:bg-slate-50">Next <ChevronRight size={13} /></button>
        </div>
      )}
    </div>
  );
}

interface CourseGroup {
  course_id: number; title: string;
  versions: { version: number; assignment_id: number; completed_date: string | null }[];
  pending: CCourse | null;
}

/** Group a program's course entries by course, collecting every completed version
 *  (each = an earned certificate) plus any pending newer version still to do. */
function groupByCourse(courses: CCourse[]): CourseGroup[] {
  const map = new Map<number, CourseGroup>();
  const order: number[] = [];
  for (const c of courses) {
    if (!map.has(c.course_id)) { map.set(c.course_id, { course_id: c.course_id, title: c.title, versions: [], pending: null }); order.push(c.course_id); }
    const g = map.get(c.course_id)!;
    if (c.status === 'completed') {
      if (!g.versions.some((v) => v.version === c.version)) {
        g.versions.push({ version: c.version, assignment_id: c.assignment_id, completed_date: c.completed_date });
      }
    } else {
      // keep the most relevant pending (overdue beats assigned; newest version wins)
      if (!g.pending || c.status === 'overdue' || c.version > g.pending.version) g.pending = c;
    }
  }
  for (const g of map.values()) g.versions.sort((a, b) => b.version - a.version);
  return order.map((id) => map.get(id)!);
}

function CertifiedCard({ g, color, onOpen }: { g: CourseGroup; color: string; onOpen: (assignmentId: number) => void }) {
  const [flipped, setFlipped] = useState(false);
  const ic = courseIcon(g.title);
  const Icon = ic.icon;
  const latest = g.versions[0];
  // a newer version is pending re-acknowledgement if the open assignment outranks earned ones
  const pendingNewer = g.pending && g.pending.version > latest.version ? g.pending : null;

  return (
    <div className="relative h-40 [perspective:1000px]" onClick={() => setFlipped((f) => !f)}>
      <div className="absolute inset-0 transition-transform duration-500 [transform-style:preserve-3d] cursor-pointer"
        style={{ transform: flipped ? 'rotateY(180deg)' : 'none' }}>
        {/* front */}
        <div className="absolute inset-0 [backface-visibility:hidden] rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50/60 p-4 flex flex-col shadow-sm">
          <div className="flex items-start justify-between">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${ic.bg}`}><Icon size={18} className={ic.fg} /></div>
            <div className="rotate-12 rounded-md border-2 px-2 py-0.5 text-[9px] font-bold tracking-wider" style={{ borderColor: `${color}99`, color: `${color}cc` }}>CERTIFIED</div>
          </div>
          <div className="mt-auto">
            <div className="font-semibold text-navy-800 text-sm leading-tight line-clamp-2">{g.title}</div>
            <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1"><BadgeCheck size={12} className="text-accent-emerald" /> {latest.completed_date}</span>
              {g.versions.length > 1 && <span className="rounded bg-slate-100 px-1 text-[10px] font-semibold text-slate-500">{g.versions.length} versions</span>}
              {pendingNewer && <span className="rounded bg-amber-50 ring-1 ring-amber-100 px-1 text-[10px] font-semibold text-accent-amber">v{pendingNewer.version} due</span>}
            </div>
          </div>
        </div>
        {/* back — every earned version's certificate */}
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)] rounded-2xl bg-navy-800 text-white p-3.5 flex flex-col shadow-sm overflow-hidden">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-brand-200"><Award size={14} className="text-amber-300" /> Certificates</div>
          <div className="mt-1.5 flex-1 overflow-y-auto space-y-1 pr-0.5">
            {g.versions.map((v) => (
              <a key={v.version} href={apiUrl(`/api/lms/assignments/${v.assignment_id}/certificate.pdf`)} target="_blank" rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 rounded-md bg-white/10 hover:bg-white/15 px-2 py-1.5 text-[11px]">
                <FileText size={12} className="text-brand-300 shrink-0" />
                <span className="font-medium">Version {v.version}</span>
                <span className="text-white/50 ml-auto">{v.completed_date}</span>
              </a>
            ))}
          </div>
          {pendingNewer && (
            <button onClick={(e) => { e.stopPropagation(); onOpen(pendingNewer!.assignment_id); }}
              className="mt-1.5 rounded-md bg-amber-400/90 hover:bg-amber-400 text-navy-900 text-[11px] font-semibold py-1.5">
              Take v{pendingNewer.version} →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function LockedCard({ c, onOpen }: { c: CCourse; onOpen: (assignmentId: number) => void }) {
  const ic = courseIcon(c.title);
  const Icon = ic.icon;
  const overdue = c.status === 'overdue';
  return (
    <button onClick={() => onOpen(c.assignment_id)}
      className="h-40 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 p-4 flex flex-col text-left hover:border-brand-300 hover:bg-brand-50/40 transition-colors">
      <div className="flex items-start justify-between">
        <div className="h-10 w-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center"><Icon size={18} className="text-slate-300" /></div>
        <Lock size={14} className="text-slate-300" />
      </div>
      <div className="mt-auto">
        <div className="font-semibold text-slate-500 text-sm leading-tight line-clamp-2">{c.title}</div>
        <div className={`text-[11px] mt-1 flex items-center gap-1 ${overdue ? 'text-accent-rose font-medium' : 'text-slate-400'}`}>
          <Clock size={11} /> {overdue ? 'overdue · tap to start' : 'tap to start'}
        </div>
      </div>
    </button>
  );
}
