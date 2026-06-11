import { useEffect, useRef, useState } from 'react';
import { Building2, ChevronDown, UserCog, Bell, Layers, Check, GraduationCap, ShieldAlert, FileText, Info } from 'lucide-react';
import { usePersona, PERSONAS, personaLabel, isTcs } from '../lib/persona';
import { api } from '../lib/api';
import type { Facility, Org, Role } from '../lib/types';

// Personas that can move between facilities. Everyone else is locked to one facility.
const MULTI_FACILITY: Role[] = ['corporate_leader', 'customer_admin', 'tcs_admin', 'tcs_sales_cs'];

interface Notif { id: number; title: string; body: string | null; kind: string; is_read: boolean; created_at: string | null }
const NOTIF_ICON: Record<string, typeof Bell> = {
  training_due: GraduationCap, regulatory: ShieldAlert, policy_update: FileText, info: Info,
};

export function Header() {
  const { role, setRole, facilityId, setFacilityId, orgId, setOrgId } = usePersona();
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [openP, setOpenP] = useState(false);
  const [openF, setOpenF] = useState(false);
  const [openN, setOpenN] = useState(false);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const facRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const personaRef = useRef<HTMLDivElement>(null);

  // close any open dropdown when clicking outside it (robust across stacking contexts)
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (facRef.current && !facRef.current.contains(t)) setOpenF(false);
      if (notifRef.current && !notifRef.current.contains(t)) setOpenN(false);
      if (personaRef.current && !personaRef.current.contains(t)) setOpenP(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  useEffect(() => {
    if (facilityId == null) return;
    api<Notif[]>(`/api/notifications?facility_id=${facilityId}`).then(setNotifs).catch(() => setNotifs([]));
  }, [facilityId, role, openN]);

  const unread = notifs.filter((n) => !n.is_read).length;
  const markAllRead = () => {
    api(`/api/notifications/read-all?facility_id=${facilityId}`, { method: 'POST' }).catch(() => {});
    setNotifs((ns) => ns.map((n) => ({ ...n, is_read: true })));
  };

  useEffect(() => {
    api<Facility[]>('/api/facilities').then((f) => {
      setFacilities(f);
      if (!f.length) return;
      // Default to (or repair a stale) facility selection. A saved facility id that
      // no longer exists — e.g. after a reseed — would otherwise leave every page empty.
      const valid = facilityId != null && f.some((x) => x.id === facilityId);
      if (!valid) {
        const def = [...f].sort((a, b) => a.id - b.id)[0];
        setFacilityId(def.id);
        setOrgId(def.org_id);
      }
    });
    api<Org[]>('/api/orgs').then(setOrgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedFacility = facilities.find((f) => f.id === facilityId);
  const parentOrg = orgs.find((o) => o.id === selectedFacility?.org_id);

  // A Corporate Leader oversees the multi-facility corporate org — never an independent
  // single-facility org. If they land on one, anchor them to the corporate group so the
  // portfolio roll-up shows the full set of facilities.
  useEffect(() => {
    if (role !== 'corporate_leader' || !orgs.length || !facilities.length || !selectedFacility) return;
    const corp = orgs.find((o) => o.is_corporate);
    if (corp && selectedFacility.org_id !== corp.id) {
      const first = facilities.find((f) => f.org_id === corp.id);
      if (first) { setFacilityId(first.id); setOrgId(corp.id); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, orgs, facilities, selectedFacility?.org_id]);
  const initials = personaLabel(role)
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Scope the facilities this persona may switch between.
  const canSwitch = MULTI_FACILITY.includes(role);
  const switchable = isTcs(role)
    ? facilities // TCS sees all customers
    : facilities.filter((f) => f.org_id === selectedFacility?.org_id); // customer-side: same org only
  const pick = (f: Facility) => {
    setFacilityId(f.id);
    setOrgId(f.org_id);
    setOpenF(false);
  };

  return (
    <header className="sticky top-0 z-50 h-16 bg-white/90 backdrop-blur border-b border-slate-200 flex items-center justify-between px-6">
      <div className="flex items-center gap-2.5">
        <Building2 size={17} className="text-slate-400" />
        {canSwitch ? (
          <div className="relative" ref={facRef}>
            <button
              onClick={() => setOpenF((v) => !v)}
              className="inline-flex items-center gap-2 text-sm font-medium text-navy-800 border border-slate-200 rounded-lg pl-3 pr-2.5 py-2 bg-white hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
            >
              <span className="max-w-[220px] truncate">
                {selectedFacility ? `${selectedFacility.name}${selectedFacility.state ? ` · ${selectedFacility.state}` : ''}` : 'Select facility'}
              </span>
              <ChevronDown size={14} className="text-slate-400" />
            </button>
            {openF && (
                <div className="absolute left-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-1.5 max-h-[70vh] overflow-y-auto">
                  <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold">
                    {isTcs(role) ? `All facilities (${switchable.length})` : `${parentOrg?.name ?? 'Organization'} · ${switchable.length}`}
                  </div>
                  {switchable.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => pick(f)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 ${f.id === facilityId ? 'bg-brand-50' : ''}`}
                    >
                      <span className="min-w-0">
                        <span className="block text-sm text-navy-800 truncate">{f.name}</span>
                        <span className="block text-[11px] text-slate-400">{f.city ? `${f.city}, ` : ''}{f.state}</span>
                      </span>
                      {f.id === facilityId && <Check size={15} className="text-brand-600 shrink-0" />}
                    </button>
                  ))}
                </div>
            )}
          </div>
        ) : (
          // Single-facility persona — locked to their facility, no dropdown.
          <div className="inline-flex items-center gap-2 text-sm font-medium text-navy-800 rounded-lg px-3 py-2 bg-slate-50 border border-slate-200">
            <span className="max-w-[220px] truncate">
              {selectedFacility ? `${selectedFacility.name}${selectedFacility.state ? ` · ${selectedFacility.state}` : ''}` : '—'}
            </span>
          </div>
        )}
        {parentOrg && parentOrg.is_corporate ? (
          <button
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 bg-brand-50 hover:bg-brand-100 ring-1 ring-brand-100 px-2.5 py-1.5 rounded-lg transition-colors"
            onClick={() => setOrgId(parentOrg.id)}
            title="View corporate portfolio"
          >
            <Layers size={13} /> {parentOrg.name}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-slate-500 px-2.5 py-1.5">
            <Building2 size={12} /> Independent facility
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative" ref={notifRef}>
          <button onClick={() => setOpenN((v) => !v)}
            className="relative h-9 w-9 rounded-lg hover:bg-slate-100 flex items-center justify-center text-slate-500 transition-colors">
            <Bell size={18} />
            {unread > 0 && (
              <span className="absolute top-1.5 right-2 min-w-4 h-4 px-1 rounded-full bg-accent-rose text-white text-[9px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </button>
          {openN && (
              <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-lg z-20 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-navy-800">Notifications</span>
                  {unread > 0
                    ? <button onClick={markAllRead} className="text-[11px] font-medium text-brand-600 hover:underline">Mark all read</button>
                    : <span className="text-[11px] text-slate-400">All caught up</span>}
                </div>
                <div className="max-h-96 overflow-y-auto">
                  {notifs.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-slate-400">You’re all caught up.</div>
                  ) : (
                    notifs.map((n) => {
                      const Icon = NOTIF_ICON[n.kind] ?? Info;
                      const tone = n.kind === 'regulatory' ? 'text-accent-rose bg-rose-50'
                        : n.kind === 'training_due' ? 'text-brand-600 bg-brand-50'
                        : n.kind === 'policy_update' ? 'text-accent-amber bg-amber-50' : 'text-slate-500 bg-slate-100';
                      return (
                        <div key={n.id} className={`flex items-start gap-3 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${n.is_read ? 'opacity-60' : ''}`}>
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${tone}`}>
                            <Icon size={15} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-navy-800 leading-snug">{n.title}</div>
                            {n.body && <div className="text-xs text-slate-500 mt-0.5 leading-snug">{n.body}</div>}
                          </div>
                          {!n.is_read && <span className="mt-1.5 h-2 w-2 rounded-full bg-brand-500 shrink-0" />}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
          )}
        </div>

        <div className="relative" ref={personaRef}>
          <button
            onClick={() => setOpenP((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg pl-1.5 pr-2.5 py-1.5 hover:bg-slate-100 transition-colors"
          >
            <span className="h-8 w-8 rounded-full bg-navy-700 text-white text-[12px] font-bold flex items-center justify-center">
              {initials}
            </span>
            <span className="hidden sm:block text-left leading-tight">
              <span className="block text-[13px] font-semibold text-navy-800">{personaLabel(role)}</span>
              <span className="block text-[11px] text-slate-400">Switch persona</span>
            </span>
            <ChevronDown size={14} className="text-slate-400" />
          </button>

          {openP && (
              <div className="absolute right-0 mt-2 w-72 bg-white border border-slate-200 rounded-xl shadow-lg z-20 py-2">
                {(['customer', 'tcs'] as const).map((group) => (
                  <div key={group}>
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] text-slate-400 font-bold flex items-center gap-1.5">
                      <UserCog size={11} />
                      {group === 'customer' ? 'Customer personas' : 'TCS internal'}
                    </div>
                    {PERSONAS.filter((p) => p.group === group).map((p) => (
                      <button
                        key={p.role}
                        onClick={() => {
                          setRole(p.role as Role);
                          setOpenP(false);
                        }}
                        className={`w-full text-left px-3 py-2 hover:bg-slate-50 flex items-center justify-between transition-colors ${
                          role === p.role ? 'bg-brand-50' : ''
                        }`}
                      >
                        <span>
                          <span className="text-sm font-medium text-navy-800">{p.label}</span>
                          <span className="block text-[11px] text-slate-400">{p.blurb}</span>
                        </span>
                        {role === p.role && <span className="h-2 w-2 rounded-full bg-brand-500" />}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
          )}
        </div>
      </div>
    </header>
  );
}
