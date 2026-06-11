import { useState } from 'react';
import { ClipboardCheck, ListChecks, BarChart3 } from 'lucide-react';
import { usePersona } from '../../lib/persona';
import { PageHeader, Empty } from '../../components/ui';
import { Tabs, type TabDef } from '../../components/ui/Tabs';
import { MockSurvey } from './tabs/MockSurvey';
import { AuditToolkit } from './tabs/AuditToolkit';
import { QaReporting } from './tabs/QaReporting';

const TABS: TabDef[] = [
  { key: 'mock', label: 'Mock Survey', icon: <ClipboardCheck size={15} /> },
  { key: 'audit', label: 'Audit Toolkit', icon: <ListChecks size={15} /> },
  { key: 'qa', label: 'QA Reporting', icon: <BarChart3 size={15} /> },
];

export function SurveyPage() {
  const { facilityId } = usePersona();
  const [active, setActive] = useState('mock');

  if (facilityId == null) {
    return (
      <div>
        <PageHeader title="Survey Readiness" subtitle="Select a facility to continue" />
        <Empty>Choose a facility from the top bar.</Empty>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Survey Readiness"
        subtitle="CEP-driven Mock Survey · Audit Toolkit · QA outcome reporting — outcomes feed the Compliance Dashboard"
      />
      <Tabs tabs={TABS} active={active} onChange={setActive} />

      {active === 'mock' && <MockSurvey facilityId={facilityId} />}
      {active === 'audit' && <AuditToolkit facilityId={facilityId} />}
      {active === 'qa' && <QaReporting facilityId={facilityId} />}
    </div>
  );
}
