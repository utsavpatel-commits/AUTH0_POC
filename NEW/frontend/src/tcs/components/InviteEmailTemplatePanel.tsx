import { useEffect, useState } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { tcsApi } from '../api';

interface ForgotPasswordTemplate {
  auth0_only: boolean;
  template_name: string;
  dashboard_url: string;
  instructions: string;
  setup_steps: string[];
  subject: string;
  body: string;
  preview_html: string;
}

export function InviteEmailTemplatePanel() {
  const [tpl, setTpl] = useState<ForgotPasswordTemplate | null>(null);
  const [copied, setCopied] = useState<'subject' | 'body' | null>(null);

  useEffect(() => {
    tcsApi<ForgotPasswordTemplate>('/api/tcs/branding/invite-email-template').then(setTpl);
  }, []);

  const copy = async (text: string, which: 'subject' | 'body') => {
    await navigator.clipboard.writeText(text);
    setCopied(which);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!tpl) return <p className="text-slate-400 text-sm">Loading email template…</p>;

  return (
    <section className="bg-white border border-slate-200 rounded-lg p-5 ring-1 ring-slate-200/60 max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="font-semibold text-navy-800">Organization join invite email</h2>
          <p className="text-sm text-slate-500 mt-1">{tpl.instructions}</p>
        </div>
        <a
          href={tpl.dashboard_url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-brand-600 hover:bg-slate-50 shrink-0"
        >
          Open Auth0 templates <ExternalLink size={14} />
        </a>
      </div>

      <ol className="text-sm text-slate-600 space-y-1.5 mb-5 list-decimal list-inside bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
        {tpl.setup_steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <div className="mb-5">
        <p className="text-[13px] font-semibold text-navy-700 mb-2">Preview</p>
        <div className="rounded-lg overflow-hidden ring-1 ring-slate-200" dangerouslySetInnerHTML={{ __html: tpl.preview_html }} />
      </div>

      <div className="space-y-4">
        <TemplateBlock label="Subject" value={tpl.subject} copied={copied === 'subject'} onCopy={() => copy(tpl.subject, 'subject')} />
        <TemplateBlock label="Body (HTML)" value={tpl.body} copied={copied === 'body'} onCopy={() => copy(tpl.body, 'body')} tall />
      </div>

      <p className="text-xs text-slate-400 mt-4">
        Organization invites use Auth0 only. Email says &quot;You&apos;re invited to join [Organization]&quot; — user accepts, sets password, then signs in.
      </p>
    </section>
  );
}

function TemplateBlock({
  label,
  value,
  copied,
  onCopy,
  tall,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  tall?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <label className="text-[13px] font-semibold text-navy-700">{label}</label>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 hover:underline shrink-0">
          <Copy size={12} /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={`text-xs font-mono bg-slate-50 border border-slate-200 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-slate-700 ${tall ? 'max-h-72 overflow-y-auto' : ''}`}>
        {value}
      </pre>
    </div>
  );
}
