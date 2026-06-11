import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { tcsApi, type TcsStaffSession } from './api';

export function TcsGuard() {
  const [staff, setStaff] = useState<TcsStaffSession | null | undefined>();

  useEffect(() => {
    tcsApi<{ staff: TcsStaffSession }>('/api/tcs/auth/me').then((r) => setStaff(r.staff)).catch(() => setStaff(null));
  }, []);

  if (staff === undefined) return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
  if (!staff) return <Navigate to="/login" replace />;
  return <Outlet context={{ staff }} />;
}
