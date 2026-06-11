import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';

/** Shown after an invited admin sets their password — not the login form. */
export function InviteComplete() {
  const [params] = useSearchParams();
  const email = params.get('email');

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm text-center">
        <CheckCircle2 className="mx-auto text-emerald-500 mb-4" size={48} />
        <h1 className="text-xl font-bold text-navy-800 mb-2">You&apos;re all set</h1>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">
          Your password has been created
          {email ? (
            <> for <strong>{email}</strong></>
          ) : null}
          . Your organization administrator account is ready.
        </p>
        <p className="text-xs text-slate-500 mb-6">
          You can sign in whenever you want to access the platform.
        </p>
        <Link
          to={email ? `/login?email=${encodeURIComponent(email)}` : '/login'}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-600"
        >
          Sign in now
        </Link>
      </div>
    </div>
  );
}
