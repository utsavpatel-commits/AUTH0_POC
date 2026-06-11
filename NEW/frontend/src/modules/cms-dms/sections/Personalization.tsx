import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Sparkles, Eye, EyeOff, Globe2, FileText, Newspaper } from 'lucide-react';
import { Badge, SimpleDropdown } from '../../../components/ui';
import { getDocuments, getMarketingPages, getNewsArticles } from '../../../services/contentful/contentfulService';

const STATES = [{ value: 'AZ', label: 'Arizona' }, { value: 'TX', label: 'Texas' }, { value: 'CA', label: 'California' }];
const PERSONAS = [{ value: 'Administrator', label: 'Administrator' }, { value: 'DON', label: 'Director of Nursing' }, { value: 'Nurse', label: 'Nurse' }];

function visible(item: { state?: string; audience?: string }, state: string, persona: string) {
  const s = (item.state || '').toUpperCase();
  const a = (item.audience || '').toLowerCase();
  return (!s || s === state) && (!a || a === persona.toLowerCase());
}

export function Personalization() {
  const docsQ = useQuery({ queryKey: ['cms-docs'], queryFn: getDocuments });
  const pagesQ = useQuery({ queryKey: ['cms-pages'], queryFn: getMarketingPages });
  const newsQ = useQuery({ queryKey: ['cms-news'], queryFn: getNewsArticles });
  const [state, setState] = useState('AZ');
  const [persona, setPersona] = useState('DON');

  const groups = useMemo(() => ([
    { key: 'pages', label: 'Marketing pages', icon: Globe2, items: (pagesQ.data ?? []).map((p) => ({ id: p.id, title: p.title, state: p.state, audience: p.audience })) },
    { key: 'docs', label: 'Documents', icon: FileText, items: (docsQ.data ?? []).map((d) => ({ id: d.id, title: d.title, state: d.state, audience: d.audience })) },
    { key: 'news', label: 'News', icon: Newspaper, items: (newsQ.data ?? []).map((nws) => ({ id: nws.id, title: nws.title, state: nws.state, audience: nws.audience })) },
  ]), [docsQ.data, pagesQ.data, newsQ.data]);

  const personaLabel = PERSONAS.find((p) => p.value === persona)?.label ?? persona;
  const stateLabel = STATES.find((s) => s.value === state)?.label ?? state;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 mr-auto">
            <span className="h-8 w-8 rounded-lg bg-brand-50 ring-1 ring-brand-100 flex items-center justify-center"><Sparkles size={16} className="text-brand-600" /></span>
            <div>
              <h3 className="text-sm font-semibold text-navy-800">Entitlement-driven visibility</h3>
              <p className="text-[12px] text-slate-500">Contentful stores state &amp; audience metadata; Web 3.0 decides who sees what.</p>
            </div>
          </div>
          <label className="text-[12px] font-medium text-slate-500">State
            <div className="mt-1"><SimpleDropdown value={state} onChange={setState} items={STATES} width="min-w-[9rem]" /></div>
          </label>
          <label className="text-[12px] font-medium text-slate-500">Persona
            <div className="mt-1"><SimpleDropdown value={persona} onChange={setPersona} items={PERSONAS} width="min-w-[11rem]" /></div>
          </label>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Showing what a <strong className="text-navy-800">{personaLabel}</strong> in <strong className="text-navy-800">{stateLabel}</strong> is entitled to see. Items tagged for another state or audience are withheld by the platform — the CMS itself applies no permissions.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        {groups.map((g) => {
          const Icon = g.icon;
          const shown = g.items.filter((i) => visible(i, state, persona));
          const hidden = g.items.filter((i) => !visible(i, state, persona));
          return (
            <section key={g.key} className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-navy-800 flex items-center gap-2"><Icon size={15} className="text-brand-600" /> {g.label}</h3>
                <Badge tone="brand">{shown.length}/{g.items.length} visible</Badge>
              </div>
              <div className="p-3 space-y-2">
                {shown.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-lg bg-emerald-50/60 ring-1 ring-emerald-100 px-3 py-2 text-sm text-navy-800">
                    <Eye size={14} className="text-accent-emerald shrink-0" /> <span className="truncate">{i.title}</span>
                  </div>
                ))}
                {hidden.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-sm text-slate-400">
                    <EyeOff size={14} className="shrink-0" /> <span className="truncate line-through">{i.title}</span>
                    <span className="ml-auto text-[10.5px] uppercase tracking-wide">{i.state && i.state.toUpperCase() !== state ? i.state : i.audience}</span>
                  </div>
                ))}
                {!g.items.length && <div className="px-2 py-6 text-center text-sm text-slate-400">No content.</div>}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
