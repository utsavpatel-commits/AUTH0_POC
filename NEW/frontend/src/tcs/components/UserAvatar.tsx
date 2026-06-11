const PALETTES = [
  'bg-rose-100 text-rose-700 ring-rose-200',
  'bg-sky-100 text-sky-700 ring-sky-200',
  'bg-violet-100 text-violet-700 ring-violet-200',
  'bg-amber-100 text-amber-800 ring-amber-200',
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-indigo-100 text-indigo-700 ring-indigo-200',
];

function palette(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i)) % PALETTES.length;
  return PALETTES[h];
}

function initials(name: string, email: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

export function UserAvatar({ name, email }: { name: string; email: string }) {
  const cls = palette(name || email);
  return (
    <span className={`inline-flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold ring-1 ${cls}`}>
      {initials(name, email)}
    </span>
  );
}
