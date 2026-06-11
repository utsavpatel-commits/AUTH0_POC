import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, FileDown, RefreshCw } from 'lucide-react';
import { api } from '../../../lib/api';
import { Card, StatCard, Badge, Table, Empty, Button } from '../../../components/ui';

interface FTag { ftag: string; title: string; count: number; repeat: boolean }
interface Report {
  by_ftag: FTag[];
  repeat_ftags: FTag[];
  by_severity: Record<string, number>;
  audit_runs: number;
  audit_pass_rate: number | null;
  training_completion: number;
  open_findings: number;
}

export function QaReporting({ facilityId }: { facilityId: number }) {
  const q = useQuery({
    queryKey: ['qa-report', facilityId],
    queryFn: () => api<Report>(`/api/survey/qa/report?facility_id=${facilityId}`),
  });
  const d = q.data;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-slate-500">Board-ready QA outcomes across mock surveys, audits, and training.</p>
        <Button variant="outline" onClick={() => window.print()}><FileDown size={14} /> Export board pack</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <StatCard label="Open findings" value={d?.open_findings ?? '—'} tone="rose" />
        <StatCard label="Repeat F-tags" value={d?.repeat_ftags.length ?? '—'} tone="amber" sub="corrective action didn't hold" />
        <StatCard label="Audit pass rate" value={d?.audit_pass_rate != null ? `${d.audit_pass_rate}%` : '—'} tone="brand" />
        <StatCard label="Training completion" value={d ? `${d.training_completion}%` : '—'} tone="emerald" />
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Findings by F-tag" actions={<span className="text-[11px] text-slate-400">CEP + audit trend</span>}>
          {(d?.by_ftag ?? []).length === 0 ? (
            <Empty>No findings recorded yet.</Empty>
          ) : (
            <Table head={['F-tag', 'Title', 'Count', '']}>
              {(d?.by_ftag ?? []).map((f) => (
                <tr key={f.ftag} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 px-1 font-semibold text-navy-800">{f.ftag}</td>
                  <td className="py-2.5 px-1 text-slate-500 text-xs">{f.title}</td>
                  <td className="py-2.5 px-1"><Badge tone="rose">{f.count}×</Badge></td>
                  <td className="py-2.5 px-1">
                    {f.repeat && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-accent-amber font-medium">
                        <RefreshCw size={11} /> recurring
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Findings by severity">
            {d && Object.keys(d.by_severity).length > 0 ? (
              <div className="space-y-2.5">
                {Object.entries(d.by_severity).map(([sev, n]) => {
                  const tone = sev === 'actual' || sev === 'immediate_jeopardy' ? 'rose' : sev === 'potential' ? 'amber' : 'slate';
                  return (
                    <div key={sev} className="flex items-center justify-between">
                      <span className="text-sm text-slate-700 capitalize">{sev.replace('_', ' ')}</span>
                      <Badge tone={tone as 'rose' | 'amber' | 'slate'}>{n}</Badge>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Empty>No findings.</Empty>
            )}
          </Card>

          {(d?.repeat_ftags ?? []).length > 0 && (
            <Card title={<span className="flex items-center gap-2 text-sm font-semibold text-accent-amber"><AlertTriangle size={15} /> Repeat offenders</span>}>
              <div className="space-y-2">
                {(d?.repeat_ftags ?? []).map((f) => (
                  <div key={f.ftag} className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm">
                    <strong className="text-navy-800">{f.ftag}</strong> <span className="text-slate-600">{f.title}</span>
                    <span className="text-xs text-accent-amber ml-2">recurred {f.count}× — recommend root-cause analysis</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
