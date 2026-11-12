import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, FileText, Loader2, Plus, Trash2, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { billingApi, type BillingClient, type InvoiceSummary } from '../../services/api/billing';
import { ClientPicker, Modal, apiError, inputCls, rupees, shortDate, todayIst } from './ui';

// Invoices tab: GST invoices made in Zoho Books (18% GST; CGST + SGST in Kerala, IGST elsewhere), created as drafts.

const DEFAULT_SAC = '998314';
const GST = 0.18;
const STATUS: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground', sent: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', paid: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  overdue: 'bg-red-500/10 text-red-700 dark:text-red-300', partially_paid: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', void: 'bg-muted text-muted-foreground line-through',
};

interface LineDraft { description: string; details: string; sac: string; amount: string }
const emptyLine = (): LineDraft => ({ description: '', details: '', sac: DEFAULT_SAC, amount: '' });

/** Opens a PDF from the API in a new tab (the tab is opened first so the browser does not block it) */
export function useOpenPdf() {
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const w = window.open('', '_blank');
      try {
        const blob = await billingApi.invoicePdf(id);
        const url = URL.createObjectURL(blob);
        if (w) w.location.href = url; else window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } catch (err) {
        w?.close();
        throw err;
      }
    },
    onError: (e) => toast.error(apiError(e, 'Could not open the invoice'), 'Billing'),
  });
}

const CreateInvoice: React.FC<{ clients: BillingClient[]; onClose: () => void; onCreated: (inv: { id: string; number: string; total: number }) => void }> = ({ clients, onClose, onCreated }) => {
  const { toast } = useToast();
  const [client, setClient] = useState<BillingClient | null>(null);
  const [date, setDate] = useState(todayIst());
  const [gstin, setGstin] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [pin, setPin] = useState('');
  const [lines, setLines] = useState<LineDraft[]>([emptyLine()]);
  const [confirming, setConfirming] = useState(false);

  const pick = (c: BillingClient | null) => { setClient(c); setGstin(c?.gstin ?? ''); };
  const setLine = (i: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l, k) => (k === i ? { ...l, ...patch } : l)));

  const gstinClean = gstin.trim().toUpperCase();
  const interState = gstinClean.length >= 2 && gstinClean.slice(0, 2) !== '32';
  const totals = useMemo(() => {
    const sub = lines.reduce((s, l) => s + (Number(l.amount) > 0 ? Number(l.amount) : 0), 0);
    const tax = Math.round(sub * GST * 100) / 100;
    const exact = Math.round((sub + tax) * 100) / 100;
    const total = Math.round(exact);
    return { sub, tax, roundOff: Math.round((total - exact) * 100) / 100, total };
  }, [lines]);

  const problem = !client ? 'Choose the client'
    : gstinClean && !/^[0-9]{2}[A-Z0-9]{13}$/.test(gstinClean) ? 'A GSTIN has 15 letters and digits'
    : date > todayIst() ? 'The date cannot be in the future'
    : lines.some((l) => !l.description.trim()) ? 'Each line needs a description'
    : lines.some((l) => !(Number(l.amount) > 0)) ? 'Each line needs an amount above zero'
    : lines.some((l) => !/^\d{4,8}$/.test(l.sac.trim())) ? 'SAC codes are 4 to 8 digits'
    : '';

  const create = useMutation({
    mutationFn: () => billingApi.createInvoice({
      clientId: client!.id, clientName: client!.name, date, gstin: gstinClean || undefined,
      address: address.trim() || undefined, city: city.trim() || undefined, pin: pin.trim() || undefined,
      lines: lines.map((l) => ({ description: l.description.trim(), details: l.details.trim() || undefined, sac: l.sac.trim(), amount: Number(l.amount) })),
    }),
    onSuccess: (inv) => { toast.success(`Invoice ${inv.number} created in Zoho Books (${rupees(inv.total)}).`, 'Billing'); onCreated(inv); },
    onError: (e) => { toast.error(apiError(e, 'The invoice was not created.'), 'Billing'); setConfirming(false); },
  });

  if (confirming && client) {
    return (
      <Modal title="Create invoice" onClose={onClose}>
        <div className="space-y-3">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>Create a <span className="font-bold">{rupees(totals.total)}</span> invoice for <span className="font-bold">{client.name}</span> dated {shortDate(date)}? It takes the next invoice number in Zoho Books and is saved as a draft (nothing is sent to the client).</p>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" disabled={create.isPending} onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer disabled:opacity-50">Back</button>
            <button type="button" disabled={create.isPending} onClick={() => create.mutate()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
              {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create invoice
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Create invoice" onClose={onClose} wide>
      <form noValidate onSubmit={(e) => { e.preventDefault(); if (!problem) setConfirming(true); }} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="ci-client" className="text-xs font-semibold text-foreground">Client <span className="text-red-500">*</span></label>
          <ClientPicker id="ci-client" clients={clients} value={client} onChange={pick} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="ci-date" className="text-xs font-semibold text-foreground">Invoice date</label>
            <input id="ci-date" type="date" max={todayIst()} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="ci-gstin" className="text-xs font-semibold text-foreground">Client GSTIN</label>
            <input id="ci-gstin" value={gstin} maxLength={15} onChange={(e) => setGstin(e.target.value.toUpperCase())} placeholder="Leave empty if not registered" className={`${inputCls} uppercase`} />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="ci-address" className="text-xs font-semibold text-foreground">Billing address</label>
          <input id="ci-address" value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} placeholder="Building, street, area (saved in Zoho for this client)" className={inputCls} />
          <div className="grid grid-cols-2 gap-3">
            <input aria-label="City" value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} placeholder="City" className={inputCls} />
            <input aria-label="PIN code" value={pin} maxLength={10} inputMode="numeric" onChange={(e) => setPin(e.target.value)} placeholder="PIN code" className={inputCls} />
          </div>
          <p className="text-[11px] text-muted-foreground">Leave empty to keep the address already in Zoho Books.</p>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-foreground">Lines (18% GST is added)</p>
          {lines.map((l, i) => (
            <div key={i} className="rounded-xl border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <input aria-label={`Line ${i + 1} description`} value={l.description} maxLength={200} onChange={(e) => setLine(i, { description: e.target.value })} placeholder="e.g. WhatsApp API – Premium plan (Nov 2026)" className={inputCls} />
                {lines.length > 1 && (
                  <button type="button" onClick={() => setLines((ls) => ls.filter((_, k) => k !== i))} aria-label={`Remove line ${i + 1}`} className="p-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
                )}
              </div>
              <input aria-label={`Line ${i + 1} details`} value={l.details} maxLength={500} onChange={(e) => setLine(i, { details: e.target.value })} placeholder="Details (optional)" className={inputCls} />
              <div className="grid grid-cols-2 gap-2">
                <input aria-label={`Line ${i + 1} SAC`} value={l.sac} maxLength={8} inputMode="numeric" onChange={(e) => setLine(i, { sac: e.target.value })} placeholder="SAC" className={inputCls} />
                <input aria-label={`Line ${i + 1} amount before GST`} type="number" min={1} step="0.01" inputMode="decimal" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} placeholder="Amount before GST (₹)" className={inputCls} />
              </div>
            </div>
          ))}
          {lines.length < 20 && (
            <button type="button" onClick={() => setLines((ls) => [...ls, emptyLine()])} className="flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"><Plus className="w-4 h-4" /> Add a line</button>
          )}
        </div>

        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub total</span><span>{rupees(totals.sub)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">{interState ? 'IGST 18%' : 'CGST 9% + SGST 9%'}</span><span>{rupees(totals.tax)}</span></div>
          {totals.roundOff !== 0 && <div className="flex justify-between"><span className="text-muted-foreground">Round off</span><span>{rupees(totals.roundOff)}</span></div>}
          <div className="flex justify-between font-bold text-foreground pt-1 border-t border-border"><span>Total</span><span>{rupees(totals.total)}</span></div>
        </div>

        {client && problem && <p className="text-[11px] text-red-500">{problem}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer">Cancel</button>
          <button type="submit" disabled={!!problem} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">Continue</button>
        </div>
      </form>
    </Modal>
  );
};

const InvoicesPanel: React.FC<{ clients?: BillingClient[]; connected: boolean }> = ({ clients, connected }) => {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const invoices = useQuery({ queryKey: ['billing', 'invoices'], queryFn: billingApi.invoices, enabled: connected });
  const openPdf = useOpenPdf();
  const remove = useMutation({
    mutationFn: (inv: InvoiceSummary) => billingApi.deleteInvoice(inv.id),
    onSuccess: (r) => { toast.success(`Draft ${r.number} deleted.`, 'Billing'); qc.invalidateQueries({ queryKey: ['billing', 'invoices'] }); },
    onError: (e) => toast.error(apiError(e, 'The invoice was not deleted.'), 'Billing'),
  });

  const askDelete = async (inv: InvoiceSummary) => {
    const ok = await confirm({
      title: `Delete draft ${inv.number}?`,
      message: `${inv.clientName} · ${rupees(inv.total)}. This cannot be undone. Zoho will not reuse the number by itself: to give it out again, set the invoice starting number back in Zoho Books (Settings → Transaction Number Series).`,
      confirmLabel: 'Delete draft',
      cancelLabel: 'Keep it',
      variant: 'danger',
    });
    if (ok) remove.mutate(inv);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" disabled={!connected || !clients} onClick={() => setCreating(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
          <Plus className="w-4 h-4" /> Create invoice
        </button>
      </div>
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        {invoices.isLoading ? (
          <div className="p-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : invoices.isError ? (
          <p className="p-6 text-sm text-red-600">{apiError(invoices.error, 'Could not load the invoices.')}</p>
        ) : !invoices.data?.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-semibold px-4 py-2.5">Invoice</th>
                  <th className="text-left font-semibold px-4 py-2.5">Client</th>
                  <th className="text-left font-semibold px-4 py-2.5">Date</th>
                  <th className="text-right font-semibold px-4 py-2.5">Total</th>
                  <th className="text-left font-semibold px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.data.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground whitespace-nowrap">{inv.number}</td>
                    <td className="px-4 py-3 text-foreground">{inv.clientName}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{shortDate(inv.date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground whitespace-nowrap">{rupees(inv.total)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold capitalize ${STATUS[inv.status] ?? 'bg-muted text-muted-foreground'}`}>{inv.status.replace('_', ' ')}</span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button type="button" onClick={() => openPdf.mutate(inv.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"><FileText className="w-3.5 h-3.5" /> PDF</button>
                      {inv.status === 'draft' && (
                        <button type="button" disabled={remove.isPending} onClick={() => askDelete(inv)} aria-label={`Delete draft ${inv.number}`} className="ml-3 inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline cursor-pointer disabled:opacity-50"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && clients && (
        <CreateInvoice clients={clients} onClose={() => setCreating(false)} onCreated={(inv) => {
          setCreating(false); qc.invalidateQueries({ queryKey: ['billing', 'invoices'] }); qc.invalidateQueries({ queryKey: ['billing', 'clients'] }); openPdf.mutate(inv.id);
        }} />
      )}
    </div>
  );
};

export default InvoicesPanel;
