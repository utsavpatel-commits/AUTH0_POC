import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Mail, Trash2, RefreshCw, GraduationCap, Copy, Check } from 'lucide-react';
import { api } from '../../../lib/api';
import { Card, Badge, Button, Modal, DataTable, Empty, type Column } from '../../../components/ui';
import { usePrograms } from '../programMeta';
import { TYPE_DUE_DAYS, TYPE_SHORT, isoIn } from '../trainingType';

interface Learner {
  id: number; name: string; email: string; job_title: string | null; profile: string;
  status: string; temp_token: string | null; assigned: number; completed: number;
}
interface Course { id: number; title: string; program: string; target_profile: string | null; training_type: string }

const PROFILES = ['all', 'clinical', 'dietary', 'activities', 'housekeeping', 'admin'];

export function Learners({ facilityId }: { facilityId: number }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [assignFor, setAssignFor] = useState<Learner | null>(null);
  const [revealed, setRevealed] = useState<number | null>(null);

  const q = useQuery({ queryKey: ['learners', facilityId], queryFn: () => api<Learner[]>(`/api/lms/learners?facility_id=${facilityId}`) });
  const refresh = () => qc.invalidateQueries({ queryKey: ['learners', facilityId] });

  const resend = useMutation({
    mutationFn: (id: number) => api<{ temp_token: string }>(`/api/lms/learners/${id}/resend`, { method: 'POST' }),
    onSuccess: (_d, id) => { setRevealed(id); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/lms/learners/${id}`, { method: 'DELETE' }),
    onSuccess: () => refresh(),
  });

  const rows = q.data ?? [];
  const invited = rows.filter((r) => r.status === 'invited').length;

  const columns: Column<Learner>[] = [
    { key: 'name', header: 'Learner', sortable: true, accessor: (r) => r.name,
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <span className="h-8 w-8 rounded-full bg-navy-50 ring-1 ring-navy-100 text-navy-600 text-[11px] font-bold flex items-center justify-center shrink-0">
            {r.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-navy-800 truncate">{r.name}</span>
            <span className="block text-[11px] text-slate-400 truncate">{r.email}</span>
          </span>
        </div>
      ) },
    { key: 'role', header: 'Role', sortable: true, accessor: (r) => r.job_title ?? r.profile,
      cell: (r) => <span className="text-slate-500 text-xs capitalize">{r.job_title || r.profile}</span> },
    { key: 'status', header: 'Status', sortable: true, accessor: (r) => r.status,
      cell: (r) => r.status === 'invited'
        ? <Badge tone="amber">Invited</Badge>
        : <Badge tone="emerald">Active</Badge> },
    { key: 'training', header: 'Training', sortable: true, accessor: (r) => r.assigned,
      cell: (r) => r.assigned > 0
        ? <span className="text-xs text-slate-600"><span className="font-semibold text-navy-700">{r.completed}</span>/{r.assigned} done</span>
        : <span className="text-xs text-slate-300">none assigned</span> },
    { key: 'code', header: 'Login code', accessor: (r) => r.temp_token ?? '',
      cell: (r) => r.temp_token
        ? (revealed === r.id
            ? <CodePill code={r.temp_token} />
            : <span className="text-[11px] text-slate-400">•••• <button onClick={() => setRevealed(r.id)} className="text-brand-600 hover:underline">show</button></span>)
        : <span className="text-[11px] text-slate-300">email code at sign-in</span> },
    { key: 'actions', header: '', align: 'right',
      cell: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <button onClick={() => setAssignFor(r)} title="Assign training" className="text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded p-1.5"><GraduationCap size={15} /></button>
          <button onClick={() => resend.mutate(r.id)} title="Resend invite code" className="text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded p-1.5"><RefreshCw size={14} /></button>
          <button onClick={() => { if (confirm(`Remove ${r.name}?`)) remove.mutate(r.id); }} title="Remove" className="text-slate-400 hover:text-accent-rose hover:bg-rose-50 rounded p-1.5"><Trash2 size={14} /></button>
        </div>
      ) },
  ];

  return (
    <Card padded>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div>
          <h3 className="text-sm font-semibold text-navy-800">Frontline learners</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {rows.length} learner{rows.length !== 1 ? 's' : ''}{invited > 0 ? ` · ${invited} awaiting first sign-in` : ''} · they sign in with a one-time email code
          </p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)} ><UserPlus size={14} /> Add learners</Button>
      </div>

      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        searchAccessor={(r) => `${r.name} ${r.email} ${r.job_title ?? ''}`}
        searchPlaceholder="Search learners…"
        emptyTitle="No learners yet"
        emptyHint="Add your frontline staff so you can assign their training."
      />

      {addOpen && <AddLearners facilityId={facilityId} onClose={() => { setAddOpen(false); refresh(); }} />}
      {assignFor && <AssignToLearner learner={assignFor} facilityId={facilityId} onClose={() => { setAssignFor(null); refresh(); }} />}
    </Card>
  );
}

function CodePill({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard?.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
      className="inline-flex items-center gap-1 rounded-md bg-brand-50 ring-1 ring-brand-100 px-2 py-0.5 text-[11px] font-mono font-bold text-brand-700 hover:bg-brand-100" title="Copy code">
      {code} {copied ? <Check size={11} className="text-accent-emerald" /> : <Copy size={11} />}
    </button>
  );
}

function AddLearners({ facilityId, onClose }: { facilityId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [profile, setProfile] = useState('all');
  const [result, setResult] = useState<{ name: string; email: string; temp_token: string }[] | null>(null);

  // each line: "Name, email[, job title]"
  const parsed = text.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    const [name, email, job] = line.split(',').map((s) => s.trim());
    return { name: name || '', email: email || '', job_title: job || null, profile };
  }).filter((r) => r.email);

  const add = useMutation({
    mutationFn: () => api<{ created: { name: string; email: string; temp_token: string }[] }>(`/api/lms/learners`, {
      method: 'POST', body: { facility_id: facilityId, learners: parsed },
    }),
    onSuccess: (d) => { setResult(d.created); qc.invalidateQueries({ queryKey: ['learners', facilityId] }); },
  });

  return (
    <Modal open onClose={onClose} wide title="Add learners"
      footer={result
        ? <Button onClick={onClose}>Done</Button>
        : <>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={() => add.mutate()} disabled={parsed.length === 0 || add.isPending}>Add {parsed.length || ''} learner{parsed.length !== 1 ? 's' : ''}</Button>
          </>}>
      {result ? (
        <div>
          <div className="flex items-center gap-2 text-sm text-accent-emerald font-medium mb-3"><Mail size={16} /> {result.length} learner{result.length !== 1 ? 's' : ''} invited — a one-time code was emailed to each.</div>
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
            {result.map((r) => (
              <div key={r.email} className="flex items-center gap-3 px-3 py-2">
                <span className="min-w-0 flex-1"><span className="block text-sm text-navy-800 truncate">{r.name}</span><span className="block text-[11px] text-slate-400 truncate">{r.email}</span></span>
                <CodePill code={r.temp_token} />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Roster — one per line: <span className="font-normal text-slate-400">Name, email, job title</span></label>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={7}
            placeholder={'Maria Lopez, maria.lopez@facility.com, CNA\nJohn Park, john.park@facility.com, RN'}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-brand-400" />
          <div className="flex items-center gap-3 mt-3">
            <label className="text-[13px] font-semibold text-navy-700">Default staff profile</label>
            <select value={profile} onChange={(e) => setProfile(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm capitalize">
              {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="text-xs text-slate-400 ml-auto">{parsed.length} valid row{parsed.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-xs text-slate-400 mt-3">Each learner gets a one-time email code to sign in and take their assigned training — they don't need any other access to the platform.</p>
        </>
      )}
    </Modal>
  );
}

function AssignToLearner({ learner, facilityId, onClose }: { learner: Learner; facilityId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { byKey: programByKey } = usePrograms(facilityId);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const roleProfile = learner.profile && learner.profile !== 'all' ? learner.profile : null;
  const [audienceOnly, setAudienceOnly] = useState(!!roleProfile);
  const courses = useQuery({ queryKey: ['lms-courses', facilityId], queryFn: () => api<Course[]>(`/api/lms/courses?facility_id=${facilityId}`) });

  const all = courses.data ?? [];
  // Audience: only courses for this learner's role (their profile or "all").
  const list = roleProfile && audienceOnly
    ? all.filter((c) => !c.target_profile || c.target_profile === 'all' || c.target_profile === roleProfile)
    : all;

  const assign = useMutation({
    mutationFn: async () => {
      for (const cid of [...picked]) {
        const c = all.find((x) => x.id === cid);
        // Type sets each course's due date automatically.
        const due = isoIn(TYPE_DUE_DAYS[c?.training_type ?? 'mandatory_annual'] ?? 365);
        await api('/api/lms/assignments', { method: 'POST', body: { course_id: cid, user_ids: [learner.id], facility_id: facilityId, due_date: due, source: 'manual' } });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['learners', facilityId] }); qc.invalidateQueries({ queryKey: ['lms-assignments'] }); onClose(); },
  });

  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <Modal open onClose={onClose} wide title={`Assign training — ${learner.name}`}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => assign.mutate()} disabled={picked.size === 0 || assign.isPending}>Assign {picked.size || ''} course{picked.size !== 1 ? 's' : ''}</Button>
      </>}>
      {/* Audience filter — courses relevant to this learner's role */}
      {roleProfile && (
        <div className="flex items-center justify-between rounded-lg bg-brand-50/60 ring-1 ring-brand-100 px-3 py-2 mb-3 text-[12px]">
          <span className="text-slate-600">Showing courses for <strong className="capitalize text-navy-800">{learner.job_title || roleProfile}</strong></span>
          <button className="text-brand-600 font-medium hover:underline" onClick={() => setAudienceOnly((v) => !v)}>
            {audienceOnly ? 'Show all courses' : 'Show role-relevant only'}
          </button>
        </div>
      )}
      <p className="text-[11px] text-slate-400 mb-2">Each course's due date is set automatically from its type (annual, 90-day, etc.).</p>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Courses ({picked.size} selected)</label>
      {list.length === 0 ? <Empty>No courses match.</Empty> : (
        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
          {list.map((c) => {
            const prog = programByKey(c.program);
            return (
              <label key={c.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} className="rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-navy-800 truncate">{c.title}</span>
                  <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: prog.color }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: prog.color }} /> {prog.name}
                  </span>
                </span>
                <span className="shrink-0 flex items-center gap-1">
                  <span className="text-[10px] font-semibold rounded bg-slate-100 text-slate-500 px-1.5 py-0.5">{TYPE_SHORT[c.training_type] ?? 'annual'}</span>
                  {c.target_profile && c.target_profile !== 'all' && (
                    <span className="text-[10px] font-medium rounded bg-slate-50 ring-1 ring-slate-200 text-slate-500 px-1.5 py-0.5 capitalize">{c.target_profile}</span>
                  )}
                </span>
              </label>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
