import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Bell, BellOff, Loader2, PlusCircle, RefreshCw } from 'lucide-react';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { clientsApi, type TaskBalance } from '../../services/api/clients.api';

// WAAU automation tasks for one client on Onboarded Clients: the last daily reading (remaining of allotted), the daily
// check + low-task alert switch, and for Admins "check now" and "add tasks" (the TASK add-on).

const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const n = (v: number) => v.toLocaleString('en-IN');
const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? `today ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}`
    : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
};

const TaskBalanceCell: React.FC<{
  clientId: string;
  clientName: string;
  balance: TaskBalance | undefined;
  limit: number;
  isAdmin: boolean;
  addon: { tasks: number; validity: string } | undefined;
  onChanged: () => void;
}> = ({ clientId, clientName, balance, limit, isAdmin, addon, onChanged }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const watched = !!balance?.watched;

  const refresh = useMutation({
    mutationFn: () => clientsApi.refreshTasks(clientId, clientName),
    onSuccess: (r) => { toast.success(`${clientName}: ${n(r.remaining)} of ${n(r.total)} tasks left.`, 'Automation tasks'); onChanged(); },
    onError: (err) => toast.error(apiError(err, 'Could not read the tasks.'), 'Automation tasks'),
  });
  const add = useMutation({
    mutationFn: () => clientsApi.addTasks(clientId, clientName),
    onSuccess: (r) => {
      toast.success(`Added ${n(r.added)} tasks to ${clientName}.${typeof r.remaining === 'number' ? ` Now ${n(r.remaining)} left.` : ''}`, 'Automation tasks');
      onChanged();
    },
    onError: (err) => toast.error(apiError(err, 'The tasks were not added.'), 'Automation tasks'),
  });
  const toggle = useMutation({
    mutationFn: (on: boolean) => clientsApi.setTaskAlert(clientId, on, clientName),
    onSuccess: (r) => { toast.success(r.on ? 'Daily task check and alert on for this client.' : 'Daily task check and alert off for this client.', 'Automation tasks'); onChanged(); },
    onError: () => toast.error('Could not change the task alert.', 'Automation tasks'),
  });

  const askAdd = async () => {
    if (!addon) return;
    const days = addon.validity.replace('D', '');
    if (await confirm({
      title: `Add ${n(addon.tasks)} tasks to ${clientName}?`,
      message: `Subscribes ${clientName} to the TASK add-on ("External task x ${addon.tasks}") for ${days} days in the Partner Panel. WAAU bills it like an add-on bought from the Partner Panel.`,
      confirmLabel: `Add ${n(addon.tasks)} tasks`, cancelLabel: 'Cancel', variant: 'warning',
    })) add.mutate();
  };

  // Nothing allotted = the client does not use automation (not alerted)
  const none = typeof balance?.remaining === 'number' && !balance.total;
  const has = typeof balance?.remaining === 'number' && !none;
  const low = has && balance!.remaining! < limit;
  const busy = refresh.isPending || add.isPending;

  return (
    <div className="flex items-start justify-end gap-2">
      <div className="flex flex-col items-end gap-1">
        {has ? (
          <span
            title={`Allotted ${n(balance!.total ?? 0)} · consumed ${n(balance!.consumed ?? 0)}`}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-extrabold font-mono border ${
              low
                ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200/60 dark:border-rose-800/40'
                : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/40'
            }`}
          >
            {n(balance!.remaining!)}
            <span className="font-sans font-semibold text-[10px] opacity-70">/ {n(balance!.total ?? 0)}</span>
            {isAdmin && addon && (
              <button type="button" disabled={busy} onClick={askAdd} title={`Add ${n(addon.tasks)} tasks`} aria-label={`Add ${n(addon.tasks)} tasks to ${clientName}`}
                className="font-sans -mr-1 p-0.5 rounded-md text-current opacity-70 hover:opacity-100 cursor-pointer disabled:opacity-40">
                {add.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlusCircle className="w-3.5 h-3.5" />}
              </button>
            )}
          </span>
        ) : (
          <span className="text-slate-400 text-xs italic">{none ? 'No automation tasks' : watched ? 'Not read yet' : '—'}</span>
        )}
        {balance?.error && (!balance.checkedAt || (balance.errorAt && balance.errorAt > balance.checkedAt)) ? (
          <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1" title={balance.error}>
            <AlertTriangle className="w-3 h-3" /> Couldn't read{balance.errorAt ? ` · ${when(balance.errorAt)}` : ''}
          </span>
        ) : balance?.checkedAt ? (
          <span className="text-[10px] text-muted-foreground">checked {when(balance.checkedAt)}</span>
        ) : null}
      </div>
      {isAdmin && (
        <button type="button" disabled={busy} onClick={() => refresh.mutate()} title="Check tasks now" aria-label={`Check ${clientName}'s tasks now`}
          className="p-1 rounded-lg border border-transparent text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${refresh.isPending ? 'animate-spin' : ''}`} />
        </button>
      )}
      <button
        type="button" disabled={toggle.isPending} onClick={() => toggle.mutate(!watched)}
        title={watched ? `Daily check and WhatsApp alert below ${n(limit)} tasks are on — click to turn off` : `Turn on the daily check and a WhatsApp alert below ${n(limit)} tasks`}
        aria-label={watched ? 'Turn off the task alert' : 'Turn on the task alert'}
        className={`p-1 rounded-lg border cursor-pointer disabled:opacity-50 ${
          watched ? 'text-amber-600 bg-amber-50 border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/50' : 'text-slate-400 border-transparent hover:bg-slate-100 dark:hover:bg-zinc-800'
        }`}
      >
        {watched ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};

export default TaskBalanceCell;
