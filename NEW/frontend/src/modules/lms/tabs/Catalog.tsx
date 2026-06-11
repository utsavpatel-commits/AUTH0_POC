import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, FileText, Paperclip, Search, ChevronRight, Pencil, Trash2, Check, X,
  History, RefreshCw, Lock, Youtube, SlidersHorizontal, ArrowUp, ArrowDown, Layers, Library,
} from 'lucide-react';
import { api, apiUrl } from '../../../lib/api';
import { Card, Badge, Button, Empty, Modal, SimpleDropdown } from '../../../components/ui';
import { courseIcon } from '../courseMeta';
import {
  programIcon, usePrograms, UNCATEGORIZED, ICON_CHOICES, COLOR_CHOICES, type Program,
} from '../programMeta';

interface Course {
  id: number;
  title: string;
  description: string | null;
  training_type: string;
  duration_hours: number;
  target_profile: string | null;
  program: string;
  version: number;
  material_count: number;
  material_kind: string | null;
  assignment_count: number;
}

const TYPES: { v: string; label: string }[] = [
  { v: 'orientation', label: 'Orientation' },
  { v: 'mandatory_annual', label: 'Mandatory annual' },
  { v: 'competency', label: 'Competency' },
  { v: 'continuing_ed', label: 'Continuing ed' },
];
const PROFILES = ['all', 'clinical', 'dietary', 'activities', 'housekeeping', 'admin'];

export function Catalog({ facilityId, canAuthor }: { facilityId: number; canAuthor: boolean }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<Course | null>(null);
  const [query, setQuery] = useState('');
  const [activeProgram, setActiveProgram] = useState<string>('');

  const { programs } = usePrograms(facilityId);
  const courses = useQuery({
    queryKey: ['lms-courses', facilityId],
    queryFn: () => api<Course[]>(`/api/lms/courses?facility_id=${facilityId}`),
  });

  const all = courses.data ?? [];

  // program tabs in configured order — every configured bucket shows (even empty,
  // so authors can see all 10), plus Uncategorized only when it holds courses.
  const tabs = useMemo(() => {
    const progTabs = programs.map((meta) => ({
      meta, count: all.filter((c) => (c.program || 'uncategorized') === meta.key).length,
    }));
    const uncat = all.filter((c) => (c.program || 'uncategorized') === 'uncategorized').length;
    return uncat > 0 ? [...progTabs, { meta: UNCATEGORIZED, count: uncat }] : progTabs;
  }, [all, programs]);

  const activeKey = tabs.some((t) => t.meta.key === activeProgram) ? activeProgram : (tabs[0]?.meta.key ?? '');
  const activeTab = tabs.find((t) => t.meta.key === activeKey);

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => all.filter((c) => (c.program || 'uncategorized') === activeKey && (!q || c.title.toLowerCase().includes(q))),
    [all, activeKey, q],
  );

  const row = (c: Course) => {
    const ic = courseIcon(c.title);
    const Icon = ic.icon;
    return (
      <button key={c.id} onClick={() => setDetailFor(c)}
        className="group w-full text-left px-4 py-3.5 flex items-center gap-4 hover:bg-slate-50/80 transition-colors">
        <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 ${ic.bg}`}>
          <Icon size={18} className={ic.fg} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-navy-800 truncate">{c.title}</span>
            {c.version > 1 && <Badge tone="slate">v{c.version}</Badge>}
          </div>
          <div className="text-xs text-slate-500 mt-0.5 capitalize">
            {c.training_type.replace(/_/g, ' ')} · {c.duration_hours}h{c.target_profile && c.target_profile !== 'all' ? ` · ${c.target_profile}` : ''}
          </div>
        </div>
        <div className="hidden sm:flex items-center shrink-0 text-xs">
          {c.material_kind === 'video' ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 ring-1 ring-rose-100 text-rose-600 px-2 py-0.5 font-medium" title="YouTube video"><Youtube size={12} /> Video</span>
          ) : c.material_kind === 'document' ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 ring-1 ring-slate-200 text-slate-600 px-2 py-0.5 font-medium" title="Document"><FileText size={12} /> Document</span>
          ) : (
            <span className="inline-flex items-center gap-1 text-slate-300" title="No training material"><Paperclip size={12} /> no material</span>
          )}
        </div>
        <span className="text-[11px] text-slate-300 group-hover:text-brand-600 inline-flex items-center gap-0.5 shrink-0">
          <ChevronRight size={15} />
        </span>
      </button>
    );
  };

  return (
    <div>
      <Card padded>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search courses…"
              className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
          </div>
          {canAuthor && (
            <>
              <Button size="sm" variant="outline" onClick={() => setManageOpen(true)}><SlidersHorizontal size={14} /> Manage programs</Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> New course</Button>
            </>
          )}
        </div>

        {/* program tabs */}
        {tabs.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pb-3 border-b border-slate-100 mb-4">
            {tabs.map(({ meta, count }) => {
              const PIcon = programIcon(meta.icon);
              const active = meta.key === activeKey;
              return (
                <button key={meta.key} onClick={() => setActiveProgram(meta.key)}
                  className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium border transition-colors ${active ? 'bg-white shadow-sm text-navy-800' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}
                  style={active ? { borderColor: meta.color } : undefined}>
                  <span className="h-6 w-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `${meta.color}1a` }}>
                    <PIcon size={13} style={{ color: meta.color }} />
                  </span>
                  {meta.name}
                  <span className={`text-[11px] rounded-full px-1.5 ${active ? 'bg-slate-100 text-slate-500' : count === 0 ? 'text-slate-300' : 'text-slate-400'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        )}

        {courses.isLoading ? (
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-lg bg-slate-100 animate-pulse" />)}
          </div>
        ) : all.length === 0 ? (
          <Empty>No courses yet. {canAuthor ? 'Create your first course to get started.' : 'Ask an admin to add courses.'}</Empty>
        ) : (
          <>
            {activeTab && (
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-sm font-semibold text-navy-800">{activeTab.meta.name}</span>
                <span className="text-xs text-slate-400">· tap a course for details, document &amp; versions</span>
              </div>
            )}
            {visible.length === 0 ? (
              <Empty>{q ? `No courses match “${query}” in ${activeTab?.meta.name}.` : 'No courses in this program.'}</Empty>
            ) : (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">{visible.map(row)}</div>
            )}
          </>
        )}
      </Card>

      {manageOpen && <ManagePrograms facilityId={facilityId} onClose={() => setManageOpen(false)} />}
      {createOpen && <CreateCourse facilityId={facilityId} onClose={() => setCreateOpen(false)} />}
      {detailFor && (
        <CourseDetailModal course={detailFor} facilityId={facilityId} canAuthor={canAuthor}
          onClose={() => { setDetailFor(null); qc.invalidateQueries({ queryKey: ['lms-courses'] }); }} />
      )}
    </div>
  );
}

function CreateCourse({ facilityId, onClose }: { facilityId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { programs } = usePrograms(facilityId);
  const programOptions = [...programs, UNCATEGORIZED];
  const [form, setForm] = useState({ title: '', description: '', training_type: 'orientation', duration_hours: '1', target_profile: 'all', program: '' });
  const programValue = form.program || programs[0]?.key || 'uncategorized';

  const create = useMutation({
    mutationFn: () =>
      api('/api/lms/courses', {
        method: 'POST',
        body: {
          ...form,
          program: programValue,
          duration_hours: Number(form.duration_hours) || 1,
          description: form.description.trim() || null,
          owner_facility_id: facilityId,
        },
      }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['lms-courses'] }); onClose(); },
  });

  return (
    <Modal open onClose={onClose} title="New course"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => create.mutate()} disabled={!form.title.trim() || create.isPending}>Create course</Button>
      </>}>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Course title</label>
      <input autoFocus value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
        placeholder="e.g. New Hire Facility Orientation" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4" />

      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Description</label>
      <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
        placeholder="What this course covers…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4 resize-none" />

      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Program <span className="font-normal text-slate-400">(bucket)</span></label>
      <select value={programValue} onChange={(e) => setForm({ ...form, program: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4">
        {programOptions.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
      </select>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Type</label>
          <select value={form.training_type} onChange={(e) => setForm({ ...form, training_type: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
            {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Duration (h)</label>
          <input type="number" min="0.25" step="0.25" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Audience</label>
          <select value={form.target_profile} onChange={(e) => setForm({ ...form, target_profile: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm capitalize">
            {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>
      <p className="text-xs text-slate-400 mt-4">After creating, attach the training document from the course detail. The certificate is issued per course on completion.</p>
    </Modal>
  );
}

function ManagePrograms({ facilityId, onClose }: { facilityId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const { programs } = usePrograms(facilityId);
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ name: string; icon: string; color: string }>({ name: '', icon: 'clipboard', color: COLOR_CHOICES[0] });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => { qc.invalidateQueries({ queryKey: ['lms-programs'] }); qc.invalidateQueries({ queryKey: ['lms-courses'] }); };

  const create = useMutation({
    mutationFn: () => api('/api/lms/programs', { method: 'POST', body: { facility_id: facilityId, name: draft.name.trim(), icon: draft.icon, color: draft.color } }),
    onSuccess: () => { setAdding(false); setDraft({ name: '', icon: 'clipboard', color: COLOR_CHOICES[0] }); refresh(); },
  });
  const patch = useMutation({
    mutationFn: (p: { id: number; body: Record<string, unknown> }) => api(`/api/lms/programs/${p.id}`, { method: 'PATCH', body: p.body }),
    onSuccess: () => { setEditId(null); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/lms/programs/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setError(null); refresh(); },
    onError: (e: Error) => setError(e.message.replace(/^\d+\s.*?:\s*/, '')),
  });

  const move = (idx: number, dir: -1 | 1) => {
    const a = programs[idx], b = programs[idx + dir];
    if (!a || !b) return;
    patch.mutate({ id: a.id, body: { sort_order: b.sort_order } });
    patch.mutate({ id: b.id, body: { sort_order: a.sort_order } });
  };

  const startEdit = (p: Program) => { setEditId(p.id); setAdding(false); setDraft({ name: p.name, icon: p.icon, color: p.color }); };

  const MAX_PROGRAMS = 10;
  const atLimit = programs.length >= MAX_PROGRAMS;

  const Picker = () => (
    <div className="space-y-2.5">
      <input autoFocus value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
        placeholder="Program name — e.g. Dementia Care" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
      <div>
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Icon</div>
        <div className="flex flex-wrap gap-1.5">
          {ICON_CHOICES.map((k) => {
            const PI = programIcon(k);
            const sel = draft.icon === k;
            return (
              <button key={k} onClick={() => setDraft({ ...draft, icon: k })}
                className={`h-9 w-9 rounded-lg flex items-center justify-center border transition ${sel ? 'border-transparent ring-2' : 'border-slate-200 hover:border-slate-300'}`}
                style={sel ? { background: `${draft.color}1a`, boxShadow: `0 0 0 2px ${draft.color}` } : undefined}>
                <PI size={16} style={{ color: sel ? draft.color : '#64748b' }} />
              </button>
            );
          })}
        </div>
      </div>
      <div>
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Color</div>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_CHOICES.map((c) => (
            <button key={c} onClick={() => setDraft({ ...draft, color: c })}
              className={`h-7 w-7 rounded-full border-2 ${draft.color === c ? 'border-navy-700' : 'border-white'} shadow-sm`}
              style={{ background: c }} />
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Layers size={16} className="text-brand-500" /> Manage programs</span>}
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-400 pr-3">Programs are the buckets your courses group into — shared across every facility in your organization. Reorder, recolor, rename, or add your own.</p>
        <span className={`shrink-0 text-[11px] font-semibold rounded-full px-2 py-0.5 ${atLimit ? 'bg-amber-50 text-accent-amber ring-1 ring-amber-100' : 'bg-slate-100 text-slate-500'}`}>{programs.length} / {MAX_PROGRAMS}</span>
      </div>

      <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden mb-3">
        {programs.map((p, idx) => {
          const PI = programIcon(p.icon);
          const isEditing = editId === p.id;
          return (
            <div key={p.id} className="px-3 py-2.5">
              {isEditing ? (
                <div className="space-y-3">
                  <Picker />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setEditId(null)}>Cancel</Button>
                    <Button size="sm" onClick={() => patch.mutate({ id: p.id, body: { name: draft.name.trim(), icon: draft.icon, color: draft.color } })} disabled={!draft.name.trim() || patch.isPending}>Save</Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${p.color}1a` }}>
                    <PI size={16} style={{ color: p.color }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-navy-800 truncate">{p.name}</div>
                    <div className="text-[11px] text-slate-400">{p.course_count} course{p.course_count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-slate-300 enabled:hover:text-navy-700 enabled:hover:bg-slate-100 disabled:opacity-30 rounded p-1"><ArrowUp size={14} /></button>
                    <button onClick={() => move(idx, 1)} disabled={idx === programs.length - 1} className="text-slate-300 enabled:hover:text-navy-700 enabled:hover:bg-slate-100 disabled:opacity-30 rounded p-1"><ArrowDown size={14} /></button>
                    <button onClick={() => startEdit(p)} title="Edit" className="text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded p-1"><Pencil size={13} /></button>
                    <button onClick={() => remove.mutate(p.id)} title={p.course_count ? 'Reassign its courses first' : 'Delete'} className="text-slate-400 hover:text-accent-rose hover:bg-rose-50 rounded p-1 disabled:opacity-40" disabled={p.course_count > 0}><Trash2 size={13} /></button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <div className="text-xs text-accent-rose mb-2">{error}</div>}

      {adding ? (
        <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-3 space-y-3">
          <Picker />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Cancel</Button>
            <Button size="sm" onClick={() => create.mutate()} disabled={!draft.name.trim() || create.isPending}><Plus size={13} /> Add program</Button>
          </div>
        </div>
      ) : atLimit ? (
        <p className="text-[12px] text-accent-amber">Maximum of {MAX_PROGRAMS} programs reached — delete one to add another.</p>
      ) : (
        <Button variant="outline" onClick={() => { setAdding(true); setEditId(null); setDraft({ name: '', icon: 'clipboard', color: COLOR_CHOICES[0] }); }}>
          <Plus size={14} /> New program
        </Button>
      )}
    </Modal>
  );
}

interface Material { id: number; kind: string; file_name: string; file_format: string; url: string | null; size_kb: number; version: number; is_active: boolean; cafe_document_id?: number | null; cafe_version?: number | null }
interface CafeDocOption { id: number; title: string; category: string | null; version: number }

function CourseDetailModal({ course, facilityId, canAuthor, onClose }: {
  course: Course; facilityId: number; canAuthor: boolean; onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [renameId, setRenameId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState('');
  const [addKind, setAddKind] = useState<'cafe' | 'video'>('cafe');
  const [videoUrl, setVideoUrl] = useState('');
  const [cafeDocId, setCafeDocId] = useState('');
  const qc = useQueryClient();
  const { programs, byKey } = usePrograms(facilityId);
  const programOptions = [...programs, UNCATEGORIZED];
  const canManage = canAuthor;
  const ic = courseIcon(course.title);
  const Icon = ic.icon;
  const prog = byKey(course.program);

  const [form, setForm] = useState({
    title: course.title, description: course.description ?? '',
    training_type: course.training_type, duration_hours: String(course.duration_hours),
    target_profile: course.target_profile ?? 'all', program: course.program || 'uncategorized',
  });

  const materials = useQuery({
    queryKey: ['course-materials', course.id],
    queryFn: () => api<Material[]>(`/api/lms/courses/${course.id}/materials`),
  });

  const refreshCourses = () => qc.invalidateQueries({ queryKey: ['lms-courses'] });
  const refreshMaterials = () => qc.invalidateQueries({ queryKey: ['course-materials', course.id] });

  const saveCourse = useMutation({
    mutationFn: () => api(`/api/lms/courses/${course.id}`, {
      method: 'PATCH',
      body: { ...form, duration_hours: Number(form.duration_hours) || 1, description: form.description.trim() || null },
    }),
    onSuccess: () => { refreshCourses(); setEditing(false); },
  });
  const deleteCourse = useMutation({
    mutationFn: () => api(`/api/lms/courses/${course.id}`, { method: 'DELETE' }),
    onSuccess: () => { refreshCourses(); onClose(); },
    onError: (e: Error) => setError(e.message),
  });
  const addVideo = useMutation({
    mutationFn: () => api(`/api/lms/courses/${course.id}/materials/video`, {
      method: 'POST',
      body: { url: videoUrl.trim(), facility_id: facilityId, uploaded_by: 'Staff Educator', replace: (materials.data ?? []).some((m) => m.is_active) },
    }),
    onSuccess: () => { setVideoUrl(''); setError(null); refreshMaterials(); refreshCourses(); },
    onError: (e: Error) => setError(e.message),
  });
  const cafeDocs = useQuery({
    queryKey: ['lms-cafe-docs', facilityId],
    queryFn: () => api<CafeDocOption[]>(`/api/lms/cafe-documents?facility_id=${facilityId}`),
    enabled: addKind === 'cafe',
  });
  const addCafe = useMutation({
    mutationFn: () => api(`/api/lms/courses/${course.id}/materials/from-cafe`, {
      method: 'POST',
      body: { document_id: Number(cafeDocId), uploaded_by: 'Staff Educator', replace: (materials.data ?? []).some((m) => m.is_active) },
    }),
    onSuccess: () => { setCafeDocId(''); setError(null); refreshMaterials(); refreshCourses(); },
    onError: (e: Error) => setError(e.message),
  });
  const patchMat = useMutation({
    mutationFn: (p: { id: number; body: Record<string, unknown> }) => api(`/api/lms/courses/${course.id}/materials/${p.id}`, { method: 'PATCH', body: p.body }),
    onSuccess: () => { setRenameId(null); refreshMaterials(); },
  });
  const removeMat = useMutation({
    mutationFn: (id: number) => api(`/api/lms/courses/${course.id}/materials/${id}`, { method: 'DELETE' }),
    onSuccess: () => { refreshMaterials(); refreshCourses(); },
  });

  const list = materials.data ?? [];
  const active = list.filter((m) => m.is_active);
  const history = list.filter((m) => !m.is_active);
  const hasDoc = active.length > 0;
  const canDelete = course.assignment_count === 0;

  return (
    <Modal open onClose={onClose} wide
      title={<span className="flex items-center gap-2.5">
        <span className={`h-8 w-8 rounded-lg flex items-center justify-center ${ic.bg}`}><Icon size={16} className={ic.fg} /></span>
        {editing ? 'Edit course' : course.title}
      </span>}
      footer={<Button variant="ghost" onClick={onClose}>Done</Button>}
    >
      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Course title</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm resize-none" />
          </div>
          <div>
            <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Program</label>
            <select value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {programOptions.map((p) => <option key={p.key} value={p.key}>{p.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Type</label>
              <select value={form.training_type} onChange={(e) => setForm({ ...form, training_type: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                {TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Duration (h)</label>
              <input type="number" min="0.25" step="0.25" value={form.duration_hours} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Audience</label>
              <select value={form.target_profile} onChange={(e) => setForm({ ...form, target_profile: e.target.value })} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm capitalize">
                {PROFILES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => saveCourse.mutate()} disabled={!form.title.trim() || saveCourse.isPending}>Save changes</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 ring-1 ring-slate-200 px-2 py-0.5 text-[11px] font-medium" style={{ color: prog.color }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: prog.color }} /> {prog.name}
            </span>
            <span className="text-xs text-slate-500 capitalize">{course.training_type.replace(/_/g, ' ')} · {course.duration_hours}h</span>
            {course.target_profile && course.target_profile !== 'all' && (
              <span className="text-xs text-slate-500 capitalize">· {course.target_profile} staff</span>
            )}
            <span className="text-xs text-slate-400">· v{course.version}</span>
            {canManage && (
              <button onClick={() => setEditing(true)} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:text-brand-700">
                <Pencil size={12} /> Edit details
              </button>
            )}
          </div>

          {course.description && <p className="text-sm text-slate-600 mb-4">{course.description}</p>}

          {/* training material — sourced from a Document Café policy OR a YouTube video */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-[13px] font-semibold text-navy-700">Training material</span>
            {canManage && (
              <div className="inline-flex bg-slate-100 rounded-lg p-0.5 text-[11px]">
                <button onClick={() => setAddKind('cafe')} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${addKind === 'cafe' ? 'bg-white shadow-sm text-navy-800' : 'text-slate-500'}`}><Library size={12} /> Document Café</button>
                <button onClick={() => setAddKind('video')} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${addKind === 'video' ? 'bg-white shadow-sm text-navy-800' : 'text-slate-500'}`}><Youtube size={12} /> Video</button>
              </div>
            )}
          </div>
          {canManage && (
            <p className="text-[11px] text-slate-400 mb-2">Training content is sourced from <strong>Document Café</strong> policies or a YouTube video — documents aren’t uploaded into the LMS, keeping a single source of truth.</p>
          )}

          {hasDoc ? (
            active.map((m) => (
              <div key={m.id} className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 ${m.kind === 'video' ? 'border-rose-200 bg-rose-50/40' : 'border-emerald-200 bg-emerald-50/50'}`}>
                {m.kind === 'video' ? <Youtube size={15} className="text-rose-500 shrink-0" /> : <FileText size={15} className="text-accent-emerald shrink-0" />}
                {renameId === m.id ? (
                  <>
                    <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && draftName.trim()) patchMat.mutate({ id: m.id, body: { file_name: draftName.trim() } }); if (e.key === 'Escape') setRenameId(null); }}
                      className="flex-1 rounded border border-slate-300 px-2 py-1 text-sm" />
                    <button onClick={() => draftName.trim() && patchMat.mutate({ id: m.id, body: { file_name: draftName.trim() } })} className="text-accent-emerald hover:bg-emerald-100 rounded p-1"><Check size={15} /></button>
                    <button onClick={() => setRenameId(null)} className="text-slate-400 hover:bg-slate-100 rounded p-1"><X size={15} /></button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-navy-800 truncate">{m.file_name}</span>
                    <Badge tone={m.kind === 'video' ? 'rose' : 'emerald'}>v{m.version} · active</Badge>
                    {m.cafe_document_id && <Badge tone="brand">Café · auto-syncs</Badge>}
                    {m.kind === 'video'
                      ? <a href={m.url ?? '#'} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline ml-auto shrink-0">Preview ↗</a>
                      : <a href={apiUrl(`/api/lms/materials/${m.id}/file`)} target="_blank" rel="noreferrer" className="text-xs text-brand-600 hover:underline ml-auto shrink-0">Preview ↗</a>}
                    {canManage && (
                      <button onClick={() => { setRenameId(m.id); setDraftName(m.file_name); }} title="Rename" className="text-slate-400 hover:text-brand-600 hover:bg-slate-100 rounded p-1 shrink-0"><Pencil size={13} /></button>
                    )}
                  </>
                )}
              </div>
            ))
          ) : !canManage ? (
            <Empty>No training material attached yet.</Empty>
          ) : null}

          {/* add / replace control */}
          {canManage && addKind === 'video' && (
            <div className="mt-2 flex gap-2">
              <div className="relative flex-1">
                <Youtube size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rose-400" />
                <input value={videoUrl} onChange={(e) => { setVideoUrl(e.target.value); setError(null); }}
                  placeholder="Paste a YouTube link — https://youtu.be/…"
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
              </div>
              <Button size="sm" onClick={() => addVideo.mutate()} disabled={!videoUrl.trim() || addVideo.isPending}>
                <Youtube size={14} /> {hasDoc ? 'Publish video' : 'Add video'}
              </Button>
            </div>
          )}
          {canManage && addKind === 'cafe' && (
            <div className="mt-2">
              <div className="flex gap-2">
                <div className="flex-1">
                  <SimpleDropdown value={cafeDocId} width="w-full" placeholder="Select a published Café policy…"
                    onChange={(v) => { setCafeDocId(v); setError(null); }}
                    items={(cafeDocs.data ?? []).map((d) => ({ value: String(d.id), label: `${d.title} (v${d.version})` }))} />
                </div>
                <Button size="sm" onClick={() => addCafe.mutate()} disabled={!cafeDocId || addCafe.isPending}>
                  <Library size={14} /> {hasDoc ? 'Use this version' : 'Attach'}
                </Button>
              </div>
              <p className="text-[11px] text-slate-400 mt-1.5">Linked policies <strong>auto-update this course</strong> when re-published in the Café — completers keep their certificate and are re-assigned to the new version.</p>
              {(cafeDocs.data ?? []).length === 0 && !cafeDocs.isLoading && <p className="text-[11px] text-slate-400 mt-1">No published Café policies yet — publish one in the Document Café first.</p>}
            </div>
          )}

          {hasDoc && addKind === 'video' && videoUrl && (
            <p className="text-[11px] text-slate-400 mt-1.5">Publishing a video replaces the current material as <strong>v{course.version + 1}</strong> — everyone assigned auto-moves to it.</p>
          )}
          {error && <div className="text-xs text-accent-rose mt-2">{error}</div>}

          {/* version history */}
          {history.length > 0 && (
            <div className="mt-4">
              <button onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-navy-800">
                <History size={13} /> Version history ({history.length})
              </button>
              {showHistory && (
                <div className="mt-2 space-y-1.5">
                  {history.map((m) => (
                    <div key={m.id} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 bg-slate-50/50">
                      <FileText size={14} className="text-slate-400 shrink-0" />
                      <span className="text-sm text-slate-600 truncate">{m.file_name}</span>
                      <Badge tone="slate">v{m.version} · inactive</Badge>
                      <span className="text-xs text-slate-400 ml-auto uppercase shrink-0">{m.file_format}</span>
                      {canManage && (
                        <span className="flex items-center gap-0.5 shrink-0">
                          <button onClick={() => patchMat.mutate({ id: m.id, body: { is_active: true } })} title="Make active again" className="text-slate-400 hover:text-accent-emerald hover:bg-emerald-50 rounded p-1"><RefreshCw size={13} /></button>
                          <button onClick={() => removeMat.mutate(m.id)} title="Delete version" className="text-slate-400 hover:text-accent-rose hover:bg-rose-50 rounded p-1"><Trash2 size={13} /></button>
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* danger zone: delete (guarded) */}
          {canManage && (
            <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {canDelete ? 'No training assigned from this course yet.' : `${course.assignment_count} assignment(s) — delete is locked for audit defense.`}
              </span>
              <Button size="sm" variant="outline" disabled={!canDelete || deleteCourse.isPending}
                onClick={() => deleteCourse.mutate()}>
                {canDelete ? <><Trash2 size={13} /> Delete course</> : <><Lock size={13} /> Delete locked</>}
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
