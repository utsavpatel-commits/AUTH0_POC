import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Check } from 'lucide-react';
import { usePersona } from '../../../lib/persona';
import { api } from '../../../lib/api';
import { Card, Empty } from '../../../components/ui';
import { programIcon } from '../programMeta';

interface Program { key: string; name: string; icon: string; color: string }
interface Cell { pct: number; completed: number; total: number; overdue: number; status: string }
interface FacRow {
  facility_id: number; facility: string; org_id: number | null;
  total: number; completed: number; overdue: number; completion_rate: number;
  cells: Record<string, Cell>;
}
interface Rollup { programs: Program[]; facilities: FacRow[] }

const STATUS: Record<string, { bg: string; soft: string; ring: string; text: string; label: string }> = {
  complete: { bg: 'bg-emerald-500', soft: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700', label: 'All complete' },
  in_progress: { bg: 'bg-amber-400', soft: 'bg-amber-50', ring: 'ring-amber-200', text: 'text-amber-700', label: 'In progress' },
  not_started: { bg: 'bg-slate-400', soft: 'bg-slate-100', ring: 'ring-slate-200', text: 'text-slate-500', label: 'Not started' },
  overdue: { bg: 'bg-rose-500', soft: 'bg-rose-50', ring: 'ring-rose-200', text: 'text-rose-700', label: 'Overdue' },
  none: { bg: 'bg-slate-200', soft: 'bg-slate-50', ring: 'ring-slate-200', text: 'text-slate-400', label: 'Not assigned' },
};

export function Rollup({ onOpenFacility }: { onOpenFacility?: (id: number) => void }) {
  const { orgId } = usePersona();
  const q = useQuery({ queryKey: ['lms-rollup'], queryFn: () => api<Rollup>('/api/lms/rollup') });

  const programs = q.data?.programs ?? [];
  const allFac = q.data?.facilities ?? [];
  const facilities = useMemo(() => {
    const inScope = orgId ? allFac.filter((f) => f.org_id === orgId) : allFac;
    return [...inScope].filter((f) => f.total > 0).sort((a, b) => a.completion_rate - b.completion_rate);
  }, [allFac, orgId]);

  // org-level coverage per program (aggregate across in-scope facilities)
  const orgCoverage = (key: string) => {
    let c = 0, t = 0;
    for (const f of facilities) { c += f.cells[key]?.completed ?? 0; t += f.cells[key]?.total ?? 0; }
    return t ? Math.round((100 * c) / t) : 0;
  };

  const tmpl = `minmax(200px,1.5fr) repeat(${programs.length}, minmax(88px,1fr)) 120px`;

  return (
    <div>
      <Card padded>
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-sm font-semibold text-navy-800">Training compliance by facility</h3>
          <span className="text-xs text-slate-400">Portfolio roll-up · worst first</span>
        </div>
        <p className="text-xs text-slate-400 mb-3">Each cell shows a facility’s completion in that program. Facilities below 80% are flagged.</p>

        {q.isLoading ? (
          <div className="h-72 rounded-xl bg-slate-100 animate-pulse" />
        ) : facilities.length === 0 ? (
          <Empty>No facilities in scope.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-1 px-1">
            <Legend />
            <div className="min-w-[720px]">
              {/* header */}
              <div className="grid items-end gap-2 pb-2 mb-1 border-b border-slate-200" style={{ gridTemplateColumns: tmpl }}>
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Facility</div>
                {programs.map((p) => {
                  const PIcon = programIcon(p.icon);
                  return (
                    <div key={p.key} className="flex flex-col items-center gap-1 px-1">
                      <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${p.color}1a` }}>
                        <PIcon size={15} style={{ color: p.color }} />
                      </span>
                      <span className="text-[10px] leading-tight text-center text-slate-500 font-medium line-clamp-2">{p.name}</span>
                      <span className="text-[11px] font-bold" style={{ color: p.color }}>{orgCoverage(p.key)}%</span>
                    </div>
                  );
                })}
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold text-right pr-1">Overall</div>
              </div>

              {/* facility rows */}
              <div className="divide-y divide-slate-100">
                {facilities.map((f) => {
                  const flagged = f.completion_rate < 80;
                  return (
                    <div key={f.facility_id} className="grid items-center gap-2 py-2.5" style={{ gridTemplateColumns: tmpl }}>
                      <div className="flex items-center gap-2 min-w-0">
                        {flagged
                          ? <span className="h-6 w-1 rounded-full bg-rose-400 shrink-0" />
                          : <span className="h-6 w-1 rounded-full bg-emerald-300 shrink-0" />}
                        <button onClick={() => onOpenFacility?.(f.facility_id)} disabled={!onOpenFacility}
                          className="min-w-0 text-left group disabled:cursor-default">
                          <span className="block text-sm font-medium text-navy-800 truncate group-hover:text-brand-600 group-enabled:group-hover:underline">{f.facility}</span>
                          {flagged && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-accent-rose font-medium">
                              <AlertTriangle size={11} /> needs attention{f.overdue > 0 ? ` · ${f.overdue} overdue` : ''}
                            </span>
                          )}
                        </button>
                      </div>
                      {programs.map((p) => <HeatCell key={p.key} cell={f.cells[p.key]} />)}
                      <div className="flex items-center justify-end pr-1">
                        <div className="text-right">
                          <div className="text-xs font-bold text-navy-800">{f.completion_rate}%</div>
                          <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden mt-0.5">
                            <div className="h-full rounded-full" style={{ width: `${f.completion_rate}%`, background: f.completion_rate >= 80 ? '#10b981' : f.completion_rate >= 50 ? '#f59e0b' : '#f43f5e' }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function HeatCell({ cell }: { cell?: Cell }) {
  const st = STATUS[cell?.status ?? 'none'];
  if (!cell || cell.status === 'none') {
    return <div className="flex justify-center"><span className="h-7 w-14 rounded-md bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center text-slate-300 text-xs">–</span></div>;
  }
  return (
    <div className="flex justify-center">
      <span title={`${st.label} · ${cell.completed}/${cell.total} (${cell.pct}%)`}
        className={`h-7 min-w-14 px-2 rounded-md ${st.soft} ring-1 ${st.ring} flex items-center justify-center gap-1 ${st.text} text-xs font-semibold`}>
        {cell.status === 'complete' ? <Check size={13} /> : <><span className={`h-1.5 w-1.5 rounded-full ${st.bg}`} />{cell.pct}%</>}
      </span>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-[11px] text-slate-500">
      <span className="font-semibold text-slate-400 uppercase tracking-wide">Cell = program completion %</span>
      {(['complete', 'in_progress', 'not_started', 'overdue', 'none'] as const).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <span className={`h-3.5 w-5 rounded ${STATUS[k].soft} ring-1 ${STATUS[k].ring} inline-flex items-center justify-center`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS[k].bg}`} />
          </span>
          {STATUS[k].label}
        </span>
      ))}
    </div>
  );
}
