import React, { useEffect, useState } from 'react';
import { Loader2, RotateCw, ShieldCheck, Timer } from 'lucide-react';
import type { VoiceSettings } from '../../../services/api/voiceNotes';
import { useNow, formatDuration } from './useNow';

interface CodeVerifyFormProps {
  pending: NonNullable<VoiceSettings['pending']>;
  isVerifying: boolean;
  isResending: boolean;
  onVerify: (code: string) => void;
  onResend: () => void;
  onUseDifferentNumber: () => void;
  /** Called once when the code expires so the parent can refetch settings. */
  onExpired: () => void;
}

export const CodeVerifyForm: React.FC<CodeVerifyFormProps> = ({
  pending,
  isVerifying,
  isResending,
  onVerify,
  onResend,
  onUseDifferentNumber,
  onExpired,
}) => {
  const [code, setCode] = useState('');
  const now = useNow(true);

  const expiresAt = new Date(pending.expiresAt).getTime();
  const resendAt = pending.resendAvailableAt ? new Date(pending.resendAvailableAt).getTime() : 0;
  const expiresIn = expiresAt - now;
  const resendIn = resendAt - now;
  const isExpired = expiresIn <= 0;
  const outOfAttempts = pending.attemptsRemaining <= 0;

  useEffect(() => {
    if (isExpired) onExpired();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpired]);

  // A fresh code was sent: clear the old input
  useEffect(() => {
    setCode('');
  }, [pending.resendAvailableAt]);

  const canVerify = code.length === 6 && !isVerifying && !isExpired && !outOfAttempts;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (canVerify) onVerify(code);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Enter the 6-digit code we sent on WhatsApp to{' '}
        <span className="font-semibold text-foreground">{pending.phone}</span>.
      </p>

      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        aria-label="Verification code"
        placeholder="••••••"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        disabled={isExpired || outOfAttempts}
        className="w-full sm:w-56 px-4 py-3 glass-input rounded-xl text-lg tracking-[0.5em] text-center font-mono text-foreground placeholder-muted-foreground focus:outline-none disabled:opacity-50"
      />

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[10px] font-medium">
        <span className={`flex items-center gap-1 ${isExpired ? 'text-rose-400' : 'text-muted-foreground'}`}>
          <Timer className="w-3 h-3" />
          {isExpired ? 'Code expired' : `Expires in ${formatDuration(expiresIn)}`}
        </span>
        <span className={outOfAttempts ? 'text-rose-400' : pending.attemptsRemaining <= 2 ? 'text-amber-400' : 'text-muted-foreground'}>
          {outOfAttempts
            ? 'No attempts left. Request a new code.'
            : `${pending.attemptsRemaining} attempt${pending.attemptsRemaining === 1 ? '' : 's'} remaining`}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onResend}
            disabled={resendIn > 0 || isResending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCw className="w-3.5 h-3.5" />}
            <span>{resendIn > 0 ? `Resend in ${formatDuration(resendIn)}` : 'Resend code'}</span>
          </button>
          <button
            type="button"
            onClick={onUseDifferentNumber}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            Use a different number
          </button>
        </div>
        <button
          type="submit"
          disabled={!canVerify}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isVerifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
          <span>{isVerifying ? 'Verifying...' : 'Verify'}</span>
        </button>
      </div>
    </form>
  );
};
