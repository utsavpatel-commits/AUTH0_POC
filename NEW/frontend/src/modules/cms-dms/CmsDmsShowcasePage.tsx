import { useState } from 'react';
import { LayoutDashboard, Library, FileText, Sparkles, PanelsTopLeft, type LucideIcon } from 'lucide-react';
import { PageHeader } from '../../components/ui';
import { Overview } from './sections/Overview';
import { DocumentLibrary } from './sections/DocumentLibrary';
import { CustomerCafe } from './sections/CustomerCafe';
import { Personalization } from './sections/Personalization';
import { Architecture } from './sections/Architecture';

interface Item { key: string; label: string; icon: LucideIcon }
const ITEMS: Item[] = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'library', label: 'Document Library', icon: Library },
  { key: 'cafe', label: 'Customer Café', icon: FileText },
  { key: 'personalization', label: 'Personalization', icon: Sparkles },
  { key: 'architecture', label: 'Architecture', icon: PanelsTopLeft },
];

export function CmsDmsShowcasePage() {
  const [active, setActive] = useState('overview');
  return (
    <div>
      <PageHeader
        title="Content Platform"
        subtitle="Headless authoring in Contentful, delivered across every surface by Web 3.0 — marketing site, document library, customer café, and training."
      />

      <div className="border-b border-slate-200 mb-6">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {ITEMS.map((t) => {
            const Icon = t.icon; const on = active === t.key;
            return (
              <button key={t.key} onClick={() => setActive(t.key)}
                className={`relative inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${on ? 'border-brand-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800'}`}>
                <Icon size={16} className={on ? 'text-brand-600' : 'text-slate-400'} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div key={active} className="cafe-fade">
        {active === 'overview' && <Overview onNavigate={setActive} />}
        {active === 'library' && <DocumentLibrary />}
        {active === 'cafe' && <CustomerCafe />}
        {active === 'personalization' && <Personalization />}
        {active === 'architecture' && <Architecture />}
      </div>
    </div>
  );
}
