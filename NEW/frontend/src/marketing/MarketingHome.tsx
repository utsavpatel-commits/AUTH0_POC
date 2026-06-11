import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight, ClipboardCheck, GraduationCap, FolderOpen, Sparkles, ShieldCheck, Newspaper, type LucideIcon,
} from 'lucide-react';
import { getMarketingPages, getNewsArticles, type MarketingPageContent } from '../services/contentful/contentfulService';

const ICONS: Record<string, LucideIcon> = { sparkles: Sparkles, clipboard: ClipboardCheck, graduation: GraduationCap, folder: FolderOpen };

export function MarketingHome() {
  const pagesQ = useQuery({ queryKey: ['mkt-pages'], queryFn: getMarketingPages });
  const newsQ = useQuery({ queryKey: ['mkt-news'], queryFn: getNewsArticles });
  const pages = pagesQ.data ?? [];
  const platform = pages.find((p) => p.slug === 'platform') ?? pages[0];
  const solutions = pages.filter((p) => p.slug !== 'platform');
  const news = (newsQ.data ?? []).slice(0, 3);

  return (
    <div>
      {/* hero */}
      <section className="relative overflow-hidden bg-navy-gradient text-white">
        <img src="/brand/login-hero.jpg" alt="" className="absolute inset-0 h-full w-full object-cover opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900/90 via-navy-800/80 to-brand-700/70" />
        <div className="relative mx-auto max-w-6xl px-5 py-20 lg:py-28">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1 text-[12.5px] font-medium backdrop-blur">
            <Sparkles size={14} className="text-brand-200" /> {platform?.eyebrow || 'The Compliance Store · Web 3.0'}
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl lg:text-[52px] font-bold leading-[1.08] tracking-tight">
            {platform?.heroTitle || 'The compliance operating platform for long-term care.'}
          </h1>
          <p className="mt-5 max-w-2xl text-[17px] leading-relaxed text-white/75">{platform?.heroDescription}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/login" className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-600 transition-colors">
              Customer Portal <ArrowRight size={16} />
            </Link>
            <a href="#solutions" className="inline-flex items-center gap-2 rounded-lg bg-white/10 ring-1 ring-white/20 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/15">
              Explore solutions
            </a>
          </div>
          {platform?.metrics?.length ? (
            <div className="mt-12 grid grid-cols-2 sm:grid-cols-3 gap-px max-w-2xl overflow-hidden rounded-2xl ring-1 ring-white/15">
              {platform.metrics.map((m) => (
                <div key={m.label} className="bg-white/5 backdrop-blur px-5 py-4">
                  <div className="text-2xl font-bold tracking-tight">{m.value}</div>
                  <div className="text-[12px] text-white/60 mt-0.5">{m.label}</div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* solutions */}
      <section id="solutions" className="mx-auto max-w-6xl px-5 py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold text-navy-900 tracking-tight">One platform, built around your compliance workflows</h2>
          <p className="mt-2 text-slate-600">Each solution draws on the same expert-maintained content library — authored once, delivered everywhere.</p>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {(solutions.length ? solutions : []).map((p) => <SolutionCard key={p.id} page={p} />)}
        </div>
      </section>

      {/* what's new */}
      <section className="bg-slate-50 border-y border-slate-200">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-navy-900 tracking-tight flex items-center gap-2"><Newspaper size={20} className="text-brand-600" /> What's new</h2>
              <p className="mt-2 text-slate-600">Regulatory updates and product news — published from the CMS.</p>
            </div>
            <Link to="/whats-new" className="hidden sm:inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">All updates <ArrowRight size={14} /></Link>
          </div>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {news.map((a) => (
              <Link key={a.id} to="/whats-new" className="group rounded-2xl bg-white ring-1 ring-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
                <span className="inline-flex items-center rounded-full bg-brand-50 text-brand-700 ring-1 ring-brand-100 px-2 py-0.5 text-[11px] font-semibold">{a.tag}</span>
                <h3 className="mt-3 text-base font-semibold text-navy-900 group-hover:text-brand-700">{a.title}</h3>
                <p className="mt-1.5 text-sm text-slate-600 line-clamp-3">{a.summary}</p>
                <div className="mt-3 text-[12px] text-slate-400">{a.publishDate}{a.state ? ` · ${a.state}` : ''}</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* closing CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-3xl bg-navy-gradient text-white px-8 py-12 text-center relative overflow-hidden">
          <div className="absolute -right-10 -top-16 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight">See it on your facility's content</h2>
          <p className="relative mt-3 text-white/75 max-w-xl mx-auto">Sign in to the customer portal to author policies, run training, and prepare for surveys — all from one source of truth.</p>
          <Link to="/login" className="relative mt-7 inline-flex items-center gap-2 rounded-lg bg-brand-500 px-6 py-3 text-sm font-semibold text-white shadow-lg hover:bg-brand-600">
            Enter the Customer Portal <ArrowRight size={16} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function SolutionCard({ page }: { page: MarketingPageContent }) {
  const Icon = ICONS[page.icon] ?? ShieldCheck;
  return (
    <Link to={`/solutions/${page.slug}`} className="group rounded-2xl bg-white ring-1 ring-slate-200 p-6 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all">
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100"><Icon size={20} /></span>
      <h3 className="mt-4 text-lg font-semibold text-navy-900 group-hover:text-brand-700">{page.title}</h3>
      <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">{page.heroDescription}</p>
      <ul className="mt-4 space-y-1.5">
        {page.highlights.slice(0, 3).map((h) => (
          <li key={h} className="flex items-start gap-2 text-[13px] text-slate-600"><ShieldCheck size={14} className="text-accent-emerald mt-0.5 shrink-0" /> {h}</li>
        ))}
      </ul>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-brand-700">Learn more <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" /></span>
    </Link>
  );
}
