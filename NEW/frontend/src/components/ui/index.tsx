import type { ReactNode } from 'react';

export { Modal } from './Modal';
export { Dropdown, DItem, DHeader, SimpleDropdown } from './Dropdown';
export type { DropdownItem } from './Dropdown';
export { Tabs } from './Tabs';
export type { TabDef } from './Tabs';
export { DataTable } from './DataTable';
export type { Column } from './DataTable';

type Tone = 'slate' | 'brand' | 'navy' | 'emerald' | 'amber' | 'rose';

export function Card({
  title,
  actions,
  children,
  className = '',
  padded = true,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={`bg-white border border-slate-200/80 rounded-xl shadow-[0_1px_2px_rgba(11,32,53,0.04),0_4px_16px_rgba(11,32,53,0.06)] ${className}`}
    >
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100">
          {typeof title === 'string' ? (
            <h3 className="font-semibold text-navy-800 text-sm tracking-tight">{title}</h3>
          ) : (
            title
          )}
          {actions}
        </div>
      )}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  tone = 'navy',
  icon,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  const accent: Record<Tone, string> = {
    slate: 'before:bg-slate-300',
    brand: 'before:bg-brand-500',
    navy: 'before:bg-navy-600',
    emerald: 'before:bg-accent-emerald',
    amber: 'before:bg-accent-amber',
    rose: 'before:bg-accent-rose',
  };
  const valTone: Record<Tone, string> = {
    slate: 'text-slate-900',
    brand: 'text-brand-600',
    navy: 'text-navy-800',
    emerald: 'text-accent-emerald',
    amber: 'text-accent-amber',
    rose: 'text-accent-rose',
  };
  return (
    <div
      className={`relative bg-white border border-slate-200/80 rounded-xl p-4 shadow-[0_1px_2px_rgba(11,32,53,0.04)] overflow-hidden
        before:absolute before:left-0 before:top-0 before:h-full before:w-1 ${accent[tone]}`}
    >
      <div className="flex items-start justify-between">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">{label}</div>
        {icon && <span className="text-slate-300">{icon}</span>}
      </div>
      <div className={`text-2xl font-bold mt-1 tracking-tight ${valTone[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: Tone }) {
  const tones: Record<Tone, string> = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
    brand: 'bg-brand-50 text-brand-700 ring-brand-200',
    navy: 'bg-navy-50 text-navy-700 ring-navy-200',
    emerald: 'bg-emerald-50 text-accent-emerald ring-emerald-200',
    amber: 'bg-amber-50 text-accent-amber ring-amber-200',
    rose: 'bg-rose-50 text-accent-rose ring-rose-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ring-inset ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  type = 'button',
  full,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'navy' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  type?: 'button' | 'submit';
  full?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  const variants = {
    primary: 'bg-brand-500 text-white hover:bg-brand-600 shadow-sm',
    navy: 'bg-navy-700 text-white hover:bg-navy-800 shadow-sm',
    ghost: 'text-slate-600 hover:bg-slate-100',
    outline: 'border border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400',
    danger: 'bg-accent-rose text-white hover:brightness-95 shadow-sm',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${sizes[size]} ${variants[variant]} ${full ? 'w-full' : ''}`}
    >
      {children}
    </button>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
            {head.map((h) => (
              <th key={h} className="py-2.5 px-1 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-slate-400 py-8 text-center">{children}</div>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-800 tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
