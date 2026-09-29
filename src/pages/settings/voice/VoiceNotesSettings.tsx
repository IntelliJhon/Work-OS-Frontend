import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Loader2, BadgeCheck, Smartphone, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { voiceNotesApi, getVoiceApiError } from '../../../services/api/voiceNotes';
import type { VoiceNumber, VoiceSettings } from '../../../services/api/voiceNotes';
import { useToast } from '../../../components/ui/Toast';
import { useConfirm } from '../../../components/ui/ConfirmDialog';
import { PhoneEntryForm } from './PhoneEntryForm';
import { CodeVerifyForm } from './CodeVerifyForm';

const SETTINGS_KEY = ['voice-settings'];

export const VoiceNotesSettings: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  // True while the admin is typing a number to add (first setup is implied when no number exists)
  const [isEnteringNumber, setIsEnteringNumber] = useState(false);
  const [removingPhone, setRemovingPhone] = useState<string | null>(null);

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
    mutationFn: (vars: { code: string; phone: string }) => voiceNotesApi.verify(vars.code),
    onSuccess: (next, vars) => {
      applySettings(next);
      toast.success(`${vars.phone} can now send work to this workspace.`, 'Number verified');
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
      toast.success('Work from this number will no longer be accepted.', 'Number removed');
    },
    onError: (err) => toast.error(getVoiceApiError(err, 'Could not remove the number.'), 'Voice Notes'),
    onSettled: () => setRemovingPhone(null),
  });

  const handleRemove = async (number: VoiceNumber) => {
    const ok = await confirm({
      title: 'Remove this number?',
      message: `Voice notes and messages from ${number.phone} will be rejected. Existing voice notes are kept.`,
      confirmLabel: 'Remove number',
      variant: 'danger',
    });
    if (!ok) return;
    setRemovingPhone(number.phone);
    remove.mutate(number.phone);
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

  const { numbers, maxNumbers, pending } = settings;
  const atLimit = numbers.length >= maxNumbers;
  const showPhoneForm = isEnteringNumber || (numbers.length === 0 && !pending);
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
              Register the WhatsApp numbers that may give work to this workspace, for example the owner and managers.
              Voice notes and messages sent from these numbers to the Work OS WhatsApp bot are transcribed, translated
              to English and delivered to the Voice Notes inbox. Work is sent in the name of the member the number
              belongs to.
            </p>
          </div>
        </div>
      </div>

      {/* Verified numbers */}
      {numbers.map((number) => (
        <div key={number.phone} className="glass-panel rounded-2xl p-6 border border-emerald-500/20 bg-card/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <BadgeCheck className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-bold text-foreground">{number.phone}</p>
                <p className="text-[10px] text-muted-foreground">
                  {number.userName ? `${number.userName} · ` : ''}
                  Verified on {new Date(number.verifiedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleRemove(number)}
              disabled={remove.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
            >
              {removingPhone === number.phone ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              <span>Remove</span>
            </button>
          </div>
        </div>
      ))}

      {/* Add another number */}
      {numbers.length > 0 && !pending && !isEnteringNumber && (
        <button
          type="button"
          onClick={() => setIsEnteringNumber(true)}
          disabled={atLimit}
          title={atLimit ? `A workspace can have up to ${maxNumbers} numbers` : undefined}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add another number</span>
        </button>
      )}

      {/* Enter number / verify code */}
      {(showPhoneForm || showVerifyForm) && (
        <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 space-y-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-blue-400" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              {showVerifyForm ? 'Verify number' : numbers.length ? 'Add a number' : 'Register a number'}
            </h3>
          </div>

          {showVerifyForm && pending ? (
            <CodeVerifyForm
              pending={pending}
              isVerifying={verify.isPending}
              isResending={sendCode.isPending}
              onVerify={(code) => verify.mutate({ code, phone: pending.phone })}
              onResend={() => sendCode.mutate(pending.phone)}
              onUseDifferentNumber={() => setIsEnteringNumber(true)}
              onExpired={refetchSettings}
            />
          ) : (
            <PhoneEntryForm
              isSubmitting={sendCode.isPending}
              onSubmit={(value) => sendCode.mutate(value)}
              onCancel={numbers.length || pending ? () => setIsEnteringNumber(false) : undefined}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default VoiceNotesSettings;
