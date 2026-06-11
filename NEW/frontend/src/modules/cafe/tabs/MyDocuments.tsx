import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  UploadCloud, FileText, Plus, Search, ChevronRight, ChevronLeft,
  Download, Check, Copy, FilePlus2, ArrowUpCircle, GraduationCap, Trash2, AlertTriangle,
} from 'lucide-react';
import { api, apiForm, apiUrl } from '../../../lib/api';
import { usePersona, personaLabel } from '../../../lib/persona';
import { Button, Modal, Dropdown, DItem, DHeader, SimpleDropdown } from '../../../components/ui';
import { Th, sortRows, fmtDateTime, type SortState } from '../table';

interface Doc {
  id: number; title: string; group: string | null; category: string | null; tags: string[];
  owner_type: string; current_version: number; status: string; is_live: boolean;
  editable: boolean; draft_format: string; author: string | null; updated_at: string | null;
  origin: 'customized' | 'uploaded' | 'authored';
  update_available?: boolean; source_current_version?: number | null; training_links?: number;
}
interface Folder { name: string; count: number }
interface TaxGroup { group: string; categories: { name: string; count: number }[] }
interface Taxonomy { groups: TaxGroup[] }

const STATUS: Record<string, { label: string; chip: string; dot: string }> = {
  draft: { label: 'Draft', chip: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400' },
  in_review: { label: 'In review', chip: 'bg-amber-50 text-accent-amber ring-1 ring-amber-200', dot: 'bg-accent-amber' },
  approved: { label: 'Approved', chip: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200', dot: 'bg-brand-500' },
  published: { label: 'Published', chip: 'bg-emerald-50 text-accent-emerald ring-1 ring-emerald-200', dot: 'bg-accent-emerald' },
  archived: { label: 'Archived', chip: 'bg-slate-100 text-slate-500', dot: 'bg-slate-300' },
};
const ORIGIN: Record<string, { label: string; cls: string; icon: typeof Copy }> = {
  customized: { label: 'Facility version', cls: 'text-brand-700 bg-brand-50 ring-brand-200', icon: Copy },
  uploaded: { label: 'Uploaded', cls: 'text-slate-600 bg-slate-100 ring-slate-200', icon: UploadCloud },
  authored: { label: 'Authored', cls: 'text-violet-700 bg-violet-50 ring-violet-200', icon: FilePlus2 },
};
const CAT_COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f97316', '#ec4899', '#14b8a6', '#6366f1', '#ef4444'];
const catColor = (c: string | null) => {
  const s = c || 'Uncategorized'; let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return CAT_COLORS[h % CAT_COLORS.length];
};
const initials = (s: string | null) => (s || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
// facility-defined categories that aren't part of the TCS taxonomy
const extraCats = (folders?: Folder[], tax?: Taxonomy): string[] => {
  const known = new Set((tax?.groups ?? []).flatMap((g) => g.categories.map((c) => c.name)));
  return (folders ?? []).map((f) => f.name).filter((n) => n && n !== 'Uncategorized' && !known.has(n));
};
const PAGE = 12;
const val = (d: Doc, f: string): string | number =>
  f === 'category' ? (d.category ?? '').toLowerCase()
  : f === 'status' ? d.status
  : f === 'owner' ? (d.author ?? '').toLowerCase()
  : f === 'source' ? d.origin
  : f === 'title' ? d.title.toLowerCase()
  : d.updated_at ?? '';

const STATUS_OPTS: [string, string][] = [['all', 'All statuses'], ['draft', 'Draft'], ['in_review', 'In review'], ['approved', 'Approved'], ['published', 'Published']];

export function MyDocuments({ facilityId, orgId, readOnly = false }: { facilityId: number; orgId: number | null; readOnly?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { role } = usePersona();
  const actor = personaLabel(role);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [cat, setCat] = useState('all');
  const [sort, setSort] = useState<SortState>({ field: 'updated', dir: 'desc' });
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [delTarget, setDelTarget] = useState<Doc | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const docs = useQuery({ queryKey: ['cafe-docs', facilityId], queryFn: () => api<Doc[]>(`/api/cafe/documents?facility_id=${facilityId}&owner_type=customer`) });
  const folders = useQuery({ queryKey: ['cafe-folders', facilityId], queryFn: () => api<Folder[]>(`/api/cafe/folders?facility_id=${facilityId}`) });
  const tax = useQuery({ queryKey: ['cafe-tcs-taxonomy'], queryFn: () => api<Taxonomy>('/api/cafe/tcs/taxonomy') });

  const open = (id: number) => nav(`/cafe/d/${id}`);
  const del = useMutation({
    mutationFn: (id: number) => api(`/api/cafe/documents/${id}`, { method: 'DELETE' }),
    onSuccess: () => { setDelTarget(null); qc.invalidateQueries({ queryKey: ['cafe-docs'] }); qc.invalidateQueries({ queryKey: ['cafe-folders'] }); },
  });

  const all = docs.data ?? [];
  const s = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    const rows = all
      .filter((d) => status === 'all' ? true : status === 'published' ? d.is_live : d.status === status)
      .filter((d) => cat === 'all' || (cat.startsWith('g:') ? (d.group ?? '') === cat.slice(2) : (d.category ?? 'Uncategorized') === cat))
      .filter((d) => !s || d.title.toLowerCase().includes(s) || (d.tags ?? []).some((t) => t.toLowerCase().includes(s)));
    return sortRows(rows, sort, val);
  }, [all, status, cat, s, sort]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE, safePage * PAGE);
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOnPage = pageRows.length > 0 && pageRows.every((d) => picked.has(d.id));
  const toggleAll = () => setPicked((p) => { const n = new Set(p); if (allOnPage) pageRows.forEach((d) => n.delete(d.id)); else pageRows.forEach((d) => n.add(d.id)); return n; });

  const bulkDownload = async () => {
    const res = await fetch(apiUrl('/api/cafe/documents/bulk-download'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ document_ids: [...picked] }) });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cafe_export.zip'; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative flex-1 min-w-56">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search documents and tags…"
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <Dropdown label={STATUS_OPTS.find((o) => o[0] === status)?.[1] ?? 'All statuses'} width="min-w-[8.5rem]">
          {(close) => STATUS_OPTS.map(([v, l]) => (
            <DItem key={v} active={status === v} onClick={() => { setStatus(v); setPage(1); close(); }}>{l}</DItem>
          ))}
        </Dropdown>
        <Dropdown label={cat === 'all' ? 'All categories' : cat.startsWith('g:') ? cat.slice(2) : cat} width="min-w-[11rem]" align="right">
          {(close) => (
            <>
              <DItem active={cat === 'all'} onClick={() => { setCat('all'); setPage(1); close(); }}>All categories</DItem>
              {(tax.data?.groups ?? []).map((g) => (
                <div key={g.group}>
                  <DHeader>{g.group}</DHeader>
                  <DItem active={cat === `g:${g.group}`} onClick={() => { setCat(`g:${g.group}`); setPage(1); close(); }}>All {g.group}</DItem>
                  {g.categories.map((c) => (
                    <DItem key={c.name} indent active={cat === c.name} onClick={() => { setCat(c.name); setPage(1); close(); }}>{c.name}</DItem>
                  ))}
                </div>
              ))}
              {extraCats(folders.data, tax.data).length > 0 && (
                <>
                  <DHeader>Facility categories</DHeader>
                  {extraCats(folders.data, tax.data).map((n) => (
                    <DItem key={n} indent active={cat === n} onClick={() => { setCat(n); setPage(1); close(); }}>{n}</DItem>
                  ))}
                </>
              )}
            </>
          )}
        </Dropdown>
        <div className="flex items-center gap-2 ml-auto">
          {picked.size > 0 && <Button variant="outline" onClick={bulkDownload}><Download size={14} /> Download {picked.size}</Button>}
          {!readOnly && <>
            <Button variant="outline" onClick={() => setUploadOpen(true)}><UploadCloud size={15} /> Upload</Button>
            <Button onClick={() => setNewOpen(true)}><Plus size={15} /> New document</Button>
          </>}
        </div>
      </div>

      {/* table */}
      {docs.isLoading ? (
        <div className="space-y-2.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-11 rounded-xl bg-white ring-1 ring-slate-200/70 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 py-16 text-center">
          <div className="mx-auto h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center mb-3"><FileText size={22} className="text-brand-500" /></div>
          <div className="text-sm font-medium text-navy-800">No documents match your filters</div>
          {!readOnly && <div className="mt-4"><Button size="sm" onClick={() => setNewOpen(true)}><Plus size={14} /> New document</Button></div>}
        </div>
      ) : (
        <>
          <div className="rounded-xl bg-white ring-1 ring-slate-200/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="w-10 pl-4">
                    <button onClick={toggleAll} className={`h-4 w-4 rounded border flex items-center justify-center ${allOnPage ? 'bg-brand-500 border-brand-500' : 'border-slate-300'}`}>{allOnPage && <Check size={11} className="text-white" />}</button>
                  </th>
                  <Th field="title" sort={sort} onSort={setSort}>{''}</Th>
                  <Th field="source" sort={sort} onSort={setSort} className="hidden lg:table-cell w-40">Source</Th>
                  <Th field="category" sort={sort} onSort={setSort} className="hidden md:table-cell w-40">Category</Th>
                  <Th field="status" sort={sort} onSort={setSort} className="w-32">Status</Th>
                  <Th field="owner" sort={sort} onSort={setSort} className="hidden xl:table-cell w-32">Owner</Th>
                  <Th field="updated" sort={sort} onSort={setSort} align="right" className="hidden sm:table-cell w-44">Updated</Th>
                  {!readOnly && <th className="w-10 pr-3" />}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((d) => {
                  const st = STATUS[d.status] ?? STATUS.draft; const cc = catColor(d.category); const og = ORIGIN[d.origin] ?? ORIGIN.authored; const OIcon = og.icon;
                  return (
                    <tr key={d.id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                      <td className="pl-4">
                        <button onClick={() => toggle(d.id)} className={`h-4 w-4 rounded border flex items-center justify-center transition-colors ${picked.has(d.id) ? 'bg-brand-500 border-brand-500' : 'border-slate-300 hover:border-brand-400'}`}>{picked.has(d.id) && <Check size={11} className="text-white" />}</button>
                      </td>
                      <td className="px-3 py-2.5 cursor-pointer" onClick={() => open(d.id)}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cc}14` }}><FileText size={14} style={{ color: cc }} /></span>
                          <span className="font-medium text-navy-900 truncate group-hover:text-brand-700">{d.title}</span>
                          {d.is_live && <span className="text-[10px] font-semibold text-slate-400 shrink-0">v{d.current_version}</span>}
                          {d.update_available && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700 ring-1 ring-amber-300 shrink-0" title={`TCS released v${d.source_current_version} of the source`}>
                              <ArrowUpCircle size={10} /> Update available
                            </span>
                          )}
                          {!!d.training_links && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shrink-0" title={`Used as training material in ${d.training_links} course(s)`}>
                              <GraduationCap size={10} /> In training{d.training_links > 1 ? ` · ${d.training_links}` : ''}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden lg:table-cell">
                        <span className={`inline-flex items-center gap-1 whitespace-nowrap text-[10.5px] font-semibold leading-none rounded-full px-2 py-1 ring-1 ${og.cls}`}><OIcon size={11} className="shrink-0" /> {og.label}</span>
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: cc }} />{d.category || 'Uncategorized'}</span>
                          {d.group && <span className="text-[10px] text-slate-400 pl-3.5 truncate">{d.group}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5"><span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1 ${st.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} /> {st.label}</span></td>
                      <td className="px-3 py-2.5 hidden xl:table-cell">
                        <span className="inline-flex items-center gap-2 text-xs text-slate-500">
                          <span className="h-6 w-6 rounded-full bg-gradient-to-br from-navy-600 to-navy-800 text-white text-[9px] font-bold flex items-center justify-center shrink-0">{initials(d.author)}</span>
                          <span className="truncate">{d.author || '—'}</span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-400 hidden sm:table-cell whitespace-nowrap">{fmtDateTime(d.updated_at)}</td>
                      {!readOnly && (
                        <td className="pr-3 py-2.5 text-right">
                          <button onClick={(e) => { e.stopPropagation(); setDelTarget(d); }} title="Delete policy"
                            className="h-7 w-7 inline-flex items-center justify-center rounded-lg text-slate-300 hover:text-accent-rose hover:bg-rose-50 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-400">Showing {(safePage - 1) * PAGE + 1}–{Math.min(safePage * PAGE, filtered.length)} of {filtered.length}{picked.size > 0 ? ` · ${picked.size} selected` : ''}</span>
            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50"><ChevronLeft size={14} /> Prev</button>
                <span className="text-xs text-slate-400 px-1">{safePage} / {totalPages}</span>
                <button disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-600 disabled:opacity-40 hover:bg-slate-50">Next <ChevronRight size={14} /></button>
              </div>
            )}
          </div>
        </>
      )}

      {uploadOpen && <UploadModal facilityId={facilityId} orgId={orgId} actor={actor} onClose={() => setUploadOpen(false)}
        onUploaded={(id) => { qc.invalidateQueries({ queryKey: ['cafe-docs'] }); qc.invalidateQueries({ queryKey: ['cafe-folders'] }); open(id); }} />}
      {newOpen && <NewPolicyModal facilityId={facilityId} orgId={orgId} actor={actor} onClose={() => setNewOpen(false)}
        onCreated={(id) => { qc.invalidateQueries({ queryKey: ['cafe-docs'] }); qc.invalidateQueries({ queryKey: ['cafe-folders'] }); open(id); }} />}
      {delTarget && (
        <Modal open onClose={() => setDelTarget(null)} title={<span className="flex items-center gap-2"><AlertTriangle size={16} className="text-accent-rose" /> Delete policy</span>}
          footer={<div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDelTarget(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => del.mutate(delTarget.id)} disabled={del.isPending}><Trash2 size={14} /> Delete policy</Button>
          </div>}>
          <p className="text-sm text-slate-600">Delete <strong className="text-navy-800">{delTarget.title}</strong>? This permanently removes the policy and its version history.</p>
          {!!delTarget.training_links && (
            <p className="mt-3 text-[12px] text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2">
              This policy is the source for {delTarget.training_links} training course{delTarget.training_links > 1 ? 's' : ''}. Policies with completed training are protected and cannot be deleted.
            </p>
          )}
          {del.isError && <p className="mt-3 text-xs text-accent-rose">{(del.error as Error).message}</p>}
        </Modal>
      )}
    </div>
  );
}

function NewPolicyModal({ facilityId, orgId, actor, onClose, onCreated }: { facilityId: number; orgId: number | null; actor: string; onClose: () => void; onCreated: (id: number) => void }) {
  const [title, setTitle] = useState('');
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [touched, setTouched] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const tax = useQuery({ queryKey: ['cafe-tcs-taxonomy'], queryFn: () => api<Taxonomy>('/api/cafe/tcs/taxonomy') });
  const groups = tax.data?.groups ?? [];
  const isCustom = group === '__custom';
  const cats = groups.find((g) => g.group === group)?.categories ?? [];
  const effCategory = isCustom ? customCat.trim() : category;
  const titleOk = title.trim().length > 0;
  const valid = titleOk && !!group && !!effCategory;

  const create = useMutation({
    mutationFn: () => api<{ id: number }>('/api/cafe/documents', {
      method: 'POST',
      body: {
        title: title.trim(), facility_id: facilityId, org_id: orgId, author: actor,
        group: isCustom ? 'Policies & Procedures' : group, category: effCategory, content_html: '',
      },
    }),
    onSuccess: (r) => onCreated(r.id),
    onError: (e: Error) => setErr(e.message),
  });
  const submit = () => { setTouched(true); if (!valid) { setErr('Fill in all required fields.'); return; } create.mutate(); };

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><FilePlus2 size={16} className="text-brand-500" /> New policy</span>}
      footer={<div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={create.isPending}><Plus size={14} /> Create &amp; open</Button>
      </div>}>
      <div className="mb-3">
        <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Policy title <span className="text-accent-rose">*</span></label>
        <input autoFocus value={title} onChange={(e) => { setTitle(e.target.value); setErr(null); }} onBlur={() => setTouched(true)}
          placeholder="e.g. Falls Prevention & Management"
          className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400 ${touched && !titleOk ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300'}`} />
        {touched && !titleOk && <p className="text-[11px] text-accent-rose mt-1">A title is required.</p>}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Group <span className="text-accent-rose">*</span></label>
          <SimpleDropdown value={group} width="w-full" placeholder="Select…"
            onChange={(v) => { setGroup(v); setCategory(''); setErr(null); }}
            items={[...groups.map((g) => ({ value: g.group, label: g.group })), { value: '__custom', label: '+ Facility category…' }]} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Category <span className="text-accent-rose">*</span></label>
          {isCustom ? (
            <input value={customCat} onChange={(e) => { setCustomCat(e.target.value); setErr(null); }} placeholder="Your category name"
              className={`w-full rounded-lg border px-3 py-2 text-sm ${touched && !effCategory ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300'}`} />
          ) : (
            <SimpleDropdown value={category} width="w-full" disabled={!group} placeholder={group ? 'Select…' : 'Pick a group first'}
              onChange={(v) => { setCategory(v); setErr(null); }}
              items={cats.map((c) => ({ value: c.name, label: c.name }))} />
          )}
        </div>
      </div>
      {err && <div className="text-xs text-accent-rose mt-3">{err}</div>}
    </Modal>
  );
}

function UploadModal({ facilityId, orgId, actor, onClose, onUploaded }: { facilityId: number; orgId: number | null; actor: string; onClose: () => void; onUploaded: (id: number) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [group, setGroup] = useState('');
  const [category, setCategory] = useState('');
  const [customCat, setCustomCat] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const tax = useQuery({ queryKey: ['cafe-tcs-taxonomy'], queryFn: () => api<Taxonomy>('/api/cafe/tcs/taxonomy') });
  const groups = tax.data?.groups ?? [];
  const isCustom = group === '__custom';
  const cats = groups.find((g) => g.group === group)?.categories ?? [];
  const effCategory = isCustom ? customCat.trim() : category;

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file); fd.append('facility_id', String(facilityId));
      if (orgId != null) fd.append('org_id', String(orgId));
      if (!isCustom && group) fd.append('group', group);
      if (effCategory) fd.append('category', effCategory);
      fd.append('uploaded_by', actor);
      return apiForm<{ id: number }>('/api/cafe/documents/upload', fd);
    },
    onSuccess: (r) => onUploaded(r.id),
    onError: (e: Error) => setErr(e.message),
  });
  const pick = (f?: File | null) => { if (!group || !effCategory) { setErr('Choose a group and category first.'); return; } if (f) upload.mutate(f); };

  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><UploadCloud size={16} className="text-brand-500" /> Upload a document</span>}
      footer={<Button variant="ghost" onClick={onClose}>Cancel</Button>}>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Group</label>
          <SimpleDropdown value={group} width="w-full" placeholder="Select…"
            onChange={(v) => { setGroup(v); setCategory(''); setErr(null); }}
            items={[...groups.map((g) => ({ value: g.group, label: g.group })), { value: '__custom', label: '+ Facility category…' }]} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Category</label>
          {isCustom ? (
            <input value={customCat} onChange={(e) => { setCustomCat(e.target.value); setErr(null); }} placeholder="Your category name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          ) : (
            <SimpleDropdown value={category} width="w-full" disabled={!group} placeholder={group ? 'Select…' : 'Pick a group first'}
              onChange={(v) => { setCategory(v); setErr(null); }}
              items={cats.map((c) => ({ value: c.name, label: c.name }))} />
          )}
        </div>
      </div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); pick(e.dataTransfer.files?.[0]); }}
        onClick={() => fileRef.current?.click()}
        className={`rounded-xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-400 bg-brand-50/50' : 'border-slate-300 hover:border-brand-400 hover:bg-brand-50/30'}`}>
        <UploadCloud className="mx-auto text-brand-500 mb-2" size={28} />
        <div className="text-sm font-medium text-navy-800">{upload.isPending ? 'Uploading…' : 'Drag & drop, or click to choose a file'}</div>
        <div className="text-xs text-slate-400 mt-1">PDF, Word, Excel, PowerPoint, images</div>
        <input ref={fileRef} type="file" className="hidden" accept=".pdf,.docx,.doc,.xlsx,.pptx,.txt,.png,.jpg,.jpeg,.html"
          onChange={(e) => { pick(e.target.files?.[0]); e.currentTarget.value = ''; }} />
      </div>
      {err && <div className="text-xs text-accent-rose mt-2">{err}</div>}
    </Modal>
  );
}
