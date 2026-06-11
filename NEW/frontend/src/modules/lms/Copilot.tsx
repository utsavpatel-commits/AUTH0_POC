import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, AlarmClock, RefreshCw, Target, FileText, Mail, CheckCircle2, ArrowRight,
  AlertTriangle, Building2, TrendingUp, ShieldCheck, type LucideIcon,
} from 'lucide-react';
import { api } from '../../lib/api';
import { usePersona, isTcs } from '../../lib/persona';
import type { Role } from '../../lib/types';

const INSIGHT_ICON: Record<string, LucideIcon> = {
  alarm: AlarmClock, refresh: RefreshCw, target: Target, file: FileText, mail: Mail, check: CheckCircle2,
};
const SEV: Record<string, { dot: string; chip: string; ring: string }> = {
  high: { dot: 'bg-rose-500', chip: 'bg-rose-50 text-accent-rose ring-rose-100', ring: 'ring-rose-100' },
  medium: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-accent-amber ring-amber-100', ring: 'ring-amber-100' },
  low: { dot: 'bg-brand-400', chip: 'bg-brand-50 text-brand-600 ring-brand-100', ring: 'ring-brand-100' },
  good: { dot: 'bg-emerald-500', chip: 'bg-emerald-50 text-accent-emerald ring-emerald-100', ring: 'ring-emerald-100' },
};

function scoreColor(s: number) {
  return s >= 85 ? '#0f9d6c' : s >= 70 ? '#00a0d7' : s >= 50 ? '#d98a04' : '#e11d48';
}

/** Animated survey-readiness gauge. */
function ReadinessGauge({ score, label, size = 132 }: { score: number; label: string; size?: number }) {
  const stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r, off = c - (score / 100) * c;
  const col = scoreColor(score);
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#e8edf3" strokeWidth={stroke} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={col} strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={off} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-navy-800">{score}</span>
        <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: col }}>{label}</span>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(11,32,53,0.04),0_6px_20px_rgba(11,32,53,0.05)] overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-brand-50/60 to-white">
        <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-brand-400 to-brand-600 text-white flex items-center justify-center"><Sparkles size={15} /></span>
        <span className="text-sm font-bold text-navy-800">Compliance Copilot</span>
        <span className="text-[11px] text-slate-400 ml-1">· computed from your live data</span>
      </div>
      {children}
    </div>
  );
}

// ---- Facility Copilot (Faculty / DON / Admin) --------------------------------
interface Insight { severity: string; icon: string; title: string; detail: string; impact: number; action: string; tab: string }
interface Insights { readiness: { score: number; label: string; completion: number; program_avg: number; overdue: number }; insights: Insight[] }

export function FacilityCopilot({ facilityId, onNavigate }: { facilityId: number; onNavigate: (k: string) => void }) {
  const q = useQuery({ queryKey: ['insights', facilityId], queryFn: () => api<Insights>(`/api/lms/insights?facility_id=${facilityId}`) });
  const d = q.data;
  if (!d) return <div className="h-44 rounded-2xl bg-slate-100 animate-pulse" />;

  const priorities = d.insights.filter((i) => i.severity !== 'good');
  const lift = priorities.reduce((n, i) => n + i.impact, 0);
  const narrative = priorities.length === 0
    ? 'You’re survey-ready — nothing needs your attention right now.'
    : `${priorities.length} priorit${priorities.length === 1 ? 'y' : 'ies'} to clear. Resolving the top items could lift readiness toward ~${Math.min(100, d.readiness.score + lift)}%.`;

  return (
    <Shell>
      <div className="grid md:grid-cols-[200px_1fr] gap-5 p-5">
        {/* gauge */}
        <div className="flex md:flex-col items-center md:items-start gap-4">
          <ReadinessGauge score={d.readiness.score} label={d.readiness.label} />
          <div className="text-xs text-slate-500 space-y-0.5">
            <div className="font-semibold text-navy-700 mb-1">Survey readiness</div>
            <div>{d.readiness.completion}% completion</div>
            <div>{d.readiness.program_avg}% avg program coverage</div>
            <div className={d.readiness.overdue ? 'text-accent-rose font-medium' : ''}>{d.readiness.overdue} overdue</div>
          </div>
        </div>
        {/* insights */}
        <div>
          <p className="text-sm text-navy-700 font-medium mb-3">{narrative}</p>
          <div className="space-y-2">
            {d.insights.map((i, idx) => {
              const Icon = INSIGHT_ICON[i.icon] ?? Target;
              const sev = SEV[i.severity] ?? SEV.low;
              return (
                <button key={idx} onClick={() => onNavigate(i.tab)}
                  className={`group w-full flex items-center gap-3 rounded-xl border border-slate-200 ring-1 ${sev.ring} px-3.5 py-2.5 text-left hover:border-brand-300 hover:bg-brand-50/30 transition-colors`}>
                  <span className={`h-2 w-2 rounded-full ${sev.dot} shrink-0`} />
                  <Icon size={16} className="text-slate-500 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy-800 leading-tight">{i.title}</span>
                    <span className="block text-[12px] text-slate-500 truncate">{i.detail}</span>
                  </span>
                  {i.impact > 0 && <span className={`shrink-0 text-[11px] font-bold rounded-md px-1.5 py-0.5 ring-1 ${sev.chip}`}>+{i.impact} pts</span>}
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[12px] font-medium text-brand-600">{i.action} <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" /></span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ---- Portfolio Copilot (VP / Corporate) --------------------------------------
interface Cell { status: string }
interface FacRow { facility_id: number; facility: string; org_id: number | null; total: number; overdue: number; completion_rate: number; cells: Record<string, Cell> }
interface Rollup { facilities: FacRow[] }

export function PortfolioCopilot({ role, onOpenFacility }: { role: Role; onOpenFacility: (id: number) => void }) {
  const { orgId } = usePersona();
  const q = useQuery({ queryKey: ['lms-rollup'], queryFn: () => api<Rollup>('/api/lms/rollup') });
  const all = q.data?.facilities ?? [];
  const facilities = (isTcs(role) ? all : orgId ? all.filter((f) => f.org_id === orgId) : all).filter((f) => f.total > 0);
  if (!q.data) return <div className="h-44 rounded-2xl bg-slate-100 animate-pulse" />;

  const avg = facilities.length ? Math.round(facilities.reduce((a, f) => a + f.completion_rate, 0) / facilities.length) : 0;
  const label = avg >= 85 ? 'Survey-ready' : avg >= 70 ? 'On track' : avg >= 50 ? 'Needs attention' : 'At risk';
  // risk score: distance below 100 + overdue weight
  const ranked = [...facilities].map((f) => ({ f, risk: (100 - f.completion_rate) + f.overdue * 2 })).sort((a, b) => b.risk - a.risk);
  const worst = ranked[0]?.f;
  const gap = worst ? avg - worst.completion_rate : 0;
  const projected = worst && facilities.length ? Math.round((avg - worst.completion_rate) / facilities.length) : 0;
  const behind = facilities.filter((f) => f.completion_rate < 80);

  return (
    <Shell>
      <div className="grid md:grid-cols-[200px_1fr] gap-5 p-5">
        <div className="flex md:flex-col items-center md:items-start gap-4">
          <ReadinessGauge score={avg} label={label} />
          <div className="text-xs text-slate-500 space-y-0.5">
            <div className="font-semibold text-navy-700 mb-1">Portfolio readiness</div>
            <div>{facilities.length} facilities</div>
            <div className={behind.length ? 'text-accent-amber font-medium' : ''}>{behind.length} below 80%</div>
          </div>
        </div>
        <div>
          {worst && (
            <p className="text-sm text-navy-700 font-medium mb-3">
              <strong>{worst.facility}</strong> is your biggest risk at {worst.completion_rate}% ({gap > 0 ? `${gap} pts below` : 'at'} portfolio average).
              {projected > 0 && <> Bringing it to average would lift the portfolio ~<strong>+{projected}%</strong>.</>}
            </p>
          )}
          <div className="space-y-2">
            {ranked.slice(0, 3).map(({ f, risk }) => {
              const flagged = f.completion_rate < 80;
              return (
                <button key={f.facility_id} onClick={() => onOpenFacility(f.facility_id)}
                  className={`group w-full flex items-center gap-3 rounded-xl border border-slate-200 ring-1 ${flagged ? 'ring-rose-100' : 'ring-slate-100'} px-3.5 py-2.5 text-left hover:border-brand-300 hover:bg-brand-50/30 transition-colors`}>
                  <span className={`h-2 w-2 rounded-full ${flagged ? 'bg-rose-500' : 'bg-emerald-500'} shrink-0`} />
                  <Building2 size={16} className="text-slate-500 shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-navy-800 leading-tight truncate">{f.facility}</span>
                    <span className="block text-[12px] text-slate-500">{f.completion_rate}% complete{f.overdue > 0 ? ` · ${f.overdue} overdue` : ''}</span>
                  </span>
                  <span className={`shrink-0 text-[11px] font-bold rounded-md px-1.5 py-0.5 ring-1 ${flagged ? 'bg-rose-50 text-accent-rose ring-rose-100' : 'bg-slate-50 text-slate-500 ring-slate-200'}`}>
                    {flagged ? <span className="inline-flex items-center gap-0.5"><AlertTriangle size={10} /> risk {Math.round(risk)}</span> : <span className="inline-flex items-center gap-0.5"><ShieldCheck size={10} /> ok</span>}
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-[12px] font-medium text-brand-600">Open <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" /></span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-400 mt-2.5 inline-flex items-center gap-1"><TrendingUp size={12} /> Ranked by risk — open a facility to drop into its DON-level detail.</p>
        </div>
      </div>
    </Shell>
  );
}
