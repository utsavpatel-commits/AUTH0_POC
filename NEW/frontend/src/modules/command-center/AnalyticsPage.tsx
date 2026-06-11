import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { api } from '../../lib/api';
import { Card, StatCard, Badge, Table, PageHeader } from '../../components/ui';

interface SearchAnalytics {
  kpis: { total_searches: number; success_rate: number; zero_result_rate: number; avg_relevance: number };
  trend: { week: string; searches: number; chats: number }[];
  top_queries: { query: string; count: number; trend: string }[];
  content_gaps: { query: string; demand: string; action: string }[];
}

const TrendIcon = ({ t }: { t: string }) =>
  t === 'up' ? (
    <TrendingUp size={13} className="text-emerald-600" />
  ) : t === 'down' ? (
    <TrendingDown size={13} className="text-rose-600" />
  ) : (
    <Minus size={13} className="text-slate-400" />
  );

export function AnalyticsPage() {
  const a = useQuery({
    queryKey: ['cc-analytics'],
    queryFn: () => api<SearchAnalytics>('/api/command-center/search-analytics'),
  });
  const d = a.data;

  return (
    <div>
      <PageHeader title="Search & Chat Analytics" subtitle="AI Search + Chat usage across the customer base" />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total searches" value={d ? d.kpis.total_searches.toLocaleString() : '—'} tone="brand" />
        <StatCard label="Success rate" value={d ? `${d.kpis.success_rate}%` : '—'} tone="emerald" />
        <StatCard label="Zero-result" value={d ? `${d.kpis.zero_result_rate}%` : '—'} tone="amber" />
        <StatCard label="Avg relevance" value={d ? d.kpis.avg_relevance : '—'} />
      </div>

      <Card title="Search & chat volume (8-week)" className="mb-5">
        {d && (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={d.trend} margin={{ left: 0, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="searches" stroke="#00a0d7" fill="#c3e9f7" name="Searches" />
              <Area type="monotone" dataKey="chats" stroke="#1d4368" fill="#d3e0ec" name="Chats" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="grid md:grid-cols-2 gap-5">
        <Card title="Top queries">
          {d && (
            <Table head={['Query', 'Count', 'Trend']}>
              {d.top_queries.map((q) => (
                <tr key={q.query} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{q.query}</td>
                  <td className="py-2 pr-4 text-slate-600">{q.count.toLocaleString()}</td>
                  <td className="py-2">
                    <TrendIcon t={q.trend} />
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title="Content gaps (zero-result demand)">
          {d && (
            <Table head={['Query', 'Demand', 'Suggested action']}>
              {d.content_gaps.map((g) => (
                <tr key={g.query} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 text-slate-700">{g.query}</td>
                  <td className="py-2 pr-4">
                    <Badge tone={g.demand === 'high' ? 'rose' : 'amber'}>{g.demand}</Badge>
                  </td>
                  <td className="py-2 text-slate-600 text-xs">{g.action}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
    </div>
  );
}
