import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileDown, Sparkles, AlertTriangle, FilePlus2 } from 'lucide-react';
import { api, apiUrl } from '../../lib/api';
import { Card, Badge, Button, Empty, PageHeader } from '../../components/ui';

interface Node {
  id: number;
  code: string;
  section: string;
  prompt: string;
  deficiency_value: string;
  ftag: string | null;
  ftag_title: string | null;
}
interface PathwayDef {
  id: number;
  title: string;
  code: string;
  slug: string;
  nodes: Node[];
}
interface Finding {
  id: number;
  ftag: string | null;
  ftag_title: string | null;
  severity: string;
  summary: string;
  status: string;
}
interface CaseRow {
  id: number;
  title: string;
  pathway: string;
  facility: string;
  status: string;
  facility_id: number;
}

export function CaseRunner({ caseId, onBack }: { caseId: number; onBack: () => void }) {
  const qc = useQueryClient();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [suggestions, setSuggestions] = useState<Record<number, string>>({});
  const [pocResult, setPocResult] = useState<string | null>(null);

  const cases = useQuery({ queryKey: ['cases'], queryFn: () => api<CaseRow[]>('/api/survey/cases') });
  const thisCase = (cases.data ?? []).find((c) => c.id === caseId);

  const pathway = useQuery({
    queryKey: ['pathway-for-case', thisCase?.pathway],
    queryFn: async () => {
      const list = await api<{ slug: string; title: string }[]>('/api/survey/pathways');
      const match = list.find((p) => p.title === thisCase?.pathway) ?? list[0];
      return api<PathwayDef>(`/api/survey/pathways/${match.slug}`);
    },
    enabled: !!thisCase,
  });

  const findings = useQuery({
    queryKey: ['findings', caseId],
    queryFn: () => api<Finding[]>(`/api/survey/cases/${caseId}/findings`),
  });

  const answer = useMutation({
    mutationFn: (p: { nodeId: number; value: string }) =>
      api(`/api/survey/cases/${caseId}/answers`, {
        method: 'POST',
        body: { node_id: p.nodeId, value: p.value },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['findings', caseId] }),
  });

  const suggest = useMutation({
    mutationFn: (nodeId: number) =>
      api<{ suggestion: string }>(`/api/survey/cases/${caseId}/nodes/${nodeId}/suggest`, {
        method: 'POST',
      }),
  });

  const createPoc = useMutation({
    mutationFn: (findingId: number) =>
      api<{ corrective_action: string; training_assigned: number; ftag: string }>(
        `/api/survey/findings/${findingId}/create-poc`,
        { method: 'POST', body: { assign_training: true, target_profile: 'clinical' } },
      ),
    onSuccess: (r) => {
      setPocResult(
        `POC drafted for ${r.ftag}. ${r.training_assigned} LMS training assignment(s) auto-created for clinical staff.\n\n${r.corrective_action}`,
      );
      qc.invalidateQueries({ queryKey: ['findings', caseId] });
      qc.invalidateQueries({ queryKey: ['lms-assignments'] });
      qc.invalidateQueries({ queryKey: ['lms-stats'] });
    },
  });

  const complete = useMutation({
    mutationFn: () => api(`/api/survey/cases/${caseId}/complete`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['cases'] }),
  });

  const def = pathway.data;
  const sections = def ? [...new Set(def.nodes.map((n) => n.section))] : [];

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800 mb-3">
        <ArrowLeft size={15} /> Back to surveys
      </button>
      <PageHeader
        title={def ? `Mock Survey — ${def.title}` : 'Mock Survey'}
        subtitle={def ? `${def.code} · ${thisCase?.facility ?? ''}` : ''}
        actions={
          <div className="flex gap-2">
            <a
              href={apiUrl(`/api/survey/cases/${caseId}/report.pdf`)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <FileDown size={15} /> CMS-2567 PDF
            </a>
            <Button onClick={() => complete.mutate()}>Complete survey</Button>
          </div>
        }
      />

      <div className="grid lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-4">
          {sections.map((section) => (
            <Card key={section} title={section}>
              <div className="space-y-4">
                {def!.nodes
                  .filter((n) => n.section === section)
                  .map((n) => {
                    const val = answers[n.id];
                    const isDeficient = val === n.deficiency_value;
                    return (
                      <div key={n.id} className="border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm text-slate-700">{n.prompt}</p>
                          {n.ftag && <Badge tone="slate">{n.ftag}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          {['yes', 'no', 'na'].map((opt) => (
                            <button
                              key={opt}
                              onClick={() => {
                                setAnswers((a) => ({ ...a, [n.id]: opt }));
                                answer.mutate({ nodeId: n.id, value: opt });
                              }}
                              className={`text-xs px-3 py-1 rounded-lg border ${
                                val === opt
                                  ? opt === n.deficiency_value
                                    ? 'bg-rose-600 text-white border-rose-600'
                                    : 'bg-brand-500 text-white border-brand-500'
                                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                              }`}
                            >
                              {opt.toUpperCase()}
                            </button>
                          ))}
                          <button
                            onClick={() =>
                              suggest.mutate(n.id, {
                                onSuccess: (r) => setSuggestions((s) => ({ ...s, [n.id]: r.suggestion })),
                              })
                            }
                            className="text-xs px-2 py-1 rounded-lg text-slate-500 hover:bg-slate-100 inline-flex items-center gap-1"
                          >
                            <Sparkles size={12} /> AI assist
                          </button>
                          {isDeficient && (
                            <span className="text-xs text-rose-600 inline-flex items-center gap-1">
                              <AlertTriangle size={12} /> deficiency → {n.ftag}
                            </span>
                          )}
                        </div>
                        {suggestions[n.id] && (
                          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs text-slate-600 whitespace-pre-wrap">
                            {suggestions[n.id]}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </Card>
          ))}
          {!def && <Empty>Loading pathway…</Empty>}
        </div>

        <div>
          <Card title={`Findings (${(findings.data ?? []).length})`}>
            {(findings.data ?? []).length === 0 ? (
              <Empty>Answer "No" on a citable element to raise a finding.</Empty>
            ) : (
              <div className="space-y-3">
                {(findings.data ?? []).map((f) => (
                  <div key={f.id} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm text-slate-800">{f.ftag}</span>
                      <Badge tone={f.severity === 'actual' ? 'rose' : 'amber'}>{f.severity}</Badge>
                    </div>
                    <div className="text-xs text-slate-500 mb-1">{f.ftag_title}</div>
                    <p className="text-xs text-slate-600 mb-2">{f.summary}</p>
                    {f.status === 'poc_created' ? (
                      <Badge tone="emerald">POC created</Badge>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => createPoc.mutate(f.id)}>
                        <FilePlus2 size={12} /> Create POC → assign training
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {pocResult && (
              <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 whitespace-pre-wrap">
                {pocResult}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
