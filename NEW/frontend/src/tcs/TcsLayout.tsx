import { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useOutletContext } from 'react-router-dom';
import { Building2, ChevronDown, Lock, LogOut, ScrollText, Shield, Users } from 'lucide-react';
import { tcsApi, type TcsStaffSession } from './api';

const USER_MGMT_PATHS = ['/tcs/users', '/tcs/roles'];

function NavItem({
  to,
  icon: Icon,
  label,
  end,
}: {
  to: string;
  icon: typeof Building2;
  label: string;
  end?: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 mx-2.5 my-0.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${
          isActive ? 'bg-white/12 text-white font-semibold' : 'text-navy-100/80 hover:bg-white/6 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-400" />}
          <Icon size={17} className={isActive ? 'text-brand-300' : 'text-navy-200'} />
          {label}
        </>
      )}
    </NavLink>
  );
}

export function TcsLayout() {
  const { staff } = useOutletContext<{ staff: TcsStaffSession }>();
  const nav = useNavigate();
  const location = useLocation();
  const inUserMgmt = USER_MGMT_PATHS.some((p) => location.pathname.startsWith(p));
  const [userMgmtOpen, setUserMgmtOpen] = useState(inUserMgmt);

  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 bg-navy-gradient text-navy-100 border-r border-white/5">
        <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10 shrink-0">
          <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
            <img src="/brand/tcs-logo-mark-trim.png" alt="TCS" className="h-7 w-auto object-contain" />
          </div>
          <div>
            <div className="text-white font-bold text-[15px] leading-tight">The Compliance Store</div>
            <div className="text-[10px] text-brand-200 tracking-[0.18em] font-semibold">TCS ADMIN</div>
          </div>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <div className="px-5 py-1.5 text-[10px] uppercase tracking-[0.13em] text-navy-300 font-bold">Organizations</div>
          <NavItem to="/tcs/organizations" icon={Building2} label="Organizations" end />

          <div className="mt-4 px-5 py-1.5 text-[10px] uppercase tracking-[0.13em] text-navy-300 font-bold">User Management</div>
          <button
            type="button"
            onClick={() => setUserMgmtOpen((o) => !o)}
            className={`w-full flex items-center justify-between mx-2.5 px-3 py-2 rounded-lg text-[13.5px] text-left transition-colors ${
              inUserMgmt ? 'text-white font-semibold' : 'text-navy-100/80 hover:bg-white/6 hover:text-white'
            }`}
            style={{ width: 'calc(100% - 1.25rem)' }}
          >
            <span className="flex items-center gap-3">
              <Users size={17} className={inUserMgmt ? 'text-brand-300' : 'text-navy-200'} />
              User Management
            </span>
            <ChevronDown size={14} className={`transition-transform ${userMgmtOpen ? 'rotate-180' : ''}`} />
          </button>
          {userMgmtOpen && (
            <div className="ml-4 border-l border-white/10 pl-1 mt-0.5">
              <NavItem to="/tcs/users" icon={Users} label="Users" />
              <NavItem to="/tcs/roles" icon={Shield} label="Roles" />
            </div>
          )}

          <div className="mt-4 px-5 py-1.5 text-[10px] uppercase tracking-[0.13em] text-navy-300 font-bold">Security</div>
          <NavItem to="/tcs/security" icon={Lock} label="Security" />
          <NavItem to="/tcs/logs" icon={ScrollText} label="Logs" />
        </nav>
      </aside>

      <div className="lg:pl-60 flex flex-col min-h-screen">
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="lg:hidden">
            <img src="/brand/tcs-logo-full-trim.png" alt="TCS" className="h-8" />
          </div>
          <div className="flex items-center gap-3 ml-auto text-sm">
            <span className="text-slate-500">{staff.name}</span>
            <button
              type="button"
              onClick={async () => {
                await tcsApi('/api/tcs/auth/logout', { method: 'POST' }).catch(() => {});
                nav('/login');
              }}
              className="inline-flex items-center gap-1 text-slate-600 hover:text-navy-800"
            >
              <LogOut size={15} /> Log out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 w-full">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function OrgAvatar({ name, large }: { name: string; large?: boolean }) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-slate-100 ring-1 ring-slate-200 font-semibold text-navy-800 ${
        large ? 'h-14 w-14 text-xl' : 'h-8 w-8 text-sm'
      }`}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Vertical left nav for organization detail sections (Auth0-style). */
export function OrgSubNav({
  active,
  onChange,
  items,
}: {
  active: string;
  onChange: (id: string) => void;
  items: { id: string; label: string }[];
}) {
  return (
    <nav className="w-52 shrink-0 pr-4 border-r border-slate-200">
      <ul className="space-y-0.5">
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onChange(item.id)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700 font-semibold ring-1 ring-brand-100'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-navy-800'
                }`}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
