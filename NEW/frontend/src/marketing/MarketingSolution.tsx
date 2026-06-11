import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, ArrowLeft, ClipboardCheck, GraduationCap, FolderOpen, Sparkles, ShieldCheck, Blocks, type LucideIcon,
} from 'lucide-react';
import { getMarketingPage, type MarketingPageContent } from '../services/contentful/contentfulService';

const ICONS: Record<string, LucideIcon> = { sparkles: Sparkles, clipboard: ClipboardCheck, graduation: GraduationCap, folder: FolderOpen };

export function MarketingSolution() {
  const { slug = '' } = useParams();
  const q = useQuery({ queryKey: ['mkt-page', slug], queryFn: () => getMarketingPage(slug) });
  const page = q.data;

  if (q.isLoading) return <div className="mx-auto max-w-6xl px-5 py-24 text-center text-slate-400">Loading…</div>;
  if (!page) return (
    <div className="mx-auto max-w-6xl px-5 py-24 text-center">
      <p className="text-slate-500">Page not found.</p>
      <Link to="/" className="mt-3 inline-flex items-center gap-1 text-brand-700 font-medium"><ArrowLeft size={14} /> Back home</Link>
    </div>
  );

  const Icon = ICONS[page.icon] ?? ShieldCheck;
  return (
    <div>
      <section className="relative overflow-hidden bg-navy-gradient text-white">
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900/95 to-brand-700/70" />
        <div className="relative mx-auto max-w-6xl px-5 py-16 lg:py-20">
          <Link to="/" className="inline-flex items-center gap-1 text-[13px] text-white/70 hover:text-white"><ArrowLeft size={14} /> All solutions</Link>
          <div className="mt-5 flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15"><Icon size={22} className="text-brand-200" /></span>
            <span className="text-[12.5px] font-medium text-brand-100">{page.eyebrow}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-4xl lg:text-5xl font-bold leading-[1.1] tracking-tight">{page.heroTitle}</h1>
          <p className="mt-4 max-w-2xl text-[17px] leading-relaxed text-white/75">{page.heroDescription}</p>
          {page.ctaText && (
            <Link to={page.ctaLink || '/login'} className="mt-7 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-600">
              {page.ctaText} <ArrowRight size={16} />
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div>
          <div className="prose-body text-[15px] leading-7 text-slate-700" dangerouslySetInnerHTML={{ __html: page.bodyHtml }} />
          {page.highlights.length > 0 && (
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {page.highlights.map((h) => (
                <div key={h} className="flex items-start gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-4 py-3">
                  <ShieldCheck size={16} className="text-accent-emerald mt-0.5 shrink-0" />
                  <span className="text-sm text-navy-800">{h}</span>
                </div>
              ))}
            </div>
          )}
          {page.metrics.length > 0 && (
            <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 gap-4">
              {page.metrics.map((m) => (
                <div key={m.label} className="rounded-xl bg-white ring-1 ring-slate-200 p-4 shadow-sm">
                  <div className="text-2xl font-bold text-navy-900">{m.value}</div>
                  <div className="text-[12px] text-slate-500 mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-navy-800"><Blocks size={16} className="text-brand-600" /> Page metadata</div>
            <dl className="mt-3 space-y-2.5 text-sm">
              <Meta label="Slug" value={`/${page.slug}`} />
              <Meta label="Audience" value={page.audience || 'All'} />
              <Meta label="State" value={page.state || 'All'} />
              <Meta label="Source" value="Contentful (headless CMS)" />
            </dl>
            <p className="mt-3 text-[11.5px] leading-snug text-slate-400">This page is authored in Contentful. Metadata (audience, state) drives where and to whom it renders across the platform.</p>
          </div>
          <Link to={page.ctaLink || '/login'} className="block rounded-2xl bg-brand-50 ring-1 ring-brand-100 p-5 hover:bg-brand-100/60 transition-colors">
            <div className="text-sm font-semibold text-brand-800">Ready to see it on your content?</div>
            <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-brand-700">Open the Customer Portal <ArrowRight size={14} /></span>
          </Link>
        </aside>
      </section>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><dt className="text-slate-500">{label}</dt><dd className="font-medium text-navy-800 text-right">{value}</dd></div>;
}
