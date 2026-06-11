import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Check } from 'lucide-react';

/** Themed popover shell — replaces native <select>. Render-prop gives you `close`. */
export function Dropdown({ label, width = '', align = 'left', disabled = false, panelClass = '', children }: {
  label: ReactNode; width?: string; align?: 'left' | 'right'; disabled?: boolean; panelClass?: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center justify-between gap-2 rounded-lg border bg-white pl-3 pr-2.5 py-2 text-sm text-slate-700 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 transition-colors disabled:bg-slate-50 disabled:text-slate-400 ${open ? 'border-brand-400 ring-2 ring-brand-400' : 'border-slate-300'} ${width}`}>
        <span className="truncate">{label}</span>
        <ChevronDown size={14} className={`text-slate-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className={`absolute z-40 mt-1.5 min-w-[14rem] max-h-[62vh] overflow-y-auto rounded-xl bg-white shadow-[0_12px_40px_rgba(11,32,53,0.16)] ring-1 ring-slate-200 py-1.5 cafe-fade ${align === 'right' ? 'right-0' : 'left-0'} ${panelClass}`}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function DItem({ active, indent, disabled, onClick, children }: {
  active?: boolean; indent?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm transition-colors hover:bg-slate-50 disabled:opacity-40 disabled:hover:bg-transparent ${active ? 'bg-brand-50/70 text-brand-700 font-semibold' : 'text-slate-700'}`}>
      <span className="w-3.5 shrink-0 flex items-center justify-center">{active && <Check size={13} className="text-brand-600" />}</span>
      <span className={`truncate ${indent ? 'pl-2' : ''}`}>{children}</span>
    </button>
  );
}

export function DHeader({ children }: { children: ReactNode }) {
  return <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</div>;
}

export type DropdownItem = { value: string; label: string; indent?: boolean; disabled?: boolean } | { header: string };

/** Convenience flat/grouped picker driven by an items array. */
export function SimpleDropdown({ value, onChange, items, placeholder = 'Select…', width = '', align = 'left', disabled = false }: {
  value: string; onChange: (v: string) => void; items: DropdownItem[];
  placeholder?: string; width?: string; align?: 'left' | 'right'; disabled?: boolean;
}) {
  const current = items.find((i): i is Extract<DropdownItem, { value: string }> => 'value' in i && i.value === value);
  return (
    <Dropdown label={current?.label ?? placeholder} width={width} align={align} disabled={disabled}>
      {(close) => items.map((it, i) =>
        'header' in it
          ? <DHeader key={`h${i}`}>{it.header}</DHeader>
          : <DItem key={it.value} active={it.value === value} indent={it.indent} disabled={it.disabled}
              onClick={() => { onChange(it.value); close(); }}>{it.label}</DItem>,
      )}
    </Dropdown>
  );
}
