import React, { useState, useEffect } from 'react';
import { securityApi } from '../../services/api/security';
import type { AuditLog } from '../../services/api/security';
import { usePermissions } from '../../features/auth/usePermissions';
import {
  Lock, Search, ChevronLeft, ChevronRight,
  Database, Info, Eye, EyeOff, Calendar, Server
} from 'lucide-react';

export const SecurityActivityCenter: React.FC = () => {
  const { can } = usePermissions();

  // State
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [page, setPage] = useState(1);

  // Expanded Logs state (for payload viewing)
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch Audit Logs
  const fetchLogs = async () => {
    if (!can('workspace.security.read' as any)) {
      setErrorMsg('You do not have permissions to read security activity logs.');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const response = await securityApi.getAuditLogs({
        page,
        limit: 15,
        search: debouncedSearch,
        action: actionFilter
      });
      setLogs(response.logs || []);
      setPagination(response.pagination);
    } catch (err: any) {
      console.error('Failed to fetch security logs', err);
      setErrorMsg(err.response?.data?.error || 'Failed to load security audit logs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [page, debouncedSearch, actionFilter]);

  const toggleExpandLog = (id: string) => {
    setExpandedLogId(prev => (prev === id ? null : id));
  };

  // Helper to format actions nicely with color badges
  const getActionBadge = (action: string) => {
    const act = action.toUpperCase();
    if (act.includes('CREATE')) {
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    }
    if (act.includes('UPDATE')) {
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    }
    if (act.includes('DELETE') || act.includes('REVOKE')) {
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    }
    return 'bg-zinc-500/10 text-zinc-400 border-white/5';
  };

  // Diff Builder component to render a premium visual output comparing old and new json objects
  const renderPayloadDiff = (oldVal: any, newVal: any) => {
    if (!oldVal && !newVal) return <span className="text-zinc-500 italic">No values modified.</span>;

    // Check if it's strings or numbers directly
    const isObject = (val: any) => val && typeof val === 'object' && !Array.isArray(val);

    if (!isObject(oldVal) && !isObject(newVal)) {
      return (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3">
            <span className="text-[10px] text-zinc-500 block uppercase font-bold tracking-wider mb-1">Before</span>
            <span className="text-red-400 break-all">{JSON.stringify(oldVal) || 'undefined'}</span>
          </div>
          <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3">
            <span className="text-[10px] text-zinc-500 block uppercase font-bold tracking-wider mb-1">After</span>
            <span className="text-emerald-400 break-all">{JSON.stringify(newVal) || 'undefined'}</span>
          </div>
        </div>
      );
    }

    const oldObj = oldVal || {};
    const newObj = newVal || {};
    const allKeys = Array.from(new Set([...Object.keys(oldObj), ...Object.keys(newObj)]));

    // Filter out common metadata fields if any to keep diff readable, but generally render all
    const changedFields = allKeys.filter(k => {
      const ov = JSON.stringify(oldObj[k]);
      const nv = JSON.stringify(newObj[k]);
      return ov !== nv;
    });

    if (changedFields.length === 0) {
      return <span className="text-zinc-500 italic text-[11px]">No fields modified in audit details.</span>;
    }

    return (
      <div className="border border-white/5 rounded-xl overflow-hidden bg-zinc-950/40 text-xs">
        <div className="grid grid-cols-3 gap-2 px-4 py-2 border-b border-white/5 bg-white/2 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
          <div>Field Key</div>
          <div>Before Mutation</div>
          <div>After Mutation</div>
        </div>
        <div className="divide-y divide-white/5 max-h-[300px] overflow-y-auto font-mono">
          {changedFields.map(key => {
            const beforeValue = oldObj[key];
            const afterValue = newObj[key];

            return (
              <div key={key} className="grid grid-cols-3 gap-2 px-4 py-3 items-start hover:bg-white/1 transition-all">
                <span className="text-zinc-300 font-semibold truncate" title={key}>{key}</span>
                <span className="text-red-400/90 break-all pr-2">
                  {beforeValue === undefined ? (
                    <span className="text-zinc-600 font-sans italic text-[10px]">undefined</span>
                  ) : beforeValue === null ? (
                    <span className="text-zinc-500 font-sans italic text-[10px]">null</span>
                  ) : typeof beforeValue === 'object' ? (
                    JSON.stringify(beforeValue)
                  ) : (
                    String(beforeValue)
                  )}
                </span>
                <span className="text-emerald-400/90 break-all pr-2">
                  {afterValue === undefined ? (
                    <span className="text-zinc-600 font-sans italic text-[10px]">undefined</span>
                  ) : afterValue === null ? (
                    <span className="text-zinc-500 font-sans italic text-[10px]">null</span>
                  ) : typeof afterValue === 'object' ? (
                    JSON.stringify(afterValue)
                  ) : (
                    String(afterValue)
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Error Notice */}
      {errorMsg && (
        <div className="flex items-center space-x-2.5 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 text-xs animate-scale-in">
          <Info className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Security Logs Shell Panel */}
      <div className="glass-panel rounded-2xl p-6 border border-border bg-card/40 glow-primary relative overflow-hidden">
        {/* Panel Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Security Activity Center</h3>
              <p className="text-xs text-muted-foreground font-light mt-0.5">
                Append-only tenant audit log auditing workspace setting mutations, RBAC tweaks, and user profile lifecycle events.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search Input */}
            <div className="relative min-w-[200px] max-w-xs w-full">
              <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-zinc-500" />
              <input
                type="text"
                placeholder="Search tables or user emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900/60 border border-border/80 rounded-xl pl-9 pr-4 py-2 text-xs font-light text-white placeholder-zinc-500 focus:outline-none focus:border-blue-500/50 transition-all"
              />
            </div>

            {/* Action filter */}
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
              className="bg-zinc-900/60 border border-border/80 rounded-xl px-4 py-2 text-xs font-light text-white focus:outline-none focus:border-blue-500/50 transition-all cursor-pointer"
            >
              <option value="">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="INVITE">INVITE</option>
              <option value="ACCEPT">ACCEPT</option>
            </select>
          </div>
        </div>

        {/* Audit Trail Timeline */}
        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-16 text-muted-foreground font-light italic">
              Retrieving tenant audit trail ledger...
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground border border-dashed border-border/60 rounded-xl bg-zinc-900/10 font-light italic">
              No audit logs captured matching query rules.
            </div>
          ) : (
            <div className="relative pl-6 border-l border-zinc-800 space-y-5">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const hasPayload = log.oldValue || log.newValue;
                const initials = ((log.userFirstName?.[0] || '') + (log.userLastName?.[0] || '')).toUpperCase() || 'SYS';
                
                return (
                  <div key={log.id} className="relative group animate-scale-in">
                    {/* Timeline circle indicator */}
                    <div className="absolute -left-[31px] top-1.5 w-2.5 h-2.5 rounded-full border border-background bg-zinc-700 group-hover:bg-blue-500 transition-colors shadow-md shadow-black" />

                    {/* Timeline card panel */}
                    <div className="glass-panel border border-border/50 hover:border-blue-500/20 bg-zinc-900/15 rounded-xl p-4 transition-all">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        {/* Event Details */}
                        <div className="flex items-start space-x-3">
                          {/* User Avatar */}
                          <div className="w-8.5 h-8.5 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center font-bold text-xs text-zinc-300 shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold text-white text-xs">
                                {log.userFirstName ? `${log.userFirstName} ${log.userLastName}` : 'System Engine'}
                              </span>
                              <span className="text-[10px] text-zinc-500 font-light">
                                ({log.userEmail || 'system@workos.internal'})
                              </span>
                              <span className={`px-2 py-0.5 rounded text-[8px] font-extrabold uppercase border tracking-widest font-mono ${getActionBadge(log.action)}`}>
                                {log.action}
                              </span>
                            </div>

                            {/* Table & Resource details */}
                            <div className="flex items-center space-x-4 mt-1.5 text-[11px] text-zinc-400 font-light">
                              <span className="flex items-center space-x-1 font-semibold text-zinc-300">
                                <Database className="w-3.5 h-3.5 text-zinc-500" />
                                <span className="font-mono text-[10px] text-indigo-400">{log.tableName}</span>
                              </span>
                              <span className="text-zinc-600">|</span>
                              <span className="font-mono text-[9px] text-zinc-500 truncate max-w-[150px]" title={`Record ID: ${log.recordId}`}>
                                ID: {log.recordId}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Metadata Details (IP, Time) */}
                        <div className="flex flex-row sm:flex-col sm:items-end justify-between sm:justify-start gap-2 shrink-0 border-t sm:border-t-0 border-white/5 pt-2 sm:pt-0">
                          <span className="text-[10px] text-zinc-500 flex items-center space-x-1">
                            <Calendar className="w-3.5 h-3.5 text-zinc-600" />
                            <span>{new Date(log.createdAt).toLocaleString()}</span>
                          </span>
                          <span className="text-[9px] text-zinc-600 font-mono flex items-center space-x-1">
                            <Server className="w-3 h-3 text-zinc-700" />
                            <span>IP: {log.ipAddress || 'unknown'}</span>
                          </span>
                        </div>
                      </div>

                      {/* Expand payload toggle */}
                      {hasPayload && (
                        <div className="mt-3.5 pt-3.5 border-t border-white/5 flex flex-col space-y-3">
                          <button
                            onClick={() => toggleExpandLog(log.id)}
                            className="flex items-center space-x-1.5 self-start text-[10px] text-blue-400 hover:text-blue-300 font-bold uppercase tracking-wider transition-colors"
                          >
                            {isExpanded ? (
                              <>
                                <EyeOff className="w-3.5 h-3.5" />
                                <span>Hide Mutation details</span>
                              </>
                            ) : (
                              <>
                                <Eye className="w-3.5 h-3.5" />
                                <span>Inspect Payload Diff</span>
                              </>
                            )}
                          </button>

                          {isExpanded && (
                            <div className="w-full pt-1.5 animate-scale-in">
                              {renderPayloadDiff(log.oldValue, log.newValue)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination bar */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <span className="text-[11px] font-light text-muted-foreground">
              Showing page {pagination.page} of {pagination.totalPages} ({pagination.total} total events)
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
    </div>
  );
};

export default SecurityActivityCenter;
