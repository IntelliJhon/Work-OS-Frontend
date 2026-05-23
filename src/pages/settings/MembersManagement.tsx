import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSocket } from '../../services/socket/socket-context';
import { usersApi } from '../../services/api/users';
import type { User } from '../../services/api/users';
import { invitationsApi } from '../../services/api/invitations';
import type { PresenceEvent } from '../../services/socket/socket-events';
import type { Invitation } from '../../services/api/invitations';
import { rolesApi } from '../../services/api/roles';
import type { Role } from '../../services/api/roles';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { 
  Users, Mail, UserPlus, RefreshCw, Trash2, Shield, Search,
  ChevronLeft, ChevronRight, X, Clock, Check, AlertCircle, ShieldAlert
} from 'lucide-react';

export const MembersManagement: React.FC = () => {
  const { user: currentUser } = useAuthStore();
  const { can } = usePermissions();
  const { socket, isConnected } = useSocket();

  // State
  const [users, setUsers] = useState<User[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });
  const [roles, setRoles] = useState<Role[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const queryClient = useQueryClient();
  
  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);

  // Loading States
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Modals/Overlays
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRoleId, setInviteRoleId] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');

  // debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load roles
  useEffect(() => {
    rolesApi.list()
      .then(setRoles)
      .catch((err) => console.error('Failed to load roles list', err));
  }, []);

  const getApiErrorMessage = (error: unknown, fallback: string) => {
    const err = error as { response?: { data?: { error?: string } } } | null;
    return err?.response?.data?.error ?? fallback;
  };

  // Fetch users & invites
  const fetchUsers = React.useCallback(async () => {
    setLoadingUsers(true);
    try {
      const data = await usersApi.list({
        page,
        limit: 10,
        search: debouncedSearch,
        roleId: roleFilter,
      });
      if (data && data.users) {
        setUsers(data.users);
        setPagination(data.pagination);
      } else {
        setUsers(data || []);
      }
    } catch (err: unknown) {
      console.error('Failed to fetch members', err);
    } finally {
      setLoadingUsers(false);
    }
  }, [page, debouncedSearch, roleFilter]);

  const fetchUsersRef = useRef(fetchUsers);

  useEffect(() => {
    fetchUsersRef.current = fetchUsers;
  }, [fetchUsers]);

  useEffect(() => {
    const loadUsers = async () => {
      await fetchUsers();
    };
    void loadUsers();
  }, [fetchUsers]);

  const INVITATIONS_QUERY_KEY = ['invitations'] as const;
  const invitesQuery = useQuery<Invitation[]>({
    queryKey: INVITATIONS_QUERY_KEY,
    queryFn: invitationsApi.list,
    enabled: can(PERMISSIONS.WORKSPACE_MEMBERS_READ),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    retry: 1,
  });

  const invitations = invitesQuery.data ?? [];
  const isInviteLoading = invitesQuery.isLoading && !invitesQuery.data;

  // Presence Socket sync
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Send a message to announce presence or fetch online users if backend supports
    const handlePresence = ({ type, userId }: PresenceEvent) => {
      console.log('presence_event received:', type, userId);
      const uid = String(userId);
      setOnlineUsers((prev: Set<string>) => {
        const next = new Set(prev);
        if (type === 'USER_ONLINE') {
          next.add(uid);
        } else if (type === 'USER_OFFLINE') {
          next.delete(uid);
        }
        return next;
      });
    };

    const handleOnlineUsersList = (data: { userIds: Array<string | number> }) => {
      console.log('Received online_users_list event data:', data);
      setOnlineUsers(new Set((data.userIds || []).map(String)));
    };

    const handleMemberRefresh = () => {
      fetchUsersRef.current();
    };

    socket.on('presence_event', handlePresence);
    socket.on('online_users_list', handleOnlineUsersList);
    socket.on('member_updated', handleMemberRefresh);
    socket.on('member_deleted', handleMemberRefresh);
    socket.on('role_updated', handleMemberRefresh);
    socket.on('role_deleted', handleMemberRefresh);

    // Request the initial active online users list now that we are listening
    socket.emit('request_online_users');

    return () => {
      socket.off('presence_event', handlePresence);
      socket.off('online_users_list', handleOnlineUsersList);
      socket.off('member_updated', handleMemberRefresh);
      socket.off('member_deleted', handleMemberRefresh);
      socket.off('role_updated', handleMemberRefresh);
      socket.off('role_deleted', handleMemberRefresh);
    };
  }, [socket, isConnected]);

  // Keep current user marked online
  useEffect(() => {
    if (!currentUser) return;
    const timer = window.setTimeout(() => {
      setOnlineUsers((prev: Set<string>) => {
        const next = new Set(prev);
        next.add(currentUser.id);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [currentUser]);

  // Actions
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setGeneratedInviteUrl('');
    if (!inviteEmail || !inviteRoleId) {
      setErrorMsg('Please select a role and enter a valid email.');
      return;
    }

    setSubmittingInvite(true);
    try {
      const response = await invitationsApi.create({ email: inviteEmail, roleId: inviteRoleId });
      const token = (response as unknown as { token?: string }).token;
      if (token) {
        const inviteUrl = `${window.location.origin}/invite/accept/${token}`;
        setGeneratedInviteUrl(inviteUrl);
      } else {
        setSuccessMsg(`Invitation successfully sent to ${inviteEmail}.`);
        setTimeout(() => setShowInviteModal(false), 2000);
      }

      const newInvite = response as Invitation;
      if (newInvite?.id) {
        queryClient.setQueryData<Invitation[]>(INVITATIONS_QUERY_KEY, (old) => (old ? [newInvite, ...old] : [newInvite]));
      }

      setInviteEmail('');
      setInviteRoleId('');
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to send invitation'));
    } finally {
      setSubmittingInvite(false);
    }
  };

  const handleResendInvite = async (id: string, email: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updatedInvite = await invitationsApi.resend(id);
      setSuccessMsg(`Resent invitation to ${email}.`);
      queryClient.setQueryData<Invitation[]>(INVITATIONS_QUERY_KEY, (old) =>
        old ? old.map((invite) => (invite.id === updatedInvite.id ? updatedInvite : invite)) : old,
      );
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to resend invite'));
    }
  };

  const handleRevokeInvite = async (id: string, email: string) => {
    if (!window.confirm(`Are you sure you want to revoke the invitation for ${email}?`)) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const updatedInvite = await invitationsApi.revoke(id);
      setSuccessMsg(`Revoked invitation for ${email}.`);
      queryClient.setQueryData<Invitation[]>(INVITATIONS_QUERY_KEY, (old) =>
        old ? old.map((invite) => (invite.id === updatedInvite.id ? updatedInvite : invite)) : old,
      );
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to revoke invite'));
    }
  };

  const handleRoleChange = async (userId: string, newRoleId: string, userEmail: string) => {
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await usersApi.update(userId, { roleId: newRoleId });
      setSuccessMsg(`Updated role for ${userEmail}.`);
      void fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to update user role'));
    }
  };

  const handleRemoveMember = async (userId: string, userEmail: string) => {
    if (!window.confirm(`Are you sure you want to remove ${userEmail} from this workspace?`)) return;
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await usersApi.delete(userId);
      setSuccessMsg(`Successfully removed ${userEmail} from workspace.`);
      void fetchUsers();
    } catch (err: unknown) {
      setErrorMsg(getApiErrorMessage(err, 'Failed to remove user'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Messages */}
      {errorMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs animate-scale-in">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs animate-scale-in">
          <Check className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Workspace Members Panel */}
      <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 glow-primary relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <Users className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Workspace Members</h3>
              <p className="text-xs text-muted-foreground font-light mt-0.5">
                Users with access to this tenant workspace environment.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-50 max-w-xs w-full">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search name or email..."
                value={searchQuery}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/60 border border-border/80 rounded-xl pl-9 pr-4 py-2 text-xs font-light text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => { setRoleFilter(e.target.value); setPage(1); }}
              className="bg-zinc-900/60 border border-border/80 rounded-xl px-4 py-2 text-xs font-light text-white focus:outline-none focus:border-blue-500/50 transition-all"
            >
              <option value="">All Roles</option>
              {roles.map((r: Role) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            {/* Invite Button */}
            {can(PERMISSIONS.WORKSPACE_MEMBERS_INVITE) && (
              <button
                onClick={() => { setErrorMsg(''); setSuccessMsg(''); setShowInviteModal(true); }}
                className="flex items-center space-x-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg hover:shadow-blue-500/10 transition-all active:scale-95 shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Invite Member</span>
              </button>
            )}
          </div>
        </div>

        {/* Members Table */}
        <div className="overflow-x-auto border border-border/40 rounded-xl bg-zinc-900/20">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border/60 bg-white/2 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                <th className="px-6 py-4">User Details</th>
                <th className="px-6 py-4">Role Assigned</th>
                <th className="px-6 py-4">Status / Presence</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loadingUsers ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-light italic">
                    Loading workspace members...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground font-light italic">
                    No members match search criteria.
                  </td>
                </tr>
              ) : (
                users.map((member) => {
                  const isOnline = onlineUsers.has(member.id);
                  const isSelf = currentUser?.id === member.id;
                  
                  return (
                    <tr key={member.id} className="hover:bg-white/2 transition-colors">
                      <td className="px-6 py-4.5">
                        <div className="flex items-center space-x-3">
                          {/* Avatar Initials */}
                          <div className="w-9 h-9 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center font-bold text-indigo-400 relative">
                            {member.firstName?.[0]?.toUpperCase()}{member.lastName?.[0]?.toUpperCase()}
                            <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-background shadow-md ${isOnline ? 'bg-emerald-500' : 'bg-zinc-600'}`} />
                          </div>
                          <div>
                            <p className="font-semibold text-white flex items-center space-x-1.5">
                              <span>{member.firstName} {member.lastName}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-zinc-400 font-bold tracking-wider uppercase">
                                  You
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-muted-foreground font-light mt-0.5">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex items-center space-x-2">
                          <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                          {can(PERMISSIONS.WORKSPACE_MEMBERS_UPDATE) && !isSelf ? (
                            <select
                              value={member.roleId}
                                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => handleRoleChange(member.id, e.target.value, member.email)}
                                className="bg-transparent border-0 hover:bg-white/5 p-1 rounded font-medium text-white focus:outline-none focus:ring-1 focus:ring-blue-500/30 text-xs cursor-pointer"
                              >
                                {roles.map((r: Role) => (
                                <option key={r.id} value={r.id} className="bg-zinc-900">{r.name}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="font-medium text-white">{member.roleName || 'Member'}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex items-center space-x-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
                          <span className={`font-mono text-[10px] uppercase tracking-wider ${isOnline ? 'text-emerald-400' : 'text-zinc-500'}`}>
                            {isOnline ? 'online' : 'offline'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4.5 text-right">
                        {can(PERMISSIONS.WORKSPACE_MEMBERS) && !isSelf && (
                          <button
                            onClick={() => handleRemoveMember(member.id, member.email)}
                            className="p-2 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all active:scale-90"
                            title="Remove Member"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <span className="text-[11px] font-light text-muted-foreground">
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total members)
            </span>
            <div className="flex items-center space-x-1">
              <button
                disabled={page === 1}
                onClick={() => setPage(prev => Math.max(1, prev - 1))}
                className="p-1.5 rounded-lg border border-border bg-white/2 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={page === pagination.totalPages}
                onClick={() => setPage(prev => Math.min(pagination.totalPages, prev + 1))}
                className="p-1.5 rounded-lg border border-border bg-white/2 hover:bg-white/5 disabled:opacity-30 disabled:pointer-events-none text-white transition-all"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invitations Management Panel */}
      {can(PERMISSIONS.WORKSPACE_MEMBERS_READ) && (
        <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 glow-primary relative overflow-hidden">
          <div className="flex items-center space-x-3 mb-6">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center">
              <Mail className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Pending Team Invitations</h3>
              <p className="text-xs text-muted-foreground font-light mt-0.5">
                Outstanding invitations issued for external collaborators.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto border border-border/40 rounded-xl bg-zinc-900/20">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-border/60 bg-white/2 text-zinc-400 font-bold uppercase tracking-wider text-[10px]">
                  <th className="px-6 py-4">Invited Email</th>
                  <th className="px-6 py-4">Assigned Role</th>
                  <th className="px-6 py-4">Expiration / Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {isInviteLoading ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-muted-foreground font-light italic">
                      Loading pending invites...
                    </td>
                  </tr>
                ) : invitations.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-8 text-center text-zinc-500 font-light italic">
                      No pending invitations currently active.
                    </td>
                  </tr>
                ) : (
                  invitations.map((invite) => {
                    const isAccepted = invite.acceptedAt !== null;
                    const isRevoked = invite.revokedAt !== null;
                    const isExpired = new Date(invite.expiresAt) < new Date();
                    
                    let statusLabel = 'pending';
                    let statusColor = 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
                    if (isAccepted) {
                      statusLabel = 'accepted';
                      statusColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
                    } else if (isRevoked) {
                      statusLabel = 'revoked';
                      statusColor = 'bg-red-500/10 text-red-400 border-red-500/20';
                    } else if (isExpired) {
                      statusLabel = 'expired';
                      statusColor = 'bg-zinc-500/10 text-zinc-500 border-zinc-500/20';
                    }

                    return (
                      <tr key={invite.id} className="hover:bg-white/2 transition-colors">
                        <td className="px-6 py-4.5 font-medium text-white">{invite.email}</td>
                        <td className="px-6 py-4.5 font-medium text-white">{invite.roleName || 'Member'}</td>
                        <td className="px-6 py-4.5">
                          <div className="flex items-center space-x-3.5">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border capitalize ${statusColor}`}>
                              {statusLabel}
                            </span>
                            {!isAccepted && !isRevoked && (
                              <span className="text-[10px] text-zinc-500 flex items-center space-x-1">
                                <Clock className="w-3 h-3" />
                                <span>Expires {new Date(invite.expiresAt).toLocaleDateString()}</span>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4.5 text-right">
                          {!isAccepted && !isRevoked && (
                            <div className="flex items-center justify-end space-x-2">
                              {can(PERMISSIONS.WORKSPACE_MEMBERS_INVITE) && (
                                <button
                                  onClick={() => handleResendInvite(invite.id, invite.email)}
                                  className="p-2 text-zinc-500 hover:text-blue-400 rounded-lg hover:bg-blue-500/10 border border-transparent hover:border-blue-500/20 transition-all"
                                  title="Resend Invite Token"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {can(PERMISSIONS.WORKSPACE_MEMBERS) && (
                                <button
                                  onClick={() => handleRevokeInvite(invite.id, invite.email)}
                                  className="p-2 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all"
                                  title="Revoke Invite Token"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal Popover */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md animate-fade-in">
          <div className="w-full max-w-md glass-panel-heavy rounded-2xl p-6 shadow-2xl border border-border/80 bg-zinc-950 glow-primary relative animate-scale-in">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute top-4 right-4 p-1 rounded-lg text-zinc-500 hover:text-white hover:bg-white/5 transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <UserPlus className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Invite New Member</h3>
                <p className="text-xs text-muted-foreground font-light mt-0.5">
                  Send a secure tenant-scoped invitation token.
                </p>
              </div>
            </div>

            {generatedInviteUrl ? (
              <div className="space-y-4">
                <div className="flex items-center space-x-2.5 p-3 rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 text-xs font-light">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>Invitation created successfully! Copy the URL below to register the new member.</span>
                </div>
                
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider">
                    Invitation Registration URL
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={generatedInviteUrl}
                      className="w-full bg-zinc-900 border border-border/80 rounded-xl px-3 py-2.5 text-xs text-zinc-300 font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(generatedInviteUrl);
                        alert('Link copied to clipboard!');
                      }}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shrink-0 transition"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => { setShowInviteModal(false); setGeneratedInviteUrl(''); }}
                    className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-semibold transition"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Recipient Email
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                    <input
                      type="email"
                      required
                      placeholder="name@company.com"
                      value={inviteEmail}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteEmail(e.target.value)}
                      className="w-full bg-zinc-900/60 border border-border/80 rounded-xl pl-10 pr-4 py-2.5 text-xs font-light text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
                    Workspace Role Profile
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3.5 top-3 w-4 h-4 text-zinc-500" />
                    <select
                      required
                      value={inviteRoleId}
                        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setInviteRoleId(e.target.value)}
                        className="w-full bg-zinc-900/60 border border-border/80 rounded-xl pl-10 pr-4 py-2.5 text-xs font-light text-white focus:outline-none focus:border-blue-500/50 transition appearance-none cursor-pointer"
                      >
                        <option value="" className="bg-zinc-950">Select workspace permission group</option>
                        {roles.map((r: Role) => (
                        <option key={r.id} value={r.id} className="bg-zinc-950">
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5 p-3 rounded-lg border border-yellow-500/10 bg-yellow-500/5 text-yellow-400/90 text-[10px] leading-relaxed font-light">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>
                    The recipient will receive an onboarding token to set up their name and password securely. The link expires in 48 hours.
                  </span>
                </div>

                <div className="flex justify-end space-x-3 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-white text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingInvite}
                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-xs font-semibold shadow-lg hover:shadow-blue-500/10 transition"
                  >
                    {submittingInvite ? 'Sending...' : 'Send Onboarding Invite'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MembersManagement;
