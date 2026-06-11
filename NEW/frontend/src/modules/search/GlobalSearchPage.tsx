import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, FileText, Library, SlidersHorizontal, Info } from 'lucide-react';
import { api } from '../../lib/api';
import { usePersona } from '../../lib/persona';
import { PageHeader, Card, Badge, Empty } from '../../components/ui';

// Unified result shape across document sources. The production engine (built by
// another team) will replace these queries; this page is the UX contract — note the
// source filters. Search covers DOCUMENTS only — facility-published + TCS library
// (LMS courses are intentionally out of scope).
type Source = 'cafe' | 'tcs';
interface Result { key: string; title: string; category: string | null; source: Source; tags: string[]; meta?: string }

interface CafeResult { id: number; title: string; category: string | null; origin: string; owner_type: string; tags?: string[] }

const SOURCE_META: Record<Source, { label: string; icon: typeof FileText; tone: 'brand' | 'navy' }> = {
  cafe: { label: 'Facility document', icon: FileText, tone: 'brand' },
  tcs: { label: 'TCS Library', icon: Library, tone: 'navy' },
};

export function GlobalSearchPage() {
  const { facilityId } = usePersona();
  const [q, setQ] = useState('');
  const [on, setOn] = useState<Record<Source, boolean>>({ cafe: true, tcs: true });
  const [cat, setCat] = useState<string | null>(null);

  const enabled = q.trim().length > 1 && facilityId != null;
  const cafe = useQuery({
    queryKey: ['gsearch-cafe', facilityId, q],
    queryFn: () => api<{ results: CafeResult[] }>(`/api/cafe/search?facility_id=${facilityId}&q=${encodeURIComponent(q)}`),
    enabled,
  });

  const results: Result[] = useMemo(() => {
    const out: Result[] = [];
    for (const r of cafe.data?.results ?? []) {
      // Only published documents surface in search: facility-published + TCS library.
      const src: Source = r.owner_type === 'tcs' ? 'tcs' : 'cafe';
      out.push({ key: `${src}-${r.id}`, title: r.title, category: r.category, source: src, tags: r.tags ?? [], meta: r.origin });
    }
    return out;
  }, [cafe.data]);

  const visible = results.filter((r) => on[r.source] && (!cat || r.category === cat));
  const categories = Array.from(new Set(results.map((r) => r.category).filter(Boolean))) as string[];
  const counts = (s: Source) => results.filter((r) => r.source === s).length;

  return (
    <div>
      <PageHeader title="Search" subtitle="One search across your facility-published documents and the TCS library — permission-scoped." />

      <div className="rounded-lg bg-amber-50 ring-1 ring-amber-100 text-amber-800 text-[12px] px-3 py-2 mb-4 inline-flex items-center gap-2">
        <Info size={14} /> UX preview — the production search engine is being built by the platform team. Filters and result shape are the contract.
      </div>

      <Card padded>
        <div className="relative">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Search policies, procedures, and training…"
            className="w-full rounded-lg border border-slate-300 pl-10 pr-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
        </div>

        {/* source filters */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide text-slate-400 font-semibold mr-1"><SlidersHorizontal size={13} /> Sources</span>
          {(Object.keys(SOURCE_META) as Source[]).map((s) => {
            const M = SOURCE_META[s]; const Icon = M.icon;
            return (
              <button key={s} onClick={() => setOn((o) => ({ ...o, [s]: !o[s] }))}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${on[s] ? 'border-transparent bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                <Icon size={13} /> {M.label}{enabled ? ` · ${counts(s)}` : ''}
              </button>
            );
          })}
        </div>

        {/* category facets */}
        {enabled && categories.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            <span className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mr-1">Category</span>
            <button onClick={() => setCat(null)} className={`rounded-full px-2.5 py-0.5 text-[11px] ${!cat ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>All</button>
            {categories.map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`rounded-full px-2.5 py-0.5 text-[11px] ${cat === c ? 'bg-navy-700 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{c}</button>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-4">
        {!enabled ? (
          <Empty>Type at least 2 characters to search.</Empty>
        ) : visible.length === 0 ? (
          <Empty>No matches{cat ? ` in ${cat}` : ''} for “{q}”.</Empty>
        ) : (
          <Card padded>
            <div className="text-xs text-slate-400 mb-2">{visible.length} result{visible.length !== 1 ? 's' : ''}</div>
            <div className="divide-y divide-slate-100">
              {visible.map((r) => {
                const M = SOURCE_META[r.source]; const Icon = M.icon;
                return (
                  <div key={r.key} className="flex items-center gap-3 py-3">
                    <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${r.source === 'tcs' ? 'bg-navy-50 text-navy-600' : 'bg-brand-50 text-brand-600'}`}><Icon size={16} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-navy-800 truncate">{r.title}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                        {r.category && <span>{r.category}</span>}
                        {r.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-slate-100 text-slate-500 px-1.5 py-0.5 text-[10px] capitalize">{t.replace(/_/g, ' ')}</span>)}
                      </div>
                    </div>
                    <Badge tone={M.tone}>{M.label}</Badge>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
