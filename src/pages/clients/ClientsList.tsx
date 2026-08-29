import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { clientsApi, type ClientUser } from '../../services/api/clients.api';
import { useAuthStore } from '../../store/authStore';
import {
  Users,
  Search,
  CheckCircle2,
  XCircle,
  ShieldCheck,
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
  Plus
} from 'lucide-react';

export const ClientsList: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching
  } = useQuery({
    queryKey: ['clients-list'],
    queryFn: clientsApi.list,
    staleTime: 60000,
  });

  const LEADSNDEALS_TENANT_ID = 'aee1faf8-27d5-4f5d-9b14-9246abbd0eec';
  const isLeadsndeals =
    user?.tenantId === LEADSNDEALS_TENANT_ID ||
    user?.tenantId === 'leadsndeals' ||
    data?.slug === 'leadsndeals' ||
    data?.isOurCompany === true;

  const clients = data?.users || [];
  const companyName = data?.company || (isLeadsndeals ? 'Leadsndeals interactive technologies' : 'Current Company');

  // Mutation for saving comments
  const saveCommentMutation = useMutation({
    mutationFn: ({ clientId, comment }: { clientId: string; comment: string }) =>
      clientsApi.saveComment(clientId, comment),
    onSuccess: (res, variables) => {
      // Optimistically update query data cache
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
    },
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

  // Filter clients by search query (name, email, user ID, country, comment)
  const filteredClients = useMemo(() => {
    if (!searchQuery.trim()) return clients;
    const q = searchQuery.toLowerCase().trim();
    return clients.filter((client: ClientUser) => {
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
  }, [clients, searchQuery]);

  // Stat calculations
  const totalCount = clients.length;
  const activeCount = clients.filter(c => c.active).length;
  const verifiedCount = clients.filter(c => c.verified).length;
  const commentedCount = clients.filter(c => c.comment && c.comment.trim().length > 0).length;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="space-y-1">
          <h2 className="text-xl font-bold flex items-center space-x-2 text-slate-900 dark:text-white">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <span>Clients</span>
          </h2>
          <p className="text-xs text-muted-foreground font-light flex items-center gap-1.5">
            <span>Client accounts and updates associated with</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              {companyName}
            </span>
          </p>
        </div>

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center space-x-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/80 transition shadow-sm cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isFetching ? 'animate-spin' : ''}`} />
          <span>{isFetching ? 'Refreshing...' : 'Refresh List'}</span>
        </button>
      </div>

      {/* ── Summary Cards Grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-blue-500 bg-blue-500/10 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">TOTAL CLIENTS</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{totalCount}</h4>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-emerald-500 bg-emerald-500/10 shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">ACTIVE ACCOUNTS</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{activeCount}</h4>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-4 border border-slate-100 dark:border-white/5 flex items-center space-x-3.5">
          <div className="p-2.5 rounded-xl text-indigo-500 bg-indigo-500/10 shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-black tracking-wider text-slate-400">VERIFIED USERS</p>
            <h4 className="text-xl font-extrabold text-slate-900 dark:text-white mt-0.5">{verifiedCount}</h4>
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

      {/* ── Search Bar ── */}
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
          Showing {filteredClients.length} of {totalCount} clients
        </div>
      </div>

      {/* ── Main Data View / States ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-slate-100/60 dark:bg-white/5 animate-pulse border border-slate-100 dark:border-zinc-850" />
          ))}
        </div>
      ) : !isLeadsndeals && data?.isOurCompany === false ? (
        <div className="text-center py-20 border border-slate-200 dark:border-zinc-800 bg-slate-50/50 dark:bg-zinc-900/10 rounded-3xl space-y-3">
          <ShieldAlert className="w-12 h-12 mx-auto text-amber-500" />
          <h4 className="text-base font-bold text-slate-900 dark:text-zinc-100">Access Restricted</h4>
          <p className="text-xs text-muted-foreground font-light max-w-md mx-auto leading-relaxed">
            The Clients section is exclusively configured for <span className="font-semibold text-blue-600 dark:text-blue-400">Leadsndeals</span>. Your company (<span className="font-medium text-slate-800 dark:text-zinc-200">{companyName}</span>) does not have access to this section.
          </p>
        </div>
      ) : isError ? (
        <div className="text-center py-16 border border-rose-200 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/10 rounded-3xl space-y-3">
          <AlertTriangle className="w-10 h-10 mx-auto text-rose-500" />
          <h4 className="text-sm font-bold text-slate-900 dark:text-zinc-100">Failed to Load Clients</h4>
          <p className="text-xs text-muted-foreground font-light max-w-sm mx-auto">
            {(error as any)?.response?.data?.error || (error as any)?.message || 'An unexpected error occurred while communicating with the server.'}
          </p>
          <button
            onClick={() => refetch()}
            className="mt-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer inline-flex items-center space-x-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Try Again</span>
          </button>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-slate-250 dark:border-zinc-800 rounded-3xl space-y-2">
          <Users className="w-10 h-10 mx-auto text-slate-350 dark:text-zinc-650" />
          <h4 className="text-sm font-bold text-slate-800 dark:text-zinc-300">No Clients Found</h4>
          <p className="text-xs text-muted-foreground font-light max-w-xs mx-auto">
            {searchQuery ? 'No client records match your search criteria.' : 'There are currently no clients registered under this company.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-background/25">
          <table className="w-full text-left border-collapse min-w-[980px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-zinc-850 bg-slate-50/70 dark:bg-zinc-900/50">
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Client Name</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">Email</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider">User ID (External)</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center w-24">Status</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider text-center w-20">Country</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-28">Created Date</th>
                <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 dark:text-zinc-400 tracking-wider w-80">Comments / Important Updates</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 dark:divide-zinc-850">
              {filteredClients.map((client: ClientUser) => {
                const firstName = client.profile?.name?.first || '';
                const lastName = client.profile?.name?.last || '';
                const displayName = `${firstName} ${lastName}`.trim() || client.email.split('@')[0];
                const isActive = client.active !== false;
                const createdDate = client.created_at ? new Date(client.created_at).toLocaleDateString() : '-';
                const isEditing = editingClientId === client.id;
                const hasComment = Boolean(client.comment && client.comment.trim());

                return (
                  <tr
                    key={client.id}
                    className="hover:bg-slate-50/60 dark:hover:bg-zinc-900/20 transition-colors duration-150"
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
                        <span className="truncate max-w-[180px]">{client.email}</span>
                      </div>
                    </td>

                    {/* User ID */}
                    <td className="px-4 py-3.5 align-middle">
                      <div className="flex items-center space-x-1.5 font-mono text-[11px] text-slate-600 dark:text-zinc-400">
                        <Key className="w-3 h-3 text-slate-400 shrink-0" />
                        <span className="bg-slate-100 dark:bg-zinc-800/80 px-2 py-0.5 rounded border border-slate-200 dark:border-zinc-700/60 truncate max-w-[160px]" title={client.id}>
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
                              className="px-2 py-1 rounded-md text-[11px] font-semibold text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-800 transition"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleSaveComment(client.id)}
                              disabled={saveCommentMutation.isPending}
                              className="px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold inline-flex items-center space-x-1 shadow-sm transition disabled:opacity-50"
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
                            <div className="space-y-0.5 max-w-[280px]">
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
                            className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition shrink-0"
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
  );
};

export default ClientsList;
