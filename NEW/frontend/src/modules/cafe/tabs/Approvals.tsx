import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, ChevronRight, ChevronLeft, Search, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePersona, personaLabel } from '../../../lib/persona';
import { Button } from '../../../components/ui';
import { fmtDateTime } from '../table';

interface QueueDoc {
  id: number; title: string; category: string | null; author: string | null;
  submitted_by: string | null; submitted_at: string | null;
}
const PAGE = 12;
const initials = (s: string | null) => (s || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

export function Approvals({ facilityId }: { facilityId: number }) {
  const nav = useNavigate();
  const { role } = usePersona();
  const actor = personaLabel(role);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ['cafe-review-queue', facilityId],
    queryFn: () => api<QueueDoc[]>(`/api/cafe/review-queue?facility_id=${facilityId}`),
  });

  const s = search.trim().toLowerCase();
  const rows = useMemo(() => {
    const r = (q.data ?? []).filter((d) => !s || d.title.toLowerCase().includes(s) || (d.submitted_by ?? '').toLowerCase().includes(s));
    return [...r].sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? ''));
  }, [q.data, s]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative flex-1 min-w-56 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search submissions…"
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <span className="ml-auto text-xs text-slate-400">{rows.length} awaiting approval</span>
      </div>

      {q.isLoading ? (
        <div className="space-y-2.5">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 rounded-xl bg-white ring-1 ring-slate-200/70 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 py-16 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-3"><CheckCircle2 size={22} className="text-accent-emerald" /></div>
          <div className="text-sm font-medium text-navy-800">Nothing awaiting approval</div>
          <div className="text-xs text-slate-400 mt-1">Submitted policies will appear here for peer review.</div>
        </div>
      ) : (
        <>
          <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100">
              <span className="h-6 w-6 rounded-md bg-amber-50 flex items-center justify-center"><ClipboardCheck size={14} className="text-accent-amber" /></span>
              <h3 className="text-sm font-semibold text-navy-800">Review queue</h3>
            </div>
            <div className="divide-y divide-slate-50">
              {pageRows.map((d) => {
                const mine = d.submitted_by && d.submitted_by.trim().toLowerCase() === actor.trim().toLowerCase();
                return (
                  <button key={d.id} onClick={() => nav(`/cafe/d/${d.id}`)}
                    className="group w-full flex items-center gap-3.5 px-5 py-3.5 hover:bg-slate-50/70 text-left transition-colors">
                    <span className="h-9 w-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><Clock size={17} className="text-accent-amber" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-navy-900 truncate group-hover:text-brand-700">{d.title}</div>
                      <div className="text-[11.5px] text-slate-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="inline-flex items-center gap-1">
                          <span className="h-4 w-4 rounded-full bg-gradient-to-br from-navy-600 to-navy-800 text-white text-[8px] font-bold flex items-center justify-center">{initials(d.submitted_by)}</span>
                          {d.submitted_by || 'Unknown'}
                        </span>
                        <span>·</span>
                        <span>{d.category || 'Uncategorized'}</span>
                        <span>·</span>
                        <span>{fmtDateTime(d.submitted_at)}</span>
                      </div>
                    </div>
                    {mine
                      ? <span className="text-[11px] font-medium text-slate-400 shrink-0">Your submission</span>
                      : <span className="shrink-0"><Button size="sm" variant="outline">Review</Button></span>}
                    <ChevronRight size={15} className="text-slate-300 group-hover:text-brand-600 shrink-0" />
                  </button>
                );
              })}
            </div>
          </section>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-400">{rows.length} document{rows.length !== 1 ? 's' : ''}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft size={14} /> Prev</button>
                <span className="text-xs text-slate-400 px-1">{safePage} / {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50">Next <ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
