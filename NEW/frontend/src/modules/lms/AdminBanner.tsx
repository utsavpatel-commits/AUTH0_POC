import { useQuery } from '@tanstack/react-query';
import { Users, AlertTriangle, GraduationCap } from 'lucide-react';
import { api } from '../../lib/api';

interface Stats { total: number; completed: number; in_progress: number; overdue: number; completion_rate: number }
interface Row { user_id: number; completion_rate: number }
interface Facility { id: number; name: string }

/** Branded identity banner for facility-management personas (Faculty / DON / Admin).
 *  Mission + team KPIs + the cross-persona hand-off cue. (Smart actions live in the
 *  Compliance Copilot below it.) */
export function AdminBanner({ facilityId, role }: { facilityId: number; role: string }) {
  const stats = useQuery({ queryKey: ['lms-stats', facilityId], queryFn: () => api<Stats>(`/api/lms/stats?facility_id=${facilityId}`) });
  const summary = useQuery({ queryKey: ['completion-summary', facilityId], queryFn: () => api<Row[]>(`/api/lms/completion-summary?facility_id=${facilityId}`) });
  const facilities = useQuery({ queryKey: ['facilities'], queryFn: () => api<Facility[]>('/api/facilities') });

  const facilityName = facilities.data?.find((f) => f.id === facilityId)?.name;
  const s = stats.data;
  const rate = s?.completion_rate ?? 0;
  const staffCount = summary.data?.length ?? 0;
  const behind = (summary.data ?? []).filter((r) => r.completion_rate < 80).length;

  const headline: Record<string, string> = {
    staff_educator: 'Training Center', don: 'Clinical Training Oversight',
    administrator: 'Facility Training', customer_admin: 'Training Administration',
  };
  const tagline: Record<string, string> = {
    staff_educator: 'Build courses, enroll staff, assign training, and keep everyone current.',
    don: 'Monitor clinical compliance, intervene on risk, and pull survey-ready evidence.',
    administrator: 'Assign training, track completion, and stay survey-ready.',
    customer_admin: 'Manage training, content, and completion for your organization.',
  };
  const handoff: Record<string, string> = {
    staff_educator: 'What you assign lands on each learner’s home — completions roll up to your DON and Corporate.',
    don: 'These numbers come straight from your educators’ assignments — flag gaps back or pull evidence for survey.',
    administrator: 'Assignments flow to learners; completion rolls up to your DON and Corporate portfolio.',
    customer_admin: 'Courses, learners, and assignments here power every downstream compliance view.',
  };

  return (
    <div className="rounded-2xl text-white p-6" style={{ background: 'linear-gradient(135deg, #0b2035 0%, #006f97 60%, #00a0d7 130%)' }}>
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-widest text-brand-200 font-semibold">{headline[role] ?? 'Facility Training'}</div>
          <div className="text-2xl font-bold mt-1 truncate">{facilityName ?? 'Your facility'}</div>
          <div className="text-sm text-white/70 mt-1 max-w-xl">{tagline[role] ?? tagline.administrator}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-4xl font-bold">{rate}%</div>
          <div className="text-xs text-white/60 uppercase tracking-wide">team complete</div>
          <div className="mt-2 h-2 w-40 rounded-full bg-white/15 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-300 to-emerald-400" style={{ width: `${rate}%` }} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
        <Kpi icon={<Users size={15} />} label="Staff" value={staffCount} />
        <Kpi icon={<GraduationCap size={15} />} label="Assignments" value={s?.total ?? '—'} />
        <Kpi icon={<AlertTriangle size={15} />} label="Overdue" value={s?.overdue ?? '—'} tone="rose" />
        <Kpi icon={<AlertTriangle size={15} />} label="Behind (<80%)" value={behind} tone="amber" />
      </div>

      <p className="text-[11px] text-white/45 mt-3">{handoff[role] ?? handoff.administrator}</p>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone?: 'rose' | 'amber' }) {
  const accent = tone === 'rose' ? 'text-rose-200' : tone === 'amber' ? 'text-amber-200' : 'text-white';
  return (
    <div className="rounded-xl bg-white/10 ring-1 ring-white/15 px-3.5 py-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[11px] text-white/60 uppercase tracking-wide font-semibold">
        {icon} {label}
      </div>
      <div className={`text-xl font-bold mt-0.5 ${accent}`}>{value}</div>
    </div>
  );
}
