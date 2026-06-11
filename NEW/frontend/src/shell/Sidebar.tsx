import { NavLink } from 'react-router-dom';
import { usePersona } from '../lib/persona';
import { navForRole } from './nav';

export function Sidebar() {
  const { role } = usePersona();
  const items = navForRole(role);
  const groups = [...new Set(items.map((i) => i.group))];

  return (
    <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-64 bg-navy-gradient text-navy-100">
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-white/10">
        <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center shadow-sm shrink-0 overflow-hidden">
          <img src="/brand/tcs-logo-mark-trim.png" alt="The Compliance Store" className="h-7 w-auto object-contain" />
        </div>
        <div>
          <div className="text-white font-bold text-[15px] leading-tight">The Compliance Store</div>
          <div className="text-[10px] text-brand-200 tracking-[0.18em] font-semibold">WEB 3.0 PLATFORM</div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {groups.map((g) => (
          <div key={g} className="mb-3">
            <div className="px-5 py-1.5 text-[10px] uppercase tracking-[0.13em] text-navy-300 font-bold">
              {g}
            </div>
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const Icon = i.icon;
                return (
                  <NavLink
                    key={i.to}
                    to={i.to}
                    end={i.to === '/command-center'}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 mx-2.5 my-0.5 px-3 py-2 rounded-lg text-[13.5px] transition-colors ${
                        isActive
                          ? 'bg-white/12 text-white font-semibold'
                          : 'text-navy-100/80 hover:bg-white/6 hover:text-white'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-full bg-brand-400" />
                        )}
                        <Icon size={17} className={isActive ? 'text-brand-300' : 'text-navy-200'} />
                        <span>{i.label}</span>
                        {i.stub && (
                          <span className="ml-auto text-[8.5px] tracking-wide bg-white/10 text-navy-200 px-1.5 py-0.5 rounded font-semibold">
                            SOON
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                );
              })}
          </div>
        ))}
      </nav>

      <div className="px-5 py-3.5 border-t border-white/10 text-[10px] text-navy-300">
        © {new Date().getFullYear()} The Compliance Store
      </div>
    </aside>
  );
}
