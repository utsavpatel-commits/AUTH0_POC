import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip,
  AreaChart, Area, CartesianGrid,
} from 'recharts';
import {
  FileText, CheckCircle2, Eye, Download, TrendingUp, TrendingDown,
  Activity, PieChart as PieIcon,
} from 'lucide-react';
import { api } from '../../../lib/api';

interface Analytics {
  by_status: { name: string; value: number }[];
  by_category: { name: string; value: number }[];
  timeline: { month: string; published: number }[];
  usage: { views: number; downloads: number };
  acknowledgement: { total: number; done: number; rate: number };
  totals: { documents: number; published: number };
}

const STATUS_COLORS: Record<string, string> = { Published: '#10b981', 'In review': '#f59e0b', Approved: '#0ea5e9', Draft: '#8b5cf6' };
const fmtMonth = (m: string) => { const [y, mo] = m.split('-'); return new Date(Number(y), Number(mo) - 1).toLocaleString(undefined, { month: 'short' }); };

export function AnalyticsTab({ facilityId }: { facilityId: number }) {
  const q = useQuery({ queryKey: ['cafe-analytics', facilityId], queryFn: () => api<Analytics>(`/api/cafe/analytics?facility_id=${facilityId}`) });
  const a = q.data;

  if (q.isLoading || !a) return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[88px] rounded-2xl bg-white ring-1 ring-slate-200/70 animate-pulse" />)}</div>
      <div className="grid lg:grid-cols-3 gap-5"><div className="lg:col-span-2 h-72 rounded-2xl bg-white ring-1 ring-slate-200/70 animate-pulse" /><div className="h-72 rounded-2xl bg-white ring-1 ring-slate-200/70 animate-pulse" /></div>
    </div>
  );

  const tl = a.timeline.map((t) => ({ ...t, label: fmtMonth(t.month) }));
  const lastM = tl[tl.length - 1]?.published ?? 0;
  const prevM = tl[tl.length - 2]?.published ?? 0;
  const delta = lastM - prevM;
  const engagement = a.usage.views + a.usage.downloads;

  const kpis = [
    { label: 'Total policies', value: a.totals.documents, icon: FileText, grad: 'from-navy-600 to-navy-800', num: 'text-navy-900', hint: `${a.totals.published} published` },
    { label: 'Published & live', value: a.totals.published, icon: CheckCircle2, grad: 'from-emerald-500 to-emerald-700', num: 'text-emerald-700', delta },
    { label: 'Total views', value: a.usage.views, icon: Eye, grad: 'from-brand-500 to-brand-600', num: 'text-brand-700', hint: `${engagement} interactions` },
    { label: 'Downloads', value: a.usage.downloads, icon: Download, grad: 'from-violet-500 to-violet-700', num: 'text-violet-700', hint: 'PDF exports' },
  ];

  return (
    <div className="space-y-5">
      {/* compact KPI band */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 flex items-center gap-3.5">
              <div className={`h-11 w-11 rounded-xl bg-gradient-to-br ${s.grad} flex items-center justify-center shadow-md shrink-0`}><Icon size={19} className="text-white" /></div>
              <div className="min-w-0">
                <div className={`text-[26px] leading-none font-bold tracking-tight ${s.num}`}>{s.value.toLocaleString()}</div>
                <div className="text-[11px] text-slate-500 mt-1 truncate">{s.label}</div>
              </div>
              {s.delta !== undefined ? (
                <span className={`ml-auto inline-flex items-center gap-0.5 text-[11px] font-semibold rounded-full px-1.5 py-0.5 shrink-0 ${s.delta >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-rose-600 bg-rose-50'}`}>
                  {s.delta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{s.delta >= 0 ? '+' : ''}{s.delta}
                </span>
              ) : s.hint ? <span className="ml-auto text-[10px] text-slate-400 text-right shrink-0 max-w-[72px]">{s.hint}</span> : null}
            </div>
          );
        })}
      </div>

      {/* hero: publishing activity (wide) + status donut */}
      <div className="grid lg:grid-cols-3 gap-5">
        <Panel className="lg:col-span-2" icon={Activity} iconTone="text-brand-600 bg-brand-50" title="Publishing activity" sub="Policy versions released per month">
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={tl} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="pubg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00a0d7" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#00a0d7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
                <Tooltip contentStyle={TOOLTIP} cursor={{ stroke: '#cbd5e1', strokeDasharray: '4 4' }} />
                <Area type="monotone" dataKey="published" name="Published" stroke="#00a0d7" strokeWidth={2.5}
                  fill="url(#pubg)" dot={{ r: 3, fill: '#00a0d7', strokeWidth: 0 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel icon={PieIcon} iconTone="text-violet-600 bg-violet-50" title="Policies by status" sub="Lifecycle distribution">
          <div className="relative h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={a.by_status.filter((s) => s.value > 0)} dataKey="value" nameKey="name"
                  innerRadius={58} outerRadius={88} paddingAngle={2} stroke="none">
                  {a.by_status.map((s) => <Cell key={s.name} fill={STATUS_COLORS[s.name] ?? '#cbd5e1'} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="text-3xl font-bold text-navy-900">{a.totals.documents}</div>
              <div className="text-[11px] text-slate-400">policies</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-1">
            {a.by_status.map((s) => (
              <div key={s.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: STATUS_COLORS[s.name] ?? '#cbd5e1' }} />
                <span className="text-slate-600 flex-1 truncate">{s.name}</span>
                <span className="font-semibold text-navy-800">{s.value}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const TOOLTIP = { borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 8px 24px rgba(11,32,53,0.10)', fontSize: 12 } as const;

function Panel({ title, sub, icon: Icon, iconTone, children, className = '' }: {
  title: string; sub?: string; icon: typeof Activity; iconTone: string; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-5 ${className}`}>
      <div className="flex items-center gap-2.5 mb-4">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${iconTone}`}><Icon size={16} /></span>
        <div>
          <h3 className="text-sm font-semibold text-navy-800 leading-tight">{title}</h3>
          {sub && <p className="text-[11px] text-slate-400 leading-tight">{sub}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
