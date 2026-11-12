import React, { useMemo, useState } from 'react';
import { Receipt, Search, X } from 'lucide-react';
import type { BillingClient } from '../../services/api/billing';

// Small pieces shared by the Billing page's Invoices and Payments tabs

export const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
export const rupees = (v: number | string) => `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
export const inputCls = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30';

export const Modal: React.FC<{ title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }> = ({ title, onClose, wide, children }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-md'} rounded-2xl border border-border bg-card shadow-2xl my-8`}>
      <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2"><Receipt className="w-4 h-4 text-emerald-600" /> {title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

/** Search the Onboarded Clients and pick one */
export const ClientPicker: React.FC<{ id: string; clients: BillingClient[]; value: BillingClient | null; onChange: (c: BillingClient | null) => void }> = ({ id, clients, value, onChange }) => {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)) : clients).slice(0, 8);
  }, [clients, query]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 text-sm">
        <span className="font-semibold text-foreground truncate">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-muted-foreground hover:text-foreground cursor-pointer">Change</button>
      </div>
    );
  }
  return (
    <>
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input id={id} autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Onboarded Clients" className={`${inputCls} pl-9`} />
      </div>
      <ul className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {matches.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => onChange(c)} className="w-full text-left px-3 py-2 text-sm hover:bg-muted cursor-pointer">
              <span className="font-medium text-foreground">{c.name}</span>
              {c.email && <span className="block text-[11px] text-muted-foreground truncate">{c.email}</span>}
            </button>
          </li>
        ))}
        {!matches.length && <li className="px-3 py-2 text-sm text-muted-foreground">No client matches</li>}
      </ul>
    </>
  );
};
