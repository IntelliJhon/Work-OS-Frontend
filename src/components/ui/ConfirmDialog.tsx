import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, Trash2, CheckCircle, X } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfirmVariant = 'danger' | 'warning' | 'info';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

// ─── Variant config ───────────────────────────────────────────────────────────

const variantConfig = {
  danger: {
    icon: Trash2,
    iconBg: 'bg-red-500/10 border-red-500/20',
    iconColor: 'text-red-400',
    confirmBg: 'bg-red-600 hover:bg-red-500 shadow-red-500/20',
    accentBar: 'bg-gradient-to-r from-red-500 to-rose-500',
    title: 'text-red-500 dark:text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconColor: 'text-amber-400',
    confirmBg: 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20',
    accentBar: 'bg-gradient-to-r from-amber-400 to-orange-500',
    title: 'text-amber-500 dark:text-amber-400',
  },
  info: {
    icon: CheckCircle,
    iconBg: 'bg-blue-500/10 border-blue-500/20',
    iconColor: 'text-blue-400',
    confirmBg: 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20',
    accentBar: 'bg-gradient-to-r from-blue-500 to-indigo-500',
    title: 'text-blue-500 dark:text-blue-400',
  },
};

// ─── Dialog Component ─────────────────────────────────────────────────────────

const ConfirmDialogUI: React.FC<{
  state: ConfirmState;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const [visible, setVisible] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const variant = state.variant ?? 'danger';
  const config = variantConfig[variant];
  const Icon = config.icon;

  useEffect(() => {
    // Trigger enter animation
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  // Focus cancel button on open for accessibility
  useEffect(() => {
    cancelRef.current?.focus();
  }, [visible]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleConfirm = () => {
    setVisible(false);
    setTimeout(() => { state.resolve(true); onClose(); }, 200);
  };

  const handleCancel = () => {
    setVisible(false);
    setTimeout(() => { state.resolve(false); onClose(); }, 200);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px] transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleCancel}
      />

      {/* Dialog */}
      <div
        className={`fixed z-[9999] inset-0 flex items-center justify-center p-4 pointer-events-none`}
      >
        <div
          className={`
            pointer-events-auto w-full max-w-sm
            bg-white dark:bg-zinc-950
            border border-slate-200 dark:border-zinc-800
            rounded-2xl shadow-2xl overflow-hidden
            transition-all duration-200
            ${visible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'}
          `}
        >
          {/* Top accent bar */}
          <div className={`h-1 w-full ${config.accentBar}`} />

          <div className="p-6">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center space-x-3">
                <div className={`p-2.5 rounded-xl border ${config.iconBg} flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${config.iconColor}`} />
                </div>
                <div>
                  <h3 className={`text-sm font-black uppercase tracking-wider ${config.title}`}>
                    {state.title}
                  </h3>
                </div>
              </div>
              <button
                onClick={handleCancel}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Message */}
            <p className="text-sm text-slate-600 dark:text-zinc-400 font-medium leading-relaxed mb-6 pl-1">
              {state.message}
            </p>

            {/* Actions */}
            <div className="flex items-center justify-end space-x-2">
              <button
                ref={cancelRef}
                onClick={handleCancel}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-white/5 transition duration-150 cursor-pointer"
              >
                {state.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={handleConfirm}
                className={`px-4 py-2 rounded-xl text-white text-xs font-black uppercase tracking-wider shadow-lg transition duration-150 active:scale-95 cursor-pointer ${config.confirmBg}`}
              >
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogState, setDialogState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setDialogState({ ...options, resolve });
    });
  }, []);

  const handleClose = useCallback(() => {
    setDialogState(null);
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {dialogState && (
        <ConfirmDialogUI state={dialogState} onClose={handleClose} />
      )}
    </ConfirmContext.Provider>
  );
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export const useConfirm = (): ((options: ConfirmOptions) => Promise<boolean>) => {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ctx.confirm;
};
