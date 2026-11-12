import React, { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, Clock, FileText, Loader2, Plus, Receipt, Search, Send, X, XCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { isLeadsndealsTenant } from '../../features/auth/company';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { useToast } from '../../components/ui/Toast';
import { billingApi, type BillingClient, type BillingPayment, type PaymentMode, type ReceiptStatus } from '../../services/api/billing';
import InvoicesPanel from './InvoicesPanel';

// Billing (LeadsNDeals): payments received from clients are recorded in Zoho Books, and the Zoho receipt is sent to
// the client on WhatsApp after someone checks it and presses Send.

const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const rupees = (v: number | string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
const MODES: Record<PaymentMode, string> = { upi: 'UPI', bank_transfer: 'Bank transfer', cash: 'Cash', cheque: 'Cheque', other: 'Other' };
const input = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

const STATUS: Record<ReceiptStatus, { label: string; cls: string; Icon: typeof Clock }> = {
  pending: { label: 'Receipt not sent', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', Icon: Clock },
  sent: { label: 'Receipt sent', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', Icon: CheckCircle2 },
  failed: { label: 'Not delivered', cls: 'bg-red-500/10 text-red-700 dark:text-red-300', Icon: XCircle },
  skipped: { label: 'No receipt', cls: 'bg-muted text-muted-foreground', Icon: X },
};

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl my-8">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Receipt className="w-4 h-4 text-emerald-600" /> {title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

/** Send (or resend) a payment's receipt on WhatsApp */
const SendReceipt: React.FC<{ payment: BillingPayment; client?: BillingClient; onClose: () => void; onDone: () => void }> = ({ payment, client, onClose, onDone }) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState(payment.whatsappTo || client?.whatsapp || '');
  const view = useMutation({ mutationFn: () => billingApi.receiptUrl(payment.id), onSuccess: (url) => window.open(url, '_blank', 'noopener'), onError: (e) => toast.error(apiError(e, 'Could not open the receipt'), 'Billing') });
  const send = useMutation({
    mutationFn: () => billingApi.sendReceipt(payment.id, phone.trim()),
    onSuccess: (p) => {
      if (p.receiptStatus === 'sent') toast.success(`Receipt sent to ${payment.clientName} on WhatsApp.`, 'Billing');
      else toast.error(`WhatsApp did not deliver it: ${p.whatsappError ?? 'unknown error'}`, 'Billing');
      onDone();
    },
    onError: (e) => toast.error(apiError(e, 'The receipt was not sent.'), 'Billing'),
  });
  const skip = useMutation({ mutationFn: () => billingApi.skip(payment.id), onSuccess: onDone, onError: (e) => toast.error(apiError(e, 'Could not change it'), 'Billing') });
  const busy = send.isPending || skip.isPending;

  return (
    <Modal title="Send receipt" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-0.5">
          <p className="font-semibold text-foreground">{payment.clientName}</p>
          <p className="text-xs text-muted-foreground">{rupees(payment.amount)} · {MODES[payment.mode]} · {shortDate(payment.paidOn)}{payment.reference ? ` · Ref ${payment.reference}` : ''}</p>
          {payment.zohoPaymentNumber && <p className="text-xs text-muted-foreground">Zoho Books payment #{payment.zohoPaymentNumber}</p>}
        </div>
        <button type="button" onClick={() => view.mutate()} disabled={view.isPending} className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50">
          {view.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Check the receipt PDF first
        </button>
        <div className="space-y-1.5">
          <label htmlFor="rc-phone" className="text-xs font-semibold text-foreground">Client's WhatsApp number <span className="text-red-500">*</span></label>
          <input id="rc-phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="e.g. 9847012345" className={input} />
          <p className="text-[11px] text-muted-foreground">Saved for this client, so next time it is filled in.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {payment.receiptStatus === 'pending' && (
            <button type="button" disabled={busy} onClick={() => skip.mutate()} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted cursor-pointer disabled:opacity-50">No receipt</button>
          )}
          <button type="button" disabled={busy} onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer disabled:opacity-50">Later</button>
          <button type="button" disabled={busy || !phone.trim()} onClick={() => send.mutate()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
            {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send on WhatsApp
          </button>
        </div>
      </div>
    </Modal>
  );
};

/** Record a payment: saved in Zoho Books, then the receipt step opens */
const RecordPayment: React.FC<{ clients: BillingClient[]; onClose: () => void; onSaved: (p: BillingPayment) => void }> = ({ clients, onClose, onSaved }) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [client, setClient] = useState<BillingClient | null>(null);
  const [amount, setAmount] = useState('');
  const [paidOn, setPaidOn] = useState(todayIst());
  const [mode, setMode] = useState<PaymentMode>('upi');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : clients).slice(0, 8);
  }, [clients, query]);
  const value = Number(amount);
  const problem = !client ? 'Choose the client' : !amount ? 'Enter the amount' : !(value > 0) ? 'Enter an amount above zero' : paidOn > todayIst() ? 'The date cannot be in the future' : '';

  const save = useMutation({
    mutationFn: () => billingApi.record({ clientId: client!.id, clientName: client!.name, amount: value, paidOn, mode, reference: reference.trim() || undefined, note: note.trim() || undefined }),
    onSuccess: (p) => { toast.success(`${rupees(p.amount)} from ${p.clientName} recorded in Zoho Books.`, 'Billing'); onSaved(p); },
    onError: (e) => { toast.error(apiError(e, 'The payment was not recorded.'), 'Billing'); setConfirming(false); },
  });

  if (confirming && client) {
    return (
      <Modal title="Record payment" onClose={onClose}>
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Record <span className="font-bold">{rupees(value)}</span> received from <span className="font-bold">{client.name}</span> by {MODES[mode]} on {shortDate(paidOn)}{reference.trim() ? ` (ref ${reference.trim()})` : ''}? It is saved in Zoho Books.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={save.isPending} onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer disabled:opacity-50">Back</button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
              {save.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Record {rupees(value)}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Record payment" onClose={onClose}>
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!problem) setConfirming(true); }} className="space-y-3">
        <div className="space-y-1.5">
          <label htmlFor="rp-client" className="text-xs font-semibold text-foreground">Client <span className="text-red-500">*</span></label>
          {client ? (
            <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-sm">
              <span className="font-semibold text-foreground truncate">{client.name}</span>
              <button type="button" onClick={() => setClient(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer">Change</button>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input id="rp-client" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Onboarded Clients" className={`${input} pl-9`} />
              </div>
              <ul className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {matches.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setClient(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer">
                      <span className="font-medium text-foreground">{c.name}</span>
                      {c.email && <span className="block text-[11px] text-muted-foreground truncate">{c.email}</span>}
                    </button>
                  </li>
                ))}
                {!matches.length && <li className="px-3 py-2 text-sm text-muted-foreground">No client matches</li>}
              </ul>
            </>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rp-amount" className="text-xs font-semibold text-foreground">Amount (₹) <span className="text-red-500">*</span></label>
            <input id="rp-amount" type="number" min={1} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 10000" className={input} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rp-date" className="text-xs font-semibold text-foreground">Received on</label>
            <input id="rp-date" type="date" max={todayIst()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={input} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="rp-mode" className="text-xs font-semibold text-foreground">Paid by</label>
            <select id="rp-mode" value={mode} onChange={(e) => setMode(e.target.value as PaymentMode)} className={input}>
              {(Object.keys(MODES) as PaymentMode[]).map((m) => <option key={m} value={m}>{MODES[m]}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rp-ref" className="text-xs font-semibold text-foreground">UTR / reference</label>
            <input id="rp-ref" value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)} placeholder="From the bank" className={input} />
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="rp-note" className="text-xs font-semibold text-foreground">Note</label>
          <input id="rp-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Wallet recharge" className={input} />
        </div>
        {amount && client && problem && <p className="text-[11px] text-red-500">{problem}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer">Cancel</button>
          <button type="submit" disabled={!!problem} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">Continue</button>
        </div>
      </form>
    </Modal>
  );
};

const Billing: React.FC = () => {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'invoices' | 'payments'>('invoices');
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState<BillingPayment | null>(null);
  const status = useQuery({ queryKey: ['billing', 'status'], queryFn: billingApi.status, staleTime: 300_000 });
  const clients = useQuery({ queryKey: ['billing', 'clients'], queryFn: billingApi.clients, staleTime: 120_000 });
  const payments = useQuery({ queryKey: ['billing', 'payments'], queryFn: billingApi.payments });
  const byId = useMemo(() => new Map((clients.data ?? []).map((c) => [c.id, c])), [clients.data]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['billing', 'payments'] }); qc.invalidateQueries({ queryKey: ['billing', 'clients'] }); };
  const waiting = (payments.data ?? []).filter((p) => p.receiptStatus === 'pending' || p.receiptStatus === 'failed').length;
  const connected = status.data?.zohoConnected;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Receipt className="w-6 h-6 text-emerald-600" /> Billing</h1>
          <p className="text-sm text-muted-foreground mt-1">GST invoices and payments in Zoho Books, with receipts sent on WhatsApp.</p>
        </div>
      </div>

      <div role="tablist" aria-label="Billing" className="inline-flex rounded-xl border border-border p-1 bg-muted/40">
        {(['invoices', 'payments'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold capitalize cursor-pointer ${tab === t ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {t}
          </button>
        ))}
      </div>

      {status.data && !connected && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> Zoho Books is not connected yet, so payments cannot be recorded.
        </div>
      )}
      {clients.isError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{apiError(clients.error, 'Could not load the Onboarded Clients.')}</div>
      )}
      {tab === 'invoices' ? <InvoicesPanel clients={clients.data} connected={Boolean(connected)} /> : (<>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{waiting > 0 ? `${waiting} receipt${waiting === 1 ? '' : 's'} waiting to be sent.` : ''}</p>
        <button type="button" disabled={!connected || !clients.data} onClick={() => setRecording(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
          <Plus className="w-4 h-4" /> Record payment
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {payments.isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : payments.isError ? (
          <p className="p-6 text-sm text-red-600">{apiError(payments.error, 'Could not load the payments.')}</p>
        ) : !payments.data?.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No payments recorded yet. Press <span className="font-semibold">Record payment</span> when money reaches the account.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Received</th>
                  <th className="text-left font-semibold px-4 py-2.5">Client</th>
                  <th className="text-right font-semibold px-4 py-2.5">Amount</th>
                  <th className="text-left font-semibold px-4 py-2.5">Paid by</th>
                  <th className="text-left font-semibold px-4 py-2.5">Receipt</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.data.map((p) => {
                  const s = STATUS[p.receiptStatus];
                  return (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 whitespace-nowrap text-foreground">{shortDate(p.paidOn)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{p.clientName}</p>
                        {p.zohoPaymentNumber && <p className="text-[11px] text-muted-foreground">Zoho #{p.zohoPaymentNumber}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">{rupees(p.amount)}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {MODES[p.mode]}{p.reference && <span className="block text-[11px]">Ref {p.reference}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${s.cls}`} title={p.whatsappError ?? undefined}>
                          <s.Icon className="w-3 h-3" /> {s.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button type="button" onClick={() => setSending(p)} className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap">
                          {p.receiptStatus === 'pending' ? 'Send receipt' : p.receiptStatus === 'sent' ? 'View' : p.receiptStatus === 'failed' ? 'Try again' : 'Send anyway'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </>)}

      {recording && clients.data && (
        <RecordPayment clients={clients.data} onClose={() => setRecording(false)} onSaved={(p) => { setRecording(false); refresh(); setSending(p); }} />
      )}
      {sending && (
        sending.receiptStatus === 'sent' ? (
          <SentReceipt payment={sending} onClose={() => setSending(null)} />
        ) : (
          <SendReceipt payment={sending} client={byId.get(sending.clientId)} onClose={() => setSending(null)} onDone={() => { setSending(null); refresh(); }} />
        )
      )}
    </div>
  );
};

/** A receipt already sent: when and where, and the PDF */
const SentReceipt: React.FC<{ payment: BillingPayment; onClose: () => void }> = ({ payment, onClose }) => {
  const { toast } = useToast();
  const view = useMutation({ mutationFn: () => billingApi.receiptUrl(payment.id), onSuccess: (url) => window.open(url, '_blank', 'noopener'), onError: (e) => toast.error(apiError(e, 'Could not open the receipt'), 'Billing') });
  return (
    <Modal title="Receipt" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <p className="text-foreground"><span className="font-semibold">{rupees(payment.amount)}</span> from <span className="font-semibold">{payment.clientName}</span></p>
        <p className="text-muted-foreground">Sent to +{payment.whatsappTo} on {payment.receiptSentAt ? new Date(payment.receiptSentAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}.</p>
        <button type="button" onClick={() => view.mutate()} disabled={view.isPending} className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer disabled:opacity-50">
          {view.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} Open the receipt PDF
        </button>
      </div>
    </Modal>
  );
};

const BillingPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { can } = usePermissions();
  if (!isLeadsndealsTenant(user?.tenantId) || !can(PERMISSIONS.BILLING_MANAGE)) return <Navigate to="/dashboard" replace />;
  return <Billing />;
};

export default BillingPage;
