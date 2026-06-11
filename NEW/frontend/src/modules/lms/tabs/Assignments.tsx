import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, FileDown, Plus, BookOpen, Layers } from 'lucide-react';
import { api, apiUrl } from '../../../lib/api';
import { Card, Badge, Button, Modal, DataTable, type Column } from '../../../components/ui';
import { courseIcon } from '../courseMeta';
import { programIcon, usePrograms } from '../programMeta';
import { TYPE_DUE_DAYS, TYPE_LABEL, isoIn } from '../trainingType';

interface Assignment {
  id: number;
  course_title: string;
  program: string;
  user_id: number;
  user_name: string;
  status: string;
  source: string;
  version: number;
  current_version: number;
  due_date: string | null;
}
interface Course { id: number; title: string; program: string; target_profile: string | null; training_type: string }
interface Staff { id: number; name: string; profile: string; job_title: string | null }

const tone = (s: string) =>
  s === 'completed' ? 'emerald' : s === 'overdue' ? 'rose' : s === 'in_progress' ? 'brand' : 'slate';
// Source = who triggered the assignment: a user, or a POC remediation recommendation.
const sourceLabel = (s: string) => (s === 'poc' ? 'POC' : 'Assigned');

export function Assignments({ facilityId }: { facilityId: number }) {
  const qc = useQueryClient();
  const { byKey } = usePrograms(facilityId);
  const [src, setSrc] = useState<'all' | 'manual' | 'poc'>('all');
  const [assignOpen, setAssignOpen] = useState(false);

  const assignments = useQuery({
    queryKey: ['lms-assignments', facilityId, src],
    queryFn: () => api<Assignment[]>(`/api/lms/assignments?facility_id=${facilityId}${src !== 'all' ? `&source=${src}` : ''}`),
  });

  const setStatus = useMutation({
    mutationFn: (p: { id: number; status: string }) => api(`/api/lms/assignments/${p.id}?status=${p.status}`, { method: 'PATCH' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lms-assignments'] }); qc.invalidateQueries({ queryKey: ['lms-stats'] }); },
  });

  const columns: Column<Assignment>[] = [
    { key: 'user', header: 'Staff', sortable: true, accessor: (r) => r.user_name,
      cell: (r) => <span className="font-medium text-navy-800">{r.user_name}</span> },
    { key: 'course', header: 'Course', sortable: true, accessor: (r) => r.course_title,
      cell: (r) => {
        const ic = courseIcon(r.course_title);
        const Icon = ic.icon;
        const prog = byKey(r.program);
        return (
          <div className="flex items-center gap-2.5">
            <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${ic.bg}`}><Icon size={14} className={ic.fg} /></span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="text-navy-800 truncate">{r.course_title}</span>
                <span className="shrink-0 text-[10px] font-semibold rounded bg-slate-100 text-slate-500 px-1">v{r.version}</span>
                {r.status !== 'completed' && r.current_version > r.version && (
                  <span className="shrink-0 text-[10px] font-semibold rounded bg-amber-50 ring-1 ring-amber-100 text-accent-amber px-1">re-acknowledge v{r.current_version}</span>
                )}
              </span>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-medium" style={{ color: prog.color }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: prog.color }} /> {prog.name}
              </span>
            </span>
          </div>
        );
      } },
    { key: 'source', header: 'Source', accessor: (r) => r.source,
      cell: (r) => <Badge tone={r.source === 'manual' ? 'slate' : 'amber'}>{sourceLabel(r.source)}</Badge> },
    { key: 'status', header: 'Status', sortable: true, accessor: (r) => r.status,
      cell: (r) => <Badge tone={tone(r.status)}>{r.status.replace('_', ' ')}</Badge> },
    { key: 'due', header: 'Due', sortable: true, accessor: (r) => r.due_date ?? '',
      cell: (r) => <span className="text-slate-500 text-xs">{r.due_date ?? '—'}</span> },
    { key: 'evidence', header: 'Evidence', align: 'center',
      cell: (r) => (
        <a href={apiUrl(`/api/lms/users/${r.user_id}/evidence.pdf`)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline" onClick={(e) => e.stopPropagation()}>
          <FileDown size={13} /> PDF
        </a>
      ) },
    { key: 'action', header: '', align: 'right',
      cell: (r) => r.status !== 'completed' ? (
        <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: r.id, status: 'completed' })}>
          <CheckCircle2 size={13} /> Complete
        </Button>
      ) : <span className="text-slate-300 text-xs">—</span> },
  ];

  const filters = (
    <div className="flex gap-1 ml-auto">
      {(['all', 'manual', 'poc'] as const).map((t) => (
        <button key={t} onClick={() => setSrc(t)}
          className={`text-xs px-2.5 py-1.5 rounded-lg ${src === t ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
          {t === 'all' ? 'All' : t === 'manual' ? 'Assigned' : 'POC'}
        </button>
      ))}
      <Button size="sm" onClick={() => setAssignOpen(true)}><Plus size={14} /> Assign</Button>
    </div>
  );

  return (
    <div>
      <Card title="Training assignments" padded>
        <DataTable
          rows={assignments.data ?? []}
          columns={columns}
          rowKey={(r) => r.id}
          loading={assignments.isLoading}
          searchAccessor={(r) => `${r.user_name} ${r.course_title}`}
          searchPlaceholder="Search staff or course…"
          toolbar={filters}
          emptyTitle="No assignments"
          emptyHint="Assign training to staff to get started."
        />
      </Card>

      {assignOpen && <AssignDrawer facilityId={facilityId} onClose={() => setAssignOpen(false)} />}
    </div>
  );
}

function AssignDrawer({ facilityId, onClose }: { facilityId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { programs } = usePrograms(facilityId);
  const [mode, setMode] = useState<'course' | 'program'>('course');
  const [courseId, setCourseId] = useState<number | null>(null);
  const [programKey, setProgramKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [due, setDue] = useState('');
  const [search, setSearch] = useState('');
  const [audienceOnly, setAudienceOnly] = useState(true);

  const courses = useQuery({ queryKey: ['lms-courses', facilityId], queryFn: () => api<Course[]>(`/api/lms/courses?facility_id=${facilityId}`) });
  const staff = useQuery({ queryKey: ['facility-staff', facilityId], queryFn: () => api<Staff[]>(`/api/users?facility_id=${facilityId}`) });

  const allCourses = courses.data ?? [];
  const selCourse = allCourses.find((c) => c.id === courseId) ?? null;
  // Audience = the course's target staff profile (when not "all").
  const audience = mode === 'course' && selCourse?.target_profile && selCourse.target_profile !== 'all' ? selCourse.target_profile : null;

  // When a course is picked, Type sets a smart default due date and we reset the audience filter.
  useEffect(() => {
    if (!selCourse) return;
    setDue(isoIn(TYPE_DUE_DAYS[selCourse.training_type] ?? 365));
    setAudienceOnly(true);
    setPicked(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);
  // courses that belong to the chosen program (by the course's configured bucket)
  const programCourses = programKey ? allCourses.filter((c) => (c.program || 'uncategorized') === programKey) : [];
  // count of courses available per program (for the program picker cards)
  const programCounts = (key: string) => allCourses.filter((c) => (c.program || 'uncategorized') === key).length;

  // which course ids we're about to assign
  const courseIds = mode === 'course' ? (courseId ? [courseId] : []) : programCourses.map((c) => c.id);

  const assign = useMutation({
    mutationFn: async () => {
      const users = [...picked];
      // assign every chosen course to every chosen user
      for (const cid of courseIds) {
        await api('/api/lms/assignments', { method: 'POST', body: { course_id: cid, user_ids: users, facility_id: facilityId, due_date: due || null, source: 'manual' } });
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lms-assignments'] }); qc.invalidateQueries({ queryKey: ['lms-stats'] }); qc.invalidateQueries({ queryKey: ['completion-summary'] }); qc.invalidateQueries({ queryKey: ['facility-curricula'] }); onClose(); },
  });

  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const list = (staff.data ?? []).filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) &&
    (!audience || !audienceOnly || u.profile === audience));
  const ready = courseIds.length > 0 && picked.size > 0;
  const assignCount = courseIds.length * picked.size;

  return (
    <Modal open onClose={onClose} title="Assign training to staff" wide
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => assign.mutate()} disabled={!ready || assign.isPending}>
          {mode === 'program' && courseIds.length > 0
            ? `Assign ${courseIds.length} courses to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`
            : `Assign to ${picked.size} ${picked.size === 1 ? 'person' : 'people'}`}
          {assignCount > 0 ? ` · ${assignCount} assignment${assignCount !== 1 ? 's' : ''}` : ''}
        </Button>
      </>}>
      {/* mode toggle — single course vs whole program (curriculum) */}
      <div className="inline-flex bg-slate-100 rounded-lg p-1 mb-4">
        <button onClick={() => setMode('course')}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${mode === 'course' ? 'bg-white shadow-sm text-navy-800' : 'text-slate-500 hover:text-slate-700'}`}>
          <BookOpen size={14} /> Single course
        </button>
        <button onClick={() => setMode('program')}
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${mode === 'program' ? 'bg-white shadow-sm text-navy-800' : 'text-slate-500 hover:text-slate-700'}`}>
          <Layers size={14} /> Whole program
        </button>
      </div>

      {mode === 'course' ? (
        <>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Course</label>
          <select className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4" value={courseId ?? ''} onChange={(e) => setCourseId(Number(e.target.value) || null)}>
            <option value="">Select a course…</option>
            {allCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </>
      ) : (
        <>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Program (assigns every course in it)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
            {programs.map((p) => {
              const PIcon = programIcon(p.icon);
              const n = programCounts(p.key);
              const sel = programKey === p.key;
              return (
                <button key={p.key} disabled={n === 0} onClick={() => setProgramKey(p.key)}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors disabled:opacity-40 ${sel ? 'border-transparent ring-2' : 'border-slate-200 hover:border-slate-300'}`}
                  style={sel ? { boxShadow: `0 0 0 2px ${p.color}` } : undefined}>
                  <span className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${p.color}1a` }}>
                    <PIcon size={16} style={{ color: p.color }} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-navy-800 leading-tight">{p.name}</span>
                    <span className="text-[11px] text-slate-400">{n} course{n !== 1 ? 's' : ''}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {programKey && programCourses.length > 0 && (
            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 mb-4 text-[11px] text-slate-500">
              Includes: {programCourses.map((c) => c.title).join(' · ')}
            </div>
          )}
        </>
      )}

      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Due date</label>
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      {selCourse && (
        <p className="text-[11px] text-slate-400 mt-1 mb-4">
          <span className="font-medium text-slate-500">{TYPE_LABEL[selCourse.training_type] ?? 'Training'}</span> — due date defaulted from the course type
        </p>
      )}
      {!selCourse && <div className="mb-4" />}

      {/* Audience — the course's target staff profile filters who you assign to */}
      {audience && (
        <div className="flex items-center justify-between rounded-lg bg-brand-50/60 ring-1 ring-brand-100 px-3 py-2 mb-2 text-[12px]">
          <span className="text-slate-600">Targets <strong className="capitalize text-navy-800">{audience}</strong> staff</span>
          <button className="text-brand-600 font-medium hover:underline" onClick={() => setAudienceOnly((v) => !v)}>
            {audienceOnly ? 'Show all staff' : `Show only ${audience}`}
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] font-semibold text-navy-700">Staff ({picked.size} selected)</label>
        <div className="flex gap-2">
          <button className="text-xs text-brand-600 hover:underline" onClick={() => setPicked(new Set(list.map((u) => u.id)))}>Select all</button>
          {picked.size > 0 && <button className="text-xs text-slate-400 hover:underline" onClick={() => setPicked(new Set())}>Clear</button>}
        </div>
      </div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter staff…" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm mb-2" />
      <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
        {list.map((u) => (
          <label key={u.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 cursor-pointer">
            <input type="checkbox" checked={picked.has(u.id)} onChange={() => toggle(u.id)} className="rounded border-slate-300 text-brand-500 focus:ring-brand-400" />
            <span className="text-sm text-navy-800">{u.name}</span>
            <span className="text-xs text-slate-400 ml-auto capitalize">{u.job_title || u.profile}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
