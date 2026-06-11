import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, FolderOpen, Library, ClipboardCheck, BarChart3, type LucideIcon } from 'lucide-react';
import { usePersona } from '../../lib/persona';
import { api } from '../../lib/api';
import { PageHeader, Empty } from '../../components/ui';
import { HomeTab } from './tabs/HomeTab';
import { MyDocuments } from './tabs/MyDocuments';
import { TcsLibrary } from './tabs/TcsLibrary';
import { Approvals } from './tabs/Approvals';
import { AnalyticsTab } from './tabs/AnalyticsTab';
import type { Role } from '../../lib/types';

const CAFE_MANAGERS: Role[] = ['staff_educator', 'don', 'corporate_leader', 'administrator', 'customer_admin', 'compliance_officer'];

interface NavItem { key: string; label: string; icon: LucideIcon }

export function CafePage() {
  const { facilityId, orgId, role } = usePersona();
  const [active, setActive] = useState('home');
  const canManage = CAFE_MANAGERS.includes(role);
  const readOnly = role === 'surveyor';

  const items = useMemo<NavItem[]>(() => {
    const base: NavItem[] = [
      { key: 'home', label: 'Home', icon: LayoutDashboard },
      { key: 'mine', label: 'Policies', icon: FolderOpen },
    ];
    if (canManage) base.push({ key: 'approvals', label: 'Approvals', icon: ClipboardCheck });
    base.push({ key: 'library', label: 'TCS Library', icon: Library });
    base.push({ key: 'analytics', label: 'Analytics', icon: BarChart3 });
    return base;
  }, [canManage]);

  const queue = useQuery({
    queryKey: ['cafe-review-queue', facilityId],
    queryFn: () => api<unknown[]>(`/api/cafe/review-queue?facility_id=${facilityId}`),
    enabled: canManage && facilityId != null,
  });
  const pending = (queue.data ?? []).length;

  if (facilityId == null) {
    return (
      <div>
        <PageHeader title="Document Café" subtitle="Select a facility to continue" />
        <Empty>Choose a facility from the top bar.</Empty>
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-slate-200 mb-6">
        <div className="flex items-center gap-1 -mb-px overflow-x-auto">
          {items.map((t) => {
            const Icon = t.icon; const on = active === t.key;
            return (
              <button key={t.key} onClick={() => setActive(t.key)}
                className={`relative inline-flex items-center gap-2 px-3.5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${on ? 'border-brand-500 text-navy-900' : 'border-transparent text-slate-500 hover:text-navy-800'}`}>
                <Icon size={16} className={on ? 'text-brand-600' : 'text-slate-400'} />
                {t.label}
                {t.key === 'approvals' && pending > 0 && (
                  <span className="h-4 min-w-4 px-1 rounded-full bg-accent-amber text-white text-[10px] font-bold flex items-center justify-center">{pending}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div key={active} className="cafe-fade">
        {active === 'home' && <HomeTab facilityId={facilityId} canManage={canManage} onNavigate={setActive} />}
        {active === 'mine' && <MyDocuments facilityId={facilityId} orgId={orgId} readOnly={readOnly} />}
        {active === 'approvals' && canManage && <Approvals facilityId={facilityId} />}
        {active === 'library' && <TcsLibrary facilityId={facilityId} orgId={orgId} readOnly={readOnly} />}
        {active === 'analytics' && <AnalyticsTab facilityId={facilityId} />}
      </div>
    </div>
  );
}
