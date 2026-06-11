import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ClipboardCheck, Plus, Sparkles, Users } from 'lucide-react';
import { api } from '../../../lib/api';
import { usePersona } from '../../../lib/persona';
import { Card, Badge, Button, Table, Empty, Modal } from '../../../components/ui';
import { CaseRunner } from '../CaseRunner';

interface Pathway { id: number; code: string; slug: string; title: string }
interface CaseRow { id: number; title: string; pathway: string; facility: string; status: string }
interface SampleResp { narrative: string; sample: { resident: string; risk: string; reason: string }[] }

const riskTone = (r: string) => (r === 'high' ? 'rose' : r === 'medium' ? 'amber' : 'emerald');

export function MockSurvey({ facilityId }: { facilityId: number }) {
  const qc = useQueryClient();
  const [activeCase, setActiveCase] = useState<number | null>(null);
  const [sampleFor, setSampleFor] = useState<{ caseId: number; data?: SampleResp } | null>(null);

  const pathways = useQuery({ queryKey: ['pathways'], queryFn: () => api<Pathway[]>('/api/survey/pathways') });
  const cases = useQuery({
    queryKey: ['cases', facilityId],
    queryFn: () => api<CaseRow[]>(`/api/survey/cases?facility_id=${facilityId}`),
  });

  const createCase = useMutation({
    mutationFn: (pathwayId: number) =>
      api<{ id: number }>('/api/survey/cases', {
        method: 'POST',
        body: { facility_id: facilityId, pathway_id: pathwayId, resident_sample: '5 residents' },
      }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['cases'] }); setActiveCase(r.id); },
  });

  const suggest = useMutation({
    mutationFn: (caseId: number) => api<SampleResp>(`/api/survey/cases/${caseId}/suggest-sample`, { method: 'POST' }),
    onSuccess: (data, caseId) => setSampleFor({ caseId, data }),
  });

  if (activeCase) return <CaseRunner caseId={activeCase} onBack={() => setActiveCase(null)} />;

  return (
    <div>
      <Card
        title={<span className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Plus size={16} className="text-brand-600" /> Start a Mock Survey (pick a CEP)</span>}
        className="mb-5"
      >
        <div className="flex flex-wrap gap-2">
          {(pathways.data ?? []).map((p) => (
            <Button key={p.id} variant="outline" onClick={() => createCase.mutate(p.id)}>
              <ClipboardCheck size={14} /> {p.title} <span className="text-slate-400 text-xs">({p.code})</span>
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Mock surveys at this facility">
        {(cases.data ?? []).length === 0 ? (
          <Empty>No mock surveys yet. Start one above.</Empty>
        ) : (
          <Table head={['Survey', 'Pathway', 'Status', '']}>
            {(cases.data ?? []).map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 px-1 font-medium text-navy-800">{c.title}</td>
                <td className="py-2.5 px-1 text-slate-600">{c.pathway}</td>
                <td className="py-2.5 px-1"><Badge tone={c.status === 'completed' ? 'emerald' : 'amber'}>{c.status}</Badge></td>
                <td className="py-2.5 px-1 flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => suggest.mutate(c.id)}>
                    <Sparkles size={13} /> AI sample
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setActiveCase(c.id)}>Open</Button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {sampleFor?.data && (
        <Modal
          open onClose={() => setSampleFor(null)} wide
          title="AI-suggested resident sample (risk-weighted)"
          footer={<Button variant="ghost" onClick={() => setSampleFor(null)}>Close</Button>}
        >
          <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
            <Users size={15} className="text-brand-500" /> Recommended 5 residents to review
          </div>
          <div className="space-y-2">
            {sampleFor.data.sample.map((s, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                <Badge tone={riskTone(s.risk)}>{s.risk}</Badge>
                <span className="text-sm font-medium text-navy-800">{s.resident}</span>
                <span className="text-xs text-slate-500 ml-auto text-right">{s.reason}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 whitespace-pre-wrap">
            {sampleFor.data.narrative}
          </div>
        </Modal>
      )}
    </div>
  );
}
