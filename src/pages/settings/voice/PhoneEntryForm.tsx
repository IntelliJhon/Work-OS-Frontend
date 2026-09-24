import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';

interface PhoneEntryFormProps {
  isSubmitting: boolean;
  onSubmit: (phone: string) => void;
  onCancel?: () => void;
}

export const PhoneEntryForm: React.FC<PhoneEntryFormProps> = ({ isSubmitting, onSubmit, onCancel }) => {
  const [countryCode, setCountryCode] = useState('');
  const [number, setNumber] = useState('');

  const digits = number.replace(/\D/g, '');
  const ccDigits = countryCode.replace(/\D/g, '');
  const canSubmit = digits.length >= 6 && !isSubmitting;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // The backend normalizes the number; without a country code it applies the workspace default.
    onSubmit(ccDigits ? `+${ccDigits}${digits}` : digits);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-[9px] font-bold text-muted-foreground uppercase tracking-widest block">
          WhatsApp number
        </label>
        <div className="flex gap-2">
          <div className="relative w-24 shrink-0">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">+</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="Country code"
              placeholder="Code"
              maxLength={3}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.replace(/\D/g, ''))}
              className="w-full pl-6 pr-3 py-2.5 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none"
            />
          </div>
          <input
            type="tel"
            inputMode="tel"
            aria-label="Phone number"
            placeholder="Phone number"
            maxLength={20}
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
            className="flex-1 min-w-0 px-4 py-2.5 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none"
          />
        </div>
        <p className="text-[10px] text-muted-foreground font-light">
          We'll send a 6-digit code to this number on WhatsApp.
        </p>
      </div>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          <span>{isSubmitting ? 'Sending...' : 'Send code'}</span>
        </button>
      </div>
    </form>
  );
};
