import { Construction } from 'lucide-react';
import { PageHeader } from '../../components/ui';

export function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <PageHeader title={title} subtitle="This module is on the platform roadmap" />
      <div className="bg-white border border-dashed border-slate-300 rounded-xl p-12 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-xl bg-brand-50 ring-1 ring-brand-100 flex items-center justify-center">
          <Construction className="text-brand-500" size={26} />
        </div>
        <h2 className="text-lg font-semibold text-navy-800 mb-1">Coming soon</h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto">{blurb}</p>
      </div>
    </div>
  );
}
