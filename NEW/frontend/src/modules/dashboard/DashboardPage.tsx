import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { AlertTriangle, TrendingDown } from 'lucide-react';
import { api } from '../../lib/api';
import { usePersona, isTcs } from '../../lib/persona';
import { Card, StatCard, Badge, Empty, PageHeader } from '../../components/ui';

interface FacilityDash {
  facility: string;
  completion_rate: number;
  overdue: number;
  open_findings: number;
  open_pocs: number;
  readiness_score: number;
  top_ftags: { ftag: string; title: string; count: number }[];
}
interface PortfolioFac {
  facility_id: number;
  facility: string;
  state?: string;
  readiness_score: number;
  completion_rate: number;
  open_findings: number;
}
interface Portfolio {
  portfolio_score: number;
  facility_count: number;
  ready_count: number;
  outlier: PortfolioFac | null;
  facilities: PortfolioFac[];
}

function scoreColor(s: number) {
  if (s >= 80) return '#0f9d6c';
  if (s >= 60) return '#d98a04';
  return '#d6435b';
}

export function DashboardPage() {
  const { role, facilityId, orgId } = usePersona();
  const [view, setView] = useState<'facility' | 'portfolio'>(
    role === 'corporate_leader' || isTcs(role) ? 'portfolio' : 'facility',
  );

  const facility = useQuery({
    queryKey: ['dash-facility', facilityId],
    queryFn: () => api<FacilityDash>(`/api/dashboard/facility/${facilityId}`),
    enabled: facilityId != null && view === 'facility',
  });

  const portfolio = useQuery({
    queryKey: ['dash-portfolio', orgId],
    queryFn: () => api<Portfolio>(`/api/dashboard/portfolio?org_id=${orgId ?? ''}`),
    enabled: view === 'portfolio',
  });

  return (
    <div>
      <PageHeader
        title="Compliance Dashboard"
        subtitle="Outcome plane — LMS completion + Survey findings + audit results, role-lensed"
        actions={
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
            {(['facility', 'portfolio'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`text-xs px-3 py-1.5 rounded-md ${
                  view === v ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'
                }`}
              >
                {v === 'facility' ? 'Single facility' : 'Portfolio'}
              </button>
            ))}
          </div>
        }
      />

      {view === 'facility' && facility.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
            <StatCard
              label="Readiness"
              value={facility.data.readiness_score}
              tone={facility.data.readiness_score >= 80 ? 'emerald' : facility.data.readiness_score >= 60 ? 'amber' : 'rose'}
              sub="composite score"
            />
            <StatCard label="Training" value={`${facility.data.completion_rate}%`} tone="brand" />
            <StatCard label="Overdue" value={facility.data.overdue} tone="amber" />
            <StatCard label="Open findings" value={facility.data.open_findings} tone="rose" />
            <StatCard label="Open POCs" value={facility.data.open_pocs} />
          </div>
          <Card title={`Top F-tags — ${facility.data.facility}`}>
            {facility.data.top_ftags.length === 0 ? (
              <Empty>No findings recorded. Run a Mock Survey to populate.</Empty>
            ) : (
              <Table_ rows={facility.data.top_ftags} />
            )}
          </Card>
        </>
      )}

      {view === 'portfolio' && portfolio.data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <StatCard label="Portfolio score" value={portfolio.data.portfolio_score} tone="brand" />
            <StatCard label="Facilities" value={portfolio.data.facility_count} />
            <StatCard label="Ready (≥80)" value={portfolio.data.ready_count} tone="emerald" />
            <StatCard
              label="Outlier"
              value={portfolio.data.outlier?.facility.split(' ')[0] ?? '—'}
              tone="rose"
              sub={portfolio.data.outlier ? `score ${portfolio.data.outlier.readiness_score}` : ''}
            />
          </div>

          {portfolio.data.outlier && (
            <div className="mb-5 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 flex items-center gap-3">
              <TrendingDown className="text-rose-600" size={20} />
              <div className="text-sm text-rose-800">
                <strong>{portfolio.data.outlier.facility}</strong> is the portfolio outlier — readiness{' '}
                {portfolio.data.outlier.readiness_score}, {portfolio.data.outlier.open_findings} open finding(s),
                training {portfolio.data.outlier.completion_rate}%.
              </div>
            </div>
          )}

          <Card title="Facility readiness — ranked">
            <ResponsiveContainer width="100%" height={Math.max(260, portfolio.data.facilities.length * 26)}>
              <BarChart
                data={portfolio.data.facilities}
                layout="vertical"
                margin={{ left: 30, right: 20 }}
              >
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="facility"
                  width={150}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="readiness_score" radius={[0, 4, 4, 0]}>
                  {portfolio.data.facilities.map((f) => (
                    <Cell key={f.facility_id} fill={scoreColor(f.readiness_score)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {((view === 'facility' && facility.isLoading) || (view === 'portfolio' && portfolio.isLoading)) && (
        <Empty>Loading…</Empty>
      )}
    </div>
  );
}

function Table_({ rows }: { rows: { ftag: string; title: string; count: number }[] }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.ftag} className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-2">
            <AlertTriangle size={13} className="text-rose-500" />
            <span className="font-semibold text-slate-800">{r.ftag}</span>
            <span className="text-slate-500">{r.title}</span>
          </span>
          <Badge tone="rose">{r.count}×</Badge>
        </div>
      ))}
    </div>
  );
}
