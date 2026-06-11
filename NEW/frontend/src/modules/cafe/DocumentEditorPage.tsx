import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, FileText, Save, Send, CheckCircle2, XCircle, Rocket, Undo2, Clock,
  History, Activity, SlidersHorizontal, Eye, Download, Trash2, Lock, ShieldCheck,
  GraduationCap, Check, Loader2, ArrowUpCircle, Sparkles, GitMerge, X,
} from 'lucide-react';
import { api, apiUrl } from '../../lib/api';
import { usePersona, personaLabel } from '../../lib/persona';
import { Button, Badge } from '../../components/ui';
import { RichTextEditor } from './RichTextEditor';

interface Review { id: number; status: string; version: number; submitted_by: string | null; reviewer: string | null; note: string | null }
interface Doc {
  id: number; title: string; category: string | null; tags: string[]; status: string;
  current_version: number; is_live: boolean; editable: boolean; draft_format: string;
  author: string | null; owner_type: string; effective_date: string | null;
  draft_html: string | null; review: Review | null;
  update_available?: boolean; source_version?: number | null; source_current_version?: number | null;
  training_links?: number;
}
interface TrainingImpact {
  assigned: number; completed: number; outstanding: number;
  linked_courses: { id: number; title: string; assigned: number }[]; linked_assigned: number;
}
interface ReconcileData {
  document_id: number; title: string; source_version: number | null; source_current_version: number | null;
  tcs_new_html: string; current_html: string; proposed_html: string; summary_html: string; used_ai: boolean;
}
interface Version { version: number; note: string | null; created_by: string | null; is_current: boolean; created_at: string | null }

const STATUS_META: Record<string, { label: string; tone: 'slate' | 'amber' | 'brand' | 'emerald'; dot: string }> = {
  draft: { label: 'Draft', tone: 'slate', dot: 'bg-slate-400' },
  in_review: { label: 'In review', tone: 'amber', dot: 'bg-accent-amber' },
  approved: { label: 'Approved', tone: 'brand', dot: 'bg-brand-500' },
  published: { label: 'Published', tone: 'emerald', dot: 'bg-accent-emerald' },
  archived: { label: 'Archived', tone: 'slate', dot: 'bg-slate-400' },
};

export function DocumentEditorPage() {
  const { docId } = useParams();
  const id = Number(docId);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { role } = usePersona();
  const actor = personaLabel(role);

  const [tab, setTab] = useState<'details' | 'versions' | 'activity'>('details');
  const [title, setTitle] = useState<string | null>(null);
  const [html, setHtml] = useState<string | null>(null);
  const [json, setJson] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const [assignProfile, setAssignProfile] = useState('all');
  const [reconcileOpen, setReconcileOpen] = useState(false);
  const [publishConfirm, setPublishConfirm] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const q = useQuery({ queryKey: ['cafe-doc', id], queryFn: () => api<Doc>(`/api/cafe/documents/${id}`) });
  const doc = q.data;
  const impact = useQuery({ queryKey: ['cafe-training-impact', id], queryFn: () => api<TrainingImpact>(`/api/cafe/documents/${id}/training`) });
  const linkedCourses = impact.data?.linked_courses ?? [];
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['cafe-doc', id] });
    qc.invalidateQueries({ queryKey: ['cafe-docs'] });
    qc.invalidateQueries({ queryKey: ['cafe-review-queue'] });
  };

  const curTitle = title ?? doc?.title ?? '';
  const canEdit = !!doc && doc.owner_type !== 'tcs' && doc.editable && doc.status !== 'in_review';
  const sm = STATUS_META[doc?.status ?? 'draft'] ?? STATUS_META.draft;
  const isSubmitter = doc?.review?.submitted_by && doc.review.submitted_by.trim().toLowerCase() === actor.trim().toLowerCase();

  const save = useMutation({
    mutationFn: () => api(`/api/cafe/documents/${id}`, {
      method: 'PATCH',
      body: { actor, title: curTitle, content_html: html ?? doc?.draft_html ?? '', content_json: json },
    }),
    onSuccess: () => { setSaveState('saved'); qc.invalidateQueries({ queryKey: ['cafe-docs'] }); },
    onError: (e: Error) => { setErr(e.message); setSaveState('dirty'); },
  });
  const doSave = () => { if (canEdit) { setSaveState('saving'); save.mutate(); } };

  // debounced autosave
  const onEdit = (h: string, j: string) => {
    setHtml(h); setJson(j); setSaveState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => doSave(), 1400);
  };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const act = (path: string, body: Record<string, unknown> = {}) => api(`/api/cafe/documents/${id}/${path}`, { method: 'POST', body: { actor, ...body } });
  const submit = useMutation({ mutationFn: async () => { if (saveState !== 'saved' && canEdit) await save.mutateAsync(); return act('submit'); }, onSuccess: refresh, onError: (e: Error) => setErr(e.message) });
  const withdraw = useMutation({ mutationFn: () => act('withdraw'), onSuccess: refresh });
  const review = useMutation({
    mutationFn: (v: { decision: 'approve' | 'reject'; note?: string }) =>
      api(`/api/cafe/documents/${id}/review`, { method: 'POST', body: { reviewer: actor, decision: v.decision, note: v.note } }),
    onSuccess: refresh, onError: (e: Error) => setErr(e.message),
  });
  const publish = useMutation({
    mutationFn: () => api(`/api/cafe/documents/${id}/publish`, { method: 'POST', body: { actor, assign_profile: assignProfile } }),
    onSuccess: () => {
      setPublishConfirm(false); refresh();
      qc.invalidateQueries({ queryKey: ['lms-assignments'] });
      qc.invalidateQueries({ queryKey: ['lms-courses'] });
      qc.invalidateQueries({ queryKey: ['cafe-training-impact', id] });
    },
    onError: (e: Error) => setErr(e.message),
  });
  const onPublishClick = () => { if (linkedCourses.length > 0) setPublishConfirm(true); else publish.mutate(); };

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-slate-100">
      {/* top bar */}
      <header className="h-14 shrink-0 bg-white border-b border-slate-200 shadow-sm flex items-center gap-3 px-3 sm:px-4">
        <button onClick={() => nav('/cafe')} className="h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 shrink-0" title="Back to Document Café">
          <ChevronLeft size={20} />
        </button>
        <span className="h-8 w-8 rounded-lg bg-brand-50 ring-1 ring-brand-100 flex items-center justify-center shrink-0"><FileText size={16} className="text-brand-600" /></span>
        <div className="min-w-0 flex-1">
          <input
            value={curTitle} disabled={!canEdit}
            onChange={(e) => { setTitle(e.target.value); setSaveState('dirty'); }}
            placeholder="Untitled policy"
            className="w-full max-w-xl text-[15px] font-semibold text-navy-900 bg-transparent focus:outline-none focus:bg-slate-50 rounded px-1.5 py-1 disabled:cursor-default truncate"
          />
          <div className="flex items-center gap-2 px-1.5 text-[11px] text-slate-400">
            <span className="flex items-center gap-1"><span className={`h-1.5 w-1.5 rounded-full ${sm.dot}`} />{sm.label}</span>
            {doc?.is_live && <span>· Live v{doc.current_version}</span>}
            <SaveIndicator state={saveState} canEdit={canEdit} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {doc?.is_live && (
            <a href={apiUrl(`/api/cafe/documents/${id}/download?actor=${encodeURIComponent(actor)}`)} target="_blank" rel="noreferrer"
              className="hidden sm:inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-navy-800 px-2.5 py-1.5 rounded-lg hover:bg-slate-100"><Eye size={14} /> PDF</a>
          )}
          <WorkflowActions
            doc={doc} isSubmitter={!!isSubmitter} canEdit={canEdit} saving={save.isPending}
            onSave={doSave}
            onSubmit={() => submit.mutate()}
            onWithdraw={() => withdraw.mutate()}
            onApprove={() => review.mutate({ decision: 'approve' })}
            onReject={() => { const n = window.prompt('Reason for sending back (optional):') ?? undefined; review.mutate({ decision: 'reject', note: n }); }}
            onPublish={onPublishClick}
          />
        </div>
      </header>

      {/* body */}
      <div className="flex-1 flex min-h-0">
        {/* canvas */}
        <div className="flex-1 overflow-y-auto">
          {!doc ? (
            <div className="max-w-[820px] mx-auto my-10 h-[70vh] rounded-2xl bg-white shadow-lg animate-pulse" />
          ) : (
            <div className="max-w-[820px] mx-auto my-8 px-4">
              {/* contextual workflow banner */}
              {doc.status === 'in_review' && (
                <Banner tone="amber" icon={<Clock size={15} />}>
                  {isSubmitter ? 'Pending peer approval. To preserve segregation of duties, the submitter cannot approve their own document — another manager will complete the review.'
                    : <>Submitted by <strong>{doc.review?.submitted_by}</strong> for your approval. Use the actions in the top bar to approve or return it with comments.</>}
                </Banner>
              )}
              {doc.update_available && doc.owner_type !== 'tcs' && (
                <Banner tone="brand" icon={<ArrowUpCircle size={15} />}>
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span>TCS released <strong>v{doc.source_current_version}</strong> of the source policy (your version is based on v{doc.source_version}). Reconcile to fold the changes into your policy without losing your edits.</span>
                    <span className="shrink-0"><Button size="sm" onClick={() => setReconcileOpen(true)}><GitMerge size={14} /> Reconcile</Button></span>
                  </div>
                </Banner>
              )}
              {linkedCourses.length > 0 && (
                <Banner tone="brand" icon={<GraduationCap size={15} />}>
                  Source for <strong>{linkedCourses.length}</strong> LMS training course{linkedCourses.length > 1 ? 's' : ''}
                  {' '}({linkedCourses.map((c) => c.title).join(', ')}). Publishing a new version updates the assigned training automatically.
                </Banner>
              )}
              {doc.review?.status === 'rejected' && doc.status === 'draft' && doc.review?.note && (
                <Banner tone="rose" icon={<XCircle size={15} />}>Sent back by {doc.review.reviewer}: “{doc.review.note}”</Banner>
              )}
              {doc.status === 'approved' && (
                <Banner tone="emerald" icon={<Rocket size={15} />}>
                  <div className="flex items-center justify-between gap-3 w-full">
                    <span>Approved — ready to publish <strong>v{doc.current_version + 1}</strong>. Publishing notifies staff and creates LMS acknowledgements.</span>
                    <label className="shrink-0 text-[12px]">Notify
                      <select value={assignProfile} onChange={(e) => setAssignProfile(e.target.value)} className="ml-1.5 rounded-md border border-emerald-200 bg-white px-1.5 py-0.5 capitalize">
                        {['all', 'clinical', 'dietary', 'activities', 'housekeeping', 'admin'].map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </label>
                  </div>
                </Banner>
              )}
              {err && <Banner tone="rose" icon={<XCircle size={15} />}>{err}</Banner>}

              {/* the document "paper" */}
              <div className="rounded-2xl bg-white shadow-[0_1px_3px_rgba(11,32,53,0.06),0_12px_40px_rgba(11,32,53,0.10)] ring-1 ring-slate-200/60 overflow-hidden">
                {doc.editable ? (
                  <RichTextEditor initialHtml={doc.draft_html} editable={canEdit} bare onChange={onEdit} />
                ) : (
                  <div className="p-12 text-center text-sm text-slate-500">
                    This is a <strong>.{doc.draft_format}</strong> file — inline editing is available for Word and rich-text documents.
                    <div className="mt-3"><a href={apiUrl(`/api/cafe/documents/${id}/download?actor=${encodeURIComponent(actor)}`)} target="_blank" rel="noreferrer"><Button size="sm" variant="outline"><Eye size={14} /> Open PDF</Button></a></div>
                  </div>
                )}
              </div>
              <div className="h-10" />
            </div>
          )}
        </div>

        {/* inspector */}
        <aside className="hidden lg:flex w-[340px] shrink-0 flex-col border-l border-slate-200 bg-white">
          <div className="flex items-center gap-1 p-2 border-b border-slate-100">
            {([['details', SlidersHorizontal], ['versions', History], ['activity', Activity]] as const).map(([k, Icon]) => (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${tab === k ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-100'}`}>
                <Icon size={14} /> {k}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {doc && tab === 'details' && <DetailsPanel docId={id} doc={doc} actor={actor} canEdit={canEdit} onChanged={() => qc.invalidateQueries({ queryKey: ['cafe-doc', id] })} />}
            {tab === 'versions' && <VersionsPanel docId={id} actor={actor} />}
            {tab === 'activity' && <ActivityPanel docId={id} onChanged={refresh} onDeleted={() => nav('/cafe')} />}
          </div>
        </aside>
      </div>

      {reconcileOpen && doc && (
        <ReconcileModal docId={id} actor={actor} onClose={() => setReconcileOpen(false)}
          onApplied={() => { setReconcileOpen(false); refresh(); }} />
      )}

      {publishConfirm && doc && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-navy-950/40 backdrop-blur-sm p-4">
          <div className="w-[min(520px,96vw)] rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
              <span className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center"><GraduationCap size={18} className="text-brand-600" /></span>
              <div className="text-[15px] font-semibold text-navy-900">Publish v{doc.current_version + 1} &amp; update training?</div>
            </div>
            <div className="px-5 py-4 text-sm text-slate-600 space-y-3">
              <p>This policy is the single source for the following LMS training. Publishing rolls each linked course to the new version and re-assigns completed staff to re-acknowledge (their prior certificate is preserved).</p>
              <ul className="rounded-xl bg-slate-50 ring-1 ring-slate-200/70 divide-y divide-slate-100">
                {linkedCourses.map((c) => (
                  <li key={c.id} className="flex items-center justify-between px-3.5 py-2.5">
                    <span className="flex items-center gap-2 text-navy-800 font-medium"><GraduationCap size={14} className="text-brand-500" /> {c.title}</span>
                    <span className="text-[11px] text-slate-500">{c.assigned} assigned</span>
                  </li>
                ))}
              </ul>
              <p className="text-[12px] text-slate-400">{impact.data?.linked_assigned ?? 0} staff assignment(s) will be moved to the new version.</p>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/60">
              <Button variant="ghost" size="sm" onClick={() => setPublishConfirm(false)}>Cancel</Button>
              <Button size="sm" onClick={() => publish.mutate()} disabled={publish.isPending}>
                {publish.isPending ? <><Loader2 size={14} className="animate-spin" /> Publishing…</> : <><Rocket size={14} /> Publish &amp; update training</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ReconcileModal({ docId, actor, onClose, onApplied }: { docId: number; actor: string; onClose: () => void; onApplied: () => void }) {
  const [merged, setMerged] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['cafe-reconcile', docId], queryFn: () => api<ReconcileData>(`/api/cafe/documents/${docId}/reconcile`) });
  const d = q.data;
  const apply = useMutation({
    mutationFn: () => api(`/api/cafe/documents/${docId}/reconcile`, { method: 'POST', body: { actor, content_html: merged ?? d?.proposed_html ?? '' } }),
    onSuccess: onApplied,
  });

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-navy-950/40 backdrop-blur-sm">
      <div className="m-auto w-[min(1180px,96vw)] h-[90vh] rounded-2xl bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="h-14 shrink-0 border-b border-slate-200 flex items-center gap-3 px-5">
          <span className="h-8 w-8 rounded-lg bg-brand-50 ring-1 ring-brand-100 flex items-center justify-center"><GitMerge size={16} className="text-brand-600" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-navy-900">Reconcile TCS update</div>
            <div className="text-[11px] text-slate-400">
              {d ? <>Folding TCS v{d.source_version} → v{d.source_current_version} into your facility version</> : 'Preparing comparison…'}
              {d && (d.used_ai
                ? <span className="ml-2 inline-flex items-center gap-1 text-brand-600 font-medium"><Sparkles size={11} /> AI-assisted merge</span>
                : <span className="ml-2 inline-flex items-center gap-1 text-slate-400 font-medium"><Sparkles size={11} /> Structured merge</span>)}
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500"><X size={18} /></button>
        </div>

        {/* body: three panes */}
        {q.isLoading || !d ? (
          <div className="flex-1 flex items-center justify-center text-slate-400 text-sm"><Loader2 size={18} className="animate-spin mr-2" /> Analyzing changes…</div>
        ) : (
          <div className="flex-1 grid grid-cols-3 min-h-0 divide-x divide-slate-200">
            {/* what TCS changed */}
            <div className="flex flex-col min-h-0">
              <PaneHead icon={<ArrowUpCircle size={13} className="text-amber-500" />} title="What TCS changed" sub={`v${d.source_current_version} of the source`} />
              <div className="flex-1 overflow-y-auto p-4">
                <div className="rounded-xl bg-amber-50/60 ring-1 ring-amber-100 p-3 text-[12.5px] text-amber-900 cafe-doc" dangerouslySetInnerHTML={{ __html: d.summary_html }} />
                <details className="mt-3 text-xs text-slate-400"><summary className="cursor-pointer hover:text-slate-600">View full TCS v{d.source_current_version}</summary>
                  <div className="mt-2 cafe-doc text-[12px] text-slate-600" dangerouslySetInnerHTML={{ __html: d.tcs_new_html }} /></details>
              </div>
            </div>
            {/* your current */}
            <div className="flex flex-col min-h-0">
              <PaneHead icon={<Lock size={13} className="text-slate-400" />} title="Your current policy" sub="Your edits preserved" />
              <div className="flex-1 overflow-y-auto p-4">
                <div className="cafe-doc text-[12.5px] text-slate-700" dangerouslySetInnerHTML={{ __html: d.current_html }} />
              </div>
            </div>
            {/* proposed merge — editable */}
            <div className="flex flex-col min-h-0 bg-brand-50/20">
              <PaneHead icon={<Sparkles size={13} className="text-brand-600" />} title="Proposed merge" sub={d.used_ai ? 'AI draft — review before accepting' : 'Auto-merged — review before accepting'} accent />
              <div className="flex-1 overflow-y-auto p-3">
                <RichTextEditor initialHtml={merged ?? d.proposed_html} editable bare onChange={(h) => setMerged(h)} />
              </div>
            </div>
          </div>
        )}

        {/* footer */}
        <div className="h-16 shrink-0 border-t border-slate-200 flex items-center justify-between px-5 bg-slate-50/60">
          <div className="text-[11px] text-slate-400 max-w-md">Accepting creates a <strong>draft</strong> — it still goes through submit → peer approval → publish. Nothing is overwritten automatically.</div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending || q.isLoading}>
              {apply.isPending ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Check size={14} /> Accept as draft</>}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PaneHead({ icon, title, sub, accent }: { icon: React.ReactNode; title: string; sub: string; accent?: boolean }) {
  return (
    <div className={`shrink-0 px-4 py-2.5 border-b ${accent ? 'border-brand-100 bg-brand-50/40' : 'border-slate-100'}`}>
      <div className="flex items-center gap-1.5 text-[12px] font-semibold text-navy-800">{icon} {title}</div>
      <div className="text-[10.5px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function SaveIndicator({ state, canEdit }: { state: string; canEdit: boolean }) {
  if (!canEdit) return null;
  if (state === 'saving') return <span className="flex items-center gap-1 text-slate-400">· <Loader2 size={11} className="animate-spin" /> Saving…</span>;
  if (state === 'saved') return <span className="flex items-center gap-1 text-accent-emerald">· <Check size={11} /> Saved</span>;
  if (state === 'dirty') return <span className="text-amber-500">· Unsaved changes</span>;
  return null;
}

function Banner({ tone, icon, children }: { tone: 'amber' | 'rose' | 'emerald' | 'brand'; icon: React.ReactNode; children: React.ReactNode }) {
  const map = { amber: 'bg-amber-50 ring-amber-100 text-amber-800', rose: 'bg-rose-50 ring-rose-100 text-rose-700', emerald: 'bg-emerald-50 ring-emerald-100 text-emerald-800', brand: 'bg-brand-50 ring-brand-100 text-brand-800' };
  return <div className={`flex items-start gap-2 rounded-xl ring-1 px-3.5 py-2.5 mb-3 text-[12.5px] ${map[tone]}`}>{icon}<div className="flex-1">{children}</div></div>;
}

function WorkflowActions({ doc, isSubmitter, canEdit, saving, onSave, onSubmit, onWithdraw, onApprove, onReject, onPublish }: {
  doc: Doc | undefined; isSubmitter: boolean; canEdit: boolean; saving: boolean;
  onSave: () => void; onSubmit: () => void; onWithdraw: () => void; onApprove: () => void; onReject: () => void; onPublish: () => void;
}) {
  if (!doc || doc.owner_type === 'tcs') return null;
  const s = doc.status;
  if (s === 'draft') return (
    <>
      <Button variant="outline" size="sm" onClick={onSave} disabled={saving}><Save size={14} /> Save</Button>
      <Button size="sm" onClick={onSubmit}><Send size={14} /> Submit for review</Button>
    </>
  );
  if (s === 'in_review') return isSubmitter
    ? <Button variant="outline" size="sm" onClick={onWithdraw}><Undo2 size={14} /> Withdraw</Button>
    : <><Button variant="outline" size="sm" onClick={onReject}><XCircle size={14} /> Send back</Button><Button size="sm" onClick={onApprove}><CheckCircle2 size={14} /> Approve</Button></>;
  if (s === 'approved') return <Button size="sm" onClick={onPublish}><Rocket size={14} /> Publish</Button>;
  if (s === 'published' && canEdit) return <Button variant="outline" size="sm" onClick={onSave} disabled={saving}><Save size={14} /> Save new draft</Button>;
  return null;
}

// ---- inspector panels ---------------------------------------------------------
function DetailsPanel({ docId, doc, actor, canEdit, onChanged }: { docId: number; doc: Doc; actor: string; canEdit: boolean; onChanged: () => void }) {
  const [category, setCategory] = useState(doc.category ?? '');
  const [tags, setTags] = useState((doc.tags ?? []).join(', '));
  const [eff, setEff] = useState(doc.effective_date ?? '');
  const save = useMutation({
    mutationFn: () => api(`/api/cafe/documents/${docId}`, { method: 'PATCH', body: { actor, category, tags: tags.split(',').map((t) => t.trim()).filter(Boolean), effective_date: eff || null } }),
    onSuccess: onChanged,
  });
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</div>{children}</div>
  );
  return (
    <div className="space-y-4">
      <Field label="Category"><input value={category} disabled={!canEdit} onChange={(e) => setCategory(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-50" /></Field>
      <Field label="Tags"><input value={tags} disabled={!canEdit} onChange={(e) => setTags(e.target.value)} placeholder="comma separated" className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-50" /></Field>
      <Field label="Effective date"><input type="date" value={eff} disabled={!canEdit} onChange={(e) => setEff(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-50" /></Field>
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Field label="Author"><div className="text-sm text-navy-800">{doc.author || '—'}</div></Field>
        <Field label="Version"><div className="text-sm text-navy-800">{doc.is_live ? `v${doc.current_version} live` : 'Unpublished'}</div></Field>
      </div>
      {doc.review && (
        <Field label="Last review"><div className="text-sm text-navy-800 capitalize">{doc.review.status}{doc.review.reviewer ? ` · ${doc.review.reviewer}` : ''}</div></Field>
      )}
      {canEdit && <Button full size="sm" variant="outline" onClick={() => save.mutate()} disabled={save.isPending}><Save size={13} /> Save properties</Button>}
    </div>
  );
}

function VersionsPanel({ docId, actor }: { docId: number; actor: string }) {
  const q = useQuery({ queryKey: ['cafe-versions', docId], queryFn: () => api<Version[]>(`/api/cafe/documents/${docId}/versions`) });
  const [asOf, setAsOf] = useState('');
  const rows = q.data ?? [];
  if (q.isLoading) return <div className="h-40 rounded-lg bg-slate-100 animate-pulse" />;
  if (!rows.length) return <div className="text-center text-sm text-slate-400 py-8">No published versions yet.</div>;

  // point-in-time: the latest version whose effective date is on/before the chosen date
  const effective = asOf
    ? rows.find((v) => (v.created_at ?? '').slice(0, 10) <= asOf) ?? null
    : null;

  return (
    <div>
      {/* surveyor point-in-time lookup (folds the old Archive in) */}
      <div className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3 mb-4">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><History size={12} /> Policy in effect on…</div>
        <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
        {asOf && (
          <div className="mt-2 text-[12px]">
            {effective
              ? <span className="text-navy-800">On <strong>{asOf}</strong>, <strong className="text-brand-700">v{effective.version}</strong> was in effect.
                  <a href={apiUrl(`/api/cafe/documents/${docId}/download?version=${effective.version}&actor=${encodeURIComponent(actor)}`)} target="_blank" rel="noreferrer" className="ml-1 text-brand-600 hover:underline">Export PDF</a></span>
              : <span className="text-slate-400">No version was published yet on that date.</span>}
          </div>
        )}
      </div>

      <ol className="relative border-l border-slate-200 ml-1 space-y-3">
        {rows.map((v) => {
          const isEff = effective?.version === v.version;
          return (
            <li key={v.version} className="ml-4">
              <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${isEff ? 'bg-brand-500' : v.is_current ? 'bg-accent-emerald' : 'bg-slate-300'}`} />
              <div className={`flex items-center gap-2 ${isEff ? 'rounded-lg -ml-2 px-2 py-1 bg-brand-50 ring-1 ring-brand-200' : ''}`}>
                <span className="text-sm font-semibold text-navy-800">v{v.version}</span>
                {v.is_current && <Badge tone="emerald">current</Badge>}
                {isEff && <Badge tone="brand">in effect</Badge>}
                <a href={apiUrl(`/api/cafe/documents/${docId}/download?version=${v.version}&actor=${encodeURIComponent(actor)}`)} target="_blank" rel="noreferrer"
                  className="ml-auto text-xs text-brand-600 hover:underline inline-flex items-center gap-1"><Download size={12} /> PDF</a>
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5">{v.note}</div>
              <div className="text-[11px] text-slate-400">{v.created_by} · {v.created_at?.slice(0, 10)}</div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ActivityPanel({ docId, onChanged, onDeleted }: { docId: number; onChanged: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const metrics = useQuery({ queryKey: ['cafe-metrics', docId], queryFn: () => api<{ views: number; downloads: number; unique_viewers: number }>(`/api/cafe/documents/${docId}/metrics`) });
  const training = useQuery({ queryKey: ['cafe-training', docId], queryFn: () => api<{ assigned: number; completed: number; outstanding: number; deletable: boolean; removable_training: boolean }>(`/api/cafe/documents/${docId}/training`) });
  const audit = useQuery({ queryKey: ['cafe-audit', docId], queryFn: () => api<{ actor: string; action: string; details: string | null; created_at: string | null }[]>(`/api/cafe/documents/${docId}/audit`) });
  const m = metrics.data; const t = training.data; const log = audit.data ?? [];
  const after = () => { qc.invalidateQueries({ queryKey: ['cafe-training', docId] }); onChanged(); };
  const unlink = useMutation({ mutationFn: () => api(`/api/cafe/documents/${docId}/unlink-training`, { method: 'POST', body: {} }), onSuccess: after });
  const del = useMutation({ mutationFn: () => api(`/api/cafe/documents/${docId}`, { method: 'DELETE' }), onSuccess: onDeleted });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <Mini icon={<Eye size={14} />} label="Views" value={m?.views ?? 0} />
        <Mini icon={<Download size={14} />} label="Downloads" value={m?.downloads ?? 0} />
        <Mini icon={<GraduationCap size={14} />} label="Trained" value={`${t?.completed ?? 0}/${t?.assigned ?? 0}`} />
      </div>

      <div className="rounded-xl border border-slate-200 p-3">
        <div className="text-[12px] font-semibold text-navy-800 mb-1 flex items-center gap-1.5"><GraduationCap size={13} className="text-brand-500" /> Training</div>
        {t && t.assigned > 0
          ? <p className="text-[12px] text-slate-500">{t.assigned} assigned · {t.completed} completed · {t.outstanding} outstanding.</p>
          : <p className="text-[12px] text-slate-400">No training generated yet.</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {t && !t.deletable && <span className="inline-flex items-center gap-1 text-[11px] text-accent-rose"><Lock size={12} /> Completions — delete locked</span>}
          {t && t.removable_training && <Button size="sm" variant="outline" onClick={() => unlink.mutate()}>Remove training</Button>}
          <Button size="sm" variant="danger" disabled={!t?.deletable || (t?.assigned ?? 0) > 0 || del.isPending} onClick={() => del.mutate()}>
            {t?.deletable && (t?.assigned ?? 0) === 0 ? <><Trash2 size={12} /> Delete</> : <><Lock size={12} /> Locked</>}
          </Button>
        </div>
      </div>

      <div>
        <div className="text-[12px] font-semibold text-navy-800 mb-1.5 flex items-center gap-1.5"><ShieldCheck size={13} className="text-brand-500" /> Audit trail</div>
        {log.length === 0 ? <p className="text-[12px] text-slate-400">No activity yet.</p> : (
          <ol className="relative border-l border-slate-200 ml-1 space-y-2.5">
            {log.map((e, i) => (
              <li key={i} className="ml-3.5">
                <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-brand-400 ring-2 ring-white" />
                <div className="text-[12px] text-navy-800"><strong className="capitalize">{e.action.replace(/_/g, ' ')}</strong> · {e.actor}</div>
                {e.details && <div className="text-[11px] text-slate-500">{e.details}</div>}
                <div className="text-[10px] text-slate-400">{e.created_at?.replace('T', ' ').slice(0, 16)}</div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 px-2.5 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-slate-400 text-[10px] uppercase tracking-wide font-semibold">{icon}</div>
      <div className="text-base font-bold text-navy-800 mt-0.5">{value}</div>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  );
}
