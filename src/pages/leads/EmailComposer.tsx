import React, { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Loader2, Mail, Paperclip, Send, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { mailApi } from '../../services/api/mail';
import { leadsApi, type LeadDetail } from '../../services/api/leads';

// Email a lead from the company address, optionally with a proposal attached. Logged on the lead's history.

const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const inputClass =
  'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50';
const labelClass = 'text-xs font-semibold text-foreground';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_BYTES = 15 * 1024 * 1024;
const emailsIn = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

const EmailComposer: React.FC<{ lead: LeadDetail; onClose: () => void }> = ({ lead, onClose }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const { data: status } = useQuery({ queryKey: ['mail', 'status'], queryFn: mailApi.status });
  const { data: proposals = [] } = useQuery({ queryKey: ['leads', 'proposals', lead.id], queryFn: () => leadsApi.proposals(lead.id) });
  const latest = proposals.find((p) => p.file && p.uploadId);
  const [to, setTo] = useState(lead.email ?? '');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState(lead.service ? `Proposal for ${lead.service}` : 'Our proposal');
  const [body, setBody] = useState(`Dear ${lead.name},\n\nThank you for your interest. Please find our proposal attached. Let us know if you have any questions or would like to discuss it.\n\n`);
  const [attachProposal, setAttachProposal] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [tried, setTried] = useState(false);

  const problem = !emailsIn(to).length || !emailsIn(to).every((e) => EMAIL_RE.test(e)) ? 'Enter a valid email address'
    : cc && !emailsIn(cc).every((e) => EMAIL_RE.test(e)) ? 'Check the CC addresses'
      : !subject.trim() ? 'Add a subject' : !body.trim() ? 'Write the message' : '';

  const send = useMutation({
    mutationFn: () => mailApi.send({
      to, cc, subject: subject.trim(), body, leadId: lead.id, files,
      uploadIds: attachProposal && latest?.uploadId ? [latest.uploadId] : [],
    }),
    onSuccess: (r) => {
      toast.success(`Email sent to ${to}${r.savedToSent ? '. A copy is in the Sent folder.' : '.'}`, 'Email');
      queryClient.invalidateQueries({ queryKey: ['leads', 'activity', lead.id] });
      onClose();
    },
    onError: (err) => toast.error(apiError(err, 'The email was not sent.'), 'Email'),
  });
  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = '';
    const big = picked.find((f) => f.size > MAX_BYTES);
    if (big) return toast.error(`"${big.name}" is larger than 15 MB.`, 'Email');
    setFiles([...files, ...picked].slice(0, 5));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Send email">
      <div className="w-full max-w-2xl rounded-2xl border border-border bg-card shadow-2xl my-8">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Mail className="w-4 h-4 text-blue-500" /> Email {lead.name}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        {status && !status.configured ? (
          <div className="p-5 text-sm text-muted-foreground">
            Company email is not set up yet. {status.isAdmin ? 'Add it in Settings → Company email.' : 'Ask an Admin to add it in Settings → Company email.'}
          </div>
        ) : (
          <form noValidate onSubmit={(e) => { e.preventDefault(); setTried(true); if (!problem) send.mutate(); }} className="p-5 space-y-3">
            <p className="text-xs text-muted-foreground">From <span className="font-semibold text-foreground">{status?.fromName ? `${status.fromName} <${status.fromEmail}>` : status?.fromEmail ?? '…'}</span></p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="em-to" className={labelClass}>To <span className="text-red-500">*</span></label>
                <input id="em-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@company.com" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="em-cc" className={labelClass}>CC</label>
                <input id="em-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Optional, comma separated" className={inputClass} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="em-subject" className={labelClass}>Subject <span className="text-red-500">*</span></label>
              <input id="em-subject" value={subject} maxLength={300} onChange={(e) => setSubject(e.target.value)} className={inputClass} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="em-body" className={labelClass}>Message <span className="text-red-500">*</span></label>
              <textarea id="em-body" rows={8} value={body} maxLength={20000} onChange={(e) => setBody(e.target.value)} className={`${inputClass} resize-y`} />
              <p className="text-[11px] text-muted-foreground">The company signature is added at the end.</p>
            </div>
            <div className="space-y-2">
              {latest?.file && (
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input type="checkbox" checked={attachProposal} onChange={(e) => setAttachProposal(e.target.checked)} />
                  <FileText className="w-4 h-4 text-red-500" /> Attach proposal v{latest.version} · {latest.file.name}
                </label>
              )}
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="mr-1.5 inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-muted text-xs text-foreground">
                  <FileText className="w-3 h-3" /> {f.name}
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="cursor-pointer"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <input ref={fileInput} type="file" multiple hidden onChange={(e) => pick(e.target.files)} />
              <button type="button" onClick={() => fileInput.current?.click()} className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                <Paperclip className="w-3.5 h-3.5" /> Attach a file
              </button>
            </div>
            {tried && problem && <p className="text-xs text-red-500">{problem}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer">Cancel</button>
              <button type="submit" disabled={send.isPending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
                {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send email
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default EmailComposer;
