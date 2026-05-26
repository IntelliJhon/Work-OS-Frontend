import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useCollaborationStore } from '../../store/collaborationStore';
import type { ActivityEvent } from '../../store/collaborationStore';
import { useAuthStore } from '../../store/authStore';
import { 
  Activity, Filter, AlertTriangle, Info, ShieldAlert, Clock,
  Search, RefreshCw, Layers, CheckCircle2
} from 'lucide-react';

export const ActivityFeed: React.FC = () => {
  const { id: projectId } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const { activities, loadActivities, addActivity } = useCollaborationStore();

  // Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedActor, setSelectedActor] = useState<string>('all');
  
  // Pagination & Scroll State
  const [visibleCount, setVisibleCount] = useState(15);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load activities on mount
  useEffect(() => {
    if (projectId && user?.tenantId) {
      loadActivities(user.tenantId, projectId);
      
      // Auto-populate baseline events if this project has an empty timeline cache
      const list = activities[projectId] || [];
      if (list.length === 0) {
        const adminName = 'Admin Acme';
        const pmName = 'Product Manager';
        
        const baselines: Omit<ActivityEvent, 'id' | 'createdAt'>[] = [
          {
            projectId,
            type: 'project_created',
            title: 'Project Workspace Initialized',
            message: 'Acme Corporation initialized workflow governance models.',
            severity: 'high',
            actor: adminName
          },
          {
            projectId,
            type: 'phase_activated',
            title: 'Phase 1: Ingestion Activated',
            message: 'Quality standards verified and gate unlocked.',
            severity: 'medium',
            actor: pmName
          },
          {
            projectId,
            type: 'sprint_started',
            title: 'Sprint 1: Kickoff Started',
            message: 'Active governance parameters enabled.',
            severity: 'low',
            actor: pmName
          }
        ];

        // Seed with delays to simulate chronological order
        baselines.forEach((event, i) => {
          setTimeout(() => {
            addActivity(user.tenantId, projectId, event);
          }, i * 200);
        });
      }
    }
  }, [projectId, user, loadActivities]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      if (projectId && user?.tenantId) {
        loadActivities(user.tenantId, projectId);
      }
      setIsRefreshing(false);
    }, 600);
  };

  const projectActivities = (projectId && activities[projectId]) || [];

  // Gather unique actors and event types for dropdown filters
  const uniqueActors = Array.from(new Set(projectActivities.map(a => a.actor)));
  const uniqueTypes = Array.from(new Set(projectActivities.map(a => a.type)));

  // Filter activities
  const filteredActivities = projectActivities.filter((act) => {
    const matchesSearch = 
      act.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
      act.actor.toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesSeverity = selectedSeverity === 'all' || act.severity === selectedSeverity;
    const matchesType = selectedType === 'all' || act.type === selectedType;
    const matchesActor = selectedActor === 'all' || act.actor === selectedActor;

    return matchesSearch && matchesSeverity && matchesType && matchesActor;
  });

  // Paginated/visible slice (Infinite Scroll Simulation)
  const paginatedActivities = filteredActivities.slice(0, visibleCount);

  // Group activities by date section
  const groupActivitiesByDate = (list: ActivityEvent[]) => {
    const groups: Record<string, ActivityEvent[]> = {};
    
    list.forEach(act => {
      const date = new Date(act.createdAt);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);

      let groupKey = 'Older';
      if (date.toDateString() === today.toDateString()) {
        groupKey = 'Today';
      } else if (date.toDateString() === yesterday.toDateString()) {
        groupKey = 'Yesterday';
      } else {
        groupKey = date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(act);
    });

    return groups;
  };

  const groupedActivities = groupActivitiesByDate(paginatedActivities);

  // Check if we can scroll to load more
  useEffect(() => {
    const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      
      // If user scrolls within 50px of bottom, render more items
      if (scrollHeight - scrollTop - clientHeight < 50) {
        if (visibleCount < filteredActivities.length) {
          setVisibleCount(prev => Math.min(prev + 10, filteredActivities.length));
        }
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', handleScroll);
    }
    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [visibleCount, filteredActivities.length]);

  // Color mappings
  const getSeverityStyle = (sev: string) => {
    switch (sev) {
      case 'high':
        return 'bg-red-500/10 border-red-500/25 text-red-400';
      case 'medium':
        return 'bg-amber-500/10 border-amber-500/25 text-amber-400';
      case 'low':
      default:
        return 'bg-blue-500/10 border-blue-500/25 text-blue-400';
    }
  };

  const getSeverityIcon = (sev: string) => {
    switch (sev) {
      case 'high':
        return <ShieldAlert className="w-3.5 h-3.5" />;
      case 'medium':
        return <AlertTriangle className="w-3.5 h-3.5" />;
      case 'low':
      default:
        return <Info className="w-3.5 h-3.5" />;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'gate_approved':
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case 'gate_rejected':
        return <XCircleIcon className="w-4 h-4 text-red-400" />;
      case 'sprint_started':
      case 'sprint_closed':
        return <Layers className="w-4 h-4 text-indigo-400" />;
      case 'comment_added':
        return <MessageSquareIcon className="w-4 h-4 text-pink-400" />;
      default:
        return <Activity className="w-4 h-4 text-blue-400 animate-pulse" />;
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      
      {/* Actionable Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 glass-panel p-4 rounded-3xl border border-border shadow-md shrink-0">
        
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-500 dark:text-zinc-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search operational ledger logs..."
            className="w-full bg-black/40 border border-border hover:border-zinc-700 focus:border-blue-500/50 focus:outline-none rounded-xl pl-10 pr-4 py-2 text-xs text-white"
          />
        </div>

        {/* Right: Select Filters list */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center space-x-1.5 text-slate-600 dark:text-zinc-400 pr-1.5 border-r border-slate-100 dark:border-white/5">
            <Filter className="w-3.5 h-3.5" />
            <span className="text-[10px] uppercase font-bold tracking-wider">Filters</span>
          </div>

          {/* Severity */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="bg-black/30 border border-border rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-700 dark:text-zinc-300 focus:outline-none hover:bg-black/50 transition"
          >
            <option value="all">All Severities</option>
            <option value="high">High Severity</option>
            <option value="medium">Medium Severity</option>
            <option value="low">Low Severity</option>
          </select>

          {/* Event Type */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="bg-black/30 border border-border rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-700 dark:text-zinc-300 focus:outline-none hover:bg-black/50 transition max-w-[130px]"
          >
            <option value="all">All Events</option>
            {uniqueTypes.map(t => (
              <option key={t} value={t}>{t.replace('_', ' ').toUpperCase()}</option>
            ))}
          </select>

          {/* Actor */}
          <select
            value={selectedActor}
            onChange={(e) => setSelectedActor(e.target.value)}
            className="bg-black/30 border border-border rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-slate-700 dark:text-zinc-300 focus:outline-none hover:bg-black/50 transition max-w-[130px]"
          >
            <option value="all">All Actors</option>
            {uniqueActors.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>

          {/* Reload button */}
          <button
            onClick={handleRefresh}
            className={`p-2 rounded-xl border border-zinc-800 hover:bg-slate-100/60 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-white transition flex items-center justify-center cursor-pointer`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
          </button>
        </div>

      </div>

      {/* Main Feed chronological tree */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto pr-1 space-y-8 max-h-[62vh]"
      >
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center space-y-3 glass-panel border border-dashed border-border rounded-3xl bg-white/1">
            <Clock className="w-10 h-10 text-zinc-655 animate-pulse" />
            <h3 className="text-sm font-extrabold text-zinc-450">No operational entries recorded</h3>
            <p className="text-xs text-slate-500 dark:text-zinc-500 max-w-xs leading-relaxed">
              No audit logs match your selected filter criteria. Clear filters or add comments to append entries.
            </p>
          </div>
        ) : (
          Object.entries(groupedActivities).map(([dateGroup, items]) => (
            <div key={dateGroup} className="space-y-4">
              
              {/* Date Header Badge */}
              <div className="flex items-center space-x-3.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 dark:text-zinc-500 px-3.5 py-1 rounded-full border border-slate-100 dark:border-white/5 bg-zinc-950/40">
                  {dateGroup}
                </span>
                <div className="flex-1 h-px bg-gradient-to-r from-zinc-800 to-transparent" />
              </div>

              {/* Items List */}
              <div className="relative border-l border-zinc-800 ml-4 pl-6 space-y-4">
                {items.map((act) => (
                  <div 
                    key={act.id} 
                    className="relative group p-4 rounded-2xl bg-zinc-900/30 hover:bg-white dark:bg-zinc-900/60 border border-slate-100 dark:border-white/5 transition duration-150 animate-scale-in"
                  >
                    
                    {/* Floating chronological node dot */}
                    <div className="absolute -left-[31px] top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-zinc-950 border-2 border-zinc-850 flex items-center justify-center group-hover:border-blue-500 transition">
                      <span className="w-1 h-1 rounded-full bg-zinc-700 group-hover:bg-blue-400" />
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start space-x-3.5">
                        {/* Event icon bubble */}
                        <div className="w-8 h-8 rounded-xl bg-zinc-950/80 border border-zinc-800 flex items-center justify-center shrink-0">
                          {getEventIcon(act.type)}
                        </div>

                        {/* Text description */}
                        <div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white leading-normal">{act.title}</p>
                          <p className="text-[11px] text-slate-600 dark:text-zinc-400 leading-relaxed mt-0.5">{act.message}</p>
                          
                          {/* Actor Badge */}
                          <div className="flex items-center space-x-1.5 mt-2">
                            <span className="w-4 h-4 rounded-full bg-zinc-950 border border-zinc-800 flex items-center justify-center text-[7px] text-slate-600 dark:text-zinc-400 font-extrabold">
                              {act.actor.substring(0, 2).toUpperCase()}
                            </span>
                            <span className="text-[9px] text-slate-500 dark:text-zinc-500 font-bold">{act.actor}</span>
                          </div>
                        </div>
                      </div>

                      {/* Severity & Time stamp */}
                      <div className="flex flex-col items-end space-y-2 shrink-0">
                        <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${getSeverityStyle(act.severity)} flex items-center space-x-1`}>
                          {getSeverityIcon(act.severity)}
                          <span>{act.severity}</span>
                        </span>
                        
                        <span className="text-[9px] text-slate-500 dark:text-zinc-500 font-medium">
                          {new Date(act.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                  </div>
                ))}
              </div>

            </div>
          ))
        )}
      </div>

    </div>
  );
};

// Internal mini icons to prevent export issues
const XCircleIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <circle cx="12" cy="12" r="10" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
  </svg>
);

const MessageSquareIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
  </svg>
);

export default ActivityFeed;
