import { ChevronUp, ChevronDown } from 'lucide-react';

// Shared sortable-table primitives so every Café table behaves identically.
export interface SortState { field: string; dir: 'asc' | 'desc' }

export function nextSort(cur: SortState, field: string): SortState {
  if (cur.field !== field) return { field, dir: 'asc' };
  return { field, dir: cur.dir === 'asc' ? 'desc' : 'asc' };
}

export function sortRows<T>(rows: T[], sort: SortState, val: (r: T, field: string) => string | number): T[] {
  const dir = sort.dir === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = val(a, sort.field), vb = val(b, sort.field);
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return 0;
  });
}

export function Th({
  field, sort, onSort, children, align = 'left', className = '', sortable = true,
}: {
  field?: string; sort?: SortState; onSort?: (s: SortState) => void;
  children: React.ReactNode; align?: 'left' | 'right' | 'center'; className?: string; sortable?: boolean;
}) {
  const active = !!field && sort?.field === field;
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  if (!sortable || !field || !sort || !onSort) {
    return <th className={`px-3 py-2.5 ${alignCls} font-semibold ${className}`}>{children}</th>;
  }
  return (
    <th className={`px-3 py-2.5 ${alignCls} font-semibold ${className}`}>
      <button onClick={() => onSort(nextSort(sort, field))}
        className={`inline-flex items-center gap-1 w-full ${justify} hover:text-navy-700 transition-colors ${active ? 'text-navy-700' : ''}`}>
        {children}
        <span className="w-3 inline-flex justify-center">
          {active ? (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />) : null}
        </span>
      </button>
    </th>
  );
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
