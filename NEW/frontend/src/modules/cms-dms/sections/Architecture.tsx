import { Blocks, ShieldCheck, ArrowRight, FileText, Image, History, PenLine, Fingerprint, KeyRound, Search, Sparkles, LayoutDashboard, type LucideIcon } from 'lucide-react';

const CMS: { icon: LucideIcon; label: string }[] = [
  { icon: PenLine, label: 'Authoring' }, { icon: FileText, label: 'Content & documents' },
  { icon: Image, label: 'Media assets' }, { icon: History, label: 'Versioning' },
];
const PLATFORM: { icon: LucideIcon; label: string }[] = [
  { icon: Fingerprint, label: 'Identity' }, { icon: KeyRound, label: 'Entitlements' },
  { icon: Search, label: 'Search' }, { icon: Sparkles, label: 'AI' }, { icon: LayoutDashboard, label: 'Dashboards' },
];

export function Architecture() {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-navy-gradient text-white px-6 py-8 text-center relative overflow-hidden shadow-sm">
        <div className="absolute -left-10 -bottom-16 h-56 w-56 rounded-full bg-brand-500/20 blur-3xl" />
        <h2 className="relative text-2xl font-bold tracking-tight">Contentful manages authoring. Web 3.0 manages consumption.</h2>
        <p className="relative mt-2 text-white/70 max-w-2xl mx-auto text-[15px]">A clean separation of concerns: a best-in-class headless CMS for content, and the platform for everything that turns content into a governed, intelligent experience.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_72px_1fr] items-stretch">
        <Pane title="Contentful" subtitle="Headless CMS" icon={Blocks} tone="brand" items={CMS} />
        <div className="hidden lg:flex flex-col items-center justify-center text-slate-300">
          <ArrowRight size={30} className="text-brand-400" />
          <span className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">delivery API</span>
        </div>
        <Pane title="Web 3.0 Platform" subtitle="Consumption layer" icon={ShieldCheck} tone="emerald" items={PLATFORM} />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ['Single source of truth', 'One document, one place — referenced everywhere, never copied.'],
          ['Always current', 'Source updates propagate to every surface, including training.'],
          ['Governed delivery', 'Identity & entitlements decide visibility at read time, not in the CMS.'],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-5">
            <ShieldCheck size={18} className="text-accent-emerald" />
            <div className="mt-2 text-sm font-semibold text-navy-800">{t}</div>
            <p className="mt-1 text-[13px] leading-6 text-slate-600">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Pane({ title, subtitle, icon: Icon, tone, items }: {
  title: string; subtitle: string; icon: LucideIcon; tone: 'brand' | 'emerald'; items: { icon: LucideIcon; label: string }[];
}) {
  const ring = tone === 'brand' ? 'ring-brand-100' : 'ring-emerald-100';
  const chip = tone === 'brand' ? 'bg-brand-500' : 'bg-accent-emerald';
  return (
    <div className={`rounded-2xl bg-white ring-1 ${ring} shadow-sm p-6`}>
      <div className="flex items-center gap-2.5">
        <span className={`h-10 w-10 rounded-xl ${chip} text-white flex items-center justify-center shadow-sm`}><Icon size={18} /></span>
        <div>
          <div className="text-[15px] font-semibold text-navy-900">{title}</div>
          <div className="text-[12px] text-slate-500">{subtitle}</div>
        </div>
      </div>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {items.map((it) => {
          const I = it.icon;
          return (
            <div key={it.label} className="flex items-center gap-2.5 rounded-xl bg-slate-50 ring-1 ring-slate-200 px-3.5 py-3">
              <I size={16} className="text-slate-500 shrink-0" />
              <span className="text-sm font-medium text-navy-800">{it.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
