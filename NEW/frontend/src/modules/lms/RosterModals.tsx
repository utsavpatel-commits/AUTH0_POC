import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Modal, Empty } from '../../components/ui';
import { programIcon } from './programMeta';

function Avatar({ name }: { name: string }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <span className="h-8 w-8 rounded-full bg-navy-50 ring-1 ring-navy-100 text-navy-600 text-[11px] font-bold flex items-center justify-center shrink-0">
      {initials}
    </span>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick}
      className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${active ? 'bg-white shadow-sm text-navy-800' : 'text-slate-500 hover:text-slate-700'}`}>
      {children}
    </button>
  );
}

interface Outstanding { title: string; status: string; due_label: string; version?: number; reack?: boolean }
interface ProgramRosterStaff {
  user_id: number; user_name: string; job_title: string | null; profile: string;
  total: number; completed: number; progress: number; complete: boolean; outstanding: Outstanding[];
}
interface ProgramRoster {
  program_key: string; program_name: string; total_staff: number; incomplete_staff: number;
  staff: ProgramRosterStaff[];
}

/** Drill-down for ONE program at a facility: who's behind and on which courses.
 *  This is the single home for "who hasn't completed" — the catalog does not duplicate it. */
export function ProgramRosterModal({ programKey, programName, iconKey, color, facilityId, onClose }: {
  programKey: string; programName: string; iconKey: string; color: string; facilityId: number; onClose: () => void;
}) {
  const [tab, setTab] = useState<'incomplete' | 'all'>('incomplete');
  const q = useQuery({
    queryKey: ['program-roster', programKey, facilityId],
    queryFn: () => api<ProgramRoster>(`/api/lms/program-roster?facility_id=${facilityId}&program_key=${programKey}`),
  });
  const PIcon = programIcon(iconKey);
  const d = q.data;
  const rows = (d?.staff ?? []).filter((s) => (tab === 'incomplete' ? !s.complete : true));

  return (
    <Modal open onClose={onClose} wide title={
      <span className="flex items-center gap-2.5">
        <span className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ background: `${color}1a` }}><PIcon size={16} style={{ color }} /></span>
        {programName}
      </span>
    }>
      <div className="flex items-center justify-between mb-3">
        <div className="inline-flex bg-slate-100 rounded-lg p-1">
          <Seg active={tab === 'incomplete'} onClick={() => setTab('incomplete')}>Not complete{d ? ` · ${d.incomplete_staff}` : ''}</Seg>
          <Seg active={tab === 'all'} onClick={() => setTab('all')}>All staff{d ? ` · ${d.total_staff}` : ''}</Seg>
        </div>
      </div>

      {q.isLoading ? (
        <div className="h-40 rounded-lg bg-slate-100 animate-pulse" />
      ) : rows.length === 0 ? (
        <Empty>{tab === 'incomplete' ? '🎉 Every assigned staff member has completed this program.' : 'No staff assigned to this program yet.'}</Empty>
      ) : (
        <div className="space-y-2 max-h-[26rem] overflow-y-auto pr-0.5">
          {rows.map((s) => (
            <div key={s.user_id} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center gap-3">
                <Avatar name={s.user_name} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy-800 truncate">{s.user_name}</div>
                  <div className="text-[11px] text-slate-400 capitalize">{s.job_title || s.profile}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-semibold text-navy-700">{s.completed}/{s.total} courses</div>
                  <div className="h-1.5 w-24 rounded-full bg-slate-100 overflow-hidden mt-1">
                    <div className="h-full rounded-full" style={{ width: `${s.progress}%`, background: s.complete ? '#10b981' : color }} />
                  </div>
                </div>
              </div>
              {s.outstanding.length > 0 && (
                <div className="mt-2.5 pl-11 flex flex-wrap gap-1.5">
                  {s.outstanding.map((o, i) => (
                    <span key={i} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ring-1 ${o.status === 'overdue' ? 'bg-rose-50 text-accent-rose ring-rose-100' : 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                      {o.title}
                      {o.version ? <span className="text-slate-400">v{o.version}</span> : null}
                      {o.reack ? <span className="text-accent-amber font-medium">· re-acknowledge</span> : null}
                      <span className="text-slate-400">· {o.due_label}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
