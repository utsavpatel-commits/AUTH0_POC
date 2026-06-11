import { Link, NavLink, Outlet } from 'react-router-dom';
import { ArrowRight, Blocks } from 'lucide-react';

const NAV = [
  { to: '/solutions/survey-readiness', label: 'Survey Readiness' },
  { to: '/solutions/lms', label: 'Learning Management' },
  { to: '/solutions/document-cafe', label: 'Document Café' },
  { to: '/whats-new', label: "What's New" },
];

export function MarketingLayout() {
  return (
    <div className="min-h-screen flex flex-col bg-white text-navy-900">
      {/* demo ribbon — makes the headless-CMS story explicit */}
      <div className="bg-navy-900 text-white/80 text-[11.5px]">
        <div className="mx-auto max-w-6xl px-5 py-1.5 flex items-center gap-2">
          <Blocks size={13} className="text-brand-300" />
          This public site is authored in <span className="font-semibold text-white">Contentful</span> (headless CMS) and rendered by the Web&nbsp;3.0 platform.
        </div>
      </div>

      {/* top nav */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-6xl px-5 h-16 flex items-center gap-6">
          <Link to="/" className="shrink-0"><img src="/brand/tcs-logo-full-trim.png" alt="The Compliance Store" className="h-8 w-auto" /></Link>
          <nav className="hidden md:flex items-center gap-1 ml-2">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to}
                className={({ isActive }) => `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'text-brand-700 bg-brand-50' : 'text-slate-600 hover:text-navy-900 hover:bg-slate-50'}`}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/login" className="hidden sm:inline-flex text-sm font-medium text-slate-600 hover:text-navy-900 px-3 py-2">Sign in</Link>
            <Link to="/login" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 transition-colors">
              Customer Portal <ArrowRight size={15} />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* footer */}
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-5 py-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <img src="/brand/tcs-logo-full-trim.png" alt="The Compliance Store" className="h-8 w-auto" />
            <p className="mt-3 text-sm text-slate-500 max-w-xs">The compliance operating platform for long-term care. Because getting it right matters.</p>
          </div>
          <FooterCol title="Solutions" links={[['Survey Readiness', '/solutions/survey-readiness'], ['Learning Management', '/solutions/lms'], ['Document Café', '/solutions/document-cafe']]} />
          <FooterCol title="Company" links={[["What's New", '/whats-new'], ['Platform', '/'], ['Customer Portal', '/login']]} />
          <FooterCol title="Get started" links={[['Request a walkthrough', '/login'], ['Sign in', '/login']]} />
        </div>
        <div className="border-t border-slate-200">
          <div className="mx-auto max-w-6xl px-5 py-4 text-[12px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>© {new Date().getFullYear()} The Compliance Store · Web 3.0 Platform</span>
            <span>Content managed in Contentful · Consumption managed by Web 3.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{title}</div>
      <ul className="mt-3 space-y-2">
        {links.map(([label, to]) => (
          <li key={label}><Link to={to} className="text-sm text-slate-600 hover:text-brand-700">{label}</Link></li>
        ))}
      </ul>
    </div>
  );
}
