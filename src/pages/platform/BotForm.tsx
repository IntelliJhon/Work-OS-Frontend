import React, { useState } from 'react';
import { Loader2, Save, Trash2, X } from 'lucide-react';
import type { PlatformWorkspace, SaveBotPayload } from '../../services/api/platform';

interface BotFormProps {
  workspace: PlatformWorkspace;
  isSaving: boolean;
  isRemoving: boolean;
  onSave: (payload: SaveBotPayload) => void;
  onRemove: () => void;
  onCancel: () => void;
}

const inputClass =
  'w-full px-3 py-2 glass-input rounded-xl text-xs text-foreground placeholder-muted-foreground focus:outline-none';
const labelClass = 'text-[9px] font-bold text-muted-foreground uppercase tracking-widest block mb-1';

/** Edit a workspace's own WhatsApp bot (WAAU channel). The token is write-only: it is never shown again. */
export const BotForm: React.FC<BotFormProps> = ({ workspace, isSaving, isRemoving, onSave, onRemove, onCancel }) => {
  const bot = workspace.bot;
  const [phoneNumberId, setPhoneNumberId] = useState(bot?.phoneNumberId ?? '');
  const [accessToken, setAccessToken] = useState('');
  const [businessPhone, setBusinessPhone] = useState(bot?.businessPhone ?? '');
  const [otpTemplate, setOtpTemplate] = useState(bot?.otpTemplate ?? '');
  const [ownerTemplate, setOwnerTemplate] = useState(bot?.ownerTemplate ?? '');
  const [employeeTemplate, setEmployeeTemplate] = useState(bot?.employeeTemplate ?? '');
  const [templateLang, setTemplateLang] = useState(bot?.templateLang ?? '');

  const canSave = /^\d{5,30}$/.test(phoneNumberId.trim()) && (!!bot || accessToken.trim().length >= 20) && !isSaving;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onSave({
      phoneNumberId: phoneNumberId.trim(),
      ...(accessToken.trim() ? { accessToken: accessToken.trim() } : {}),
      businessPhone: businessPhone.trim(),
      otpTemplate: otpTemplate.trim(),
      ownerTemplate: ownerTemplate.trim(),
      employeeTemplate: employeeTemplate.trim(),
      templateLang: templateLang.trim(),
    });
  };

  return (
    <form onSubmit={submit} className="mt-4 pt-4 border-t border-border space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Phone number ID *</label>
          <input className={inputClass} inputMode="numeric" placeholder="e.g. 977102768817403" value={phoneNumberId}
            onChange={(e) => setPhoneNumberId(e.target.value.replace(/\D/g, ''))} />
        </div>
        <div>
          <label className={labelClass}>Channel WhatsApp number</label>
          <input className={inputClass} type="tel" placeholder="+91 95394 11333" value={businessPhone}
            onChange={(e) => setBusinessPhone(e.target.value.replace(/[^\d+\s-]/g, ''))} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>Access token {bot ? '(leave empty to keep the current one)' : '*'}</label>
          <input className={inputClass} type="password" autoComplete="new-password" spellCheck={false}
            placeholder={bot ? `Current: ${bot.accessTokenMasked}` : 'WAAU access token for this channel'}
            value={accessToken} onChange={(e) => setAccessToken(e.target.value)} />
        </div>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground font-semibold">Template names (optional; empty = same names as the platform bot)</summary>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mt-3">
          <div>
            <label className={labelClass}>Verification code</label>
            <input className={inputClass} placeholder="default" value={otpTemplate} onChange={(e) => setOtpTemplate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Work assigned (owner)</label>
            <input className={inputClass} placeholder="default" value={ownerTemplate} onChange={(e) => setOwnerTemplate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>New work (employee)</label>
            <input className={inputClass} placeholder="default" value={employeeTemplate} onChange={(e) => setEmployeeTemplate(e.target.value)} />
          </div>
          <div>
            <label className={labelClass}>Language</label>
            <input className={inputClass} placeholder="en" value={templateLang} onChange={(e) => setTemplateLang(e.target.value)} />
          </div>
        </div>
      </details>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {bot ? (
          <button type="button" onClick={onRemove} disabled={isRemoving}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-bold disabled:opacity-50 cursor-pointer">
            {isRemoving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            <span>Use the default bot</span>
          </button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground text-xs font-bold cursor-pointer">
            <X className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
          <button type="submit" disabled={!canSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer">
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            <span>Save bot</span>
          </button>
        </div>
      </div>
    </form>
  );
};
