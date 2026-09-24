import React, { useState } from 'react';
import { Check, Loader2, MessageCircle, Pencil, X } from 'lucide-react';
import { usersApi } from '../../../services/api/users';
import { useToast } from '../../../components/ui/Toast';

interface MemberPhoneFieldProps {
  userId: string;
  phone: string | null | undefined;
  canEdit: boolean;
  onSaved: (phone: string | null) => void;
}

const display = (phone: string) => `+${phone}`;

/** WhatsApp number used to notify the member about assigned work (inline edit in the members table). */
export const MemberPhoneField: React.FC<MemberPhoneFieldProps> = ({ userId, phone, canEdit, onSaved }) => {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const startEdit = () => {
    setValue(phone ? display(phone) : '');
    setIsEditing(true);
  };

  const save = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSaving(true);
    try {
      const updated = await usersApi.update(userId, { phone: value.trim() || null });
      onSaved(updated.phone ?? null);
      setIsEditing(false);
      toast.success(updated.phone ? 'WhatsApp number saved.' : 'WhatsApp number removed.');
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Could not save the WhatsApp number.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isEditing) {
    return (
      <form onSubmit={save} className="flex items-center gap-1.5 mt-1.5">
        <input
          type="tel"
          autoFocus
          aria-label="WhatsApp number"
          placeholder="+91 98765 43210"
          maxLength={25}
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d+\s-]/g, ''))}
          onKeyDown={(e) => e.key === 'Escape' && setIsEditing(false)}
          className="w-40 bg-white dark:bg-zinc-900/60 border border-slate-200 dark:border-border/80 rounded-lg px-2.5 py-1 text-[11px] text-slate-900 dark:text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
        />
        <button type="submit" disabled={isSaving} aria-label="Save" className="p-1 rounded-md text-emerald-500 hover:bg-emerald-500/10 disabled:opacity-50 cursor-pointer">
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
        </button>
        <button type="button" onClick={() => setIsEditing(false)} aria-label="Cancel" className="p-1 rounded-md text-muted-foreground hover:bg-muted cursor-pointer">
          <X className="w-3.5 h-3.5" />
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-1.5 mt-1 text-[11px]">
      <MessageCircle className={`w-3 h-3 ${phone ? 'text-emerald-500' : 'text-muted-foreground'}`} />
      {phone ? (
        <span className="text-slate-600 dark:text-zinc-400">{display(phone)}</span>
      ) : (
        <span className="text-muted-foreground font-light italic">No WhatsApp number</span>
      )}
      {canEdit && (
        <button type="button" onClick={startEdit} aria-label={phone ? 'Edit WhatsApp number' : 'Add WhatsApp number'} className="p-0.5 rounded text-muted-foreground hover:text-foreground cursor-pointer">
          <Pencil className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
