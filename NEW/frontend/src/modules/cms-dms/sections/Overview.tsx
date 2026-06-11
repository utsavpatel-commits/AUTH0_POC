import { useQuery } from '@tanstack/react-query';
import {
  Blocks, Globe2, Library, FileText, GraduationCap, ArrowRight, ExternalLink, ShieldCheck,
  Boxes, FileStack, Users, type LucideIcon,
} from 'lucide-react';
import { hasContentfulConfig } from '../../../services/contentful/contentfulClient';
import { getDocuments, getCustomerDocuments, getMarketingPages, getNewsArticles } from '../../../services/contentful/contentfulService';

const SURFACES: { icon: LucideIcon; label: string; note: string }[] = [
  { icon: Globe2, label: 'Marketing site', note: 'Public pages & news' },
  { icon: Library, label: 'Document Library', note: 'Policies, procedures, assets' },
  { icon: FileText, label: 'Customer Café', note: 'Facility-owned documents' },
  { icon: GraduationCap, label: 'LMS training', note: 'Policy-sourced courses' },
];

export function Overview({ onNavigate }: { onNavigate: (k: string) => void }) {
  const docs = useQuery({ queryKey: ['cms-docs'], queryFn: getDocuments });
  const cust = useQuery({ queryKey: ['cms-cust'], queryFn: getCustomerDocuments });
  const pages = useQuery({ queryKey: ['cms-pages'], queryFn: getMarketingPages });
  const news = useQuery({ queryKey: ['cms-news'], queryFn: getNewsArticles });

  const stats = [
    { label: 'Marketing pages', value: pages.data?.length ?? '—', icon: Globe2 },
    { label: 'Documents', value: docs.data?.length ?? '—', icon: FileStack },
    { label: 'Customer documents', value: cust.data?.length ?? '—', icon: Users },
    { label: 'News articles', value: news.data?.length ?? '—', icon: Boxes },
  ];

  return (
    <div className="space-y-6">
      {/* hero */}
      <section className="relative overflow-hidden rounded-2xl bg-navy-gradient text-white p-6 sm:p-8 shadow-sm">
        <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-[12px] font-medium backdrop-blur">
            <Blocks size={14} className="text-brand-200" /> Headless content architecture
          </span>
          <h2 className="mt-4 max-w-2xl text-2xl sm:text-3xl font-bold tracking-tight">One headless CMS. Every surface, always current.</h2>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-white/75">
            Authors create content once in Contentful. Web 3.0 delivers it — with identity, entitlements, search and AI applied — to the public
            marketing site and to every in-platform workspace. No duplicate copies, no version drift.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a href="/" target="_blank" rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-brand-600">
              View the public marketing site <ExternalLink size={15} />
            </a>
            <button onClick={() => onNavigate('library')}
              className="inline-flex items-center gap-2 rounded-lg bg-white/10 ring-1 ring-white/20 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/15">
              Browse the document library <ArrowRight size={15} />
            </button>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-4 flex items-center gap-3.5">
              <span className="h-11 w-11 rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100 flex items-center justify-center shrink-0"><Icon size={19} /></span>
              <div>
                <div className="text-[26px] leading-none font-bold tracking-tight text-navy-900">{s.value}</div>
                <div className="text-[11.5px] text-slate-500 mt-1">{s.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* the flow: one source -> many surfaces */}
      <section className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-navy-800">How content flows</h3>
        <div className="mt-5 grid items-center gap-5 lg:grid-cols-[260px_64px_1fr]">
          {/* source */}
          <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white ring-1 ring-brand-100 p-5">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500 text-white shadow-sm"><Blocks size={18} /></span>
            <div className="mt-3 text-[15px] font-semibold text-navy-900">Contentful</div>
            <div className="text-[12px] text-slate-500">Headless CMS</div>
            <ul className="mt-3 space-y-1.5">
              {['Content & documents', 'Media assets', 'Versioning', 'Editorial workflow'].map((x) => (
                <li key={x} className="flex items-center gap-1.5 text-[12.5px] text-slate-600"><ShieldCheck size={13} className="text-brand-500 shrink-0" /> {x}</li>
              ))}
            </ul>
          </div>
          {/* connector */}
          <div className="hidden lg:flex flex-col items-center text-slate-300">
            <ArrowRight size={26} className="text-brand-400" />
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">delivery API</span>
          </div>
          {/* surfaces */}
          <div className="grid gap-3 sm:grid-cols-2">
            {SURFACES.map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="rounded-xl bg-slate-50 ring-1 ring-slate-200 p-3.5 flex items-start gap-3">
                  <span className="h-9 w-9 rounded-lg bg-white ring-1 ring-slate-200 flex items-center justify-center text-navy-700 shrink-0"><Icon size={16} /></span>
                  <div>
                    <div className="text-[13.5px] font-semibold text-navy-800">{s.label}</div>
                    <div className="text-[11.5px] text-slate-500">{s.note}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="mt-5 flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3.5 py-2.5 text-[12.5px] text-slate-600">
          <span className={`h-2 w-2 rounded-full ${hasContentfulConfig ? 'bg-accent-emerald' : 'bg-accent-amber'}`} />
          {hasContentfulConfig
            ? 'Connected to a live Contentful space via the delivery API.'
            : 'Running on bundled demo content — set VITE_CONTENTFUL_* to connect a live space.'}
          <span className="ml-auto text-slate-400">Web 3.0 layers identity · entitlements · search · AI on top.</span>
        </div>
      </section>
    </div>
  );
}
