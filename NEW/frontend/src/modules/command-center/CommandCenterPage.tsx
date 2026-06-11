import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { AlertCircle, TrendingUp, CalendarClock } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, StatCard, Badge, Empty, PageHeader } from '../../components/ui';

interface Overview {
  arr: number;
  customers: number;
  facilities: number;
  subscribers: number;
  net_retention: number;
  ai_cost_mtd: number;
  ai_revenue_mtd: number;
  margin_pct: number;
}
interface Economics {
  series: { day: string; ai_cost: number; ai_revenue: number; margin: number }[];
}
interface SalesCS {
  at_risk: { account: string; signal: string; owner: string }[];
  upsell: { account: string; signal: string; play: string }[];
  renewals: { account: string; date: string; arr: number }[];
}

const fmt = (n: number) => `$${(n / 1_000_000).toFixed(2)}M`;
const fmtK = (n: number) => `$${(n / 1000).toFixed(0)}k`;

export function CommandCenterPage() {
  const overview = useQuery({ queryKey: ['cc-overview'], queryFn: () => api<Overview>('/api/command-center/overview') });
  const econ = useQuery({ queryKey: ['cc-econ'], queryFn: () => api<Economics>('/api/command-center/ai-economics') });
  const sales = useQuery({ queryKey: ['cc-sales'], queryFn: () => api<SalesCS>('/api/command-center/sales-cs') });

  const o = overview.data;

  return (
    <div>
      <PageHeader title="Executive Command Center" subtitle="TCS-internal — business health, AI economics, Sales/CS" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="ARR" value={o ? fmt(o.arr) : '—'} tone="emerald" />
        <StatCard label="Customers" value={o?.customers ?? '—'} sub={o ? `${o.facilities} facilities` : ''} />
        <StatCard label="Subscribers" value={o?.subscribers ?? '—'} />
        <StatCard label="Net retention" value={o ? `${o.net_retention}%` : '—'} tone="brand" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card
          title="AI cost vs revenue (14-day)"
          className="lg:col-span-2"
          actions={o && <Badge tone="emerald">margin {o.margin_pct}%</Badge>}
        >
          {econ.data ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={econ.data.series} margin={{ left: 0, right: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="ai_revenue" stroke="#0f9d6c" strokeWidth={2} name="AI revenue" />
                <Line type="monotone" dataKey="ai_cost" stroke="#d6435b" strokeWidth={2} name="AI cost" />
                <Line type="monotone" dataKey="margin" stroke="#00a0d7" strokeWidth={2} name="Margin" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty>Loading…</Empty>
          )}
        </Card>

        <Card title="AI economics (MTD)">
          <div className="space-y-3">
            <StatCard label="AI revenue" value={o ? fmtK(o.ai_revenue_mtd) : '—'} tone="emerald" />
            <StatCard label="AI cost" value={o ? fmtK(o.ai_cost_mtd) : '—'} tone="rose" />
            <StatCard label="Margin" value={o ? `${o.margin_pct}%` : '—'} tone="brand" />
          </div>
        </Card>
      </div>

      <h2 className="text-sm font-semibold text-slate-700 mt-6 mb-3">Sales / CS morning view</h2>
      <div className="grid md:grid-cols-3 gap-5">
        <Card
          title={
            <span className="flex items-center gap-2 text-sm font-semibold text-rose-700">
              <AlertCircle size={15} /> At-risk
            </span>
          }
        >
          {(sales.data?.at_risk ?? []).map((a) => (
            <div key={a.account} className="border-b border-slate-100 last:border-0 py-2">
              <div className="text-sm font-medium text-slate-800">{a.account}</div>
              <div className="text-xs text-slate-500">{a.signal}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">Owner: {a.owner}</div>
            </div>
          ))}
        </Card>
        <Card
          title={
            <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
              <TrendingUp size={15} /> Upsell signals
            </span>
          }
        >
          {(sales.data?.upsell ?? []).map((a) => (
            <div key={a.account} className="border-b border-slate-100 last:border-0 py-2">
              <div className="text-sm font-medium text-slate-800">{a.account}</div>
              <div className="text-xs text-slate-500">{a.signal}</div>
              <Badge tone="emerald">{a.play}</Badge>
            </div>
          ))}
        </Card>
        <Card
          title={
            <span className="flex items-center gap-2 text-sm font-semibold text-brand-700">
              <CalendarClock size={15} /> Renewals
            </span>
          }
        >
          {(sales.data?.renewals ?? []).map((a) => (
            <div key={a.account} className="border-b border-slate-100 last:border-0 py-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium text-slate-800">{a.account}</div>
                <div className="text-xs text-slate-500">{a.date}</div>
              </div>
              <span className="text-sm font-semibold text-slate-700">{fmtK(a.arr)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
