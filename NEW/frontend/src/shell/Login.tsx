import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ArrowRight, Search, GraduationCap, ClipboardCheck, KeyRound, ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { usePersona } from '../lib/persona';
import { tcsApi } from '../tcs/api';
import type { Role } from '../lib/types';

interface Lookup {
  found: boolean;
  user_id?: number;
  name?: string;
  role?: Role;
  facility_id?: number | null;
  org_id?: number | null;
  auth_mode?: 'password' | 'code';
  temp_token?: string | null;
  auth0_otp?: boolean;
  tcs_console?: boolean;
  auth0_password?: boolean;
}

export function Login() {
  const nav = useNavigate();
  const { setRole, setFacilityId, setOrgId } = usePersona();
  const [email, setEmail] = useState('');
  const [step, setStep] = useState<'id' | 'password' | 'code'>('id');
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [inviteReady, setInviteReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const prefill = params.get('email');
    if (prefill) setEmail(prefill);
    if (params.get('invited') === '1') setInviteReady(true);
  }, []);

  const enter = (lk: Lookup) => {
    if (lk.role) setRole(lk.role);
    if (lk.facility_id != null) setFacilityId(lk.facility_id);
    if (lk.org_id != null) setOrgId(lk.org_id);
    nav('/lms');
  };

  const onContinue = async () => {
    setError(null);
    setBusy(true);
    try {
      const lk = await api<Lookup>(`/api/lms/login-lookup?login_id=${encodeURIComponent(email.trim())}`);
      if (!lk.found) { setError("We couldn't find an account for that email."); return; }
      if (lk.auth_mode === 'code' && lk.auth0_otp) {
        await api('/api/passwordless/send', { method: 'POST', body: { email: email.trim() } });
      }
      setLookup(lk);
      setStep(lk.auth_mode === 'code' ? 'code' : 'password');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const detail = msg.includes(': ') ? msg.split(': ').slice(1).join(': ') : msg;
      setError(detail || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onForgotPassword = async () => {
    if (!email.trim()) return;
    setError(null);
    setResetSent(false);
    setResetBusy(true);
    try {
      await tcsApi('/api/tcs/auth/forgot-password', { method: 'POST', body: { email: email.trim() } });
      setResetSent(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || 'Could not send reset email. Please try again.');
    } finally {
      setResetBusy(false);
    }
  };

  const onPasswordSignIn = async () => {
    if (!lookup) return;
    setError(null);
    setBusy(true);
    try {
      if (lookup.tcs_console && lookup.auth0_password) {
        await tcsApi('/api/tcs/auth/login', { method: 'POST', body: { email: email.trim(), password } });
        nav('/tcs/organizations');
        return;
      }
      if (lookup.auth0_password) {
        const session = await api<{ role: Role; org_id?: number | null; facility_id?: number | null }>(
          '/api/lms/auth/login',
          { method: 'POST', body: { email: email.trim(), password } },
        );
        setRole(session.role);
        if (session.facility_id != null) setFacilityId(session.facility_id);
        if (session.org_id != null) setOrgId(session.org_id);
        nav('/lms');
        return;
      }
      enter(lookup);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      setError(msg || 'Invalid email or password.');
    } finally {
      setBusy(false);
    }
  };

  const onVerifyCode = async () => {
    if (!lookup) return;
    setError(null);
    setBusy(true);
    try {
      if (lookup.auth0_otp) {
        await api('/api/passwordless/verify', {
          method: 'POST',
          body: { email: email.trim(), code: code.trim() },
        });
      }
      enter(lookup);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      const detail = msg.includes(': ') ? msg.split(': ').slice(1).join(': ') : msg;
      setError(detail || 'Invalid or expired code. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[65fr_35fr]">
      {/* LEFT — brand hero (65%) */}
      <div className="relative hidden lg:block overflow-hidden bg-navy-900">
        <img
          src="/brand/login-hero.jpg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-navy-900/90 via-navy-800/82 to-brand-700/72" />
        <div className="relative h-full flex flex-col justify-between p-14 text-white">
          <div className="inline-flex items-center rounded-lg bg-white px-5 py-3 shadow-md w-fit">
            <img src="/brand/tcs-logo-full-trim.png" alt="The Compliance Store" className="h-9 w-auto" />
          </div>

          <div className="max-w-xl">
            <h1 className="text-[40px] leading-[1.12] font-bold tracking-tight">
              The compliance operating platform for long-term care.
            </h1>
            <p className="mt-5 text-white/75 text-[16px] leading-relaxed">
              Survey readiness, learning management, document control, and compliance reporting —
              unified on the deepest regulatory library in long-term care, with intelligence built in.
            </p>
            <div className="mt-9 flex flex-wrap gap-2.5">
              {[
                { icon: ClipboardCheck, label: 'Survey Readiness' },
                { icon: GraduationCap, label: 'Learning Management' },
                { icon: Search, label: 'Intelligent Search' },
              ].map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3.5 py-1.5 text-[13px] font-medium backdrop-blur"
                >
                  <f.icon size={15} className="text-brand-200" /> {f.label}
                </span>
              ))}
            </div>
          </div>

          <div className="text-[12px] text-white/55">
            © {new Date().getFullYear()} The Compliance Store · Because Getting It Right Matters.
          </div>
        </div>
      </div>

      {/* RIGHT — sign-in (35%) */}
      <div className="flex items-center justify-center p-6 sm:p-10 bg-white">
        <div className="w-full max-w-sm">
          {/* mobile brand */}
          <div className="lg:hidden mb-8">
            <img src="/brand/tcs-logo-full-trim.png" alt="The Compliance Store" className="h-10 w-auto" />
          </div>

          <h2 className="text-2xl font-bold text-navy-800 tracking-tight">Sign in</h2>
          {inviteReady && (
            <div className="mt-3 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
              Your password is set. Sign in below as your organization administrator — no approval needed.
            </div>
          )}
          <p className="text-sm text-slate-500 mt-1.5 mb-7">
            {step === 'id' ? 'Enter your email to continue.'
              : step === 'password' && lookup?.tcs_console
                ? `TCS Admin Console — welcome back${lookup?.name ? `, ${lookup.name.split(' ')[0]}` : ''}.`
              : step === 'password' ? `Welcome back${lookup?.name ? `, ${lookup.name.split(' ')[0]}` : ''}.`
              : 'Check your email for a one-time code.'}
          </p>

          {/* STEP 1 — login id only */}
          {step === 'id' && (
            <form onSubmit={(e) => { e.preventDefault(); if (email.trim()) onContinue(); }} className="space-y-4">
              <div>
                <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@facility.com"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm text-navy-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400" />
                </div>
              </div>
              {error && <div className="text-xs text-accent-rose">{error}</div>}
              <button type="submit" disabled={!email.trim() || busy}
                className="group w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:opacity-50">
                Continue <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </button>
            </form>
          )}

          {/* STEP 2a — password (staff / admins) */}
          {step === 'password' && (
            <form onSubmit={(e) => { e.preventDefault(); onPasswordSignIn(); }} className="space-y-4">
              <div className="flex items-center gap-2 rounded-lg bg-slate-50 ring-1 ring-slate-200 px-3 py-2 text-sm text-slate-600">
                <Mail size={14} className="text-slate-400" /> {email}
              </div>
              {resetSent && (
                <div className="rounded-lg bg-emerald-50 ring-1 ring-emerald-100 px-3.5 py-3 text-sm text-emerald-800">
                  <strong>Reset email sent.</strong> Check <strong>{email}</strong> for a password reset link from Auth0 (including spam).
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[13px] font-semibold text-navy-700">Password</label>
                  {(lookup?.auth0_password || lookup?.tcs_console) && (
                    <button
                      type="button"
                      onClick={onForgotPassword}
                      disabled={resetBusy}
                      className="text-[12px] font-medium text-brand-600 hover:text-brand-700 disabled:opacity-50"
                    >
                      {resetBusy ? 'Sending…' : 'Forgot password?'}
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                    className="w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 py-2.5 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400" />
                </div>
              </div>
              {error && <div className="text-xs text-accent-rose">{error}</div>}
              <button type="submit" disabled={!password.trim() || busy}
                className="group w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50">
                {lookup?.tcs_console ? 'Go to TCS console' : 'Sign in'} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <BackLink onClick={() => { setStep('id'); setLookup(null); setPassword(''); setResetSent(false); setError(null); }} />
            </form>
          )}

          {/* STEP 2b — one-time email code (frontline learners) */}
          {step === 'code' && (
            <form onSubmit={(e) => { e.preventDefault(); onVerifyCode(); }} className="space-y-4">
              <div className="flex items-start gap-2.5 rounded-lg bg-brand-50/70 ring-1 ring-brand-100 px-3.5 py-3 text-sm">
                <KeyRound size={16} className="text-brand-500 mt-0.5 shrink-0" />
                <div className="text-slate-600">
                  We emailed a one-time sign-in code to <strong className="text-navy-800">{email}</strong>.
                  {lookup?.temp_token && <div className="mt-1 text-xs text-slate-500">Demo code: <span className="font-mono font-bold text-brand-700">{lookup.temp_token}</span></div>}
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-navy-700 mb-1.5">One-time code</label>
                <input autoFocus value={code} onChange={(e) => setCode(e.target.value)} placeholder="Enter the code from your email"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-mono tracking-wider text-navy-800 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:border-brand-400" />
              </div>
              {error && <div className="text-xs text-accent-rose">{error}</div>}
              <button type="submit" disabled={!code.trim() || busy}
                className="group w-full inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50">
                Go to my training <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <BackLink onClick={() => { setStep('id'); setLookup(null); }} />
            </form>
          )}

          {step === 'id' && (
            <p className="text-center text-[12px] text-slate-400 mt-8">
              Need access? <a className="text-brand-600 font-medium hover:text-brand-700" href="#">Contact your administrator</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 text-[12px] font-medium text-slate-500 hover:text-navy-800">
      <ArrowLeft size={13} /> Use a different email
    </button>
  );
}
