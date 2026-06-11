import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { usePersona } from '../lib/persona';

export function AppLayout() {
  const { role } = usePersona();
  // Frontline learners get a focused shell — only their training, no module sidebar.
  const learnerOnly = role === 'end_user';
  return (
    <div className="min-h-screen bg-slate-50">
      {!learnerOnly && <Sidebar />}
      <div className={`${learnerOnly ? '' : 'lg:pl-64'} flex flex-col min-h-screen`}>
        <Header />
        <main className="flex-1 p-6 max-w-[1400px] w-full mx-auto">
          <Outlet />
        </main>
        <footer className="border-t border-slate-200 bg-white py-3">
          <p className="text-center text-[11px] text-slate-400">
            © {new Date().getFullYear()} The Compliance Store · Web 3.0 Platform · Because Getting It Right Matters.
          </p>
        </footer>
      </div>
    </div>
  );
}
