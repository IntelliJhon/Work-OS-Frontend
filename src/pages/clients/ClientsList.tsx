import React, { useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import {
  clientsApi,
  type ClientUser,
  type OnboardingClient,
  type ClientDocument,
  type EnquiryClient,
} from '../../services/api/clients.api';
import { useAuthStore } from '../../store/authStore';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useToast } from '../../components/ui/Toast';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  Building2,
  RefreshCw,
  AlertTriangle,
  Mail,
  MessageSquare,
  Edit2,
  Check,
  X,
  Loader2,
  Plus,
  UserCheck,
  UserPlus,
  Clock,
  Phone,
  User,
  Trash2,
  Sparkles,
  Paperclip,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File as FileIcon,
  Download,
  Upload,
  ExternalLink,
  ChevronDown,
  Filter
} from 'lucide-react';

const STAGES = [
  { key: 'initiation', label: 'Initiation', color: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-400 dark:border-blue-800' },
  { key: 'requirements', label: 'Requirements', color: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800' },
  { key: 'configuration', label: 'Setup & Config', color: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:border-indigo-800' },
  { key: 'testing', label: 'Testing & QA', color: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-400 dark:border-purple-800' },
  { key: 'ready_to_launch', label: 'Ready to Launch', color: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800' },
  { key: 'completed', label: 'Onboarded', color: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:border-teal-800' },
];

const STATUSES = [
  { key: 'in_progress', label: 'In Progress', color: 'bg-blue-50 text-blue-600 border-blue-250 dark:bg-blue-950/20 dark:text-blue-400 dark:border-blue-900' },
  { key: 'pending_info', label: 'Pending Info', color: 'bg-amber-50 text-amber-600 border-amber-250 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900' },
  { key: 'on_hold', label: 'On Hold', color: 'bg-rose-50 text-rose-600 border-rose-250 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900' },
  { key: 'completed', label: 'Completed', color: 'bg-emerald-50 text-emerald-600 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900' },
];

function formatFileSize(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function getDocumentIcon(fileType: string, fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (fileType.includes('pdf') || ext === 'pdf') {
    return <FileText className="w-4 h-4 text-rose-500 shrink-0" />;
  }
  if (fileType.includes('spreadsheet') || fileType.includes('excel') || ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
    return <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />;
  }
  if (fileType.startsWith('image/') || ['png', 'jpg', 'jpeg', 'svg', 'webp'].includes(ext)) {
    return <FileImage className="w-4 h-4 text-blue-500 shrink-0" />;
  }
  if (fileType.includes('zip') || fileType.includes('compressed') || ['zip', 'rar', 'tar', 'gz'].includes(ext)) {
    return <FileArchive className="w-4 h-4 text-amber-500 shrink-0" />;
  }
  return <FileIcon className="w-4 h-4 text-indigo-500 shrink-0" />;
}

export const ClientsList: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'onboarded' | 'onboarding' | 'enquiry'>('onboarded');
  const [searchQuery, setSearchQuery] = useState('');
  const [expiryFilter, setExpiryFilter] = useState<string>('all');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOnboardingClient, setEditingOnboardingClient] = useState<OnboardingClient | null>(null);

  // Enquiry List State & Modals
  const [showAddEnquiryModal, setShowAddEnquiryModal] = useState(false);
  const [editingEnquiry, setEditingEnquiry] = useState<EnquiryClient | null>(null);
  const [showSheetUploadModal, setShowSheetUploadModal] = useState(false);
  const [parsedSheetRows, setParsedSheetRows] = useState<Array<{ clientName: string; number: string; email?: string; remarks?: string }>>([]);
  const [parsedSheetName, setParsedSheetName] = useState('');
  const [isParsingSheet, setIsParsingSheet] = useState(false);
  const sheetInputRef = useRef<HTMLInputElement>(null);

  // Documents popover anchored state
  const [activeDocsClient, setActiveDocsClient] = useState<{
    id: string;
    name: string;
    email: string;
    anchorRect?: DOMRect;
  } | null>(null);

  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();

  // 1. Fetch OnBoarded Clients (External API Proxy)
  const {
    data: onboardedData,
    isLoading: isOnboardedLoading,
    isError: isOnboardedError,
    error: onboardedError,
    refetch: refetchOnboarded,
    isFetching: isOnboardedFetching
  } = useQuery({
    queryKey: ['clients-list'],
    queryFn: clientsApi.list,
    staleTime: 60000,
  });

  // 2. Fetch OnBoarding Pipeline Clients
  const {
    data: onboardingData,
    isLoading: isOnboardingLoading,
    isError: isOnboardingError,
    error: onboardingErrorMsg,
    refetch: refetchOnboarding,
    isFetching: isOnboardingFetching
  } = useQuery({
    queryKey: ['onboarding-clients-list'],
    queryFn: clientsApi.getOnboardingList,
    staleTime: 30000,
  });

  // 3. Fetch Enquiry Clients
  const {
    data: enquiryData,
    isLoading: isEnquiryLoading,
    refetch: refetchEnquiry,
    isFetching: isEnquiryFetching
  } = useQuery({
    queryKey: ['enquiry-clients-list'],
    queryFn: clientsApi.getEnquiryList,
    staleTime: 30000,
  });

  const enquiryClients = enquiryData?.data || [];

  const LEADSNDEALS_TENANT_ID = 'aee1faf8-27d5-4f5d-9b14-9246abbd0eec';
  const isLeadsndeals =
    user?.tenantId === LEADSNDEALS_TENANT_ID ||
    user?.tenantId === 'leadsndeals' ||
    onboardedData?.slug === 'leadsndeals' ||
    onboardedData?.isOurCompany === true;

  const onboardedClients = onboardedData?.users || [];
  const onboardingClients = onboardingData?.data || [];
  const companyName = onboardedData?.company || (isLeadsndeals ? 'Leadsndeals interactive technologies' : 'Current Company');

  // Sheet file parser handler
  const handleSheetFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingSheet(true);
    setParsedSheetName(file.name);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (jsonRows.length === 0) {
          toast.error('The uploaded spreadsheet is empty.');
          setIsParsingSheet(false);
          return;
        }

        // Detect column keys flexibly
        const keys = Object.keys(jsonRows[0] || {});
        const findKey = (possibleNames: string[]) => {
          return keys.find((k) => {
            const cleanKey = k.toLowerCase().replace(/[^a-z0-9]/g, '');
            return possibleNames.some((p) => cleanKey.includes(p));
          });
        };

        const clientKey = findKey(['clientname', 'client', 'name', 'customer', 'company']);
        const numberKey = findKey(['number', 'phone', 'mobile', 'contact', 'cell']);
        const emailKey = findKey(['email', 'mail']);
        const remarksKey = findKey(['remarks', 'remark', 'notes', 'note', 'comments', 'comment', 'description']);

        const extracted = jsonRows
          .map((row) => {
            const clientName = String(clientKey ? row[clientKey] : '').trim();
            const number = String(numberKey ? row[numberKey] : '').trim();
            const email = String(emailKey ? row[emailKey] : '').trim();
            const remarks = String(remarksKey ? row[remarksKey] : '').trim();

            return {
              clientName,
              number,
              email: email || undefined,
              remarks: remarks || undefined,
            };
          })
          .filter((item) => item.clientName || item.number);

        if (extracted.length === 0) {
          toast.error('Could not find client name or number columns in the uploaded sheet.');
          setIsParsingSheet(false);
          return;
        }

        setParsedSheetRows(extracted);
        setShowSheetUploadModal(true);
      } catch (err: any) {
        toast.error('Failed to parse spreadsheet file. Please check format.');
      } finally {
        setIsParsingSheet(false);
        if (e.target) e.target.value = '';
      }
    };

    reader.onerror = () => {
      toast.error('Error reading spreadsheet file.');
      setIsParsingSheet(false);
      if (e.target) e.target.value = '';
    };

    reader.readAsArrayBuffer(file);
  };

  // Bulk Import Mutation
  const bulkImportEnquiryMutation = useMutation({
    mutationFn: (payload: { items: any[]; sourceSheetName: string }) =>
      clientsApi.importEnquiryClientsBulk(payload),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['enquiry-clients-list'] });
      toast.success(`Successfully imported ${res.count} enquiry clients!`);
      setShowSheetUploadModal(false);
      setParsedSheetRows([]);
      setParsedSheetName('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to import enquiry clients');
    },
  });

  // Single Enquiry Mutation
  const saveEnquiryMutation = useMutation({
    mutationFn: (payload: { id?: string; clientName: string; number: string; email?: string; remarks?: string }) => {
      if (payload.id) {
        return clientsApi.updateEnquiryClient(payload.id, payload);
      }
      return clientsApi.createEnquiryClient(payload);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['enquiry-clients-list'] });
      toast.success(variables.id ? 'Enquiry client updated.' : 'New enquiry client added.');
      setShowAddEnquiryModal(false);
      setEditingEnquiry(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save enquiry');
    },
  });

  // Delete Enquiry Mutation
  const deleteEnquiryMutation = useMutation({
    mutationFn: (id: string) => clientsApi.deleteEnquiryClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enquiry-clients-list'] });
      toast.success('Enquiry client record deleted.');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete enquiry');
    },
  });

  const handleDeleteEnquiry = async (item: EnquiryClient) => {
    const ok = await confirm({
      title: 'Delete Enquiry Client',
      message: `Are you sure you want to delete enquiry record for "${item.clientName}"?`,
      confirmLabel: 'Delete Record',
      variant: 'danger',
    });

    if (ok) {
      deleteEnquiryMutation.mutate(item.id);
    }
  };

  // Mutation: Save comment on onboarded client
  const saveCommentMutation = useMutation({
    mutationFn: ({ clientId, comment }: { clientId: string; comment: string }) =>
      clientsApi.saveComment(clientId, comment),
    onSuccess: (res, variables) => {
      queryClient.setQueryData(['clients-list'], (old: any) => {
        if (!old || !old.users) return old;
        return {
          ...old,
          users: old.users.map((u: ClientUser) =>
            u.id === variables.clientId
              ? {
                  ...u,
                  comment: variables.comment,
                  commentAuthor: res.note?.authorName || user?.email,
                  commentUpdatedAt: res.note?.updatedAt || new Date().toISOString(),
                }
              : u
          ),
        };
      });
      setEditingClientId(null);
      setCommentDraft('');
      toast.success('Important update saved.');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to save update');
    }
  });

  // Mutation: Delete onboarding client
  const deleteOnboardingMutation = useMutation({
    mutationFn: (id: string) => clientsApi.deleteOnboardingClient(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete client');
    }
  });

  // Mutation: Quick update onboarding client stage/status
  const updateOnboardingMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      clientsApi.updateOnboardingClient(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
      toast.success('Client pipeline status updated.');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to update status');
    }
  });

  const handleStartEdit = (client: ClientUser) => {
    setEditingClientId(client.id);
    setCommentDraft(client.comment || '');
  };

  const handleCancelEdit = () => {
    setEditingClientId(null);
    setCommentDraft('');
  };

  const handleSaveComment = (clientId: string) => {
    saveCommentMutation.mutate({ clientId, comment: commentDraft });
  };

  const handleDeleteOnboarding = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete Onboarding Client',
      message: `Are you sure you want to remove "${name}" from the onboarding pipeline? This action cannot be undone.`,
      confirmLabel: 'Delete Client',
      variant: 'danger',
    });

    if (ok) {
      deleteOnboardingMutation.mutate(id);
    }
  };

  // Calculate Expiry Counts for Onboarded Clients
  const expiryCounts = useMemo(() => {
    let expired = 0;
    let expire1Day = 0;
    let expire3Days = 0;
    let expire5Days = 0;

    const nowTime = new Date().getTime();

    onboardedClients.forEach((client: ClientUser) => {
      if (!client.expiry) return;
      const expiryDateObj = new Date(client.expiry);
      if (isNaN(expiryDateObj.getTime())) return;

      const diffDays = Math.ceil((expiryDateObj.getTime() - nowTime) / (1000 * 60 * 60 * 24));

      if (diffDays <= 0) expired++;
      if (diffDays === 1) expire1Day++;
      if (diffDays > 0 && diffDays <= 3) expire3Days++;
      if (diffDays > 0 && diffDays <= 5) expire5Days++;
    });

    return { expired, expire1Day, expire3Days, expire5Days };
  }, [onboardedClients]);

  // Filtered Onboarded Clients
  const filteredOnboardedClients = useMemo(() => {
    const nowTime = new Date().getTime();

    return onboardedClients.filter((client: ClientUser) => {
      // 1. Subscription Expiry Filter
      if (expiryFilter !== 'all') {
        if (!client.expiry) return false;
        const expiryDateObj = new Date(client.expiry);
        if (isNaN(expiryDateObj.getTime())) return false;

        const diffDays = Math.ceil((expiryDateObj.getTime() - nowTime) / (1000 * 60 * 60 * 24));

        if (expiryFilter === 'expired') {
          if (diffDays > 0) return false;
        } else if (expiryFilter === '1_day') {
          if (diffDays !== 1) return false;
        } else if (expiryFilter === '3_days') {
          if (diffDays <= 0 || diffDays > 3) return false;
        } else if (expiryFilter === '5_days') {
          if (diffDays <= 0 || diffDays > 5) return false;
        } else if (expiryFilter === '30_days') {
          if (diffDays <= 0 || diffDays > 30) return false;
        }
      }

      // 2. Search Query Filter
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const firstName = client.profile?.name?.first || '';
      const lastName = client.profile?.name?.last || '';
      const fullName = `${firstName} ${lastName}`.toLowerCase();
      const email = (client.email || '').toLowerCase();
      const id = (client.id || '').toLowerCase();
      const country = (client.country || '').toLowerCase();
      const comment = (client.comment || '').toLowerCase();

      return (
        fullName.includes(q) ||
        email.includes(q) ||
        id.includes(q) ||
        country.includes(q) ||
        comment.includes(q)
      );
    });
  }, [onboardedClients, searchQuery, expiryFilter]);

  // Filtered Onboarding Clients
  const filteredOnboardingClients = useMemo(() => {
    return onboardingClients.filter((client: OnboardingClient) => {
      const matchesStage = stageFilter === 'all' || client.stage === stageFilter;
      if (!matchesStage) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const name = (client.clientName || '').toLowerCase();
      const contact = (client.contactPerson || '').toLowerCase();
      const email = (client.email || '').toLowerCase();
      const phone = (client.phone || '').toLowerCase();
      const lead = (client.assignedTo || '').toLowerCase();
      const notes = (client.notes || '').toLowerCase();

      return (
        name.includes(q) ||
        contact.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        lead.includes(q) ||
        notes.includes(q)
      );
    });
  }, [onboardingClients, searchQuery, stageFilter]);

  // Filtered Enquiry Clients
  const filteredEnquiryClients = useMemo(() => {
    if (!searchQuery.trim()) return enquiryClients;
    const q = searchQuery.toLowerCase().trim();
    return enquiryClients.filter((e: EnquiryClient) => {
      const name = (e.clientName || '').toLowerCase();
      const num = (e.number || '').toLowerCase();
      const email = (e.email || '').toLowerCase();
      const remarks = (e.remarks || '').toLowerCase();
      const sheet = (e.sourceSheetName || '').toLowerCase();

      return (
        name.includes(q) ||
        num.includes(q) ||
        email.includes(q) ||
        remarks.includes(q) ||
        sheet.includes(q)
      );
    });
  }, [enquiryClients, searchQuery]);

  // Stats: Onboarded
  const totalOnboarded = onboardedClients.length;
  const activeOnboarded = onboardedClients.filter(c => c.active).length;
  const commentedCount = onboardedClients.filter(c => c.comment && c.comment.trim().length > 0).length;
  const totalOnboardedDocs = onboardedClients.reduce((acc, c) => acc + (c.documentsCount || 0), 0);

  // Stats: Onboarding
  const totalOnboarding = onboardingClients.length;
  const inProgressOnboarding = onboardingClients.filter(c => c.stage === 'initiation' || c.stage === 'requirements').length;
  const setupQaOnboarding = onboardingClients.filter(c => c.stage === 'configuration' || c.stage === 'testing').length;
  const readyLaunchOnboarding = onboardingClients.filter(c => c.stage === 'ready_to_launch' || c.stage === 'completed').length;

  // Stats: Enquiry List
  const totalEnquiries = enquiryClients.length;
  const validNumbersCount = enquiryClients.filter((e: EnquiryClient) => e.number && e.number.trim().length >= 5).length;
  const withEmailCount = enquiryClients.filter((e: EnquiryClient) => e.email && e.email.trim().length > 0).length;
  const uniqueSheetSourcesCount = new Set(enquiryClients.map((e: EnquiryClient) => e.sourceSheetName).filter(Boolean)).size;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-900 dark:text-white">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Clients Directory</span>
          </h2>
          <p className="text-xs text-muted-foreground font-light flex items-center gap-1.5">
            <span>Managing onboarded, pipeline accounts, and enquiry leads for</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {companyName}
            </span>
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {/* Hidden File Input for Spreadsheet Upload */}
          <input
            type="file"
            ref={sheetInputRef}
            accept=".csv, .xlsx, .xls"
            onChange={handleSheetFileUpload}
            className="hidden"
          />

          {activeTab === 'enquiry' && (
            <>
              <button
                type="button"
                onClick={() => sheetInputRef.current?.click()}
                disabled={isParsingSheet}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isParsingSheet ? (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                ) : (
                  <FileSpreadsheet className="w-4 h-4 text-purple-600" />
                )}
                <span>{isParsingSheet ? 'Parsing Sheet...' : 'Upload Sheet (CSV/Excel)'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingEnquiry(null);
                  setShowAddEnquiryModal(true);
                }}
                className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Enquiry</span>
              </button>
            </>
          )}

          {activeTab === 'onboarding' && (
            <button
              onClick={() => {
                setEditingOnboardingClient(null);
                setShowCreateModal(true);
              }}
              className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Client</span>
            </button>
          )}

          <button
            onClick={() => {
              if (activeTab === 'onboarded') refetchOnboarded();
              else if (activeTab === 'onboarding') refetchOnboarding();
              else refetchEnquiry();
            }}
            disabled={isOnboardedFetching || isOnboardingFetching || isEnquiryFetching}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isOnboardedFetching || isOnboardingFetching || isEnquiryFetching ? 'animate-spin' : ''}`} />
            <span>{isOnboardedFetching || isOnboardingFetching || isEnquiryFetching ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* ── Main Tab Switcher ── */}
      <div className="flex border-b border-slate-200 dark:border-zinc-800 gap-2">
        <button
          onClick={() => {
            setActiveTab('onboarded');
            setSearchQuery('');
          }}
          className={`flex items-center space-x-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'onboarded'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>OnBoarded Clients</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/60">
            {totalOnboarded}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('onboarding');
            setSearchQuery('');
          }}
          className={`flex items-center space-x-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'onboarding'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          <UserPlus className="w-4 h-4" />
          <span>OnBoarding Clients</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/60 dark:border-amber-800/60">
            {totalOnboarding}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('enquiry');
            setSearchQuery('');
          }}
          className={`flex items-center space-x-2 px-4 py-3 text-xs font-bold border-b-2 transition cursor-pointer ${
            activeTab === 'enquiry'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400'
              : 'border-transparent text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Enquiry List</span>
          <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/60">
            {totalEnquiries}
          </span>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── TAB 1: ONBOARDED CLIENTS (EXTERNAL PARTNER API) ────── */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeTab === 'onboarded' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-blue-500 bg-blue-500/10 shrink-0">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">TOTAL ONBOARDED</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalOnboarded}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-emerald-500 bg-emerald-500/10 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">ACTIVE ACCOUNTS</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{activeOnboarded}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-purple-500 bg-purple-500/10 shrink-0">
                <Paperclip className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">DOCUMENTS ATTACHED</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalOnboardedDocs}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-indigo-500 bg-indigo-500/10 shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">WITH REMARKS</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{commentedCount}</h4>
              </div>
            </div>
          </div>

          {/* Search & Subscription Expiry Filter Controls */}
          <div className="flex flex-col gap-3 bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
                {/* Search Input */}
                <div className="relative w-full sm:w-72">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search by client name, email, ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>

                {/* Expiry Filter Dropdown */}
                <div className="relative flex items-center w-full sm:w-60">
                  <Clock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500 pointer-events-none" />
                  <select
                    value={expiryFilter}
                    onChange={(e) => setExpiryFilter(e.target.value)}
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs font-bold text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500 appearance-none cursor-pointer"
                  >
                    <option value="all">All Expiry Statuses</option>
                    <option value="expired">🚨 Expired Accounts ({expiryCounts.expired})</option>
                    <option value="1_day">⚠️ Expire in 1 Day ({expiryCounts.expire1Day})</option>
                    <option value="3_days">⏳ Expire in 3 Days ({expiryCounts.expire3Days})</option>
                    <option value="5_days">📅 Expire in 5 Days ({expiryCounts.expire5Days})</option>
                    <option value="30_days">📆 Expire in 30 Days</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div className="text-xs text-slate-500 dark:text-zinc-400 font-semibold self-end sm:self-auto shrink-0">
                Showing {filteredOnboardedClients.length} of {totalOnboarded} clients
              </div>
            </div>

            {/* Quick Expiry Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/60 dark:border-zinc-800/60">
              <span className="text-[11px] font-bold text-slate-400 dark:text-zinc-500 flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3" /> Expiry Filters:
              </span>

              <button
                type="button"
                onClick={() => setExpiryFilter('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  expiryFilter === 'all'
                    ? 'bg-slate-800 text-white dark:bg-zinc-200 dark:text-zinc-900 shadow-sm'
                    : 'bg-white dark:bg-zinc-850 text-slate-600 dark:text-zinc-300 border border-slate-200 dark:border-zinc-750 hover:bg-slate-100 dark:hover:bg-zinc-800'
                }`}
              >
                All ({totalOnboarded})
              </button>

              <button
                type="button"
                onClick={() => setExpiryFilter('expired')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  expiryFilter === 'expired'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                }`}
              >
                <span>Expired</span>
                <span className="px-1.5 py-0.5 rounded-md bg-rose-200/60 dark:bg-rose-900/60 text-[10px]">
                  {expiryCounts.expired}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExpiryFilter('1_day')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  expiryFilter === '1_day'
                    ? 'bg-amber-600 text-white shadow-sm'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-900/50'
                }`}
              >
                <span>Expire in 1 Day</span>
                <span className="px-1.5 py-0.5 rounded-md bg-amber-200/60 dark:bg-amber-900/60 text-[10px]">
                  {expiryCounts.expire1Day}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExpiryFilter('3_days')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  expiryFilter === '3_days'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
                }`}
              >
                <span>Expire in 3 Days</span>
                <span className="px-1.5 py-0.5 rounded-md bg-indigo-200/60 dark:bg-indigo-900/60 text-[10px]">
                  {expiryCounts.expire3Days}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExpiryFilter('5_days')}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  expiryFilter === '5_days'
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 dark:hover:bg-blue-900/50'
                }`}
              >
                <span>Expire in 5 Days</span>
                <span className="px-1.5 py-0.5 rounded-md bg-blue-200/60 dark:bg-blue-900/60 text-[10px]">
                  {expiryCounts.expire5Days}
                </span>
              </button>
            </div>
          </div>

          {/* Table View */}
          {isOnboardedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
              ))}
            </div>
          ) : isOnboardedError ? (
            <div className="text-center py-16 border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 rounded-3xl space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Failed to Load Onboarded Clients</h4>
              <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
                {onboardedError instanceof Error ? onboardedError.message : 'Error accessing client database proxy API'}
              </p>
              <button
                onClick={() => refetchOnboarded()}
                className="mt-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : filteredOnboardedClients.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-2">
              <Users className="w-10 h-10 mx-auto text-slate-350 dark:text-zinc-650" />
              <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Onboarded Clients Found</h4>
              <p className="text-xs text-muted-foreground font-light max-w-xs mx-auto">
                {searchQuery ? 'No accounts match your search query.' : 'There are currently no active onboarded accounts.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Client User</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Account ID</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Subscription Expiry</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-right">Balance</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Status</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Docs</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Important Remark</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
                  {filteredOnboardedClients.map((client: ClientUser) => {
                    const firstName = client.profile?.name?.first || '';
                    const lastName = client.profile?.name?.last || '';
                    const fullName = `${firstName} ${lastName}`.trim() || client.email.split('@')[0];
                    const isEditing = editingClientId === client.id;
                    const docCount = client.documentsCount || 0;

                    const expiryDateObj = client.expiry ? new Date(client.expiry) : null;
                    const isExpiryValid = expiryDateObj && !isNaN(expiryDateObj.getTime());
                    const formattedExpiry = isExpiryValid
                      ? expiryDateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '-';

                    const diffDays = isExpiryValid
                      ? Math.ceil((expiryDateObj.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
                      : null;

                    return (
                      <tr key={client.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-colors">
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-200 dark:border-blue-800/40 shrink-0 uppercase">
                              {fullName.charAt(0)}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 block">
                                {fullName}
                              </span>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {client.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 align-middle">
                          <span className="font-mono text-[11px] font-semibold text-slate-700 dark:text-zinc-300 bg-slate-100 dark:bg-zinc-850 px-2 py-1 rounded-lg">
                            {client.id}
                          </span>
                        </td>

                        <td className="px-5 py-4 align-middle">
                          {isExpiryValid ? (
                            <div className="space-y-0.5">
                              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                                <span>{formattedExpiry}</span>
                              </span>
                              {diffDays !== null && (
                                <p className="text-[10px] font-semibold">
                                  {diffDays <= 0 ? (
                                    <span className="text-rose-600 dark:text-rose-400 font-bold">Expired ({Math.abs(diffDays)}d ago)</span>
                                  ) : diffDays <= 7 ? (
                                    <span className="text-amber-600 dark:text-amber-400 font-bold">Expiring in {diffDays} day{diffDays === 1 ? '' : 's'}</span>
                                  ) : (
                                    <span className="text-emerald-600 dark:text-emerald-400">{diffDays} days remaining</span>
                                  )}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">-</span>
                          )}
                        </td>

                        <td className="px-5 py-4 align-middle text-right">
                          {(() => {
                            const balanceVal = typeof client.balance === 'number' ? client.balance : 0;
                            const currencySymbol = client.currency === 'USD' ? '$' : (client.currency === 'EUR' ? '€' : (client.currency === 'GBP' ? '£' : '₹'));
                            const formattedNum = balanceVal.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                            return (
                              <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-extrabold font-mono ${
                                balanceVal > 0
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/40'
                                  : balanceVal < 0
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/40'
                                  : 'bg-slate-100 text-slate-600 dark:bg-zinc-850 dark:text-zinc-400 border border-slate-200/60 dark:border-zinc-750'
                              }`}>
                                {currencySymbol}{formattedNum}
                              </span>
                            );
                          })()}
                        </td>

                        <td className="px-5 py-4 align-middle text-center">
                          {client.active ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-900/50">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border border-slate-200 dark:border-zinc-700">
                              <XCircle className="w-3 h-3 text-slate-400" />
                              Inactive
                            </span>
                          )}
                        </td>

                        <td className="px-5 py-4 align-middle text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActiveDocsClient({
                                id: client.id,
                                name: fullName,
                                email: client.email,
                                anchorRect: rect
                              });
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition border cursor-pointer ${
                              docCount > 0
                                ? 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50'
                                : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-slate-400 dark:text-zinc-500 border-slate-200 dark:border-zinc-800'
                            }`}
                            title="Manage Documents & Attachments"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-purple-500" />
                            <span>{docCount}</span>
                          </button>
                        </td>

                        <td className="px-5 py-4 align-middle">
                          {isEditing ? (
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                placeholder="Type important account note..."
                                className="w-full px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-blue-500 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none"
                                autoFocus
                              />
                              <button
                                onClick={() => handleSaveComment(client.id)}
                                disabled={saveCommentMutation.isPending}
                                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition cursor-pointer shrink-0 disabled:opacity-50"
                                title="Save"
                              >
                                {saveCommentMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="p-1.5 rounded-lg bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-slate-600 dark:text-zinc-300 transition cursor-pointer shrink-0"
                                title="Cancel"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-between group/note gap-2">
                              <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium truncate max-w-xs">
                                {client.comment ? (
                                  <span className="flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                                    <span>{client.comment}</span>
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">No notes added</span>
                                )}
                              </span>
                              <button
                                onClick={() => handleStartEdit(client)}
                                className="opacity-0 group-hover/note:opacity-100 p-1 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition cursor-pointer shrink-0"
                                title="Edit Important Remark"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 align-middle text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActiveDocsClient({
                                id: client.id,
                                name: fullName,
                                email: client.email,
                                anchorRect: rect
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-purple-500" />
                            <span>Files</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── TAB 2: ONBOARDING PIPELINE CLIENTS ──────────────────── */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeTab === 'onboarding' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-amber-500 bg-amber-500/10 shrink-0">
                <UserPlus className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">TOTAL IN PIPELINE</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalOnboarding}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-blue-500 bg-blue-500/10 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">INITIATION & REQS</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{inProgressOnboarding}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-purple-500 bg-purple-500/10 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">SETUP & TESTING</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{setupQaOnboarding}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-emerald-500 bg-emerald-500/10 shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">READY TO LAUNCH</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{readyLaunchOnboarding}</h4>
              </div>
            </div>
          </div>

          {/* Search Controls & Stage Filter */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-stretch sm:items-center">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by client name, contact, email, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* Stage Filter Dropdown */}
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Stages</option>
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="text-xs text-slate-500 dark:text-zinc-400 font-semibold self-end sm:self-auto">
              Showing {filteredOnboardingClients.length} of {totalOnboarding} pipeline clients
            </div>
          </div>

          {/* Table View */}
          {isOnboardingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
              ))}
            </div>
          ) : isOnboardingError ? (
            <div className="text-center py-16 border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 rounded-3xl space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Failed to Load Onboarding Pipeline</h4>
              <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
                {onboardingErrorMsg instanceof Error ? onboardingErrorMsg.message : 'Error retrieving onboarding records'}
              </p>
              <button
                onClick={() => refetchOnboarding()}
                className="mt-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          ) : filteredOnboardingClients.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-3 bg-slate-50/30 dark:bg-zinc-900/10">
              <UserPlus className="w-10 h-10 mx-auto text-slate-350 dark:text-zinc-650" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Onboarding Pipeline Clients</h4>
                <p className="text-xs text-muted-foreground font-light max-w-xs mx-auto">
                  {searchQuery || stageFilter !== 'all'
                    ? 'No pipeline accounts match your search filters.'
                    : 'Get started by creating a new onboarding client profile.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditingOnboardingClient(null);
                  setShowCreateModal(true);
                }}
                className="mt-1 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Register Onboarding Client</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
              <table className="w-full text-left border-collapse min-w-[950px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Client / Organization</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Contact Person</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Stage & Progress</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Status</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Docs</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Assigned Lead</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Remarks</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
                  {filteredOnboardingClients.map((client: OnboardingClient) => {
                    const stageConfig = STAGES.find(s => s.key === client.stage) || STAGES[0];
                    const statusConfig = STATUSES.find(s => s.key === client.status) || STATUSES[0];
                    const docCount = client.documentsCount || 0;

                    return (
                      <tr key={client.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-colors">
                        <td className="px-5 py-4 align-middle">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-200 dark:border-amber-800/40 shrink-0 uppercase">
                              {client.clientName.charAt(0)}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 block">
                                {client.clientName}
                              </span>
                              <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-medium">
                                <Mail className="w-3 h-3 text-slate-400" />
                                {client.email}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 align-middle">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200">
                              {client.contactPerson || '-'}
                            </p>
                            {client.phone && (
                              <p className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {client.phone}
                              </p>
                            )}
                          </div>
                        </td>

                        <td className="px-5 py-4 align-middle">
                          <select
                            value={client.stage}
                            onChange={(e) => {
                              updateOnboardingMutation.mutate({
                                id: client.id,
                                payload: { stage: e.target.value }
                              });
                            }}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-extrabold uppercase border cursor-pointer focus:outline-none transition ${stageConfig.color}`}
                          >
                            {STAGES.map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </td>

                        <td className="px-5 py-4 align-middle text-center">
                          <select
                            value={client.status}
                            onChange={(e) => {
                              updateOnboardingMutation.mutate({
                                id: client.id,
                                payload: { status: e.target.value }
                              });
                            }}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-bold border cursor-pointer focus:outline-none transition ${statusConfig.color}`}
                          >
                            {STATUSES.map((s) => (
                              <option key={s.key} value={s.key}>{s.label}</option>
                            ))}
                          </select>
                        </td>

                        <td className="px-5 py-4 align-middle text-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setActiveDocsClient({
                                id: client.id,
                                name: client.clientName,
                                email: client.email,
                                anchorRect: rect
                              });
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-bold transition border cursor-pointer ${
                              docCount > 0
                                ? 'bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800/50'
                                : 'bg-slate-50 hover:bg-slate-100 dark:bg-zinc-900 dark:hover:bg-zinc-850 text-slate-400 dark:text-zinc-500 border-slate-200 dark:border-zinc-800'
                            }`}
                            title="Manage Documents & Attachments"
                          >
                            <Paperclip className="w-3.5 h-3.5 text-purple-500" />
                            <span>{docCount}</span>
                          </button>
                        </td>

                        <td className="px-5 py-4 align-middle text-xs font-medium text-slate-700 dark:text-zinc-300">
                          {client.assignedTo ? (
                            <span className="flex items-center gap-1">
                              <User className="w-3.5 h-3.5 text-blue-500" />
                              <span>{client.assignedTo}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Unassigned</span>
                          )}
                        </td>

                        <td className="px-5 py-4 align-middle text-xs font-medium text-slate-700 dark:text-zinc-300 max-w-[220px]" title={client.notes || ''}>
                          {client.notes ? (
                            <span className="flex items-center gap-1.5 truncate">
                              <MessageSquare className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              <span className="truncate">{client.notes}</span>
                            </span>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                        </td>

                        <td className="px-5 py-4 align-middle text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                setActiveDocsClient({
                                  id: client.id,
                                  name: client.clientName,
                                  email: client.email,
                                  anchorRect: rect
                                });
                              }}
                              className="px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                              title="Attach Files"
                            >
                              <Paperclip className="w-3.5 h-3.5 text-purple-500" />
                              <span>Files</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setEditingOnboardingClient(client);
                                setShowCreateModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                              title="Edit Client Profile"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteOnboarding(client.id, client.clientName)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                              title="Delete Client"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── TAB 3: ENQUIRY LIST (SHEET INTEGRATION & CRUD) ──────── */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeTab === 'enquiry' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-purple-500 bg-purple-500/10 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">TOTAL ENQUIRIES</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalEnquiries}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-emerald-500 bg-emerald-500/10 shrink-0">
                <Phone className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">CONTACT NUMBERS</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{validNumbersCount}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-blue-500 bg-blue-500/10 shrink-0">
                <Mail className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">EMAILS RECORDED</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{withEmailCount}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-indigo-500 bg-indigo-500/10 shrink-0">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">SHEET SOURCES</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{uniqueSheetSourcesCount}</h4>
              </div>
            </div>
          </div>

          {/* Search Controls */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
            <div className="relative w-full sm:w-80">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by client name, number, email, remarks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div className="text-xs text-slate-500 dark:text-zinc-400 font-semibold self-end sm:self-auto">
              Showing {filteredEnquiryClients.length} of {totalEnquiries} enquiries
            </div>
          </div>

          {/* Table View */}
          {isEnquiryLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
              ))}
            </div>
          ) : filteredEnquiryClients.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-3 bg-slate-50/30 dark:bg-zinc-900/10">
              <FileSpreadsheet className="w-12 h-12 mx-auto text-purple-400 dark:text-purple-500/60" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">No Enquiry Clients Found</h4>
                <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
                  {searchQuery
                    ? 'No enquiry entries match your search query.'
                    : 'Your HR team can upload any CSV or Excel sheet to automatically fetch client names, numbers, and emails.'}
                </p>
              </div>
              {!searchQuery && (
                <div className="flex items-center justify-center space-x-3 pt-2">
                  <button
                    type="button"
                    onClick={() => sheetInputRef.current?.click()}
                    className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Upload CSV / Excel Sheet</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEnquiry(null);
                      setShowAddEnquiryModal(true);
                    }}
                    className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-800 dark:text-zinc-200 text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Single Enquiry</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
              <table className="w-full text-left border-collapse min-w-[850px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Client</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Number</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Email</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Remarks</th>
                    <th className="px-5 py-3.5 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
                  {filteredEnquiryClients.map((item: EnquiryClient) => (
                    <tr key={item.id} className="hover:bg-slate-50/80 dark:hover:bg-zinc-900/40 transition-colors">
                      {/* Client Header column */}
                      <td className="px-5 py-4 align-middle">
                        <div className="flex items-center space-x-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-bold text-xs flex items-center justify-center border border-purple-200 dark:border-purple-800/40 shrink-0 uppercase">
                            {item.clientName.charAt(0)}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-slate-900 dark:text-zinc-100 block">
                              {item.clientName}
                            </span>
                            {item.sourceSheetName && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-purple-600 dark:text-purple-400 font-medium mt-0.5">
                                <FileSpreadsheet className="w-3 h-3" />
                                <span>{item.sourceSheetName}</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Number Column */}
                      <td className="px-5 py-4 align-middle">
                        <a
                          href={`tel:${item.number}`}
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:text-blue-600 dark:hover:text-blue-400 transition"
                        >
                          <Phone className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="font-mono">{item.number}</span>
                        </a>
                      </td>

                      {/* Email Column */}
                      <td className="px-5 py-4 align-middle text-xs font-medium text-slate-600 dark:text-zinc-300">
                        {item.email ? (
                          <a href={`mailto:${item.email}`} className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{item.email}</span>
                          </a>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Remarks Column */}
                      <td className="px-5 py-4 align-middle text-xs text-slate-600 dark:text-zinc-300 max-w-xs truncate">
                        {item.remarks ? (
                          <span title={item.remarks}>{item.remarks}</span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      {/* Actions Column */}
                      <td className="px-5 py-4 align-middle text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingEnquiry(item);
                              setShowAddEnquiryModal(true);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                            title="Edit Enquiry"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteEnquiry(item)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                            title="Delete Enquiry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Popover Documents Drawer Component */}
      {activeDocsClient && (
        <ClientDocumentsPopover
          clientId={activeDocsClient.id}
          clientName={activeDocsClient.name}
          clientEmail={activeDocsClient.email}
          anchorRect={activeDocsClient.anchorRect}
          onClose={() => setActiveDocsClient(null)}
        />
      )}

      {/* Create / Edit Onboarding Modal */}
      {showCreateModal && (
        <CreateOnboardingModal
          isOpen={showCreateModal}
          initialData={editingOnboardingClient}
          onClose={() => {
            setShowCreateModal(false);
            setEditingOnboardingClient(null);
          }}
          onSuccess={() => {
            setShowCreateModal(false);
            setEditingOnboardingClient(null);
            refetchOnboarding();
          }}
        />
      )}

      {/* SHEET IMPORT PREVIEW MODAL */}
      {showSheetUploadModal && (
        <SheetUploadModal
          isOpen={showSheetUploadModal}
          sheetName={parsedSheetName}
          rows={parsedSheetRows}
          onClose={() => {
            setShowSheetUploadModal(false);
            setParsedSheetRows([]);
            setParsedSheetName('');
          }}
          onConfirmImport={(validRows) => {
            bulkImportEnquiryMutation.mutate({
              items: validRows,
              sourceSheetName: parsedSheetName,
            });
          }}
          isPending={bulkImportEnquiryMutation.isPending}
        />
      )}

      {/* SINGLE ENQUIRY ADD/EDIT MODAL */}
      {showAddEnquiryModal && (
        <SingleEnquiryModal
          isOpen={showAddEnquiryModal}
          initialData={editingEnquiry}
          onClose={() => {
            setShowAddEnquiryModal(false);
            setEditingEnquiry(null);
          }}
          onSuccess={(payload) => {
            saveEnquiryMutation.mutate({
              id: editingEnquiry?.id,
              ...payload,
            });
          }}
          isPending={saveEnquiryMutation.isPending}
        />
      )}
    </div>
  );
};

// ── Client Documents Popover Component ──
interface ClientDocsPopoverProps {
  clientId: string;
  clientName: string;
  clientEmail: string;
  anchorRect?: DOMRect;
  onClose: () => void;
}

const ClientDocumentsPopover: React.FC<ClientDocsPopoverProps> = ({
  clientId,
  clientName,
  clientEmail,
  onClose,
}) => {
  const [docName, setDocName] = useState('');
  const [docUrl, setDocUrl] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activeTab, setActiveTab] = useState<'upload' | 'link'>('upload');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();

  const { data: docsRes, isLoading } = useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: () => clientsApi.getClientDocuments(clientId),
  });

  const documents: ClientDocument[] = docsRes?.data || [];

  const uploadFilesMutation = useMutation({
    mutationFn: () => clientsApi.uploadClientFiles(clientId, selectedFiles, docName.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
      toast.success('Document uploaded.');
      setSelectedFiles([]);
      setDocName('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to upload document');
    }
  });

  const addUrlMutation = useMutation({
    mutationFn: () => clientsApi.addClientDocumentUrl(clientId, {
      name: docName.trim() || 'Attached Link',
      fileName: docUrl.trim().split('/').pop() || 'link',
      fileUrl: docUrl.trim(),
      fileType: 'link',
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
      toast.success('Document link saved.');
      setDocUrl('');
      setDocName('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to add document URL');
    }
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => clientsApi.deleteClientDocument(clientId, docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-documents', clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
      toast.success('Document removed.');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete document');
    }
  });

  const handleDeleteDoc = async (doc: ClientDocument) => {
    const ok = await confirm({
      title: 'Remove Document',
      message: `Are you sure you want to remove document "${doc.name}"?`,
      confirmLabel: 'Remove',
      variant: 'danger',
    });

    if (ok) {
      deleteDocMutation.mutate(doc.id);
    }
  };

  const handleUploadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'upload') {
      if (selectedFiles.length === 0) {
        toast.error('Please select a file to upload.');
        return;
      }
      uploadFilesMutation.mutate();
    } else {
      if (!docUrl.trim()) {
        toast.error('Please enter a document URL.');
        return;
      }
      addUrlMutation.mutate();
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-slate-950/50 backdrop-blur-[2px] transition-opacity" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in">
          <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 shrink-0">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-purple-500/10 text-purple-500 border border-purple-500/20">
                <Paperclip className="w-4 h-4" />
              </span>
              <div>
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  Client Documents
                </h3>
                <p className="text-[11px] text-muted-foreground truncate max-w-xs font-light">
                  {clientName} ({clientEmail})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-zinc-800 text-slate-400 hover:text-slate-700 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <form onSubmit={handleUploadSubmit} className="p-3 rounded-2xl bg-slate-50 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1">
                  <Upload className="w-3.5 h-3.5 text-purple-500" />
                  <span>Attach Document</span>
                </span>
                <div className="flex items-center p-0.5 rounded-lg bg-slate-200 dark:bg-zinc-800 text-[10px] font-bold">
                  <button
                    type="button"
                    onClick={() => setActiveTab('upload')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                      activeTab === 'upload' ? 'bg-white dark:bg-zinc-950 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    File
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('link')}
                    className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                      activeTab === 'link' ? 'bg-white dark:bg-zinc-950 text-purple-600 dark:text-purple-400 shadow-sm' : 'text-slate-500 dark:text-zinc-400'
                    }`}
                  >
                    URL Link
                  </button>
                </div>
              </div>

              <input
                type="text"
                placeholder="Document Label / Title (Optional)"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-purple-500 font-medium"
              />

              {activeTab === 'upload' ? (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={(e) => {
                      if (e.target.files) setSelectedFiles(Array.from(e.target.files));
                    }}
                    className="hidden"
                  />
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 dark:border-zinc-800 rounded-xl p-3 text-center cursor-pointer hover:border-purple-400 transition bg-white/50 dark:bg-zinc-950/40"
                  >
                    {selectedFiles.length > 0 ? (
                      <div className="text-xs font-bold text-purple-600 dark:text-purple-400 flex items-center justify-center gap-1">
                        <Check className="w-3.5 h-3.5" />
                        <span>{selectedFiles.length} file(s) selected</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-muted-foreground font-medium flex items-center justify-center gap-1">
                        <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                        <span>Click to browse PDF, Excel, Doc, Image...</span>
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={docUrl}
                  onChange={(e) => setDocUrl(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-purple-500 font-medium"
                />
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={uploadFilesMutation.isPending || addUrlMutation.isPending}
                  className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1 shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {(uploadFilesMutation.isPending || addUrlMutation.isPending) ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                  <span>Save Attachment</span>
                </button>
              </div>
            </form>

            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">Attachment History ({documents.length})</p>
              {isLoading ? (
                <div className="space-y-1.5">
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-zinc-900 animate-pulse" />
                  <div className="h-10 rounded-xl bg-slate-100 dark:bg-zinc-900 animate-pulse" />
                </div>
              ) : documents.length === 0 ? (
                <div className="text-center py-6 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl space-y-1 bg-slate-50/50 dark:bg-zinc-900/20">
                  <Paperclip className="w-5 h-5 mx-auto text-slate-350 dark:text-zinc-650" />
                  <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">No documents yet</p>
                  <p className="text-[10px] text-muted-foreground">Attach files or links using the form above.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-150 dark:divide-zinc-850 rounded-xl border border-slate-200 dark:border-zinc-800 overflow-hidden bg-white dark:bg-zinc-950 max-h-48 overflow-y-auto">
                  {documents.map((doc: ClientDocument) => (
                    <div
                      key={doc.id}
                      className="p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50/80 dark:hover:bg-zinc-900/50 transition"
                    >
                      <div className="flex items-center space-x-2.5 truncate max-w-[70%]">
                        <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 shrink-0">
                          {getDocumentIcon(doc.fileType, doc.fileName)}
                        </div>
                        <div className="truncate">
                          <p className="text-xs font-bold text-slate-900 dark:text-zinc-100 truncate" title={doc.name}>
                            {doc.name}
                          </p>
                          <p className="text-[10px] text-muted-foreground flex items-center gap-1 truncate">
                            <span className="truncate">{doc.fileName}</span>
                            {doc.fileSize > 0 && <span>• {formatFileSize(doc.fileSize)}</span>}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1 shrink-0">
                        <a
                          href={
                            doc.fileUrl.startsWith('http') && !doc.fileUrl.includes('cloudinary')
                              ? doc.fileUrl
                              : `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/clients/${clientId}/documents/${doc.id}/view`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 rounded-lg bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-950/60 text-purple-700 hover:text-purple-800 dark:text-purple-300 dark:hover:text-purple-200 transition text-[11px] font-bold flex items-center gap-1 border border-purple-200/60 dark:border-purple-800/40"
                          title="Open / View Document"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open</span>
                        </a>

                        <a
                          href={
                            doc.fileUrl.startsWith('http') && !doc.fileUrl.includes('cloudinary')
                              ? doc.fileUrl
                              : `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/clients/${clientId}/documents/${doc.id}/download`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          download={doc.fileName}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition text-[11px] font-bold"
                          title="Download Document"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => handleDeleteDoc(doc)}
                          disabled={deleteDocMutation.isPending}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition cursor-pointer"
                          title="Delete Document"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/90 flex justify-end shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-zinc-800 hover:bg-slate-300 dark:hover:bg-zinc-700 text-xs font-bold text-slate-900 dark:text-white transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

// ── Create / Edit Onboarding Modal (Portal) ──
interface CreateModalProps {
  isOpen: boolean;
  initialData?: OnboardingClient | null;
  onClose: () => void;
  onSuccess: () => void;
}

const CreateOnboardingModal: React.FC<CreateModalProps> = ({
  isOpen,
  initialData,
  onClose,
  onSuccess,
}) => {
  const [clientName, setClientName] = useState(initialData?.clientName || '');
  const [contactPerson, setContactPerson] = useState(initialData?.contactPerson || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [phone, setPhone] = useState(initialData?.phone || '');
  const [country, setCountry] = useState(initialData?.country || 'IN');
  const [stage, setStage] = useState(initialData?.stage || 'initiation');
  const [status, setStatus] = useState(initialData?.status || 'in_progress');
  const [assignedTo, setAssignedTo] = useState(initialData?.assignedTo || '');
  const [targetDate, setTargetDate] = useState(initialData?.targetDate || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  const [errorMessage, setErrorMessage] = useState('');

  const isEdit = Boolean(initialData?.id);
  const { toast } = useToast();

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (isEdit && initialData) {
        return clientsApi.updateOnboardingClient(initialData.id, {
          clientName,
          contactPerson,
          email,
          phone,
          country,
          stage,
          status,
          assignedTo,
          targetDate,
          notes,
        });
      } else {
        return clientsApi.createOnboardingClient({
          clientName,
          contactPerson,
          email,
          phone,
          country,
          stage,
          status,
          assignedTo,
          targetDate,
          notes,
        });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Onboarding client updated.' : 'New onboarding client registered.');
      onSuccess();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to save client';
      setErrorMessage(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!clientName.trim()) {
      setErrorMessage('Client / Company Name is required.');
      return;
    }
    saveMutation.mutate();
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[9998] bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className={`relative w-full ${isEdit ? 'max-w-md' : 'max-w-xl'} bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in`}>
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {isEdit ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {isEdit ? 'Edit Client Remarks' : 'Create Onboarding Client'}
                </h3>
                <p className="text-[11px] text-muted-foreground font-light">
                  {isEdit ? (
                    <span>Client: <strong className="font-bold text-slate-800 dark:text-zinc-200">{clientName}</strong></span>
                  ) : (
                    'Manually register a new client for setup & onboarding.'
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {!isEdit && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Client / Company Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme Corporation"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Contact Person Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Sarah Jenkins"
                      value={contactPerson}
                      onChange={(e) => setContactPerson(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Contact Email</label>
                    <input
                      type="email"
                      placeholder="e.g. sarah@acme.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Contact Phone / Mobile</label>
                    <input
                      type="text"
                      placeholder="e.g. +91 9876543210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Country Code</label>
                    <input
                      type="text"
                      placeholder="IN, US, UK, etc."
                      value={country}
                      onChange={(e) => setCountry(e.target.value.toUpperCase())}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Pipeline Stage</label>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
                    >
                      {STAGES.map((s) => (
                        <option key={s.key} value={s.key}>{s.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Pipeline Status</label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
                    >
                      {STATUSES.map((st) => (
                        <option key={st.key} value={st.key}>{st.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Target Launch Date</label>
                    <input
                      type="date"
                      value={targetDate}
                      onChange={(e) => setTargetDate(e.target.value)}
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Assigned Onboarding Lead</label>
                    <input
                      type="text"
                      placeholder="e.g. Lead Name / Email"
                      value={assignedTo}
                      onChange={(e) => setAssignedTo(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Remarks & Notes</label>
              <textarea
                rows={4}
                placeholder="Add key requirements, integration scope, or onboarding notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 resize-none font-medium"
                autoFocus={isEdit}
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saveMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md hover:shadow-lg transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {saveMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isEdit ? 'Update Remarks' : 'Create Client'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
};

// ── Sheet Upload Preview Modal (Portal) ──
interface SheetUploadModalProps {
  isOpen: boolean;
  sheetName: string;
  rows: Array<{ clientName: string; number: string; email?: string; remarks?: string }>;
  onClose: () => void;
  onConfirmImport: (validRows: any[]) => void;
  isPending: boolean;
}

const SheetUploadModal: React.FC<SheetUploadModalProps> = ({
  isOpen,
  sheetName,
  rows,
  onClose,
  onConfirmImport,
  isPending,
}) => {
  if (!isOpen) return null;

  const validRows = rows.filter((r) => r.clientName && r.number);

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-slate-950/50 backdrop-blur-[2px] transition-opacity" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-3xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in">
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-sm flex items-center justify-center border border-purple-500/20 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Import Sheet Records</span>
                  <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                    {validRows.length} Valid Entries
                  </span>
                </h3>
                <p className="text-[11px] text-muted-foreground font-light mt-0.5">
                  Source Sheet: <span className="font-semibold text-slate-800 dark:text-zinc-200">{sheetName}</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <div className="p-3 rounded-2xl bg-purple-50/60 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/40 text-xs text-purple-900 dark:text-purple-300 font-medium flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                <span>Auto-extracted Client Name, Number, Email and Remarks columns from your spreadsheet.</span>
              </span>
              <span className="font-bold shrink-0 ml-2">Total Rows: {rows.length}</span>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 max-h-72">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50 dark:bg-zinc-900 sticky top-0">
                    <th className="px-4 py-2.5 font-bold text-slate-600 dark:text-zinc-400">#</th>
                    <th className="px-4 py-2.5 font-bold text-slate-600 dark:text-zinc-400">Client</th>
                    <th className="px-4 py-2.5 font-bold text-slate-600 dark:text-zinc-400">Number</th>
                    <th className="px-4 py-2.5 font-bold text-slate-600 dark:text-zinc-400">Email</th>
                    <th className="px-4 py-2.5 font-bold text-slate-600 dark:text-zinc-400">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
                  {validRows.map((r, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/30">
                      <td className="px-4 py-2 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                      <td className="px-4 py-2 font-bold text-slate-900 dark:text-zinc-100">{r.clientName}</td>
                      <td className="px-4 py-2 font-mono font-semibold text-slate-800 dark:text-zinc-200">{r.number}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-zinc-400">{r.email || '-'}</td>
                      <td className="px-4 py-2 text-slate-600 dark:text-zinc-400 truncate max-w-xs">{r.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex items-center justify-end space-x-3 p-4 border-t border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onConfirmImport(validRows)}
              disabled={isPending || validRows.length === 0}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              <span>Confirm & Import ({validRows.length}) Entries</span>
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
};

// ── Single Enquiry Modal (Portal) ──
interface SingleEnquiryModalProps {
  isOpen: boolean;
  initialData?: EnquiryClient | null;
  onClose: () => void;
  onSuccess: (data: { clientName: string; number: string; email?: string; remarks?: string }) => void;
  isPending: boolean;
}

const SingleEnquiryModal: React.FC<SingleEnquiryModalProps> = ({
  isOpen,
  initialData,
  onClose,
  onSuccess,
  isPending,
}) => {
  const [clientName, setClientName] = useState(initialData?.clientName || '');
  const [number, setNumber] = useState(initialData?.number || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [remarks, setRemarks] = useState(initialData?.remarks || '');
  const [errorMessage, setErrorMessage] = useState('');

  const isEdit = Boolean(initialData?.id);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    if (!clientName.trim()) {
      setErrorMessage('Client Name is required.');
      return;
    }
    if (!number.trim()) {
      setErrorMessage('Contact Number is required.');
      return;
    }

    onSuccess({
      clientName: clientName.trim(),
      number: number.trim(),
      email: email.trim() || undefined,
      remarks: remarks.trim() || undefined,
    });
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[9998] bg-slate-950/50 backdrop-blur-[2px] transition-opacity" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in">
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {isEdit ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {isEdit ? 'Edit Enquiry Record' : 'Add Enquiry Client'}
                </h3>
                <p className="text-[11px] text-muted-foreground font-light">
                  {isEdit ? 'Update details for client enquiry.' : 'Manually add a new client enquiry record.'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Client / Company Name *</label>
              <input
                type="text"
                required
                placeholder="e.g. John Doe / Acme Corp"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Contact Number *</label>
              <input
                type="text"
                required
                placeholder="e.g. +91 9876543210"
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Email Address (Optional)</label>
              <input
                type="email"
                placeholder="e.g. client@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Remarks / Notes (Optional)</label>
              <textarea
                rows={3}
                placeholder="Enter key enquiry details, requirements, or notes..."
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 resize-none font-medium"
              />
            </div>

            <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-xs font-semibold text-slate-700 dark:text-zinc-200 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
              >
                {isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                <span>{isEdit ? 'Update Record' : 'Save Enquiry'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
};

export default ClientsList;
