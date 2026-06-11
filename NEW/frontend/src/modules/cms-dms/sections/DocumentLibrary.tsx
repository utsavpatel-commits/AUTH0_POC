import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, FileDown, FilePenLine, Blocks, ExternalLink } from 'lucide-react';
import { Badge, DataTable, SimpleDropdown, Modal, Button, type Column, type DropdownItem } from '../../../components/ui';
import { getDocuments, type CmsDocumentContent } from '../../../services/contentful/contentfulService';

const TYPE_TONE: Record<string, 'slate' | 'amber' | 'brand' | 'emerald' | 'navy'> = {
  Policy: 'brand', Procedure: 'slate', Manual: 'navy', Asset: 'amber',
};

function opts(values: string[], allLabel: string): DropdownItem[] {
  return [{ value: 'all', label: allLabel }, ...values.map((v) => ({ value: v, label: v }))];
}

export function DocumentLibrary() {
  const q = useQuery({ queryKey: ['cms-docs'], queryFn: getDocuments });
  const all = q.data ?? [];
  const [type, setType] = useState('all');
  const [owner, setOwner] = useState('all');
  const [state, setState] = useState('all');
  const [mod, setMod] = useState('all');
  const [selected, setSelected] = useState<CmsDocumentContent | null>(null);

  const distinct = (key: keyof CmsDocumentContent) => [...new Set(all.map((d) => String(d[key])).filter(Boolean))].sort();
  const rows = useMemo(() => all.filter((d) =>
    (type === 'all' || d.documentType === type) &&
    (owner === 'all' || d.ownerType === owner) &&
    (state === 'all' || (d.state || '') === state) &&
    (mod === 'all' || d.module === mod)), [all, type, owner, state, mod]);

  const columns: Column<CmsDocumentContent>[] = [
    {
      key: 'title', header: 'Document', sortable: true, accessor: (r) => r.title,
      cell: (r) => (
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-7 w-7 rounded-lg bg-brand-50 ring-1 ring-brand-100 flex items-center justify-center shrink-0"><FileText size={14} className="text-brand-600" /></span>
          <span className="font-medium text-navy-800 truncate">{r.title}</span>
        </div>
      ),
    },
    { key: 'documentType', header: 'Type', sortable: true, accessor: (r) => r.documentType,
      cell: (r) => <Badge tone={TYPE_TONE[r.documentType] ?? 'slate'}>{r.documentType || 'Document'}</Badge> },
    { key: 'ownerType', header: 'Owner', sortable: true, accessor: (r) => r.ownerType,
      cell: (r) => <Badge tone={r.ownerType === 'TCS' ? 'brand' : 'emerald'}>{r.ownerType}</Badge> },
    { key: 'category', header: 'Category', sortable: true, accessor: (r) => r.category, cell: (r) => <span className="text-slate-600">{r.category || '—'}</span> },
    { key: 'state', header: 'State', accessor: (r) => r.state, cell: (r) => <span className="text-slate-600">{r.state || 'All'}</span> },
    { key: 'audience', header: 'Audience', accessor: (r) => r.audience, cell: (r) => <span className="text-slate-600">{r.audience || 'All'}</span> },
    { key: 'module', header: 'Module', accessor: (r) => r.module, cell: (r) => <span className="text-slate-600">{r.module || '—'}</span> },
    { key: 'format', header: 'Format', align: 'right',
      cell: (r) => r.originalFileUrl
        ? <span className="inline-flex items-center gap-1 text-[12px] text-amber-700"><FileDown size={13} /> Asset</span>
        : <span className="inline-flex items-center gap-1 text-[12px] text-brand-700"><FilePenLine size={13} /> Editable</span> },
  ];

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SimpleDropdown value={type} onChange={setType} items={opts(distinct('documentType'), 'All types')} width="min-w-[8.5rem]" />
      <SimpleDropdown value={owner} onChange={setOwner} items={opts(distinct('ownerType'), 'All owners')} width="min-w-[8rem]" />
      <SimpleDropdown value={state} onChange={setState} items={opts(distinct('state'), 'All states')} width="min-w-[7.5rem]" />
      <SimpleDropdown value={mod} onChange={setMod} items={opts(distinct('module'), 'All modules')} width="min-w-[8.5rem]" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-lg bg-brand-50 ring-1 ring-brand-100 px-4 py-2.5 text-sm text-brand-800">
        <Blocks size={16} className="text-brand-600" />
        <span className="font-semibold">Document management</span>
        <span className="text-brand-700">Every document — TCS source and customer-owned — catalogued with CMS metadata. Click a row to inspect.</span>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={q.isLoading}
        searchAccessor={(r) => `${r.title} ${r.category} ${r.audience} ${r.module}`}
        searchPlaceholder="Search documents…"
        toolbar={toolbar}
        defaultSortKey="title"
        onRowClick={setSelected}
        emptyTitle="No documents match"
        emptyHint="Adjust the filters or search above."
      />
      {selected && <DocDrawer doc={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DocDrawer({ doc, onClose }: { doc: CmsDocumentContent; onClose: () => void }) {
  const asset = !!doc.originalFileUrl;
  return (
    <Modal open onClose={onClose} wide
      title={<span className="flex items-center gap-2"><FileText size={16} className="text-brand-600" /> {doc.title}</span>}
      footer={<>
        <Button variant="ghost" onClick={onClose}>Close</Button>
        {asset
          ? <Button><FileDown size={14} /> Download asset</Button>
          : <Button><ExternalLink size={14} /> Open in Document Café</Button>}
      </>}>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Badge tone={TYPE_TONE[doc.documentType] ?? 'slate'}>{doc.documentType}</Badge>
        <Badge tone={doc.ownerType === 'TCS' ? 'brand' : 'emerald'}>{doc.ownerType} owned</Badge>
        <Badge tone={asset ? 'amber' : 'brand'}>{asset ? 'Downloadable asset' : 'Editable HTML'}</Badge>
        <span className="ml-auto text-[12px] text-slate-400">v{doc.version} · updated {doc.updatedAt}</span>
      </div>
      {doc.summary && <p className="text-sm leading-6 text-slate-600">{doc.summary}</p>}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {([
          ['Category', doc.category], ['Vertical', doc.vertical], ['State', doc.state || 'All'], ['Audience', doc.audience || 'All'],
          ['Module', doc.module], ['Customer', doc.customerId || '—'], ['Facility', doc.facilityId || '—'], ['Department', doc.department || '—'],
        ] as [string, string][]).map(([k, v]) => (
          <div key={k} className="rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3.5 py-2.5">
            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{k}</div>
            <div className="text-sm font-medium text-navy-800 mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg bg-brand-50/60 ring-1 ring-brand-100 px-3.5 py-3 text-[12.5px] text-slate-600">
        <Blocks size={15} className="text-brand-600 mt-0.5 shrink-0" />
        <span>
          {asset
            ? 'Binary asset stored and versioned in Contentful; the platform serves it with entitlement checks applied.'
            : 'Authored as structured content in Contentful. Editable documents open in the Document Café, where facility versioning and approval workflow apply.'}
        </span>
      </div>
    </Modal>
  );
}
