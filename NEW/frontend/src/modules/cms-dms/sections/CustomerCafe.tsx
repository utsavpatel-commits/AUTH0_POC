import { useQuery } from '@tanstack/react-query';
import { Building2, FileText, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Badge, Empty } from '../../../components/ui';
import { getCustomerDocuments, type CmsDocumentContent } from '../../../services/contentful/contentfulService';

export function CustomerCafe() {
  const q = useQuery({ queryKey: ['cms-cust'], queryFn: getCustomerDocuments });
  const docs = q.data ?? [];

  const byCustomer = docs.reduce<Record<string, CmsDocumentContent[]>>((acc, d) => {
    const key = d.customerId || 'Unassigned';
    (acc[key] ||= []).push(d);
    return acc;
  }, {});

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px] items-start">
      <div className="space-y-5">
        {q.isLoading ? (
          <Empty>Loading customer documents…</Empty>
        ) : !docs.length ? (
          <Empty>No customer-owned documents found.</Empty>
        ) : (
          Object.entries(byCustomer).map(([customer, items]) => (
            <section key={customer} className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100">
                <span className="h-7 w-7 rounded-lg bg-emerald-50 ring-1 ring-emerald-100 flex items-center justify-center"><Building2 size={15} className="text-accent-emerald" /></span>
                <h3 className="text-sm font-semibold text-navy-800">{customer}</h3>
                <Badge tone="emerald">Customer owned</Badge>
                <span className="ml-auto text-[12px] text-slate-400">{items.length} document{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-slate-50">
                {items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="h-8 w-8 rounded-lg bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center shrink-0"><FileText size={15} className="text-slate-500" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-navy-800 truncate">{d.title}</div>
                      <div className="text-[11.5px] text-slate-400">{d.facilityId || '—'} · {d.department || '—'} · {d.category || '—'}</div>
                    </div>
                    <Badge tone="slate">{d.documentType}</Badge>
                    <span className="text-[11px] text-slate-400 w-20 text-right">v{d.version} · {d.updatedAt}</span>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      <aside className="space-y-4">
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-navy-800"><LockKeyhole size={16} className="text-brand-600" /> Access model</div>
          <p className="mt-2 text-sm leading-6 text-slate-600">Content is stored in Contentful. <strong className="text-navy-800">Access is controlled by Web 3.0</strong> — facility, customer, department, and role entitlements are applied at delivery, not in the CMS.</p>
        </div>
        <div className="rounded-2xl bg-white ring-1 ring-slate-200/70 shadow-sm p-5 space-y-3">
          <div className="text-sm font-semibold text-navy-800">Why this matters</div>
          {[
            'Customer IP stays segregated from the TCS source library',
            'Facility versions keep their lineage to the TCS master',
            'The platform — not the CMS — decides who can see what',
          ].map((t) => (
            <div key={t} className="flex items-start gap-2 text-[13px] text-slate-600"><ShieldCheck size={14} className="text-accent-emerald mt-0.5 shrink-0" /> {t}</div>
          ))}
        </div>
      </aside>
    </div>
  );
}
