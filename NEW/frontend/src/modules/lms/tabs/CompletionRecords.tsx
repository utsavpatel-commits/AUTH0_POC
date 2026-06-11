import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Search, Check, FileText, ExternalLink } from 'lucide-react';
import { api, apiUrl } from '../../../lib/api';
import { Card, Button, Modal } from '../../../components/ui';
import { programIcon } from '../programMeta';
import { ProgramRosterModal } from '../RosterModals';

interface Program { key: string; name: string; icon: string; color: string }
interface Cell { total: number; completed: number; overdue: number; status: string; pct: number }
interface StaffRow {
  user_id: number; user_name: string; job_title: string | null; profile: string;
  overall_rate: number; completed: number; total: number; cells: Record<string, Cell>;
}
interface Matrix { programs: Program[]; staff: StaffRow[] }

const STATUS = {
  complete: { bg: 'bg-emerald-500', soft: 'bg-emerald-50', ring: 'ring-emerald-200', text: 'text-emerald-700', label: 'All complete' },
  in_progress: { bg: 'bg-amber-400', soft: 'bg-amber-50', ring: 'ring-amber-200', text: 'text-amber-700', label: 'In progress' },
  not_started: { bg: 'bg-slate-400', soft: 'bg-slate-100', ring: 'ring-slate-200', text: 'text-slate-500', label: 'Not started' },
  overdue: { bg: 'bg-rose-500', soft: 'bg-rose-50', ring: 'ring-rose-200', text: 'text-rose-700', label: 'Overdue' },
  none: { bg: 'bg-slate-200', soft: 'bg-slate-50', ring: 'ring-slate-200', text: 'text-slate-400', label: 'Not assigned' },
} as const;

function initials(name: string) {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export function CompletionRecords({ facilityId }: { facilityId: number }) {
  const [search, setSearch] = useState('');
  const [drill, setDrill] = useState<Program | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const q = useQuery({
    queryKey: ['completion-matrix', facilityId],
    queryFn: () => api<Matrix>(`/api/lms/completion-matrix?facility_id=${facilityId}`),
  });

  const programs = q.data?.programs ?? [];
  const staffAll = q.data?.staff ?? [];
  const s = search.trim().toLowerCase();
  const staff = useMemo(
    () => (s ? staffAll.filter((r) => `${r.user_name} ${r.job_title ?? ''} ${r.profile}`.toLowerCase().includes(s)) : staffAll),
    [staffAll, s],
  );

  // per-program coverage (folded into column headers, replacing the old card row)
  const coverage = (key: string) => {
    const assigned = staffAll.filter((r) => r.cells[key]?.total > 0);
    const done = assigned.filter((r) => r.cells[key]?.status === 'complete');
    return assigned.length ? Math.round((100 * done.length) / assigned.length) : 0;
  };

  const tmpl = `minmax(190px,1.4fr) repeat(${programs.length}, minmax(92px,1fr)) 128px`;

  return (
    <Card padded>
      {/* header: title + legend + search */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-navy-800">Team completion by program</h3>
          <p className="text-xs text-slate-400 mt-0.5">Sorted by who needs attention first · tap a program to see who’s behind</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search staff…"
              className="rounded-lg border border-slate-300 pl-8 pr-3 py-1.5 text-sm w-44 focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          <button onClick={() => setReportOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-navy-800 text-white text-sm font-medium px-3 py-1.5 hover:bg-navy-700"
            title="Preview the surveyor-ready compliance report">
            <FileText size={15} /> Report
          </button>
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-72 rounded-xl bg-slate-100 animate-pulse" />
      ) : staffAll.length === 0 ? (
        <div className="text-center text-slate-400 text-sm py-12">No staff records for this facility.</div>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          {/* key: each cell shows a staff member's standing in one program (completed / assigned) */}
          <Legend />
          <div className="min-w-[680px]">
            {/* column header */}
            <div className="grid items-end gap-2 pb-2 mb-1 border-b border-slate-200" style={{ gridTemplateColumns: tmpl }}>
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Staff member</div>
              {programs.map((p) => {
                const PIcon = programIcon(p.icon);
                const cov = coverage(p.key);
                return (
                  <button key={p.key} onClick={() => setDrill(p)} title={`${p.name} — tap to see who's behind`}
                    className="group flex flex-col items-center gap-1 px-1">
                    <span className="h-8 w-8 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${p.color}1a` }}>
                      <PIcon size={15} style={{ color: p.color }} />
                    </span>
                    <span className="text-[10px] leading-tight text-center text-slate-500 font-medium line-clamp-2 group-hover:text-navy-800">{p.name}</span>
                    <span className="text-[11px] font-bold" style={{ color: p.color }}>{cov}%</span>
                  </button>
                );
              })}
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold text-right pr-1">Overall</div>
            </div>

            {/* staff rows */}
            <div className="divide-y divide-slate-100">
              {staff.map((r) => (
                <div key={r.user_id} className="grid items-center gap-2 py-2.5" style={{ gridTemplateColumns: tmpl }}>
                  {/* staff identity */}
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="h-8 w-8 rounded-full bg-navy-50 ring-1 ring-navy-100 text-navy-600 text-[11px] font-bold flex items-center justify-center shrink-0">{initials(r.user_name)}</span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-navy-800 truncate">{r.user_name}</span>
                      <span className="block text-[11px] text-slate-400 capitalize truncate">{r.job_title || r.profile}</span>
                    </span>
                  </div>
                  {/* program cells */}
                  {programs.map((p) => (
                    <HeatCell key={p.key} cell={r.cells[p.key]} onClick={() => setDrill(p)} />
                  ))}
                  {/* overall */}
                  <div className="flex items-center justify-end gap-2 pr-1">
                    <div className="text-right">
                      <div className="text-xs font-bold text-navy-800">{r.overall_rate}%</div>
                      <div className="h-1.5 w-16 rounded-full bg-slate-100 overflow-hidden mt-0.5">
                        <div className="h-full rounded-full" style={{ width: `${r.overall_rate}%`, background: r.overall_rate >= 80 ? '#10b981' : r.overall_rate >= 50 ? '#f59e0b' : '#f43f5e' }} />
                      </div>
                    </div>
                    <a href={apiUrl(`/api/lms/users/${r.user_id}/evidence.pdf`)} target="_blank" rel="noreferrer"
                      onClick={(e) => e.stopPropagation()} title="Surveyor evidence PDF"
                      className="text-slate-300 hover:text-brand-600"><FileDown size={15} /></a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {drill && (
        <ProgramRosterModal programKey={drill.key} programName={drill.name} iconKey={drill.icon} color={drill.color}
          facilityId={facilityId} onClose={() => setDrill(null)} />
      )}

      {reportOpen && (
        <Modal open onClose={() => setReportOpen(false)} wide
          title={<span className="flex items-center gap-2"><FileText size={16} className="text-brand-500" /> Training Compliance Report</span>}
          footer={<>
            <a href={apiUrl(`/api/lms/facility-report.pdf?facility_id=${facilityId}`)} target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-navy-800 mr-auto">
              <ExternalLink size={14} /> Open in new tab
            </a>
            <a href={apiUrl(`/api/lms/facility-report.pdf?facility_id=${facilityId}`)} download>
              <Button><FileDown size={15} /> Download PDF</Button>
            </a>
          </>}>
          <iframe
            src={`${apiUrl(`/api/lms/facility-report.pdf?facility_id=${facilityId}`)}#toolbar=0&navpanes=0&view=FitH`}
            title="Training Compliance Report"
            className="w-full rounded-lg border border-slate-200 bg-slate-100"
            style={{ height: '70vh' }}
          />
        </Modal>
      )}
    </Card>
  );
}

function HeatCell({ cell, onClick }: { cell?: Cell; onClick: () => void }) {
  const st = STATUS[(cell?.status ?? 'none') as keyof typeof STATUS];
  if (!cell || cell.status === 'none') {
    return <div className="flex justify-center"><span className="h-7 w-12 rounded-md bg-slate-50 ring-1 ring-slate-100 flex items-center justify-center text-slate-300 text-xs">–</span></div>;
  }
  return (
    <div className="flex justify-center">
      <button onClick={onClick} title={`${st.label} · ${cell.completed}/${cell.total} completed`}
        className={`h-7 min-w-12 px-2 rounded-md ${st.soft} ring-1 ${st.ring} flex items-center justify-center gap-1 ${st.text} text-xs font-semibold hover:brightness-95 transition`}>
        {cell.status === 'complete'
          ? <Check size={13} />
          : <><span className={`h-1.5 w-1.5 rounded-full ${st.bg}`} />{cell.completed}/{cell.total}</>}
      </button>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3 text-[11px] text-slate-500">
      <span className="font-semibold text-slate-400 uppercase tracking-wide">Each cell = completed / assigned</span>
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
