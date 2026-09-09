import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  toast: {
    success: (message: string, title?: string, duration?: number) => void;
    error: (message: string, title?: string, duration?: number) => void;
    warning: (message: string, title?: string, duration?: number) => void;
    info: (message: string, title?: string, duration?: number) => void;
  };
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4000 }: Omit<ToastItem, 'id'>) => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const toast = {
    success: (message: string, title?: string, duration?: number) =>
      showToast({ type: 'success', title, message, duration }),
    error: (message: string, title?: string, duration?: number) =>
      showToast({ type: 'error', title, message, duration }),
    warning: (message: string, title?: string, duration?: number) =>
      showToast({ type: 'warning', title, message, duration }),
    info: (message: string, title?: string, duration?: number) =>
      showToast({ type: 'info', title, message, duration }),
  };

  return (
    <ToastContext.Provider value={{ toast, showToast }}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed bottom-5 right-5 z-[100050] flex flex-col space-y-2.5 max-w-sm w-full pointer-events-none p-2 sm:p-0">
            {toasts.map((item) => (
              <ToastCard key={item.id} item={item} onDismiss={() => removeToast(item.id)} />
            ))}
          </div>,
          document.body
        )}
    </ToastContext.Provider>
  );
};

const ToastCard: React.FC<{ item: ToastItem; onDismiss: () => void }> = ({ item, onDismiss }) => {
  const [isEntering, setIsEntering] = useState(true);

  useEffect(() => {
    const t = requestAnimationFrame(() => setIsEntering(false));
    return () => cancelAnimationFrame(t);
  }, []);

  const typeConfig = {
    success: {
      icon: CheckCircle2,
      iconColor: 'text-emerald-500',
      bg: 'bg-white dark:bg-zinc-900 border-emerald-200 dark:border-emerald-900/60 shadow-emerald-500/10',
      accent: 'bg-emerald-500',
    },
    error: {
      icon: XCircle,
      iconColor: 'text-rose-500',
      bg: 'bg-white dark:bg-zinc-900 border-rose-200 dark:border-rose-900/60 shadow-rose-500/10',
      accent: 'bg-rose-500',
    },
    warning: {
      icon: AlertTriangle,
      iconColor: 'text-amber-500',
      bg: 'bg-white dark:bg-zinc-900 border-amber-200 dark:border-amber-900/60 shadow-amber-500/10',
      accent: 'bg-amber-500',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-500',
      bg: 'bg-white dark:bg-zinc-900 border-blue-200 dark:border-blue-900/60 shadow-blue-500/10',
      accent: 'bg-blue-500',
    },
  }[item.type];

  const Icon = typeConfig.icon;

  return (
    <div
      className={`
        pointer-events-auto relative overflow-hidden rounded-2xl border p-4 shadow-xl flex items-start space-x-3 transition-all duration-300 transform
        ${typeConfig.bg}
        ${isEntering ? 'translate-y-4 opacity-0 scale-95' : 'translate-y-0 opacity-100 scale-100'}
      `}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 ${typeConfig.accent}`} />
      <Icon className={`w-5 h-5 shrink-0 ${typeConfig.iconColor} mt-0.5`} />
      <div className="flex-1 min-w-0">
        {item.title && (
          <h4 className="text-xs font-bold text-slate-900 dark:text-zinc-100 leading-tight">
            {item.title}
          </h4>
        )}
        <p className="text-xs text-slate-600 dark:text-zinc-300 font-medium leading-snug mt-0.5">
          {item.message}
        </p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-zinc-200 transition shrink-0 cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx;
};
