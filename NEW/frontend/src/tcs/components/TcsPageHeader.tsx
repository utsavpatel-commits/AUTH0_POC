export function TcsSectionTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className="border-b border-slate-200 mb-6">
      <span className={`inline-block pb-3 text-sm font-semibold border-b-2 ${active ? 'text-brand-600 border-brand-500' : 'text-slate-500 border-transparent'}`}>
        {label}
      </span>
    </div>
  );
}

export function TcsPageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between items-start gap-4 mb-6">
      <div>
        <h1 className="text-2xl font-bold text-navy-800 tracking-tight">{title}</h1>
        {description && <p className="text-sm text-slate-500 mt-1.5 max-w-3xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function TcsSearchBar({
  value,
  onChange,
  onReset,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  onReset: () => void;
  placeholder: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 mb-4 ring-1 ring-slate-200/60">
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
        </div>
        <button type="button" onClick={onReset} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50">
          Reset
        </button>
      </div>
    </div>
  );
}
