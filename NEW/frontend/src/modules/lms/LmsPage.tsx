import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap, ClipboardList, BookOpen, BarChart3, Building2, User, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { usePersona, isTcs } from '../../lib/persona';
import type { Role } from '../../lib/types';
import { PageHeader, Empty } from '../../components/ui';
import { Tabs, type TabDef } from '../../components/ui/Tabs';
import { MyTraining } from './tabs/MyTraining';
import { Assignments } from './tabs/Assignments';
import { Catalog } from './tabs/Catalog';
import { CompletionRecords } from './tabs/CompletionRecords';
import { Learners } from './tabs/Learners';
import { Rollup } from './tabs/Rollup';
import { AdminBanner } from './AdminBanner';
import { PortfolioBanner } from './PortfolioBanner';
import { FacilityCopilot, PortfolioCopilot } from './Copilot';

interface Staff { id: number; name: string; role: string; profile: string; job_title: string | null }

// Tab set + default landing tab per persona. End users get ONLY their learner home.
function tabsForPersona(role: Role): { tabs: TabDef[]; def: string } {
  const T = {
    mine: { key: 'mine', label: 'My Learning', icon: <User size={15} /> },
    assignments: { key: 'assignments', label: 'Assignments', icon: <ClipboardList size={15} /> },
    catalog: { key: 'catalog', label: 'Course Catalog', icon: <BookOpen size={15} /> },
    learners: { key: 'learners', label: 'Learners', icon: <Users size={15} /> },
    records: { key: 'records', label: 'Training Compliance', icon: <GraduationCap size={15} /> },
    rollup: { key: 'rollup', label: 'Facilities', icon: <Building2 size={15} /> },
  };
  if (role === 'end_user') return { tabs: [T.mine], def: 'mine' };
  if (role === 'staff_educator')
    return { tabs: [T.assignments, T.catalog, T.learners, T.records], def: 'assignments' };
  if (role === 'don')
    return { tabs: [T.records, T.assignments, T.catalog], def: 'records' };
  if (role === 'corporate_leader')
    return { tabs: [T.rollup, T.records, T.assignments], def: 'rollup' };
  if (role === 'customer_admin')
    return { tabs: [T.assignments, T.catalog, T.learners, T.records, T.rollup], def: 'assignments' };
  if (isTcs(role))
    return { tabs: [T.rollup, T.assignments, T.records, T.catalog], def: 'rollup' };
  // administrator
  return { tabs: [T.assignments, T.catalog, T.learners, T.records, T.rollup], def: 'assignments' };
}

const SUBTITLE: Record<string, string> = {
  end_user: '',
  staff_educator: 'Assign curriculum, manage courses, and track your team’s completion.',
  don: 'Monitor clinical training completion and pull survey-ready evidence.',
  corporate_leader: 'Training readiness across every facility in your organization.',
  customer_admin: 'Manage training, content, and completion for your organization.',
  administrator: 'Assign training, track completion, and stay survey-ready.',
  tcs_admin: 'Training adoption and completion across your customer base.',
  tcs_sales_cs: 'Training adoption and completion across your customer base.',
};

export function LmsPage() {
  const { role, facilityId, setFacilityId } = usePersona();
  const { tabs, def } = useMemo(() => tabsForPersona(role), [role]);
  const [active, setActive] = useState(def);
  const activeKey = tabs.some((t) => t.key === active) ? active : def;
  const go = (k: string) => setActive(k);
  // VP/portfolio drill: open a facility's compliance detail
  const openFacility = (id: number) => { setFacilityId(id); setActive('records'); };

  const staff = useQuery({
    queryKey: ['facility-staff', facilityId],
    queryFn: () => api<Staff[]>(`/api/users?facility_id=${facilityId}`),
    enabled: facilityId != null,
  });
  const me =
    (staff.data ?? []).find((u) => u.role === 'end_user') ?? (staff.data ?? [])[0] ?? null;

  // All content is customer-authored (no TCS library). The Staff Educator owns course
  // creation/editing/versioning, alongside facility & customer admins.
  const canAuthor = ['staff_educator', 'administrator', 'customer_admin'].includes(role);
  const isLearner = role === 'end_user';

  if (facilityId == null) {
    return (
      <div>
        <PageHeader title="Learning" subtitle="Select a facility to continue" />
        <Empty>Choose a facility from the top bar.</Empty>
      </div>
    );
  }

  // Facility-level management personas get a branded command banner on their
  // working tabs; portfolio personas get an org-level banner on the Facilities tab.
  const isPortfolio = activeKey === 'rollup';
  const showBanner = !isLearner;

  return (
    <div>
      <PageHeader
        title={isLearner ? 'My Learning' : 'Learning Management'}
        subtitle={showBanner ? undefined : (SUBTITLE[role] ?? SUBTITLE.administrator)}
      />
      {showBanner && (
        <div className="mb-4">
          {isPortfolio ? <PortfolioBanner role={role} /> : <AdminBanner facilityId={facilityId} role={role} />}
        </div>
      )}
      {/* learner gets no tab bar — it's a single focused home */}
      {!isLearner && <Tabs tabs={tabs} active={activeKey} onChange={setActive} />}

      {/* Compliance Copilot — intelligence + smart actions, on the persona's landing tab */}
      {!isLearner && activeKey === def && (
        <div className="mb-5 mt-1">
          {isPortfolio
            ? <PortfolioCopilot role={role} onOpenFacility={openFacility} />
            : <FacilityCopilot facilityId={facilityId} onNavigate={go} />}
        </div>
      )}

      {(isLearner || activeKey === 'mine') &&
        (me ? <MyTraining userId={me.id} userName={me.name} facilityId={facilityId} /> : <Empty>No staff found for this facility.</Empty>)}
      {!isLearner && activeKey === 'assignments' && <Assignments facilityId={facilityId} />}
      {!isLearner && activeKey === 'catalog' && <Catalog facilityId={facilityId} canAuthor={canAuthor} />}
      {!isLearner && activeKey === 'learners' && <Learners facilityId={facilityId} />}
      {!isLearner && activeKey === 'records' && <CompletionRecords facilityId={facilityId} />}
      {!isLearner && activeKey === 'rollup' && <Rollup onOpenFacility={openFacility} />}
    </div>
  );
}
