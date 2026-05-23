import React from 'react';

export type AlertPriority = 'info' | 'success' | 'warning' | 'critical' | 'low' | 'medium' | 'high';

interface AlertBadgeProps {
  priority: AlertPriority | string;
  className?: string;
}

export const AlertBadge: React.FC<AlertBadgeProps> = ({ priority, className = '' }) => {
  const normPriority = (priority?.toLowerCase() || 'info') as AlertPriority;

  let badgeStyles = 'bg-blue-500/10 border-blue-500/25 text-blue-400';
  let label = 'Info';

  switch (normPriority) {
    case 'success':
      badgeStyles = 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400';
      label = 'Success';
      break;
    case 'warning':
    case 'medium':
      badgeStyles = 'bg-amber-500/10 border-amber-500/25 text-amber-400';
      label = normPriority === 'medium' ? 'Medium' : 'Warning';
      break;
    case 'critical':
    case 'high':
      badgeStyles = 'bg-red-500/10 border-red-500/25 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.2)] animate-pulse';
      label = normPriority === 'high' ? 'High' : 'Critical';
      break;
    case 'info':
    case 'low':
    default:
      badgeStyles = 'bg-blue-500/10 border-blue-500/25 text-blue-400';
      label = normPriority === 'low' ? 'Low' : 'Info';
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border font-mono ${badgeStyles} ${className}`}
    >
      {(normPriority === 'critical' || normPriority === 'high') && (
        <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
      )}
      {label}
    </span>
  );
};
