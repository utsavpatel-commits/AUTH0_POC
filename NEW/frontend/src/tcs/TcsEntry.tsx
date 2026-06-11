import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Login } from '../shell/Login';
import { tcsApi } from './api';

/** /tcs — same sign-in page as /login; sends TCS admins to the org console after Auth0 password. */
export function TcsEntry() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    tcsApi('/api/tcs/auth/me')
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>;
  }
  if (authed) return <Navigate to="/tcs/organizations" replace />;
  return <Login />;
}
