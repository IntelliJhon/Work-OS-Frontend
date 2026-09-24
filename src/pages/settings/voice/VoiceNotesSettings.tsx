import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Loader2, BadgeCheck, Smartphone, Pencil, Trash2, AlertTriangle } from 'lucide-react';
import { voiceNotesApi, getVoiceApiError } from '../../../services/api/voiceNotes';
import type { VoiceSettings } from '../../../services/api/voiceNotes';
import { useToast } from '../../../components/ui/Toast';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { PhoneEntryForm } from './PhoneEntryForm';
import { CodeVerifyForm } from './CodeVerifyForm';

const SETTINGS_KEY = ['voice-settings'];

export const VoiceNotesSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  // True while the admin is typing a new number (first setup is implied when no number exists)
  const [isEnteringNumber, setIsEnteringNumber] = useState(false);

  const { data: settings, isLoading, isError, error } = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: voiceNotesApi.getSettings,
  });

  const applySettings = (next: VoiceSettings) => queryClient.setQueryData(SETTINGS_KEY, next);
  const refetchSettings = () => queryClient.invalidateQueries({ queryKey: SETTINGS_KEY });

  const sendCode = useMutation({
    mutationFn: voiceNotesApi.sendCode,
    onSuccess: (next) => {
      applySettings(next);
      setIsEnteringNumber(false);
      toast.success(`Verification code sent to ${next.pending?.phone ?? 'your WhatsApp'}.`, 'Code sent');
    },
    onError: (err) => {
      toast.error(getVoiceApiError(err, 'Could not send the verification code.'), 'Voice Notes');
      refetchSettings();
    },
  });

  const verify = useMutation({
    mutationFn: voiceNotesApi.verify,
    onSuccess: (next) => {
      applySettings(next);
      toast.success(`${next.phone} can now send voice notes to this workspace.`, 'Number verified');
    },
    onError: (err) => {
      toast.error(getVoiceApiError(err, 'Verification failed.'), 'Voice Notes');
      refetchSettings(); // attempts remaining / expiry may have changed
    },
  });

  const remove = useMutation({
    mutationFn: voiceNotesApi.removeNumber,
    onSuccess: (next) => {
      applySettings(next);
      setIsEnteringNumber(false);
      toast.success('Voice notes from this number will no longer be accepted.', 'Number removed');
    },
    onError: (err) => toast.error(getVoiceApiError(err, 'Could not remove the number.'), 'Voice Notes'),
  });

  const handleRemove = async () => {
    const ok = await confirm({
      title: 'Remove voice notes number?',
      message: `Voice notes sent from ${settings?.phone} will be rejected until a new number is verified. Existing voice notes are kept.`,
      confirmLabel: 'Remove number',
      variant: 'danger',
    });
    if (ok) remove.mutate();
  };

  if (isLoading) {
    return (
      <div className="glass-panel rounded-2xl p-10 border border-border bg-card/40 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
      </div>
    );
  }

  if (isError || !settings) {
    return (
      <div className="glass-panel rounded-2xl p-6 border border-rose-500/20 bg-rose-500/5 flex items-center gap-3 text-xs text-rose-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{getVoiceApiError(error, 'Failed to load voice notes settings.')}</span>
      </div>
    );
  }

  const { phone, verifiedAt, pending } = settings;
  const showPhoneForm = !phone && !pending ? true : isEnteringNumber;
  const showVerifyForm = !!pending && !isEnteringNumber;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40">
        <div className="flex items-start gap-3">
          <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Mic className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Voice Notes</h2>
            <p className="text-xs text-muted-foreground mt-1 font-light max-w-xl">
              Register one WhatsApp number for this workspace. Voice notes sent from that number to the Work OS
              WhatsApp bot are transcribed, translated to English and delivered to the Voice Notes inbox.
            </p>
          </div>
        </div>
      </div>

      {/* Verified number */}
      {phone && (
        <div className="glass-panel rounded-2xl p-6 border border-emerald-500/20 bg-card/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <BadgeCheck className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">{phone}</p>
                <p className="text-[10px] text-muted-foreground">
                  Verified{verifiedAt ? ` on ${new Date(verifiedAt).toLocaleString()}` : ''}
                  {pending ? ' · stays active until the new number is verified' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isEnteringNumber && !pending && (
                <button
                  type="button"
                  onClick={() => setIsEnteringNumber(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Change number</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleRemove}
                disabled={remove.isPending}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {remove.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Enter number / verify code */}
      {(showPhoneForm || showVerifyForm) && (
        <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {showVerifyForm ? 'Verify number' : phone ? 'Change number' : 'Register a number'}
            </h3>
          </div>

          {showVerifyForm && pending ? (
            <CodeVerifyForm
              pending={pending}
              isVerifying={verify.isPending}
              isResending={sendCode.isPending}
              onVerify={(code) => verify.mutate(code)}
              onResend={() => sendCode.mutate(pending.phone)}
              onUseDifferentNumber={() => setIsEnteringNumber(true)}
              onExpired={refetchSettings}
            />
          ) : (
            <PhoneEntryForm
              isSubmitting={sendCode.isPending}
              onSubmit={(value) => sendCode.mutate(value)}
              onCancel={phone || pending ? () => setIsEnteringNumber(false) : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceNotesSettings;
