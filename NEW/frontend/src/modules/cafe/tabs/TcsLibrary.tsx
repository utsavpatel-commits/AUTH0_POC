import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  FileText, Copy, Search, ChevronRight, ChevronLeft, Send, BellRing, X, Plus, Library, FileStack,
} from 'lucide-react';
import { api } from '../../../lib/api';
import { usePersona, isTcs } from '../../../lib/persona';
import { Badge, Button, Modal, Dropdown, DItem, DHeader, SimpleDropdown, type DropdownItem } from '../../../components/ui';
import { Th, fmtDateTime, type SortState } from '../table';

interface TaxGroup { group: string; count: number; categories: { name: string; count: number }[] }
interface Taxonomy { total: number; groups: TaxGroup[] }
interface LibDoc { id: number; title: string; group: string | null; category: string | null; current_version: number; updated_at: string | null; customized: boolean }
interface LibResp { total: number; page: number; page_size: number; items: LibDoc[] }
interface FeedItem { id: number; title: string; group: string | null; category: string | null; published_at: string | null; subscribed: boolean; customized: boolean }
interface Feed { subscribed_categories: string[]; items: FeedItem[] }

const GROUP_TONE: Record<string, string> = {
  'Policies & Procedures': 'text-brand-700 bg-brand-50 ring-brand-200',
  'Tools & Templates': 'text-violet-700 bg-violet-50 ring-violet-200',
};
const PAGE = 14;

export function TcsLibrary({ facilityId, orgId, readOnly = false }: { facilityId: number; orgId: number | null; readOnly?: boolean }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { role } = usePersona();
  const tcs = isTcs(role);
  const [view, setView] = useState<'browse' | 'new'>('browse');
  const [banner, setBanner] = useState<string | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);

  const tax = useQuery({ queryKey: ['cafe-tcs-taxonomy'], queryFn: () => api<Taxonomy>('/api/cafe/tcs/taxonomy') });

  const customize = useMutation({
    mutationFn: (id: number) => api<{ id: number }>(`/api/cafe/documents/${id}/customize?facility_id=${facilityId}${orgId != null ? `&org_id=${orgId}` : ''}`, { method: 'POST' }),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['cafe-docs'] }); nav(`/cafe/d/${r.id}`); },
  });

  return (
    <div>
      {banner && <div className="mb-3 rounded-lg bg-brand-50 ring-1 ring-brand-100 text-brand-800 text-sm px-4 py-2">{banner}</div>}

      {/* branded header band */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-800 to-navy-900 text-white p-5 mb-4 shadow-sm">
        <div className="absolute -right-8 -top-10 h-40 w-40 rounded-full bg-brand-500/20 blur-2xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0"><Library size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold leading-tight">TCS Source Library</h2>
            <p className="text-[12.5px] text-white/60 leading-snug mt-0.5">Regulation-ready policies &amp; templates maintained by The Compliance Store. Customize any item to create a facility-owned policy.</p>
          </div>
          <div className="flex items-center gap-5 shrink-0">
            <HeaderStat icon={FileStack} value={tax.data?.total ?? 0} label="Total documents" />
            {(tax.data?.groups ?? []).map((g) => (
              <HeaderStat key={g.group} icon={Library} value={g.count} label={g.group} />
            ))}
          </div>
        </div>
      </div>

      {/* segmented toggle + subscription chips + publish */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="inline-flex bg-slate-100 rounded-lg p-1">
          {(['browse', 'new'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all ${view === v ? 'bg-white shadow-sm text-navy-900' : 'text-slate-500 hover:text-navy-800'}`}>
              {v === 'browse' ? 'Browse' : 'What’s new'}
            </button>
          ))}
        </div>
        {!readOnly && <SubscriptionBar facilityId={facilityId} taxonomy={tax.data} onSaved={() => qc.invalidateQueries({ queryKey: ['cafe-alerts-feed'] })} />}
        {tcs && <Button onClick={() => setPublishOpen(true)} ><Send size={14} /> Publish</Button>}
      </div>

      <div key={view} className="cafe-slide">
        {view === 'browse'
          ? <BrowseView facilityId={facilityId} taxonomy={tax.data} readOnly={readOnly || tcs} onCustomize={(id) => customize.mutate(id)} />
          : <WhatsNewView facilityId={facilityId} readOnly={readOnly || tcs} onCustomize={(id) => customize.mutate(id)} />}
      </div>

      {publishOpen && <TcsPublishModal taxonomy={tax.data} onClose={() => setPublishOpen(false)}
        onDone={(m) => { setBanner(m); setPublishOpen(false); qc.invalidateQueries({ queryKey: ['cafe-tcs-lib'] }); qc.invalidateQueries({ queryKey: ['cafe-tcs-taxonomy'] }); qc.invalidateQueries({ queryKey: ['cafe-alerts-feed'] }); }} />}
    </div>
  );
}

function HeaderStat({ icon: Icon, value, label }: { icon: typeof Library; value: number; label: string }) {
  return (
    <div className="text-right">
      <div className="flex items-center justify-end gap-1.5"><Icon size={14} className="text-white/40" /><span className="text-2xl font-bold tracking-tight">{value}</span></div>
      <div className="text-[10.5px] text-white/55">{label}</div>
    </div>
  );
}

function BrowseView({ facilityId, taxonomy, readOnly, onCustomize }: { facilityId: number; taxonomy?: Taxonomy; readOnly: boolean; onCustomize: (id: number) => void }) {
  const [group, setGroup] = useState('all');
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<SortState>({ field: 'title', dir: 'asc' });
  const [page, setPage] = useState(1);

  const lib = useQuery({
    queryKey: ['cafe-tcs-lib', facilityId, group, cat, q, sort, page],
    queryFn: () => api<LibResp>(`/api/cafe/tcs/library?facility_id=${facilityId}&page=${page}&page_size=${PAGE}&sort=${sort.field}&dir=${sort.dir}${group !== 'all' ? `&group=${encodeURIComponent(group)}` : ''}${cat !== 'all' ? `&category=${encodeURIComponent(cat)}` : ''}${q ? `&q=${encodeURIComponent(q)}` : ''}`),
  });
  const groups = taxonomy?.groups ?? [];
  const catsForGroup = group === 'all' ? groups.flatMap((g) => g.categories) : (groups.find((g) => g.group === group)?.categories ?? []);
  const data = lib.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const safePage = Math.min(page, totalPages);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <div className="relative flex-1 min-w-56">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search the TCS library…"
            className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>
        <SimpleDropdown value={group} width="min-w-[10rem]" align="right"
          onChange={(v) => { setGroup(v); setCat('all'); setPage(1); }}
          items={[{ value: 'all', label: 'All groups' }, ...groups.map((g) => ({ value: g.group, label: g.group }))]} />
        <SimpleDropdown value={cat} width="min-w-[11rem]" align="right"
          onChange={(v) => { setCat(v); setPage(1); }}
          items={[{ value: 'all', label: 'All categories' }, ...catsForGroup.map((c) => ({ value: c.name, label: `${c.name} (${c.count})` }))]} />
      </div>

      {lib.isLoading ? (
        <div className="space-y-2.5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 rounded-xl bg-white ring-1 ring-slate-200/70 animate-pulse" />)}</div>
      ) : (data?.items ?? []).length === 0 ? (
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 py-16 text-center text-sm text-slate-400">No documents match.</div>
      ) : (
        <>
          <div className="rounded-xl bg-white ring-1 ring-slate-200/70 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                  <Th field="title" sort={sort} onSort={(s) => { setSort(s); setPage(1); }} className="pl-4">Document</Th>
                  <Th field="category" sort={sort} onSort={(s) => { setSort(s); setPage(1); }} className="hidden md:table-cell w-72">Category</Th>
                  <Th field="updated" sort={sort} onSort={(s) => { setSort(s); setPage(1); }} align="right" className="hidden sm:table-cell w-44">Updated</Th>
                  <Th sortable={false} align="right" className="w-32 pr-4">{''}</Th>
                </tr>
              </thead>
              <tbody>
                {data!.items.map((d) => (
                  <tr key={d.id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center shrink-0"><FileText size={14} className="text-white" /></span>
                        <span className="font-medium text-navy-900 truncate">{d.title}</span>
                        {d.customized && <Badge tone="amber">Facility version</Badge>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 hidden md:table-cell">
                      <span className="inline-flex items-center gap-2 min-w-0">
                        <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ring-1 whitespace-nowrap ${GROUP_TONE[d.group ?? ''] ?? 'text-slate-600 bg-slate-100 ring-slate-200'}`}>{d.group}</span>
                        <span className="text-xs text-slate-600 truncate">{d.category}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs text-slate-400 hidden sm:table-cell whitespace-nowrap">{fmtDateTime(d.updated_at)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {!readOnly && (d.customized
                        ? <span className="text-[11px] text-slate-400">In Policies</span>
                        : <Button size="sm" variant="outline" onClick={() => onCustomize(d.id)}><Copy size={13} /> Customize</Button>)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-4">
            <span className="text-xs text-slate-400">{data!.total} document{data!.total !== 1 ? 's' : ''} · page {safePage} of {totalPages}</span>
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
    </div>
  );
}

function WhatsNewView({ facilityId, readOnly, onCustomize }: { facilityId: number; readOnly: boolean; onCustomize: (id: number) => void }) {
  const feed = useQuery({ queryKey: ['cafe-alerts-feed', facilityId], queryFn: () => api<Feed>(`/api/cafe/alerts/feed?facility_id=${facilityId}`) });
  const items = feed.data?.items ?? [];
  if (feed.isLoading) return <div className="space-y-2.5">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-11 rounded-xl bg-white ring-1 ring-slate-200/70 animate-pulse" />)}</div>;
  if (!items.length) return <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 py-16 text-center text-sm text-slate-400">No recent TCS releases.</div>;
  return (
    <div className="rounded-xl bg-white ring-1 ring-slate-200/70 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
            <th className="text-left font-semibold px-4 py-2.5">Document</th>
            <th className="text-left font-semibold px-3 py-2.5 hidden md:table-cell w-72">Category</th>
            <th className="text-right font-semibold px-3 py-2.5 w-44">Published</th>
            <th className="px-4 py-2.5 w-32"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((d) => (
            <tr key={d.id} className="group border-b border-slate-100 last:border-0 hover:bg-slate-50/70 transition-colors">
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-navy-700 to-navy-900 flex items-center justify-center shrink-0"><FileText size={14} className="text-white" /></span>
                  <span className="font-medium text-navy-900 truncate">{d.title}</span>
                  {d.subscribed && <Badge tone="brand">subscribed</Badge>}
                </div>
              </td>
              <td className="px-3 py-2.5 hidden md:table-cell">
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span className={`shrink-0 text-[10px] font-semibold rounded-full px-2 py-0.5 ring-1 whitespace-nowrap ${GROUP_TONE[d.group ?? ''] ?? 'text-slate-600 bg-slate-100 ring-slate-200'}`}>{d.group}</span>
                  <span className="text-xs text-slate-600 truncate">{d.category}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-xs text-slate-400 whitespace-nowrap">{fmtDateTime(d.published_at)}</td>
              <td className="px-4 py-2.5 text-right">
                {!readOnly && (d.customized
                  ? <span className="text-[11px] text-slate-400">In Policies</span>
                  : <Button size="sm" variant="outline" onClick={() => onCustomize(d.id)}><Copy size={13} /> Customize</Button>)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SubscriptionBar({ facilityId, taxonomy, onSaved }: { facilityId: number; taxonomy?: Taxonomy; onSaved: () => void }) {
  const qc = useQueryClient();
  const subs = useQuery({ queryKey: ['cafe-subs', facilityId], queryFn: () => api<{ categories: string[] }>(`/api/cafe/subscriptions?facility_id=${facilityId}`) });
  const current = subs.data?.categories ?? [];
  const save = useMutation({
    mutationFn: (cats: string[]) => api('/api/cafe/subscriptions', { method: 'PUT', body: { facility_id: facilityId, categories: cats } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cafe-subs', facilityId] }); onSaved(); },
  });
  const add = (c: string) => { if (c && !current.includes(c)) save.mutate([...current, c]); };
  const remove = (c: string) => save.mutate(current.filter((x) => x !== c));
  const subscribedSet = new Set(current);

  return (
    <div className="flex items-center gap-1.5 flex-wrap ml-auto">
      <span className="inline-flex items-center gap-1 text-[12px] text-slate-400 font-medium mr-0.5"><BellRing size={13} /> Alerts:</span>
      {current.map((c) => (
        <span key={c} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-200 pl-2.5 pr-1 py-0.5 text-[12px] font-medium">
          {c}
          <button onClick={() => remove(c)} className="h-4 w-4 rounded-full hover:bg-brand-100 flex items-center justify-center"><X size={11} /></button>
        </span>
      ))}
      <Dropdown align="right" label={<span className="inline-flex items-center gap-1 text-[12px] text-slate-500"><Plus size={12} /> Add</span>}>
        {(close) => {
          const sections = (taxonomy?.groups ?? []).map((g) => ({ g, opts: g.categories.filter((c) => !subscribedSet.has(c.name)) })).filter((s) => s.opts.length);
          if (!sections.length) return <div className="px-3 py-2 text-xs text-slate-400">All categories subscribed</div>;
          return sections.map(({ g, opts }) => (
            <div key={g.group}>
              <DHeader>{g.group}</DHeader>
              {opts.map((c) => <DItem key={c.name} onClick={() => { add(c.name); close(); }}>{c.name}</DItem>)}
            </div>
          ));
        }}
      </Dropdown>
    </div>
  );
}

function TcsPublishModal({ taxonomy, onClose, onDone }: { taxonomy?: Taxonomy; onClose: () => void; onDone: (m: string) => void }) {
  const groups = taxonomy?.groups ?? [];
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(groups[0]?.categories[0]?.name ?? '');
  const [note, setNote] = useState('');
  const publish = useMutation({
    mutationFn: () => api<{ facilities_alerted: number; version: number }>('/api/cafe/tcs/publish', { method: 'POST', body: { title, category, note, actor: 'TCS R&D' } }),
    onSuccess: (r) => onDone(`Published — alerted ${r.facilities_alerted} subscribed facility(ies).`),
  });
  return (
    <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><Send size={16} className="text-brand-500" /> Publish TCS guidance</span>}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => publish.mutate()} disabled={!title.trim() || publish.isPending}>Publish & alert</Button></>}>
      <p className="text-xs text-slate-400 mb-3">Notifies every facility subscribed to this category.</p>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 2026 Infection Control Update" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm mb-4" />
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Category</label>
      <div className="mb-4">
        <SimpleDropdown value={category} width="w-full" onChange={setCategory}
          items={groups.flatMap((g): DropdownItem[] => [{ header: g.group }, ...g.categories.map((c) => ({ value: c.name, label: c.name, indent: true }))])} />
      </div>
      <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Release note</label>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed…" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </Modal>
  );
}
