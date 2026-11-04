import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Bot, CheckCircle2, History, Loader2, MousePointerClick, Search, X, XCircle } from 'lucide-react';
import { clientsApi } from '../../services/api/clients.api';

// Recharge history: every top-up made from Work OS (the Add balance buttons and Ask AI), newest first.

const money = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const when = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

const RechargeHistoryModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [q, setQ] = useState('');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['wallet-topups', from, to],
    queryFn: () => clientsApi.getWalletTopups({ from: from || undefined, to: to || undefined }),
  });

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.topups ?? []).filter((r) => !s || (r.clientName ?? '').toLowerCase().includes(s) || (r.channelNumber ?? '').includes(s) || (r.addedBy ?? '').toLowerCase().includes(s));
  }, [data, q]);
  const total = rows.filter((r) => r.status === 'done').reduce((sum, r) => sum + r.amount, 0);
  // Opened over the page (a portal: the tab's slide-in animation would otherwise pin it to the top of the tab), page scroll locked, Esc closes
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [onClose]);
  const input = 'h-9 rounded-xl border border-border bg-background px-3 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/40';

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-background/70 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Recharge history" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl border border-border bg-card shadow-2xl flex flex-col max-h-[calc(100dvh-2rem)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2"><History className="w-4 h-4 text-blue-600" /> Recharge history</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Wallet top-ups made from Work OS — the Add balance buttons and Ask AI</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-4 border-b border-border flex flex-wrap items-end gap-2">
          <label className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Client, number or person" className={`${input} w-full pl-8`} />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground flex flex-col gap-1">From
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} />
          </label>
          <label className="text-[11px] font-semibold text-muted-foreground flex flex-col gap-1">To
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} />
          </label>
          {(from || to || q) && (
            <button type="button" onClick={() => { setFrom(''); setTo(''); setQ(''); }} className="h-9 px-3 rounded-xl text-xs font-semibold text-blue-600 hover:bg-muted cursor-pointer">Clear</button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="p-10 text-center text-sm text-muted-foreground flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</p>
          ) : isError ? (
            <div className="p-10 text-center text-sm text-muted-foreground space-y-2">
              <p>Could not load the recharge history.</p>
              <button type="button" onClick={() => refetch()} className="text-blue-600 font-semibold cursor-pointer">Try again</button>
            </div>
          ) : rows.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">No recharges {from || to || q ? 'match these filters' : 'yet'}.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.id} className="px-5 py-3 flex flex-wrap sm:flex-nowrap items-start gap-x-4 gap-y-1">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{r.clientName ?? r.clientId}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.wallet === 'main' ? 'Main wallet' : <>Conversation wallet · {r.channelNumber}</>}
                    </p>
                    {r.note && <p className="text-xs text-muted-foreground italic truncate">{r.note}</p>}
                    {r.status === 'failed' && r.error && <p className="text-xs text-red-600 dark:text-red-400">{r.error}</p>}
                  </div>
                  <div className="text-xs text-muted-foreground sm:w-48 shrink-0">
                    <p>{when(r.createdAt)}</p>
                    <p className="flex items-center gap-1">
                      {r.source === 'ai' ? <Bot className="w-3 h-3 text-violet-600" /> : <MousePointerClick className="w-3 h-3" />}
                      {r.source === 'ai' ? 'Ask AI' : 'Add balance button'}{r.addedBy ? ` · ${r.addedBy}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0 sm:w-28">
                    <p className={`text-sm font-bold ${r.status === 'done' ? 'text-foreground' : 'text-muted-foreground line-through'}`}>{money(r.amount)}</p>
                    <p className={`text-[11px] font-semibold flex items-center justify-end gap-1 ${r.status === 'done' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                      {r.status === 'done' ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} {r.status === 'done' ? 'Added' : 'Failed'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {rows.length > 0 && (
          <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground flex justify-between gap-3">
            <span>{rows.length} recharge{rows.length === 1 ? '' : 's'}</span>
            <span>Total added: <span className="font-bold text-foreground">{money(total)}</span></span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
};

export default RechargeHistoryModal;
