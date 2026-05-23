import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  AlertOctagon, 
  CheckCircle2, 
  Users, 
  Activity,
  Zap
} from 'lucide-react';
import type { Task } from '../../services/api/tasks.api';
import type { User } from '../../services/api/users';

interface TaskAnalyticsProps {
  tasks: Task[];
  assignees: User[];
}

export const TaskAnalytics: React.FC<TaskAnalyticsProps> = ({ tasks, assignees }) => {
  
  // 1. Calculations: Total Statistics & Health Scores
  const stats = useMemo(() => {
    const total = tasks.length;
    if (total === 0) {
      return {
        total: 0,
        doneCount: 0,
        blockedCount: 0,
        highPriorityCount: 0,
        assignedCount: 0,
        completionRate: 0,
        blockedRate: 0,
        burdenRate: 0,
        assignmentRate: 0,
        totalPoints: 0,
        donePoints: 0,
      };
    }

    const doneCount = tasks.filter(t => t.status === 'done').length;
    const blockedCount = tasks.filter(t => t.status === 'blocked').length;
    const highPriorityCount = tasks.filter(t => t.customFields?.priority === 'high' || t.customFields?.priority === 'critical').length;
    const assignedCount = tasks.filter(t => !!t.assigneeId).length;

    const totalPoints = tasks.reduce((sum, t) => sum + (t.customFields?.storyPoints || 0), 0);
    const donePoints = tasks.filter(t => t.status === 'done').reduce((sum, t) => sum + (t.customFields?.storyPoints || 0), 0);

    const completionRate = Math.round((doneCount / total) * 100);
    const blockedRate = Math.round((blockedCount / total) * 100);
    const burdenRate = Math.round((highPriorityCount / total) * 100);
    const assignmentRate = Math.round((assignedCount / total) * 100);

    return {
      total,
      doneCount,
      blockedCount,
      highPriorityCount,
      assignedCount,
      completionRate,
      blockedRate,
      burdenRate,
      assignmentRate,
      totalPoints,
      donePoints,
    };
  }, [tasks]);

  // 2. Calculations: Status Proportions (Doughnut Chart)
  const statusDistribution = useMemo(() => {
    const total = tasks.length;
    const groups = {
      to_do: 0,
      in_progress: 0,
      in_review: 0,
      done: 0,
      blocked: 0
    };

    tasks.forEach(t => {
      const status = t.status || 'to_do';
      if (status in groups) {
        groups[status as keyof typeof groups]++;
      } else {
        groups.to_do++;
      }
    });

    if (total === 0) return [];

    const details = [
      { id: 'done', label: 'Done', count: groups.done, color: '#10b981', glow: 'rgba(16, 185, 129, 0.4)' },
      { id: 'in_progress', label: 'In Progress', count: groups.in_progress, color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.4)' },
      { id: 'in_review', label: 'In Review', count: groups.in_review, color: '#a855f7', glow: 'rgba(168, 85, 247, 0.4)' },
      { id: 'blocked', label: 'Blocked', count: groups.blocked, color: '#ef4444', glow: 'rgba(239, 68, 68, 0.4)' },
      { id: 'to_do', label: 'To Do', count: groups.to_do, color: '#71717a', glow: 'rgba(113, 113, 122, 0.4)' },
    ];

    return details.map(item => ({
      ...item,
      percentage: Math.round((item.count / total) * 100),
    }));
  }, [tasks]);

  // Doughnut Chart dynamic stroke offsets
  const doughnutSegments = useMemo(() => {
    let accumulatedPercent = 0;
    const r = 50;
    const circ = 2 * Math.PI * r; // ~314.16

    return statusDistribution.map(segment => {
      const percent = segment.percentage;
      const strokeLength = (percent / 100) * circ;
      
      accumulatedPercent += percent;

      return {
        ...segment,
        strokeDashArray: `${strokeLength} ${circ - strokeLength}`,
        strokeDashOffset: -((accumulatedPercent - percent) / 100) * circ,
      };
    });
  }, [statusDistribution]);

  // 3. Calculations: Priority Split (Stacked Bars)
  const priorityDistribution = useMemo(() => {
    const total = tasks.length;
    const counts = { low: 0, medium: 0, high: 0, critical: 0 };
    
    tasks.forEach(t => {
      const priority = t.customFields?.priority || 'medium';
      if (priority in counts) {
        counts[priority as keyof typeof counts]++;
      } else {
        counts.medium++;
      }
    });

    const maxCount = Math.max(...Object.values(counts), 1);

    return [
      { key: 'critical', label: 'Critical', count: counts.critical, color: 'bg-red-500/80 border-red-500 text-red-400', barColor: 'from-red-500 to-red-600' },
      { key: 'high', label: 'High', count: counts.high, color: 'bg-amber-500/80 border-amber-500 text-amber-400', barColor: 'from-amber-500 to-amber-600' },
      { key: 'medium', label: 'Medium', count: counts.medium, color: 'bg-blue-500/80 border-blue-500 text-blue-400', barColor: 'from-blue-500 to-blue-600' },
      { key: 'low', label: 'Low', count: counts.low, color: 'bg-zinc-500/80 border-zinc-500 text-zinc-400', barColor: 'from-zinc-500 to-zinc-600' },
    ].map(p => ({
      ...p,
      percentage: total > 0 ? Math.round((p.count / total) * 100) : 0,
      scaleY: p.count / maxCount,
    }));
  }, [tasks]);

  // 4. Calculations: Workload Balance per Team Member
  const workloadDistribution = useMemo(() => {
    const userWorkload: Record<string, { id: string; name: string; email: string; initials: string; taskCount: number; points: number }> = {};
    
    // Seed assignees to show empty state members too
    assignees.forEach(u => {
      userWorkload[u.id] = {
        id: u.id,
        name: `${u.firstName} ${u.lastName}`,
        email: u.email,
        initials: `${u.firstName[0] || ''}${u.lastName[0] || ''}`.toUpperCase(),
        taskCount: 0,
        points: 0,
      };
    });

    // Populate task allocations
    tasks.forEach(t => {
      if (t.assigneeId && t.assigneeId in userWorkload) {
        userWorkload[t.assigneeId].taskCount++;
        userWorkload[t.assigneeId].points += t.customFields?.storyPoints || 0;
      }
    });

    const activeList = Object.values(userWorkload)
      .sort((a, b) => b.points - a.points || b.taskCount - a.taskCount);

    const maxPoints = Math.max(...activeList.map(u => u.points), 1);

    return activeList.map(u => ({
      ...u,
      ratio: u.points / maxPoints,
    }));
  }, [tasks, assignees]);

  // Helper avatar coloring
  const getAvatarBg = (email: string) => {
    let sum = 0;
    for (let i = 0; i < email.length; i++) sum += email.charCodeAt(i);
    const colors = [
      'bg-red-500/20 border-red-500/40 text-red-300',
      'bg-blue-500/20 border-blue-500/40 text-blue-300',
      'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
      'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
      'bg-amber-500/20 border-amber-500/40 text-amber-300',
      'bg-purple-500/20 border-purple-500/40 text-purple-300',
    ];
    return colors[sum % colors.length];
  };

  return (
    <div className="space-y-6">
      
      {/* 1. Operational Health Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Completion Widget */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-emerald-500/30 transition-all duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Operational Velocity</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.donePoints}</span>
              <span className="text-xs text-muted-foreground font-bold">/ {stats.totalPoints} SP Done</span>
            </div>
            <div className="flex items-center space-x-1.5 pt-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{stats.completionRate}% Completion Rate</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 z-10">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="absolute top-0 right-0 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-emerald-500/15 transition-colors" />
        </div>

        {/* Blocking Rate Widget */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-red-500/30 transition-all duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Workplace Friction</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.blockedCount}</span>
              <span className="text-xs text-muted-foreground font-bold">Blocked Items</span>
            </div>
            <div className="flex items-center space-x-1.5 pt-1.5">
              <AlertOctagon className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
              <span className="text-[10px] text-red-600 dark:text-red-400 font-bold">{stats.blockedRate}% Blockage Ratio</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 z-10">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div className="absolute top-0 right-0 w-28 h-28 bg-red-500/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-red-500/15 transition-colors" />
        </div>

        {/* Burden Widget */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-amber-500/30 transition-all duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Critical Burden</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.highPriorityCount}</span>
              <span className="text-xs text-muted-foreground font-bold">High/Critical Tasks</span>
            </div>
            <div className="flex items-center space-x-1.5 pt-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
              <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">{stats.burdenRate}% Burden Ratio</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 z-10">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div className="absolute top-0 right-0 w-28 h-28 bg-amber-500/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-amber-500/15 transition-colors" />
        </div>

        {/* Assignment Widget */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex items-center justify-between relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
          <div className="space-y-1 z-10">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Allocation Rate</span>
            <div className="flex items-baseline space-x-1.5">
              <span className="text-2xl font-black text-foreground">{stats.assignedCount}</span>
              <span className="text-xs text-muted-foreground font-bold">/ {stats.total} Tasks Assigned</span>
            </div>
            <div className="flex items-center space-x-1.5 pt-1.5">
              <Users className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold">{stats.assignmentRate}% Team Allocation</span>
            </div>
          </div>
          <div className="p-3.5 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 z-10">
            <Users className="w-5 h-5" />
          </div>
          <div className="absolute top-0 right-0 w-28 h-28 bg-blue-500/10 rounded-full blur-2xl -mr-10 -mt-10 group-hover:bg-blue-500/15 transition-colors" />
        </div>
      </div>

      {/* 2. Visual Charts Container Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* doughnut Chart: Task Status Stage Distribution */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex flex-col space-y-4 lg:col-span-1">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <PieChart className="w-4 h-4 text-purple-500 dark:text-purple-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Status Breakdown</h3>
            </div>
            <span className="text-[9px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded">Stages Ratio</span>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center py-6 space-y-6">
            {tasks.length === 0 ? (
              <span className="text-xs text-muted-foreground font-light">No task data available</span>
            ) : (
              <>
                {/* SVG Doughnut */}
                <div className="relative w-40 h-40">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                    <circle 
                      cx="60" 
                      cy="60" 
                      r="50" 
                      fill="transparent" 
                      stroke="currentColor" 
                      className="text-muted/30"
                      strokeWidth="10" 
                    />
                    {doughnutSegments.map((segment) => (
                      <motion.circle 
                        key={segment.id}
                        cx="60" 
                        cy="60" 
                        r="50" 
                        fill="transparent" 
                        stroke={segment.color} 
                        strokeWidth="10"
                        strokeDasharray={segment.strokeDashArray}
                        strokeDashoffset={segment.strokeDashOffset}
                        strokeLinecap="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    ))}
                  </svg>
                  {/* Inner text overlay */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black text-foreground">{stats.total}</span>
                    <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-widest">Total Tasks</span>
                  </div>
                </div>

                {/* legend list */}
                <div className="w-full grid grid-cols-2 gap-2 text-[10px]">
                  {statusDistribution.map((seg) => (
                    <div key={seg.id} className="flex items-center justify-between p-1.5 rounded-lg bg-muted/30 border border-border">
                      <div className="flex items-center space-x-1.5 truncate">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-muted-foreground truncate">{seg.label}</span>
                      </div>
                      <span className="text-foreground font-bold">{seg.percentage}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Workload Balance List */}
        <div className="glass-panel border border-border rounded-2xl p-5 flex flex-col space-y-4 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Workload Balance (By Story Points)</h3>
            </div>
            <span className="text-[9px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded">Team Bandwidth</span>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[300px] space-y-3.5 pr-1 custom-scrollbar">
            {workloadDistribution.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-muted-foreground font-light py-12">
                No active team assignees.
              </div>
            ) : (
              workloadDistribution.map((user) => (
                <div key={user.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-medium">
                    <div className="flex items-center space-x-2.5">
                      <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-[9px] font-bold ${getAvatarBg(user.email)}`}>
                        {user.initials}
                      </div>
                      <span className="text-foreground font-semibold">{user.name}</span>
                      <span className="text-[10px] text-muted-foreground">({user.taskCount} tasks)</span>
                    </div>
                    <span className="text-blue-600 dark:text-blue-400 font-bold text-[11px]">{user.points} SP</span>
                  </div>
                  
                  {/* Glowing progress line */}
                  <div className="w-full h-2 rounded-full bg-muted border border-border overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full shadow-[0_0_10px_rgba(59,130,246,0.3)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${user.ratio * 100}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>

      {/* 3. Priority Density Plot Grid */}
      <div className="glass-panel border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Priority Distribution Density</h3>
          </div>
          <span className="text-[9px] text-muted-foreground font-bold bg-muted px-2 py-0.5 rounded">Risk Factor Allocation</span>
        </div>

        <div className="h-44 flex items-end justify-around pt-6 px-4">
          {priorityDistribution.map((item) => (
            <div key={item.key} className="flex flex-col items-center space-y-3 w-16 group">
              {/* Stacked count label */}
              <span className="text-[10px] font-black text-foreground bg-muted px-2 py-0.5 rounded border border-border opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                {item.count}
              </span>
              
              {/* Bar drawing */}
              <div className="w-6 sm:w-10 bg-muted/30 border border-border rounded-t-lg h-28 relative overflow-hidden flex items-end">
                <motion.div 
                  className={`w-full bg-gradient-to-t ${item.barColor} rounded-t`}
                  initial={{ height: 0 }}
                  animate={{ height: `${item.percentage || 2}%` }}
                  transition={{ duration: 0.7, ease: 'easeOut' }}
                />
              </div>

              {/* Label */}
              <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};
