import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  clientsApi,
  type ClientUser,
  type OnboardingClient,
  type ClientDocument
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
  Key,
  Globe,
  ShieldAlert,
  MessageSquare,
  Edit2,
  Check,
  X,
  Loader2,
  Plus,
  UserCheck,
  UserPlus,
  Clock,
  Calendar,
  Phone,
  User,
  Trash2,
  ChevronDown,
  Layers,
  Sparkles,
  Paperclip,
  FileText,
  FileSpreadsheet,
  FileImage,
  FileArchive,
  File as FileIcon,
  Download,
  Upload,
  ExternalLink
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
  const [activeTab, setActiveTab] = useState<'onboarded' | 'onboarding'>('onboarded');
  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingOnboardingClient, setEditingOnboardingClient] = useState<OnboardingClient | null>(null);

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

  const LEADSNDEALS_TENANT_ID = 'aee1faf8-27d5-4f5d-9b14-9246abbd0eec';
  const isLeadsndeals =
    user?.tenantId === LEADSNDEALS_TENANT_ID ||
    user?.tenantId === 'leadsndeals' ||
    onboardedData?.slug === 'leadsndeals' ||
    onboardedData?.isOurCompany === true;

  const onboardedClients = onboardedData?.users || [];
  const onboardingClients = onboardingData?.data || [];
  const companyName = onboardedData?.company || (isLeadsndeals ? 'Leadsndeals interactive technologies' : 'Current Company');

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

  const handleDeleteOnboarding = async (client: OnboardingClient) => {
    const ok = await confirm({
      title: 'Remove Client from Onboarding',
      message: `Are you sure you want to remove "${client.clientName}" from the onboarding pipeline?`,
      confirmLabel: 'Remove Client',
      variant: 'danger',
    });
    if (ok) {
      deleteOnboardingMutation.mutate(client.id, {
        onSuccess: () => {
          toast.success(`Client "${client.clientName}" removed.`);
        }
      });
    }
  };

  const handleOpenDocs = (
    e: React.MouseEvent<HTMLElement>,
    client: { id: string; name: string; email: string }
  ) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setActiveDocsClient({
      id: client.id,
      name: client.name,
      email: client.email,
      anchorRect: rect,
    });
  };

  // Filtered Onboarded Clients
  const filteredOnboardedClients = useMemo(() => {
    if (!searchQuery.trim()) return onboardedClients;
    const q = searchQuery.toLowerCase().trim();
    return onboardedClients.filter((client: ClientUser) => {
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
  }, [onboardedClients, searchQuery]);

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
            <span>Managing onboarded and pipeline accounts for</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {companyName}
            </span>
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
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
              else refetchOnboarding();
            }}
            disabled={isOnboardedFetching || isOnboardingFetching}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition shadow-sm cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isOnboardedFetching || isOnboardingFetching ? 'animate-spin' : ''}`} />
            <span>{isOnboardedFetching || isOnboardingFetching ? 'Refreshing...' : 'Refresh'}</span>
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
              <div className="p-2.5 rounded-xl text-amber-500 bg-amber-500/10 shrink-0">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">WITH UPDATES</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{commentedCount}</h4>
              </div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
            <div className="relative w-full sm:w-96">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, user ID, country, comment..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>
            <div className="text-xs text-slate-500 dark:text-zinc-400 font-semibold self-end sm:self-auto">
              Showing {filteredOnboardedClients.length} of {totalOnboarded} clients
            </div>
          </div>

          {/* Main Table */}
          {isOnboardedLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
              ))}
            </div>
          ) : !isLeadsndeals && onboardedData?.isOurCompany === false ? (
            <div className="text-center py-20 border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/10 rounded-3xl space-y-3">
              <ShieldAlert className="w-12 h-12 mx-auto text-amber-500" />
              <h4 className="text-base font-bold text-slate-900 dark:text-zinc-100">Access Restricted</h4>
              <p className="text-xs text-muted-foreground font-light max-w-md mx-auto leading-relaxed">
                The Clients section is exclusively configured for <span className="font-semibold text-blue-600 dark:text-blue-400">Leadsndeals</span>. Your company (<span className="font-medium text-slate-800 dark:text-zinc-200">{companyName}</span>) does not have access to this section.
              </p>
            </div>
          ) : isOnboardedError ? (
            <div className="text-center py-16 border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 rounded-3xl space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Failed to Load Clients</h4>
              <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
                {(onboardedError as any)?.response?.data?.error || (onboardedError as any)?.message || 'An unexpected error occurred while communicating with the server.'}
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
              <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Clients Found</h4>
              <p className="text-xs text-muted-foreground font-light max-w-xs mx-auto">
                {searchQuery ? 'No client records match your search criteria.' : 'There are currently no clients registered under this company.'}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Client Name</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Email</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">User ID (External)</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center w-24">Status</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center w-20">Country</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-24">Created Date</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-56">Documents</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-72">Comments / Important Updates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
                  {filteredOnboardedClients.map((client: ClientUser) => {
                    const firstName = client.profile?.name?.first || '';
                    const lastName = client.profile?.name?.last || '';
                    const displayName = `${firstName} ${lastName}`.trim() || client.email.split('@')[0];
                    const isActive = client.active !== false;
                    const createdDate = client.created_at ? new Date(client.created_at).toLocaleDateString() : '-';
                    const isEditing = editingClientId === client.id;
                    const hasComment = Boolean(client.comment && client.comment.trim());
                    const docs = client.documents || [];
                    const docsCount = client.documentsCount || docs.length;
                    const isRowActive = activeDocsClient?.id === client.id;

                    return (
                      <tr
                        key={client.id}
                        className={`transition-colors duration-150 ${
                          isRowActive
                            ? 'bg-purple-50/80 dark:bg-purple-950/40 border-l-4 border-l-purple-500'
                            : 'hover:bg-slate-50/80 dark:hover:bg-zinc-900/40'
                        }`}
                      >
                        {/* Name */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-full bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center border border-blue-200 dark:border-blue-800/40 shrink-0">
                              {displayName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">{displayName}</p>
                              {client.profile?.language && (
                                <span className="text-[9px] text-slate-400 uppercase font-semibold">
                                  Lang: {client.profile.language}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center space-x-1.5 text-xs text-slate-700 dark:text-zinc-300 font-medium">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[170px]">{client.email}</span>
                          </div>
                        </td>

                        {/* User ID */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                            <Key className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700/60 truncate max-w-[140px]" title={client.id}>
                              {client.id}
                            </span>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${
                            isActive
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-250 dark:bg-emerald-950/20 dark:text-emerald-450 dark:border-emerald-900/50'
                              : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                          }`}>
                            {isActive ? <CheckCircle2 className="w-2.5 h-2.5" /> : <XCircle className="w-2.5 h-2.5" />}
                            <span>{isActive ? 'Active' : 'Inactive'}</span>
                          </span>
                        </td>

                        {/* Country */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          {client.country ? (
                            <span className="inline-flex items-center space-x-1 text-xs font-bold text-slate-700 dark:text-zinc-300">
                              <Globe className="w-3 h-3 text-slate-400" />
                              <span>{client.country}</span>
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-400">-</span>
                          )}
                        </td>

                        {/* Created Date */}
                        <td className="px-4 py-3.5 align-middle text-xs text-slate-500 dark:text-zinc-400 font-medium">
                          {createdDate}
                        </td>

                        {/* Documents Column */}
                        <td className="px-4 py-3.5 align-middle">
                          {docsCount > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => handleOpenDocs(e, { id: client.id, name: displayName, email: client.email })}
                              className="group flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-950/50 border border-purple-200 dark:border-purple-800/40 text-purple-700 dark:text-purple-300 transition text-xs font-semibold cursor-pointer max-w-[200px]"
                              title="Click to view & add documents"
                            >
                              <Paperclip className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                              <span className="truncate">{docs[0]?.name || docs[0]?.fileName || `${docsCount} Docs`}</span>
                              {docsCount > 1 && (
                                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-purple-200/80 dark:bg-purple-900 text-purple-800 dark:text-purple-200 shrink-0">
                                  +{docsCount - 1}
                                </span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleOpenDocs(e, { id: client.id, name: displayName, email: client.email })}
                              className="flex items-center space-x-1 text-xs text-slate-500 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-400 px-2.5 py-1.5 rounded-xl border border-dashed border-slate-250 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-800 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition cursor-pointer font-medium"
                              title="Attach documents"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Documents</span>
                            </button>
                          )}
                        </td>

                        {/* Comments / Important Updates Column */}
                        <td className="px-4 py-3.5 align-middle">
                          {isEditing ? (
                            <div className="flex flex-col gap-1.5 p-1.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-blue-400 dark:border-blue-500 shadow-sm animate-fade-in">
                              <textarea
                                value={commentDraft}
                                onChange={(e) => setCommentDraft(e.target.value)}
                                placeholder="Add important update or note..."
                                className="w-full text-xs p-2 rounded-lg bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 text-slate-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none min-h-[56px]"
                                autoFocus
                              />
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  onClick={handleCancelEdit}
                                  disabled={saveCommentMutation.isPending}
                                  className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => handleSaveComment(client.id)}
                                  disabled={saveCommentMutation.isPending}
                                  className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold inline-flex items-center space-x-1 shadow-sm transition disabled:opacity-50 cursor-pointer"
                                >
                                  {saveCommentMutation.isPending ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <Check className="w-3 h-3" />
                                  )}
                                  <span>Save</span>
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div
                              onClick={() => handleStartEdit(client)}
                              className="group relative flex items-start justify-between gap-2 p-2 rounded-xl border border-transparent hover:border-slate-200 dark:hover:border-zinc-800 hover:bg-slate-50 dark:hover:bg-zinc-900/60 cursor-pointer transition"
                              title="Click to edit comment"
                            >
                              {hasComment ? (
                                <div className="space-y-0.5 max-w-[240px]">
                                  <p className="text-xs text-slate-800 dark:text-zinc-200 font-medium leading-snug line-clamp-2">
                                    {client.comment}
                                  </p>
                                  {client.commentUpdatedAt && (
                                    <span className="text-[9px] text-slate-400 dark:text-zinc-500 flex items-center gap-1">
                                      <span>Updated: {new Date(client.commentUpdatedAt).toLocaleDateString()}</span>
                                      {client.commentAuthor && <span>by {client.commentAuthor.split('@')[0]}</span>}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-slate-400 dark:text-zinc-600 italic inline-flex items-center gap-1">
                                  <Plus className="w-3 h-3 text-slate-350 dark:text-zinc-650" />
                                  Add important update...
                                </span>
                              )}

                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleStartEdit(client);
                                }}
                                className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition shrink-0 cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
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
      {/* ── TAB 2: ONBOARDING CLIENTS (PIPELINE & MANUAL CREATION) ─ */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeTab === 'onboarding' && (
        <div className="space-y-6 animate-fade-in">
          {/* Summary Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-blue-500 bg-blue-500/10 shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">TOTAL IN ONBOARDING</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalOnboarding}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-amber-500 bg-amber-500/10 shrink-0">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">DISCOVERY & REQS</p>
                <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{inProgressOnboarding}</h4>
              </div>
            </div>

            <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
              <div className="p-2.5 rounded-xl text-purple-500 bg-purple-500/10 shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">SETUP & QA</p>
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

          {/* Search & Filters Bar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50/50 dark:bg-zinc-900/10 border border-slate-200 dark:border-zinc-800 p-4 rounded-2xl">
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto items-stretch sm:items-center">
              <div className="relative w-full sm:w-80">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search onboarding clients, email, lead..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs text-slate-700 dark:text-zinc-200 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>

              {/* Stage Filter */}
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="px-3 py-2 rounded-xl bg-white dark:bg-background border border-slate-200 dark:border-zinc-850 text-xs font-semibold text-slate-700 dark:text-zinc-300 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="all">All Onboarding Stages</option>
                {STAGES.map((s) => (
                  <option key={s.key} value={s.key}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center space-x-3 self-end sm:self-auto">
              <span className="text-xs text-slate-500 dark:text-zinc-400 font-semibold">
                Showing {filteredOnboardingClients.length} of {totalOnboarding} pipeline clients
              </span>
              <button
                onClick={() => {
                  setEditingOnboardingClient(null);
                  setShowCreateModal(true);
                }}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Client</span>
              </button>
            </div>
          </div>

          {/* Onboarding Clients Table */}
          {isOnboardingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
              ))}
            </div>
          ) : isOnboardingError ? (
            <div className="text-center py-16 border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 rounded-3xl space-y-3">
              <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
              <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Failed to Load Onboarding Pipeline</h4>
              <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
                {(onboardingErrorMsg as any)?.response?.data?.error || (onboardingErrorMsg as any)?.message || 'An error occurred loading onboarding clients.'}
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
              <UserPlus className="w-12 h-12 mx-auto text-slate-350 dark:text-zinc-650" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-200">No Onboarding Clients Found</h4>
                <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
                  {searchQuery || stageFilter !== 'all'
                    ? 'No onboarding clients match the selected filters.'
                    : 'Start your onboarding pipeline by creating your first client.'}
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingOnboardingClient(null);
                  setShowCreateModal(true);
                }}
                className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Create Onboarding Client</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
              <table className="w-full text-left border-collapse min-w-[1100px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Client / Company</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Contact & Email</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Stage</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center">Status</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Target Date</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Assigned Lead</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-44">Documents</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-56">Notes & Requirements</th>
                    <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-right w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
                  {filteredOnboardingClients.map((client: OnboardingClient) => {
                    const currentStage = STAGES.find(s => s.key === client.stage) || STAGES[0];
                    const currentStatus = STATUSES.find(s => s.key === client.status) || STATUSES[0];
                    const docs = client.documents || [];
                    const docsCount = client.documentsCount || docs.length;
                    const isRowActive = activeDocsClient?.id === client.id;

                    return (
                      <tr
                        key={client.id}
                        className={`transition-colors duration-150 ${
                          isRowActive
                            ? 'bg-purple-50/80 dark:bg-purple-950/40 border-l-4 border-l-purple-500'
                            : 'hover:bg-slate-50/80 dark:hover:bg-zinc-900/40'
                        }`}
                      >
                        {/* Client Name */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="flex items-center space-x-2.5">
                            <div className="w-8 h-8 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold text-xs flex items-center justify-center border border-amber-200 dark:border-amber-800/40 shrink-0">
                              {client.clientName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-zinc-100">{client.clientName}</p>
                              {client.country && (
                                <span className="text-[9px] text-slate-400 uppercase font-semibold flex items-center gap-1">
                                  <Globe className="w-2.5 h-2.5" />
                                  {client.country}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="space-y-0.5">
                            <p className="text-xs font-semibold text-slate-800 dark:text-zinc-200 flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              {client.contactPerson || 'Direct'}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-zinc-400 flex items-center gap-1 truncate max-w-[170px]">
                              <Mail className="w-3 h-3 text-slate-400" />
                              {client.email}
                            </p>
                            {client.phone && (
                              <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Phone className="w-2.5 h-2.5" />
                                {client.phone}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Stage Selector */}
                        <td className="px-4 py-3.5 align-middle">
                          <div className="relative inline-block">
                            <select
                              value={client.stage}
                              onChange={(e) =>
                                updateOnboardingMutation.mutate({
                                  id: client.id,
                                  payload: { stage: e.target.value },
                                })
                              }
                              className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border cursor-pointer appearance-none pr-5 focus:outline-none ${currentStage.color}`}
                            >
                              {STAGES.map((s) => (
                                <option key={s.key} value={s.key}>{s.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3.5 align-middle text-center">
                          <div className="relative inline-block">
                            <select
                              value={client.status}
                              onChange={(e) =>
                                updateOnboardingMutation.mutate({
                                  id: client.id,
                                  payload: { status: e.target.value },
                                })
                              }
                              className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border cursor-pointer appearance-none pr-4 focus:outline-none ${currentStatus.color}`}
                            >
                              {STATUSES.map((st) => (
                                <option key={st.key} value={st.key}>{st.label}</option>
                              ))}
                            </select>
                            <ChevronDown className="w-2.5 h-2.5 absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none opacity-60" />
                          </div>
                        </td>

                        {/* Target Date */}
                        <td className="px-4 py-3.5 align-middle">
                          <span className="text-xs text-slate-600 dark:text-zinc-300 font-medium inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {client.targetDate || '-'}
                          </span>
                        </td>

                        {/* Assigned Lead */}
                        <td className="px-4 py-3.5 align-middle">
                          <span className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                            {client.assignedTo || 'Unassigned'}
                          </span>
                        </td>

                        {/* Documents Column */}
                        <td className="px-4 py-3.5 align-middle">
                          {docsCount > 0 ? (
                            <button
                              type="button"
                              onClick={(e) => handleOpenDocs(e, { id: client.id, name: client.clientName, email: client.email })}
                              className="group flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/30 dark:hover:bg-purple-950/50 border border-purple-200 dark:border-purple-800/40 text-purple-700 dark:text-purple-300 transition text-xs font-semibold cursor-pointer max-w-[170px]"
                              title="Click to view & add documents"
                            >
                              <Paperclip className="w-3.5 h-3.5 shrink-0 text-purple-600 dark:text-purple-400" />
                              <span className="truncate">{docs[0]?.name || docs[0]?.fileName || `${docsCount} Docs`}</span>
                              {docsCount > 1 && (
                                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[9px] font-black bg-purple-200/80 dark:bg-purple-900 text-purple-800 dark:text-purple-200 shrink-0">
                                  +{docsCount - 1}
                                </span>
                              )}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleOpenDocs(e, { id: client.id, name: client.clientName, email: client.email })}
                              className="flex items-center space-x-1 text-xs text-slate-500 hover:text-purple-600 dark:text-zinc-400 dark:hover:text-purple-400 px-2.5 py-1.5 rounded-xl border border-dashed border-slate-250 dark:border-zinc-800 hover:border-purple-300 dark:hover:border-purple-800 hover:bg-purple-50/50 dark:hover:bg-purple-950/20 transition cursor-pointer font-medium"
                              title="Attach documents"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add Docs</span>
                            </button>
                          )}
                        </td>

                        {/* Notes */}
                        <td className="px-4 py-3.5 align-middle">
                          <p className="text-xs text-slate-600 dark:text-zinc-400 line-clamp-2" title={client.notes || ''}>
                            {client.notes || <span className="text-slate-350 dark:text-zinc-650 italic">No requirements noted</span>}
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3.5 align-middle text-right">
                          <div className="flex items-center justify-end space-x-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingOnboardingClient(client);
                                setShowCreateModal(true);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                              title="Edit Client"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteOnboarding(client)}
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
      {/* ── CREATE / EDIT ONBOARDING CLIENT MODAL ──────────────── */}
      {/* ────────────────────────────────────────────────────────── */}
      {showCreateModal && (
        <CreateOnboardingModal
          isOpen={showCreateModal}
          initialData={editingOnboardingClient}
          onClose={() => {
            setShowCreateModal(false);
            setEditingOnboardingClient(null);
          }}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
            setShowCreateModal(false);
            setEditingOnboardingClient(null);
          }}
        />
      )}

      {/* ────────────────────────────────────────────────────────── */}
      {/* ── CONTEXTUAL FLOATING CLIENT DOCUMENTS POPOVER ────────── */}
      {/* ────────────────────────────────────────────────────────── */}
      {activeDocsClient && (
        <ClientDocumentsPopover
          isOpen={Boolean(activeDocsClient)}
          clientId={activeDocsClient.id}
          clientName={activeDocsClient.name}
          clientEmail={activeDocsClient.email}
          anchorRect={activeDocsClient.anchorRect}
          onClose={() => setActiveDocsClient(null)}
        />
      )}
    </div>
  );
};

// ── Contextual Anchored Client Documents Popover ──
interface DocsPopoverProps {
  isOpen: boolean;
  clientId: string;
  clientName: string;
  clientEmail: string;
  anchorRect?: DOMRect;
  onClose: () => void;
}

const ClientDocumentsPopover: React.FC<DocsPopoverProps> = ({
  isOpen,
  clientId,
  clientName,
  clientEmail,
  anchorRect,
  onClose,
}) => {
  const [docName, setDocName] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [externalUrl, setExternalUrl] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'link'>('upload');
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const { toast } = useToast();

  const { data: docsData, isLoading, refetch } = useQuery({
    queryKey: ['client-documents', clientId],
    queryFn: () => clientsApi.getClientDocuments(clientId),
    enabled: Boolean(clientId),
  });

  const documents = docsData?.data || [];

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Upload Files Mutation
  const uploadFilesMutation = useMutation({
    mutationFn: async () => {
      if (selectedFiles.length === 0) {
        throw new Error('Please select at least one file to upload');
      }
      return clientsApi.uploadClientFiles(clientId, selectedFiles, docName.trim() || undefined);
    },
    onSuccess: () => {
      const count = selectedFiles.length;
      setSelectedFiles([]);
      setDocName('');
      setErrorMessage('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
      toast.success(`Uploaded ${count} document(s) successfully.`);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to upload files';
      setErrorMessage(msg);
      toast.error(msg);
    },
  });

  // Add Link Mutation
  const addLinkMutation = useMutation({
    mutationFn: async () => {
      if (!externalUrl.trim()) {
        throw new Error('Document URL is required');
      }
      return clientsApi.addClientDocumentUrl(clientId, {
        name: docName.trim() || 'External Document',
        fileName: externalUrl.split('/').pop() || 'document_link',
        fileUrl: externalUrl.trim(),
        fileType: 'text/html',
        fileSize: 0,
      });
    },
    onSuccess: () => {
      setExternalUrl('');
      setDocName('');
      setErrorMessage('');
      refetch();
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
      toast.success('Document link attached.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Failed to add link';
      setErrorMessage(msg);
      toast.error(msg);
    },
  });

  // Delete Document Mutation
  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => clientsApi.deleteClientDocument(clientId, docId),
    onSuccess: () => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ['clients-list'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-clients-list'] });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || err?.message || 'Failed to delete document');
    }
  });

  const handleDeleteDoc = async (doc: ClientDocument) => {
    const ok = await confirm({
      title: 'Delete Document',
      message: `Are you sure you want to delete "${doc.name}"? This file will be permanently removed.`,
      confirmLabel: 'Delete Document',
      variant: 'danger',
    });
    if (ok) {
      deleteDocMutation.mutate(doc.id, {
        onSuccess: () => {
          toast.success(`Document "${doc.name}" was removed.`);
        }
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  if (!isOpen) return null;

  // Calculate dynamic floating position based on anchor button viewport position
  const popoverWidth = 460;
  const popoverHeight = 520;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let computedStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 9999,
    width: `${popoverWidth}px`,
  };

  if (anchorRect) {
    // Horizontal: Align right edge to button, but stay within viewport
    let left = anchorRect.right - popoverWidth;
    if (left < 16) left = 16;
    if (left + popoverWidth > vw - 16) left = vw - popoverWidth - 16;

    // Vertical: If space below, put below. If near bottom of viewport, put above or align to bottom
    const spaceBelow = vh - anchorRect.bottom;
    const spaceAbove = anchorRect.top;

    if (spaceBelow >= popoverHeight + 16 || spaceBelow >= spaceAbove) {
      // Position below the clicked button
      computedStyle.top = `${Math.min(anchorRect.bottom + 8, vh - popoverHeight - 16)}px`;
      computedStyle.left = `${left}px`;
    } else {
      // Position above the clicked button
      computedStyle.top = `${Math.max(16, anchorRect.top - popoverHeight - 8)}px`;
      computedStyle.left = `${left}px`;
    }
  } else {
    // Fallback: Centered in viewport
    computedStyle.top = '50%';
    computedStyle.left = '50%';
    computedStyle.transform = 'translate(-50%, -50%)';
  }

  return createPortal(
    <>
      {/* Invisible backdrop for dismissing */}
      <div
        className="fixed inset-0 z-[9998] bg-black/25 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Floating Popover Card anchored right at the clicked button */}
      <div
        style={computedStyle}
        className="bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
      >
        {/* Popover Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/90 dark:bg-zinc-900/90 shrink-0">
          <div className="flex items-center space-x-2.5 truncate">
            <span className="p-2 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20 shrink-0">
              <Paperclip className="w-4 h-4" />
            </span>
            <div className="truncate">
              <div className="flex items-center space-x-2">
                <h3 className="text-xs font-bold text-slate-900 dark:text-white">Documents & Files</h3>
                <span className="px-2 py-0.2 rounded-full text-[10px] font-black bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60">
                  {documents.length}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground font-light flex items-center gap-1 truncate">
                <span className="font-semibold text-slate-800 dark:text-zinc-200 truncate">{clientName}</span>
                <span>•</span>
                <span className="truncate">{clientEmail}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 hover:text-slate-900 dark:text-zinc-400 dark:hover:text-white transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Popover Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Upload / Add Document Section */}
          <div className="p-3.5 rounded-xl bg-slate-50/90 dark:bg-zinc-900/60 border border-slate-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5 text-purple-500" />
                <span>Attach New Document</span>
              </span>

              {/* Mode Switcher */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-200/80 dark:bg-zinc-800 text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab('upload')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    activeTab === 'upload'
                      ? 'bg-white dark:bg-zinc-950 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  Upload Files
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('link')}
                  className={`px-2 py-0.5 rounded-md transition cursor-pointer ${
                    activeTab === 'link'
                      ? 'bg-white dark:bg-zinc-950 text-purple-600 dark:text-purple-400 shadow-sm'
                      : 'text-slate-500 dark:text-zinc-400 hover:text-foreground'
                  }`}
                >
                  URL Link
                </button>
              </div>
            </div>

            {/* Document Title / Tag */}
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-slate-700 dark:text-zinc-300">
                Document Label / Tag (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. SLA, Agreement, GST Certificate, KYC"
                value={docName}
                onChange={(e) => setDocName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-purple-500 font-medium"
              />
            </div>

            {/* Mode 1: Multi-file Dropzone */}
            {activeTab === 'upload' ? (
              <div className="space-y-2">
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-purple-300 dark:border-purple-800/60 hover:border-purple-500 dark:hover:border-purple-600 bg-purple-50/40 dark:bg-purple-950/20 rounded-xl p-3.5 text-center cursor-pointer transition group"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center space-y-1">
                    <div className="p-2 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-600 dark:text-purple-300 group-hover:scale-105 transition">
                      <Paperclip className="w-4 h-4" />
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-zinc-200">
                      Click to choose files or drop here
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      PDF, Word, Excel, Images, CSV, ZIP (up to 25MB)
                    </p>
                  </div>
                </div>

                {/* Selected Files Preview */}
                {selectedFiles.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 dark:text-zinc-400">
                      <span>{selectedFiles.length} file(s) selected:</span>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles([])}
                        className="text-rose-500 hover:underline cursor-pointer"
                      >
                        Clear All
                      </button>
                    </div>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {selectedFiles.map((file, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs"
                        >
                          <div className="flex items-center space-x-1.5 truncate max-w-[80%]">
                            {getDocumentIcon(file.type, file.name)}
                            <span className="font-medium text-slate-800 dark:text-zinc-200 truncate">{file.name}</span>
                            <span className="text-[10px] text-slate-400 shrink-0">({formatFileSize(file.size)})</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedFiles(selectedFiles.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-500 p-0.5 cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={() => uploadFilesMutation.mutate()}
                        disabled={uploadFilesMutation.isPending}
                        className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                      >
                        {uploadFilesMutation.isPending ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Upload className="w-3.5 h-3.5" />
                        )}
                        <span>Upload {selectedFiles.length} File(s)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Mode 2: External URL Link */
              <div className="space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-slate-700 dark:text-zinc-300">
                    Document URL *
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://drive.google.com/... or https://..."
                    value={externalUrl}
                    onChange={(e) => setExternalUrl(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-purple-500 font-medium"
                  />
                </div>
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => addLinkMutation.mutate()}
                    disabled={addLinkMutation.isPending || !externalUrl.trim()}
                    className="px-3.5 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition flex items-center space-x-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    {addLinkMutation.isPending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Plus className="w-3.5 h-3.5" />
                    )}
                    <span>Attach Link</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Attached Documents List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                Attached Documents ({documents.length})
              </h4>
            </div>

            {isLoading ? (
              <div className="space-y-2">
                {[1, 2].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-zinc-900 animate-pulse" />
                ))}
              </div>
            ) : documents.length === 0 ? (
              <div className="text-center py-5 border border-dashed border-slate-200 dark:border-zinc-800 rounded-xl space-y-1">
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

        {/* Popover Footer */}
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
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-slate-950/50 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Container */}
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 overflow-y-auto">
        <div className="relative w-full max-w-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto animate-scale-in">
          {/* Modal Header */}
          <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-zinc-800 bg-slate-50/80 dark:bg-zinc-900/80">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20">
                {isEdit ? <Edit2 className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              </span>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                  {isEdit ? 'Edit Onboarding Client' : 'Create Onboarding Client'}
                </h3>
                <p className="text-[11px] text-muted-foreground font-light">
                  {isEdit ? 'Update details for client in onboarding pipeline.' : 'Manually register a new client for setup & onboarding.'}
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

          {/* Modal Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto bg-white dark:bg-zinc-950">
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/50 text-xs text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Business / Client Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200 flex items-center justify-between">
                <span>Client / Company Name *</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Apex Global Solutions"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
              />
            </div>

            {/* Contact Person & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Contact Person</label>
                <input
                  type="text"
                  placeholder="e.g. John Doe"
                  value={contactPerson}
                  onChange={(e) => setContactPerson(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Contact Email</label>
                <input
                  type="email"
                  placeholder="e.g. contact@apex.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
            </div>

            {/* Phone & Country */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Phone Number</label>
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
                  placeholder="e.g. IN, US, AE, AU"
                  value={country}
                  onChange={(e) => setCountry(e.target.value.toUpperCase())}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 font-medium uppercase"
                />
              </div>
            </div>

            {/* Stage & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Onboarding Stage</label>
                <select
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Priority / Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-semibold text-slate-800 dark:text-zinc-200 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {STATUSES.map((st) => (
                    <option key={st.key} value={st.key}>{st.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Target Go-Live Date & Assigned Lead */}
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

            {/* Notes & Requirements */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-800 dark:text-zinc-200">Requirements & Notes</label>
              <textarea
                rows={3}
                placeholder="Add key requirements, integration scope, or onboarding notes..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full p-3 rounded-xl bg-slate-50 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs text-slate-900 dark:text-zinc-100 focus:outline-none focus:border-blue-500 resize-none font-medium"
              />
            </div>

            {/* Footer Actions */}
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
                <span>{isEdit ? 'Update Client' : 'Create Client'}</span>
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
