import { apiClient } from './client';

export type PaymentMode = 'upi' | 'bank_transfer' | 'cash' | 'cheque' | 'other';
export type ReceiptStatus = 'pending' | 'sent' | 'failed' | 'skipped';

export interface BillingStatus {
  zohoConnected: boolean;
  receiptTemplate: string;
  modes: Record<PaymentMode, string>;
}

export interface BillingClient {
  id: string;
  name: string;
  email: string;
  whatsapp: string | null;
  gstin: string | null;
  zohoLinked: boolean;
}

export interface BillingPayment {
  id: string;
  clientId: string;
  clientName: string;
  amount: string;
  paidOn: string;
  mode: PaymentMode;
  reference: string | null;
  note: string | null;
  zohoPaymentNumber: string | null;
  receiptStatus: ReceiptStatus;
  whatsappTo: string | null;
  whatsappError: string | null;
  receiptSentAt: string | null;
  createdAt: string;
}

export interface NewPayment {
  clientId: string;
  clientName: string;
  amount: number;
  paidOn: string;
  mode: PaymentMode;
  reference?: string;
  note?: string;
}

export interface InvoiceSummary {
  id: string;
  number: string;
  clientName: string;
  date: string;
  total: number;
  status: string;
}

export interface InvoiceLine {
  description: string;
  details?: string;
  sac?: string;
  amount: number;
}

export interface NewInvoice {
  clientId: string;
  clientName: string;
  date: string;
  gstin?: string;
  address?: string;
  city?: string;
  pin?: string;
  lines: InvoiceLine[];
  notes?: string;
}

export const billingApi = {
  invoices: async (): Promise<InvoiceSummary[]> => (await apiClient.get('/billing/invoices')).data.invoices,
  createInvoice: async (body: NewInvoice): Promise<{ id: string; number: string; total: number }> => (await apiClient.post('/billing/invoices', body)).data,
  invoicePdf: async (id: string): Promise<Blob> => (await apiClient.get(`/billing/invoices/${id}/pdf`, { responseType: 'blob' })).data,
  deleteInvoice: async (id: string): Promise<{ deleted: boolean; number: string }> => (await apiClient.delete(`/billing/invoices/${id}`)).data,
  status: async (): Promise<BillingStatus> => (await apiClient.get('/billing/status')).data,
  clients: async (): Promise<BillingClient[]> => (await apiClient.get('/billing/clients')).data.clients,
  saveClient: async (id: string, body: { name: string; whatsapp?: string; gstin?: string }) => (await apiClient.put(`/billing/clients/${id}`, body)).data,
  payments: async (): Promise<BillingPayment[]> => (await apiClient.get('/billing/payments')).data.payments,
  record: async (body: NewPayment): Promise<BillingPayment> => (await apiClient.post('/billing/payments', body)).data,
  receiptUrl: async (id: string): Promise<string> => (await apiClient.get(`/billing/payments/${id}/receipt`)).data.url,
  sendReceipt: async (id: string, whatsapp?: string): Promise<BillingPayment> => (await apiClient.post(`/billing/payments/${id}/send-receipt`, { whatsapp })).data,
  skip: async (id: string): Promise<BillingPayment> => (await apiClient.post(`/billing/payments/${id}/skip`)).data,
};
