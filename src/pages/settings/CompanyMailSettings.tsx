import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Mail, PlugZap, Save, Trash2, XCircle } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { STACKMAIL_DEFAULTS, mailApi, type MailSettings, type MailTestResult } from '../../services/api/mail';

// ─── Company email ──────────────────────────────────────────────────────────────
// The mailbox Work OS sends from (e.g. info@intellijohn.com). Admins only. Emails go out over SMTP and a copy is
// saved to the mailbox's Sent folder over IMAP.

const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50';
const labelClass = 'text-xs font-semibold text-foreground';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const Check: React.FC<{ ok: boolean; title: string; detail: string | null }> = ({ ok, title, detail }) => (
  <div className={`flex gap-2 rounded-xl border p-3 text-sm ${ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
    {ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 text-emerald-600 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 text-red-500 shrink-0" />}
    <div>
      <p className="font-semibold text-foreground">{title}</p>
      {detail && <p className="text-xs text-muted-foreground mt-0.5">{detail}</p>}
    </div>
  </div>
);

const MailForm: React.FC<{ saved: MailSettings | null }> = ({ saved }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [f, setF] = useState(() => (saved ? {
    fromEmail: saved.fromEmail, fromName: saved.fromName ?? '', username: saved.username, password: '', signature: saved.signature ?? '',
    smtpHost: saved.smtpHost, smtpPort: String(saved.smtpPort), smtpSecure: saved.smtpSecure,
    imapHost: saved.imapHost ?? '', imapPort: String(saved.imapPort),
  } : {
    fromEmail: '', fromName: '', username: '', password: '', signature: '',
    smtpHost: STACKMAIL_DEFAULTS.smtpHost, smtpPort: String(STACKMAIL_DEFAULTS.smtpPort), smtpSecure: STACKMAIL_DEFAULTS.smtpSecure,
    imapHost: STACKMAIL_DEFAULTS.imapHost, imapPort: String(STACKMAIL_DEFAULTS.imapPort),
  }));
  const [tried, setTried] = useState(false);
  const [test, setTest] = useState<MailTestResult | null>(null);
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((s) => ({ ...s, [key]: e.target.value, ...(key === 'fromEmail' && (!s.username || s.username === s.fromEmail) ? { username: e.target.value } : {}) }));

  const problems = {
    fromEmail: !EMAIL_RE.test(f.fromEmail.trim()) ? 'Enter the company email address' : '',
    username: !f.username.trim() ? 'Enter the mailbox username (usually the email address)' : '',
    password: !saved && !f.password ? 'Enter the mailbox password' : '',
    smtpHost: !f.smtpHost.trim() ? 'Enter the SMTP server' : '',
  };
  const invalid = Object.values(problems).some(Boolean);
  const err = (k: keyof typeof problems) => (tried && problems[k] ? <p className="mt-1 text-[11px] text-red-500">{problems[k]}</p> : null);

  const save = useMutation({
    mutationFn: () => mailApi.save({
      fromEmail: f.fromEmail.trim(), fromName: f.fromName.trim() || null, username: f.username.trim(), signature: f.signature.trim() || null,
      smtpHost: f.smtpHost.trim(), smtpPort: Number(f.smtpPort) || 465, smtpSecure: f.smtpSecure,
      imapHost: f.imapHost.trim() || null, imapPort: Number(f.imapPort) || 993, ...(f.password ? { password: f.password } : {}),
    }),
    onSuccess: () => { toast.success('Email settings saved. Test the connection next.', 'Company email'); setF((s) => ({ ...s, password: '' })); queryClient.invalidateQueries({ queryKey: ['mail'] }); },
    onError: (e) => toast.error(apiError(e, 'Could not save the settings.'), 'Company email'),
  });
  const runTest = useMutation({
    mutationFn: mailApi.test,
    onSuccess: (r) => { setTest(r); queryClient.invalidateQueries({ queryKey: ['mail', 'settings'] }); },
    onError: (e) => toast.error(apiError(e, 'Could not test the connection.'), 'Company email'),
  });
  const remove = useMutation({
    mutationFn: mailApi.remove,
    onSuccess: () => { toast.success('Company email removed.', 'Company email'); setTest(null); queryClient.invalidateQueries({ queryKey: ['mail'] }); },
  });

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20"><Mail className="w-5 h-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Company email</h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            The mailbox Work OS sends from, by hand or through the AI assistant. Anyone who can work on leads can send from it; every email is logged with who sent it, and a copy goes to the mailbox's Sent folder.
          </p>
        </div>
      </div>

      <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!invalid) save.mutate(); }} className="rounded-2xl border border-border bg-card p-5 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="m-from" className={labelClass}>Email address <span className="text-red-500">*</span></label>
            <input id="m-from" type="email" value={f.fromEmail} onChange={set('fromEmail')} placeholder="info@intellijohn.com" className={inputClass} />
            {err('fromEmail')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-name" className={labelClass}>Sender name</label>
            <input id="m-name" value={f.fromName} maxLength={120} onChange={set('fromName')} placeholder="IntelliJohn Labs" className={inputClass} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-user" className={labelClass}>Mailbox username <span className="text-red-500">*</span></label>
            <input id="m-user" value={f.username} onChange={set('username')} placeholder="info@intellijohn.com" className={inputClass} autoComplete="off" />
            {err('username')}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="m-pass" className={labelClass}>Mailbox password {!saved && <span className="text-red-500">*</span>}</label>
            <input id="m-pass" type="password" value={f.password} onChange={set('password')} placeholder={saved ? 'Saved — type to change' : ''} className={inputClass} autoComplete="new-password" />
            {err('password')}
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Servers <span className="normal-case font-normal">(filled in for StackMail / 20i)</span></p>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_7rem_9rem] gap-3 items-end">
            <div className="space-y-1.5">
              <label htmlFor="m-smtp" className={labelClass}>SMTP server (sending)</label>
              <input id="m-smtp" value={f.smtpHost} onChange={set('smtpHost')} className={inputClass} />
              {err('smtpHost')}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="m-smtp-port" className={labelClass}>Port</label>
              <input id="m-smtp-port" inputMode="numeric" value={f.smtpPort} onChange={(e) => setF((s) => ({ ...s, smtpPort: e.target.value, smtpSecure: e.target.value === '465' }))} className={inputClass} />
            </div>
            <label className="flex items-center gap-2 text-xs text-foreground pb-2.5">
              <input type="checkbox" checked={f.smtpSecure} onChange={(e) => setF((s) => ({ ...s, smtpSecure: e.target.checked }))} /> SSL (port 465)
            </label>
            <div className="space-y-1.5">
              <label htmlFor="m-imap" className={labelClass}>IMAP server (Sent folder copy)</label>
              <input id="m-imap" value={f.imapHost} onChange={set('imapHost')} placeholder="Leave empty to skip" className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="m-imap-port" className={labelClass}>Port</label>
              <input id="m-imap-port" inputMode="numeric" value={f.imapPort} onChange={set('imapPort')} className={inputClass} />
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="m-sig" className={labelClass}>Signature (added to every email)</label>
          <textarea id="m-sig" rows={4} value={f.signature} maxLength={2000} onChange={set('signature')} placeholder={'Regards,\nIntelliJohn Labs\n+91 …  |  www.intellijohn.com'} className={`${inputClass} resize-y`} />
        </div>

        <div className="flex flex-wrap gap-2 justify-end">
          {saved && (
            <button type="button" disabled={remove.isPending}
              onClick={async () => { if (await confirm({ title: 'Remove the company email?', message: 'Work OS will stop sending email until it is set up again. Past emails stay logged.', confirmLabel: 'Remove', variant: 'danger' })) remove.mutate(); }}
              className="mr-auto flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer disabled:opacity-50">
              <Trash2 className="w-4 h-4" /> Remove
            </button>
          )}
          {saved && (
            <button type="button" disabled={runTest.isPending} onClick={() => runTest.mutate()} className={secondaryButton}>
              {runTest.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlugZap className="w-4 h-4" />} Test connection
            </button>
          )}
          <button type="submit" disabled={save.isPending} className={primaryButton}>
            {save.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </form>

      {(test || saved?.lastTestAt) && (
        <section aria-label="Connection test" className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <h2 className="text-sm font-bold text-foreground">Connection test</h2>
          {test ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Check ok={test.smtp.ok} title={test.smtp.ok ? 'Sending works' : 'Sending failed'} detail={test.smtp.error} />
              <Check ok={test.imap.ok && !!test.imap.sentFolder} title={test.imap.ok ? (test.imap.sentFolder ? `Sent folder: ${test.imap.sentFolder}` : 'Sent folder not found') : 'Sent folder copy unavailable'} detail={test.imap.error} />
            </div>
          ) : (
            <Check ok={!!saved?.lastTestOk} title={saved?.lastTestOk ? 'Last test passed' : 'Last test failed'} detail={saved?.lastTestError ?? (saved?.lastTestAt ? new Date(saved.lastTestAt).toLocaleString('en-IN') : null)} />
          )}
          {test && !test.smtp.ok && test.smtp.error?.includes('blocked') && (
            <p className="text-xs text-muted-foreground">The server could not reach the mail server. On Render's free plan, outgoing email ports are blocked: upgrade the backend to a paid plan, move it to the VPS, or use an email-sending service.</p>
          )}
        </section>
      )}
    </div>
  );
};

const CompanyMailSettings: React.FC = () => {
  const { data: saved, isLoading } = useQuery({ queryKey: ['mail', 'settings'], queryFn: mailApi.settings });
  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>;
  // A fresh form whenever the saved settings change
  return <MailForm key={saved?.updatedAt ?? 'new'} saved={saved ?? null} />;
};

export default CompanyMailSettings;
