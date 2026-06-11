import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Newspaper, Blocks } from 'lucide-react';
import { getNewsArticles } from '../services/contentful/contentfulService';

export function MarketingNews() {
  const q = useQuery({ queryKey: ['mkt-news-all'], queryFn: getNewsArticles });
  const items = q.data ?? [];
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = items.find((a) => a.id === activeId) ?? items[0];

  return (
    <div>
      <section className="bg-navy-gradient text-white">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <Link to="/" className="inline-flex items-center gap-1 text-[13px] text-white/70 hover:text-white"><ArrowLeft size={14} /> Home</Link>
          <h1 className="mt-4 text-4xl font-bold tracking-tight flex items-center gap-3"><Newspaper size={28} className="text-brand-200" /> What's new</h1>
          <p className="mt-3 text-white/75 max-w-2xl">Regulatory updates and product news — authored in Contentful and published to every surface, with audience &amp; state metadata that controls who sees what.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 grid gap-8 lg:grid-cols-[360px_1fr]">
        <div className="space-y-3">
          {items.map((a) => {
            const on = active?.id === a.id;
            return (
              <button key={a.id} onClick={() => setActiveId(a.id)}
                className={`w-full text-left rounded-2xl p-4 ring-1 transition-all ${on ? 'bg-brand-50 ring-brand-200' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}>
                <span className="inline-flex items-center rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-[11px] font-semibold">{a.tag}</span>
                <h3 className={`mt-2 text-[15px] font-semibold ${on ? 'text-brand-800' : 'text-navy-900'}`}>{a.title}</h3>
                <div className="mt-1 text-[12px] text-slate-400">{a.publishDate}{a.state ? ` · ${a.state}` : ''}{a.audience ? ` · ${a.audience}` : ''}</div>
              </button>
            );
          })}
        </div>

        {active && (
          <article className="rounded-2xl bg-white ring-1 ring-slate-200 p-7 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 px-2.5 py-0.5 text-[11px] font-semibold">{active.tag}</span>
              <span className="text-[12px] text-slate-400">{active.publishDate}</span>
              {active.state && <span className="text-[12px] text-slate-400">· Targeted to {active.state}</span>}
              {active.audience && <span className="text-[12px] text-slate-400">· {active.audience}</span>}
            </div>
            <h2 className="mt-3 text-2xl font-bold text-navy-900 tracking-tight">{active.title}</h2>
            <p className="mt-2 text-slate-600">{active.summary}</p>
            <div className="mt-5 prose-body text-[15px] leading-7 text-slate-700" dangerouslySetInnerHTML={{ __html: active.bodyHtml }} />
            <div className="mt-6 flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3.5 py-2.5 text-[12.5px] text-slate-500">
              <Blocks size={14} className="text-brand-600" /> Authored in Contentful · delivered with audience &amp; state metadata
            </div>
          </article>
        )}
      </section>
    </div>
  );
}
