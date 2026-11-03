import { apiClient } from './client';

// Company email (e.g. info@intellijohn.com): Admins set it up; anyone who can work on leads sends from it.

export interface MailStatus { configured: boolean; fromEmail: string | null; fromName: string | null; canSend: boolean; isAdmin: boolean }

export interface MailSettings {
  fromEmail: string;
  fromName: string | null;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  imapHost: string | null;
  imapPort: number;
  username: string;
  signature: string | null;
  lastTestAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string;
}

export interface MailSettingsInput extends Omit<MailSettings, 'lastTestAt' | 'lastTestOk' | 'lastTestError' | 'updatedAt'> { password?: string }

export interface MailTestResult {
  smtp: { ok: boolean; error: string | null };
  imap: { ok: boolean; error: string | null; sentFolder: string | null };
}

export interface SentEmail {
  id: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  attachments: { name: string }[];
  status: 'sent' | 'failed';
  error: string | null;
  via: 'manual' | 'ai';
  sentByName: string | null;
  createdAt: string;
}

const base = '/mail';

export const mailApi = {
  status: async () => (await apiClient.get<{ data: MailStatus }>(`${base}/status`)).data.data,
  settings: async () => (await apiClient.get<{ data: MailSettings | null }>(`${base}/settings`)).data.data,
  save: async (input: MailSettingsInput) => (await apiClient.put<{ data: MailSettings }>(`${base}/settings`, input)).data.data,
  remove: async () => (await apiClient.delete(`${base}/settings`)).data,
  test: async () => (await apiClient.post<{ data: MailTestResult }>(`${base}/test`, {}, { timeout: 90_000 })).data.data,
  send: async (input: { to: string; cc?: string; subject: string; body: string; leadId?: string; uploadIds?: string[]; files?: File[] }) => {
    const form = new FormData();
    form.append('to', input.to);
    if (input.cc) form.append('cc', input.cc);
    form.append('subject', input.subject);
    form.append('body', input.body);
    if (input.leadId) form.append('leadId', input.leadId);
    (input.uploadIds ?? []).forEach((id) => form.append('uploadIds', id));
    (input.files ?? []).forEach((f) => form.append('files', f));
    return (await apiClient.post<{ data: { id: string; savedToSent: boolean } }>(`${base}/send`, form, { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 120_000 })).data.data;
  },
  forLead: async (leadId: string) => (await apiClient.get<{ data: SentEmail[] }>(`${base}/leads/${leadId}`)).data.data,
};

/** StackMail (20i) — the provider behind intellijohn.com */
export const STACKMAIL_DEFAULTS = { smtpHost: 'mail.stackmail.com', smtpPort: 465, smtpSecure: true, imapHost: 'mail.stackmail.com', imapPort: 993 };
