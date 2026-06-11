import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileText, ClipboardCheck, BellRing, ShieldAlert, GraduationCap, Info, ChevronRight,
  ArrowUpRight, ArrowUpCircle, PencilLine, CheckCircle2, Users, Sparkles, Plus, ShieldCheck,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { fmtDateTime } from '../table';

interface Home {
  kpis: { total: number; published: number; drafts: number; in_review: number; approved: number; new_tcs: number };
  attention: { pending_approvals: number; updates_available: number; drafts: number; acks_outstanding: number };
  policy_currency: { up_to_date: number; current: number; total: number };
  training: { source_policies: number; linked_courses: number; assigned: number; completed: number; completion_rate: number; acks_total: number; acks_done: number };
  notifications: { id: number; title: string; body: string | null; kind: string; is_read: boolean; created_at: string | null }[];
  recent: { id: number; title: string; category: string | null; status: string; updated_at: string | null }[];
}
interface Doc {
  id: number; title: string; category: string | null; status: string; current_version: number;
  updated_at: string | null; update_available?: boolean; source_current_version?: number | null;
}

const NOTIF_ICON: Record<string, typeof Info> = { regulatory: ShieldAlert, training_due: GraduationCap, policy_update: FileText, info: Info };
const NOTIF_TONE: Record<string, string> = {
  regulatory: 'text-accent-rose bg-rose-50', training_due: 'text-brand-600 bg-brand-50',
  policy_update: 'text-accent-amber bg-amber-50', info: 'text-slate-500 bg-slate-100',
};

const STATUS_DOT: Record<string, string> = {
  published: 'bg-accent-emerald', in_review: 'bg-accent-amber', approved: 'bg-brand-500', draft: 'bg-violet-500', archived: 'bg-slate-300',
};
const STATUS_LABEL: Record<string, string> = { published: 'Published', in_review: 'In review', approved: 'Approved', draft: 'Draft', archived: 'Archived' };

type Kind = 'update' | 'review' | 'draft';
const KIND: Record<Kind, { icon: typeof FileText; chip: string; tag: string; tagCls: string; reason: string }> = {
  update: { icon: ArrowUpCircle, chip: 'text-accent-amber bg-amber-50', tag: 'Reconcile', tagCls: 'text-amber-700 bg-amber-50 ring-amber-200', reason: 'TCS published a newer source version' },
  review: { icon: ClipboardCheck, chip: 'text-brand-600 bg-brand-50', tag: 'Review', tagCls: 'text-brand-700 bg-brand-50 ring-brand-200', reason: 'Submitted and awaiting peer approval' },
  draft: { icon: PencilLine, chip: 'text-violet-600 bg-violet-50', tag: 'Continue', tagCls: 'text-violet-700 bg-violet-50 ring-violet-200', reason: 'Draft not yet submitted' },
};

export function HomeTab({ facilityId, canManage, onNavigate }: { facilityId: number; canManage: boolean; onNavigate: (k: string) => void }) {
  const nav = useNavigate();
  const home = useQuery({ queryKey: ['cafe-home', facilityId], queryFn: () => api<Home>(`/api/cafe/home?facility_id=${facilityId}`) });
  const docsQ = useQuery({ queryKey: ['cafe-docs', facilityId], queryFn: () => api<Doc[]>(`/api/cafe/documents?facility_id=${facilityId}&owner_type=customer`) });
  const tr = home.data?.training;
  const acksOut = home.data?.attention.acks_outstanding ?? 0;

  const work = useMemo(() => {
    const out: { kind: Kind; d: Doc; rank: number }[] = [];
    for (const d of docsQ.data ?? []) {
      if (d.update_available) out.push({ kind: 'update', d, rank: 0 });
      else if (d.status === 'in_review') out.push({ kind: 'review', d, rank: 1 });
      else if (d.status === 'draft' && d.current_version < 1) out.push({ kind: 'draft', d, rank: 2 });
    }
    return out.sort((a, b) => a.rank - b.rank || (b.d.updated_at ?? '').localeCompare(a.d.updated_at ?? ''));
  }, [docsQ.data]);
  const workCount = work.length + (acksOut > 0 ? 1 : 0);
  const recent = home.data?.recent ?? [];

  const total = home.data?.kpis.total ?? 0;
  const pubShare = total ? Math.round((100 * (home.data?.kpis.published ?? 0)) / total) : 0;
  const completion = tr?.completion_rate ?? 0;
  const upToDate = home.data?.policy_currency.up_to_date ?? 100;
  const readiness = Math.round(0.4 * completion + 0.3 * pubShare + 0.3 * upToDate);
  const flow = [
    { label: 'Facility policies', value: total, icon: FileText, tone: 'text-navy-600 bg-navy-50 ring-navy-100' },
    { label: 'Courses sourced from policies', value: tr?.linked_courses ?? 0, icon: GraduationCap, tone: 'text-brand-600 bg-brand-50 ring-brand-100' },
    { label: 'Staff assignments', value: tr?.assigned ?? 0, icon: Users, tone: 'text-violet-600 bg-violet-50 ring-violet-100' },
  ];

  return (
    <div className="space-y-5">
      {/* ---- facility readiness header ---- */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 sm:p-5 flex items-center gap-5">
        <ReadyRing pct={readiness} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy-900"><ShieldCheck size={15} className="text-brand-600" /> Compliance readiness</div>
          <p className="text-[12.5px] text-slate-500 mt-0.5">{readinessSummary(readiness, work.length + (acksOut > 0 ? 1 : 0))}</p>
        </div>
        <div className="hidden md:flex items-center gap-7 shrink-0">
          <MiniMetric label="Published coverage" pct={pubShare} tone="bg-emerald-500" />
          <MiniMetric label="Training completion" pct={completion} tone="bg-brand-500" />
        </div>
      </section>

      <div className="grid lg:grid-cols-[1.6fr_1fr] gap-5 items-start">
      {/* ---- left column: worklist + recent ---- */}
      <div className="space-y-5">
      <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <h3 className="text-sm font-semibold text-navy-800">Your worklist</h3>
            {workCount > 0 && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5">{workCount}</span>}
          </div>
          {canManage && (
            <button onClick={() => onNavigate('mine')} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700"><Plus size={13} /> New policy</button>
          )}
        </div>

        {docsQ.isLoading ? (
          <div className="p-5 space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />)}</div>
        ) : work.length === 0 && acksOut === 0 ? (
          <div className="py-16 text-center">
            <div className="mx-auto h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-3"><CheckCircle2 size={22} className="text-accent-emerald" /></div>
            <div className="text-sm font-medium text-navy-700">Nothing needs your attention</div>
            <div className="text-xs text-slate-400 mt-1">Approvals, TCS updates and drafts will surface here.</div>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {acksOut > 0 && (
              <button onClick={() => onNavigate('analytics')} className="group w-full flex items-center gap-3.5 px-5 py-3 hover:bg-slate-50/70 text-left transition-colors">
                <span className="h-9 w-9 rounded-lg bg-emerald-50 text-accent-emerald flex items-center justify-center shrink-0"><GraduationCap size={17} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-navy-800">{acksOut} staff acknowledgement{acksOut > 1 ? 's' : ''} outstanding</div>
                  <div className="text-[11.5px] text-slate-400">Published-policy sign-offs not yet completed</div>
                </div>
                <span className="hidden sm:inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ring-1 text-emerald-700 bg-emerald-50 ring-emerald-200">Track</span>
                <ChevronRight size={15} className="text-slate-300 group-hover:text-brand-600 shrink-0" />
              </button>
            )}
            {work.map(({ kind, d }) => {
              const k = KIND[kind]; const Icon = k.icon;
              return (
                <button key={`${kind}-${d.id}`} onClick={() => nav(`/cafe/d/${d.id}`)} className="group w-full flex items-center gap-3.5 px-5 py-3 hover:bg-slate-50/70 text-left transition-colors">
                  <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${k.chip}`}><Icon size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-navy-800 truncate group-hover:text-brand-700">{d.title}</div>
                    <div className="text-[11.5px] text-slate-400 truncate">{k.reason} · {fmtDateTime(d.updated_at)}</div>
                  </div>
                  <span className={`hidden sm:inline-flex text-[11px] font-semibold rounded-full px-2 py-0.5 ring-1 ${k.tagCls}`}>{k.tag}</span>
                  <ChevronRight size={15} className="text-slate-300 group-hover:text-brand-600 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* ---- recently published (fills the column, adds context) ---- */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-navy-800 flex items-center gap-2"><span className="h-6 w-6 rounded-md bg-brand-50 flex items-center justify-center"><FileText size={14} className="text-brand-600" /></span> Recently updated</h3>
          <button onClick={() => onNavigate('mine')} className="text-xs font-medium text-brand-600 hover:underline inline-flex items-center gap-1">All policies <ChevronRight size={13} /></button>
        </div>
        {home.isLoading ? (
          <div className="p-5 space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 rounded-lg bg-slate-100 animate-pulse" />)}</div>
        ) : recent.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-400">No policies yet.</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recent.map((d) => (
              <button key={d.id} onClick={() => nav(`/cafe/d/${d.id}`)} className="group w-full flex items-center gap-3 px-5 py-2.5 hover:bg-slate-50/70 text-left transition-colors">
                <span className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center shrink-0"><FileText size={14} className="text-slate-400" /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium text-navy-800 truncate group-hover:text-brand-700">{d.title}</div>
                  <div className="text-[11px] text-slate-400">{d.category || 'Uncategorized'} · {fmtDateTime(d.updated_at)}</div>
                </div>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 shrink-0">
                  <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[d.status] ?? 'bg-slate-300'}`} />{STATUS_LABEL[d.status] ?? d.status}
                </span>
                <ChevronRight size={14} className="text-slate-300 group-hover:text-brand-600 shrink-0" />
              </button>
            ))}
          </div>
        )}
      </section>
      </div>

      {/* ---- right rail: policy→training flow + alerts ---- */}
      <div className="space-y-5">
        {/* the cross-module value story as a connected flow, not boxes */}
        <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="h-7 w-7 rounded-lg bg-brand-50 flex items-center justify-center"><Sparkles size={15} className="text-brand-600" /></span>
            <div>
              <h3 className="text-sm font-semibold text-navy-800 leading-tight">Policy → training flow</h3>
              <p className="text-[11px] text-slate-400 leading-tight">Café policies are the single source for LMS courses</p>
            </div>
          </div>

          <div className="relative">
            {flow.map((s, i) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="relative flex items-center gap-3.5 pb-4 last:pb-0">
                  {i < flow.length - 1 && <span className="absolute left-[17px] top-9 h-[calc(100%-1.25rem)] w-px bg-slate-200" />}
                  <span className={`relative z-10 h-9 w-9 rounded-full ring-1 flex items-center justify-center shrink-0 ${s.tone}`}><Icon size={16} /></span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xl font-bold text-navy-900 tabular-nums">{s.value}</span>
                    <span className="text-[12.5px] text-slate-500">{s.label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* completion outcome */}
          <div className="mt-1 rounded-xl bg-gradient-to-br from-emerald-50 to-white ring-1 ring-emerald-100 p-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-medium text-navy-700 inline-flex items-center gap-1.5"><CheckCircle2 size={14} className="text-accent-emerald" /> Training completion</span>
              <span className="text-lg font-bold text-emerald-700 tabular-nums">{tr?.completion_rate ?? 0}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-emerald-100/70 overflow-hidden">
              <span className="block h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${tr?.completion_rate ?? 0}%` }} />
            </div>
            <div className="text-[11px] text-slate-400 mt-1.5">{tr?.completed ?? 0} of {tr?.assigned ?? 0} assignments complete</div>
          </div>
        </section>

        {/* alerts */}
        <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-navy-800 flex items-center gap-2"><BellRing size={15} className="text-accent-amber" /> TCS alerts</h3>
            {home.data && home.data.kpis.new_tcs > 0 && <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-full px-2 py-0.5">{home.data.kpis.new_tcs} new from TCS</span>}
          </div>
          {home.isLoading ? (
            <div className="p-5 space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 rounded-lg bg-slate-100 animate-pulse" />)}</div>
          ) : (home.data?.notifications ?? []).length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">You’re all caught up.</div>
          ) : (
            <div className="divide-y divide-slate-50 max-h-[300px] overflow-y-auto">
              {home.data!.notifications.slice(0, 5).map((n) => {
                const Icon = NOTIF_ICON[n.kind] ?? Info;
                return (
                  <div key={n.id} className="flex items-start gap-3 px-5 py-3">
                    <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${NOTIF_TONE[n.kind] ?? NOTIF_TONE.info}`}><Icon size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium text-navy-800 leading-snug">{n.title}</div>
                      {n.body && <div className="text-[11px] text-slate-500 leading-snug mt-0.5 line-clamp-2">{n.body}</div>}
                      <div className="text-[10px] text-slate-400 mt-0.5">{fmtDateTime(n.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <button onClick={() => onNavigate('library')} className="w-full flex items-center justify-center gap-1.5 px-5 py-2.5 border-t border-slate-100 text-xs font-medium text-brand-600 hover:bg-brand-50/50 transition-colors">
            Manage alerts in TCS Library <ArrowUpRight size={13} />
          </button>
        </section>
      </div>
      </div>
    </div>
  );
}

function readinessSummary(score: number, openItems: number): string {
  if (openItems === 0) {
    return score >= 85
      ? 'All policies are current, approved, and in effect.'
      : 'Your worklist is clear — policies are up to date.';
  }
  const label = score >= 85 ? 'Strong standing' : score >= 65 ? 'On track' : 'Action needed';
  return `${label} — ${openItems} open item${openItems > 1 ? 's' : ''} to action to keep your policy library current.`;
}

function ReadyRing({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r, off = c - (pct / 100) * c;
  const color = pct >= 85 ? '#10b981' : pct >= 65 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative h-[68px] w-[68px] shrink-0">
      <svg viewBox="0 0 64 64" className="h-full w-full -rotate-90">
        <circle cx="32" cy="32" r={r} fill="none" stroke="#eef2f7" strokeWidth="7" />
        <circle cx="32" cy="32" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-base font-bold text-navy-900">{pct}<span className="text-[10px] text-slate-400">%</span></div>
    </div>
  );
}

function MiniMetric({ label, pct, tone }: { label: string; pct: number; tone: string }) {
  return (
    <div className="w-32">
      <div className="flex items-baseline justify-between"><span className="text-[11px] text-slate-500">{label}</span><span className="text-[12px] font-bold text-navy-800 tabular-nums">{pct}%</span></div>
      <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
