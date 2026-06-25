import React, { useRef } from 'react';
import { CalendarDays } from 'lucide-react';

interface DatePickerInputProps {
  value: string; // ISO format: YYYY-MM-DD
  onChange: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * Formats an ISO date string (YYYY-MM-DD) into "DD-Month-YYYY"
 * e.g. "2026-04-04" → "04-April-2026"
 */
export function formatDateDisplay(isoDate: string): string {
  if (!isoDate) return '';
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  const monthName = MONTHS[parseInt(month, 10) - 1] || month;
  return `${day}-${monthName}-${year}`;
}

export const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onChange,
  onBlur,
  disabled = false,
  className = '',
  placeholder = 'Select date',
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDisplayClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.showPicker?.();
      inputRef.current.click();
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Visible styled display */}
      <div
        onClick={handleDisplayClick}
        className={`
          w-full px-3 py-2 glass-input rounded-xl text-xs flex items-center justify-between
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-blue-500/40 transition-colors'}
        `}
      >
        <span className={value ? 'text-foreground font-medium' : 'text-muted-foreground'}>
          {value ? formatDateDisplay(value) : placeholder}
        </span>
        <CalendarDays className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      </div>

      {/* Hidden native date input — positioned over the display so the picker opens */}
      <input
        ref={inputRef}
        type="date"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        style={{ zIndex: -1 }}
        tabIndex={-1}
      />
    </div>
  );
};
