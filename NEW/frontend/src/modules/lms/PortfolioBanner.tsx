import { useQuery } from '@tanstack/react-query';
import { Building2, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { api } from '../../lib/api';
import { usePersona, isTcs } from '../../lib/persona';
import type { Role } from '../../lib/types';

interface Cell { status: string }
interface FacRow { facility_id: number; facility: string; org_id: number | null; total: number; overdue: number; completion_rate: number; cells: Record<string, Cell> }
interface Rollup { facilities: FacRow[] }
interface Org { id: number; name: string; is_corporate: boolean }

/** Org-level identity banner for the portfolio (Facilities) tab. Portfolio KPIs;
 *  the risk-ranked drill-downs live in the Compliance Copilot below it. */
export function PortfolioBanner({ role }: { role: Role }) {
  const { orgId } = usePersona();
  const rollup = useQuery({ queryKey: ['lms-rollup'], queryFn: () => api<Rollup>('/api/lms/rollup') });
  const orgs = useQuery({ queryKey: ['orgs'], queryFn: () => api<Org[]>('/api/orgs') });

  const all = rollup.data?.facilities ?? [];
  const facilities = (isTcs(role) ? all : orgId ? all.filter((f) => f.org_id === orgId) : all).filter((f) => f.total > 0);
  const orgName = isTcs(role) ? 'All customers' : (orgs.data?.find((o) => o.id === orgId)?.name ?? 'Your organization');

  const avg = facilities.length ? Math.round(facilities.reduce((a, f) => a + f.completion_rate, 0) / facilities.length) : 0;
  const behind = facilities.filter((f) => f.completion_rate < 80).length;
  const onTrack = facilities.length - behind;
  const overdue = facilities.reduce((a, f) => a + (f.overdue || 0), 0);

  return (
    <div className="rounded-2xl text-white p-6" style={{ background: 'linear-gradient(135deg, #0b2035 0%, #006f97 60%, #00a0d7 130%)' }}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-brand-200 font-semibold flex items-center gap-1.5">
            <Layers size={13} /> Portfolio
          </div>
          <div className="text-2xl font-bold mt-1 truncate">{orgName}</div>
          <div className="text-sm text-white/70 mt-1 max-w-xl">Training readiness across every facility in your organization.</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-4xl font-bold">{avg}%</div>
          <div className="text-xs text-white/60 uppercase tracking-wide">avg completion</div>
          <div className="mt-2 h-2 w-40 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-400" style={{ width: `${avg}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Kpi icon={<Building2 size={15} />} label="Facilities" value={facilities.length} />
        <Kpi icon={<CheckCircle2 size={15} />} label="On track" value={onTrack} tone="emerald" />
        <Kpi icon={<AlertTriangle size={15} />} label="Behind (<80%)" value={behind} tone="amber" />
        <Kpi icon={<AlertTriangle size={15} />} label="Overdue" value={overdue} tone="rose" />
      </div>

      <p className="text-[11px] text-white/45 mt-3">Training readiness rolls up from every facility — open one to drop into its DON-level detail.</p>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'rose' | 'amber' | 'emerald' }) {
  const accent = tone === 'rose' ? 'text-rose-200' : tone === 'amber' ? 'text-amber-200' : tone === 'emerald' ? 'text-emerald-200' : 'text-white';
  return (
    <div className="rounded-xl bg-white/10 ring-1 ring-white/15 px-3.5 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[11px] text-white/60 uppercase tracking-wide font-semibold">{icon} {label}</div>
      <div className={`text-xl font-bold mt-0.5 ${accent}`}>{value}</div>
    </div>
  );
}
