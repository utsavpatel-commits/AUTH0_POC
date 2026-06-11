import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, Plus, UploadCloud, PlayCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, apiForm } from '../../../lib/api';
import { Card, Badge, Button, Table, Empty, Modal } from '../../../components/ui';

interface Template { id: number; name: string; cadence: string; owner_type: string }
interface Schedule { id: number; template: string; cadence: string; assigned_to: string | null; next_due: string | null }
interface Run { id: number; template: string; facility: string; run_date: string | null; passed: boolean; finding_summary: string | null }

export function AuditToolkit({ facilityId }: { facilityId: number }) {
  const qc = useQueryClient();
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [byoOpen, setByoOpen] = useState(false);
  const [executeFor, setExecuteFor] = useState<Template | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  const templates = useQuery({ queryKey: ['audit-templates'], queryFn: () => api<Template[]>('/api/survey/audit/templates') });
  const schedules = useQuery({ queryKey: ['audit-schedules', facilityId], queryFn: () => api<Schedule[]>(`/api/survey/audit/schedules?facility_id=${facilityId}`) });
  const runs = useQuery({ queryKey: ['audit-runs', facilityId], queryFn: () => api<Run[]>(`/api/survey/audit/runs?facility_id=${facilityId}`) });

  return (
    <div>
      {banner && <div className="mb-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-lg px-4 py-2">{banner}</div>}

      <div className="grid lg:grid-cols-2 gap-5 mb-5">
        <Card
          title={<span className="flex items-center gap-2 text-sm font-semibold text-navy-800"><CalendarClock size={16} className="text-brand-600" /> Scheduled audits</span>}
          actions={<Button size="sm" onClick={() => setScheduleOpen(true)}><Plus size={14} /> Schedule</Button>}
        >
          {(schedules.data ?? []).length === 0 ? (
            <Empty>No recurring audits scheduled.</Empty>
          ) : (
            <div className="space-y-2">
              {(schedules.data ?? []).map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-navy-800 truncate">{s.template}</div>
                    <div className="text-xs text-slate-400 capitalize">{s.cadence} · {s.assigned_to}</div>
                  </div>
                  <Badge tone="navy">due {s.next_due ? new Date(s.next_due).toLocaleDateString() : '—'}</Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Audit templates"
          actions={<Button size="sm" variant="outline" onClick={() => setByoOpen(true)}><UploadCloud size={14} /> BYO template</Button>}
        >
          {(templates.data ?? []).length === 0 ? (
            <Empty>No templates.</Empty>
          ) : (
            <div className="space-y-2">
              {(templates.data ?? []).map((t) => (
                <div key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-navy-800 truncate">{t.name}</div>
                    <div className="text-xs text-slate-400 capitalize">{t.cadence}</div>
                  </div>
                  <Badge tone={t.owner_type === 'tcs' ? 'navy' : 'amber'}>{t.owner_type === 'tcs' ? 'TCS' : 'BYO'}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setExecuteFor(t)}><PlayCircle size={13} /> Run</Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <Card title="Audit runs">
        {(runs.data ?? []).length === 0 ? (
          <Empty>No audit runs yet. Run one from a template above.</Empty>
        ) : (
          <Table head={['Template', 'Date', 'Result', 'Finding']}>
            {(runs.data ?? []).map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="py-2.5 px-1 font-medium text-navy-800">{r.template}</td>
                <td className="py-2.5 px-1 text-slate-500 text-xs">{r.run_date ? new Date(r.run_date).toLocaleDateString() : '—'}</td>
                <td className="py-2.5 px-1">
                  {r.passed ? <Badge tone="emerald"><CheckCircle2 size={11} className="inline mr-1" />passed</Badge>
                    : <Badge tone="rose"><AlertTriangle size={11} className="inline mr-1" />finding</Badge>}
                </td>
                <td className="py-2.5 px-1 text-slate-600 text-xs">{r.finding_summary || '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {scheduleOpen && (
        <ScheduleModal facilityId={facilityId} templates={templates.data ?? []} onClose={() => setScheduleOpen(false)}
          onDone={() => { setScheduleOpen(false); setBanner('Recurring audit scheduled.'); qc.invalidateQueries({ queryKey: ['audit-schedules'] }); }} />
      )}
      {byoOpen && (
        <ByoModal facilityId={facilityId} onClose={() => setByoOpen(false)}
          onDone={() => { setByoOpen(false); setBanner('BYO audit template added.'); qc.invalidateQueries({ queryKey: ['audit-templates'] }); }} />
      )}
      {executeFor && (
        <ExecuteModal facilityId={facilityId} template={executeFor} onClose={() => setExecuteFor(null)}
          onDone={(msg) => { setExecuteFor(null); setBanner(msg); qc.invalidateQueries({ queryKey: ['audit-runs'] }); qc.invalidateQueries({ queryKey: ['lms-stats'] }); }} />
      )}
    </div>
  );
}

function ScheduleModal({ facilityId, templates, onClose, onDone }: { facilityId: number; templates: Template[]; onClose: () => void; onDone: () => void }) {
  const [tid, setTid] = useState<number | null>(templates[0]?.id ?? null);
  const [cadence, setCadence] = useState('monthly');
  const m = useMutation({
    mutationFn: () => api('/api/survey/audit/schedules', { method: 'POST', body: { template_id: tid, facility_id: facilityId, cadence, assigned_to: 'DON' } }),
    onSuccess: onDone,
  });
  return (
    <Modal open onClose={onClose} title="Schedule a recurring audit"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} disabled={!tid || m.isPending}>Schedule</Button></>}>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Template</label>
      <select value={tid ?? ''} onChange={(e) => setTid(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4">
        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Cadence</label>
      <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
        {['daily', 'weekly', 'monthly', 'quarterly'].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
    </Modal>
  );
}

function ByoModal({ facilityId, onClose, onDone }: { facilityId: number; onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [cadence, setCadence] = useState('monthly');
  const [file, setFile] = useState<File | null>(null);
  const m = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('cadence', cadence);
      fd.append('facility_id', String(facilityId));
      if (file) fd.append('file', file);
      return apiForm('/api/survey/audit/templates', fd);
    },
    onSuccess: onDone,
  });
  return (
    <Modal open onClose={onClose} title="Bring your own audit template"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} disabled={!name.trim() || m.isPending}>Add template</Button></>}>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Template name</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen Sanitation Audit" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4" />
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Cadence</label>
      <select value={cadence} onChange={(e) => setCadence(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4">
        {['daily', 'weekly', 'monthly', 'quarterly'].map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <div className="rounded-xl border-2 border-dashed border-slate-300 p-5 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40" onClick={() => fileRef.current?.click()}>
        <UploadCloud className="mx-auto text-brand-500 mb-1.5" size={22} />
        <div className="text-xs text-navy-800 font-medium">{file ? file.name : 'Upload your audit form (optional)'}</div>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
    </Modal>
  );
}

function ExecuteModal({ facilityId, template, onClose, onDone }: { facilityId: number; template: Template; onClose: () => void; onDone: (msg: string) => void }) {
  const [passed, setPassed] = useState(true);
  const [finding, setFinding] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [assignTraining, setAssignTraining] = useState(true);

  const m = useMutation({
    mutationFn: () =>
      api<{ follow_ups: { training: number; policy_review: boolean; follow_up_audit: boolean; alert: boolean } }>('/api/survey/audit/runs', {
        method: 'POST',
        body: {
          template_id: template.id, facility_id: facilityId, passed,
          finding: passed ? null : finding, severity, ftag: null,
          assign_training: !passed && assignTraining, target_profile: 'clinical',
        },
      }),
    onSuccess: (r) => {
      if (passed) onDone('Audit run recorded — passed, no findings.');
      else {
        const f = r.follow_ups;
        onDone(`Finding logged. Follow-ups: ${f.training} training assignment(s), policy review${f.policy_review ? ' ✓' : ''}, follow-up audit${f.follow_up_audit ? ' ✓' : ''}, dashboard alert${f.alert ? ' ✓' : ''}.`);
      }
    },
  });

  return (
    <Modal open onClose={onClose} title={`Run audit — ${template.name}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => m.mutate()} disabled={(!passed && !finding.trim()) || m.isPending}>Record run</Button></>}>
      <div className="flex gap-2 mb-4">
        <button onClick={() => setPassed(true)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${passed ? 'bg-emerald-50 border-emerald-300 text-accent-emerald' : 'border-slate-300 text-slate-600'}`}>✓ Passed</button>
        <button onClick={() => setPassed(false)} className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${!passed ? 'bg-rose-50 border-rose-300 text-accent-rose' : 'border-slate-300 text-slate-600'}`}>⚠ Finding</button>
      </div>
      {!passed && (
        <>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Finding</label>
          <input value={finding} onChange={(e) => setFinding(e.target.value)} placeholder="e.g. 3 residents missing weekly skin check" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4" />
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4">
            {['low', 'medium', 'high'].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={assignTraining} onChange={(e) => setAssignTraining(e.target.checked)} className="rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
            Auto-assign remediation training to clinical staff
          </label>
          <p className="text-xs text-slate-400 mt-3">
            A finding fans out follow-ups automatically: training (LMS), policy-review flag, dashboard alert, and a follow-up audit in 14 days.
          </p>
        </>
      )}
    </Modal>
  );
}
