import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Wallet, X } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { clientsApi } from '../../services/api/clients.api';

// Adds balance to a client's main wallet or to one WhatsApp channel's conversation wallet (Partner Panel). Admins only.
// Two steps: enter the amount, then confirm exactly what is added where.

export interface TopUpTarget {
  clientId: string;
  clientName: string;
  wallet: 'main' | 'conversation';
  channelId?: string;
  channelNumber?: string;
  currentBalance: number;
  currency: string;
}

const MAX = 100_000;
const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const money = (n: number, currency: string) => `${currency === 'INR' ? '₹' : `${currency} `}${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

const WalletTopUpModal: React.FC<{ target: TopUpTarget; onClose: () => void; onDone: () => void }> = ({ target, onClose, onDone }) => {
  const { toast } = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const value = Number(amount);
  const problem = !amount ? 'Enter the amount' : !(value > 0) ? 'Enter an amount above zero' : value > MAX ? `At most ₹${MAX.toLocaleString('en-IN')} at a time` : '';
  const what = target.wallet === 'main' ? 'main wallet' : `conversation wallet (${target.channelNumber})`;

  const add = useMutation({
    mutationFn: () => clientsApi.topUpWallet(target.clientId, {
      wallet: target.wallet, channelId: target.channelId, amount: value, note: note.trim() || undefined, clientName: target.clientName,
    }),
    onSuccess: (r) => {
      toast.success(`Added ${money(value, target.currency)} to ${target.clientName}'s ${what}.${typeof r.balance === 'number' ? ` New balance: ${money(r.balance, target.currency)}.` : ''}`, 'Wallet');
      onDone();
    },
    onError: (err) => { toast.error(apiError(err, 'The balance was not added.'), 'Wallet'); setConfirming(false); },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label="Add balance">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl my-8">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Wallet className="w-4 h-4 text-emerald-600" /> Add balance</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-0.5">
            <p className="font-semibold text-foreground">{target.clientName}</p>
            <p className="text-xs text-muted-foreground capitalize">{what}</p>
            <p className="text-xs text-muted-foreground">Current balance: <span className="font-semibold text-foreground">{money(target.currentBalance, target.currency)}</span></p>
          </div>

          {!confirming ? (
            <form noValidate onSubmit={(e) => { e.preventDefault(); if (!problem) setConfirming(true); }} className="space-y-3">
              <div className="space-y-1.5">
                <label htmlFor="tu-amount" className="text-xs font-semibold text-foreground">Amount ({target.currency}) <span className="text-red-500">*</span></label>
                <input id="tu-amount" autoFocus type="number" min={1} step="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 500"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
                {amount && problem && <p className="text-[11px] text-red-500">{problem}</p>}
              </div>
              <div className="space-y-1.5">
                <label htmlFor="tu-note" className="text-xs font-semibold text-foreground">Note</label>
                <input id="tu-note" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Paid by UPI on 4 Nov"
                  className="w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30" />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer">Cancel</button>
                <button type="submit" disabled={!!problem} className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">Continue</button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200 flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <p>Add <span className="font-bold">{money(value, target.currency)}</span> to <span className="font-bold">{target.clientName}</span>'s {what}? This adds real balance in the Partner Panel.</p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={add.isPending} onClick={() => setConfirming(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted cursor-pointer disabled:opacity-50">Back</button>
                <button type="button" disabled={add.isPending} onClick={() => add.mutate()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer">
                  {add.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Add {money(value, target.currency)}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WalletTopUpModal;
