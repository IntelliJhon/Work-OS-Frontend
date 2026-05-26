import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Phase, Project } from '../../services/api/projects';
import { phasesApi } from '../../services/api/phases';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  GitBranch,
  Play,
  CheckCircle,
  AlertOctagon,
  RotateCcw,
  ShieldCheck,
  Activity,
  ArrowRight,
  Info,
  Lock,
  Unlock,
  AlertTriangle,
  X
} from 'lucide-react';

export const ProjectWorkflow: React.FC = () => {
  const { project, refetch } = useOutletContext<{ project: Project; refetch: () => void }>();
  const queryClient = useQueryClient();
  const [selectedPhaseId, setSelectedPhaseId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const clearError = () => setActionError(null);

  const handleMutationError = (error: any) => {
    const message =
      error?.response?.data?.error ||
      error?.message ||
      'An unexpected error occurred. Please try again.';
    setActionError(message);
  };

  // Sorting phases chronologically
  const phases = [...(project.phases || [])].sort((a, b) => a.orderIndex - b.orderIndex);
  
  // Set default selected phase to active one, or the first one
  const activePhase = phases.find((p) => p.status === 'active');
  const defaultSelectedId = selectedPhaseId || activePhase?.id || phases[0]?.id || null;
  const selectedPhase = phases.find((p) => p.id === defaultSelectedId);

  // Mutations for governance actions
  const activateMutation = useMutation({
    mutationFn: phasesApi.activate,
    onSuccess: () => {
      clearError();
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      refetch();
    },
    onError: handleMutationError,
  });

  const completeMutation = useMutation({
    mutationFn: phasesApi.complete,
    onSuccess: () => {
      clearError();
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      refetch();
    },
    onError: handleMutationError,
  });

  const blockMutation = useMutation({
    mutationFn: phasesApi.block,
    onSuccess: () => {
      clearError();
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      refetch();
    },
    onError: handleMutationError,
  });

  const reopenMutation = useMutation({
    mutationFn: phasesApi.reopen,
    onSuccess: () => {
      clearError();
      queryClient.invalidateQueries({ queryKey: ['project', project.id] });
      refetch();
    },
    onError: handleMutationError,
  });

  if (phases.length === 0) {
    return (
      <div className="glass-panel rounded-2xl p-12 text-center border border-border space-y-4">
        <GitBranch className="w-12 h-12 text-slate-500 dark:text-zinc-500 mx-auto" />
        <div>
          <h4 className="text-sm font-bold text-zinc-900 dark:text-slate-900 dark:text-white">Timeline Uninitialized</h4>
          <p className="text-xs text-muted-foreground font-light max-w-sm mt-1 mx-auto">
            This project does not have standard workflow governance nodes provisioned. 
            Please check database seed bounds or recreate the project.
          </p>
        </div>
      </div>
    );
  }

  // Count sprint details and gates linked to selected phase
  const selectedPhaseSprints = project.sprints?.filter((s) => s.phaseId === selectedPhase?.id) || [];
  const selectedPhaseGates = project.gates?.filter((g) => g.phaseId === selectedPhase?.id) || [];

  const getStatusStyles = (status: Phase['status']) => {
    switch (status) {
      case 'active':
        return {
          card: 'border-blue-500 bg-blue-500/10 shadow-lg glow-primary text-blue-400',
          badge: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
          dot: 'bg-blue-400'
        };
      case 'completed':
        return {
          card: 'border-emerald-500 bg-emerald-500/5 text-emerald-400',
          badge: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400'
        };
      case 'blocked':
        return {
          card: 'border-red-500 bg-red-500/10 text-red-400 glow-danger',
          badge: 'bg-red-500/20 border-red-500/30 text-red-400',
          dot: 'bg-red-400'
        };
      case 'pending':
      default:
        return {
          card: 'border-border bg-slate-100/60 dark:bg-white/5 text-slate-500 dark:text-zinc-500 hover:border-zinc-700 hover:bg-slate-200/60 dark:bg-white/10',
          badge: 'bg-slate-100/60 dark:bg-white/5 border-slate-200/60 dark:border-white/10 text-slate-500 dark:text-zinc-500',
          dot: 'bg-zinc-600'
        };
    }
  };

  const isPending = 
    activateMutation.isPending || 
    completeMutation.isPending || 
    blockMutation.isPending || 
    reopenMutation.isPending;

  return (
    <div className="space-y-6 text-foreground">
      {/* Timeline Progression Node visualization */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-slate-900 dark:text-white uppercase tracking-wider">
          Standardized Lifecycle Flow
        </h3>
        
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
          {phases.map((phase, idx) => {
            const styles = getStatusStyles(phase.status);
            const isSelected = selectedPhase?.id === phase.id;
            
            return (
              <div
                key={phase.id}
                onClick={() => setSelectedPhaseId(phase.id)}
                className={`relative flex flex-col justify-between p-4 rounded-xl border cursor-pointer transition-all duration-300 ${styles.card} ${
                  isSelected ? 'ring-2 ring-blue-500/30 border-blue-400 scale-[1.02]' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400">0{idx + 1}</span>
                  <span className={`w-2 h-2 rounded-full ${styles.dot} ${phase.status === 'active' ? 'animate-pulse' : ''}`} />
                </div>

                <div className="space-y-1">
                  <p className={`text-xs font-extrabold truncate ${isSelected ? 'text-zinc-900 dark:text-white' : ''}`}>
                    {phase.name}
                  </p>
                  <div className="flex items-center space-x-1">
                    <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${styles.badge}`}>
                      {phase.status}
                    </span>
                    {phase.isLocked && (
                      <Lock className="w-2.5 h-2.5 text-slate-500 dark:text-zinc-500" />
                    )}
                  </div>
                </div>

                {/* Connecting arrow indicator for desktop (draw after each except last node) */}
                {idx < phases.length - 1 && (
                  <div className="hidden md:flex absolute -right-2 top-1/2 -translate-y-1/2 z-10 p-0.5 rounded-full bg-background border border-border">
                    <ArrowRight className="w-2.5 h-2.5 text-zinc-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Phase Panel */}
      {selectedPhase && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Main Info and Governance Actions */}
          <div className="lg:col-span-2 space-y-4">
            <div className="glass-panel-heavy rounded-2xl p-6 border border-border space-y-5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center space-y-4 sm:space-y-0 border-b border-slate-100 dark:border-white/5 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-2">
                    <h4 className="text-xl font-bold text-zinc-900 dark:text-slate-900 dark:text-white">
                      Stage Gate: {selectedPhase.name}
                    </h4>
                    {selectedPhase.isLocked ? (
                      <span className="flex items-center space-x-1 text-[10px] font-semibold text-slate-500 dark:text-zinc-500 bg-slate-100/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 px-2 py-0.5 rounded">
                        <Lock className="w-3 h-3" />
                        <span>Locked</span>
                      </span>
                    ) : (
                      <span className="flex items-center space-x-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded">
                        <Unlock className="w-3 h-3" />
                        <span>Open</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground font-light">
                    Governed timeline phase #{selectedPhase.orderIndex + 1}. Active sprints and quality checks bound to RLS.
                  </p>
                </div>

                <span className={`text-[10px] uppercase font-extrabold tracking-widest px-3 py-1 rounded-full border ${
                  getStatusStyles(selectedPhase.status).badge
                }`}>
                  Stage Status: {selectedPhase.status}
                </span>
              </div>

              {/* Actions panel according to user role permissions */}
              <div className="space-y-3 bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 p-5 rounded-xl">
                <h5 className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 uppercase tracking-widest flex items-center space-x-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-400" />
                  <span>Authorized Stage Actions (PM & Lead Scope)</span>
                </h5>

                <p className="text-xs text-muted-foreground font-light leading-relaxed">
                  Manage stage gate lifecycle flags. Note: All quality gate checklists must be marked off inside current or prior stages before finalizing and entering sub-sprints.
                </p>

                {/* ── Action Error Banner ───────────────────────────────────── */}
                {actionError && (
                  <div className="flex items-start space-x-3 p-4 rounded-xl bg-red-500/10 border border-red-500/25 animate-fade-in">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-red-300">Action Failed</p>
                      <p className="text-[11px] text-red-200/70 mt-0.5 leading-relaxed">{actionError}</p>
                    </div>
                    <button
                      onClick={clearError}
                      className="text-red-400 hover:text-red-300 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {/* ─────────────────────────────────────────────────────────── */}

                {/* ── Gate Approval Status Banner ───────────────────────────── */}
                {selectedPhase.status === 'active' && (() => {
                  const phaseGate = selectedPhaseGates[0]; // one gate per phase
                  const gateApproved = phaseGate?.status === 'approved';
                  const gateStatus = phaseGate?.status ?? 'pending';

                  if (!gateApproved) {
                    return (
                      <div className="flex items-start space-x-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/25 animate-fade-in">
                        <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div className="space-y-1 flex-1 min-w-0">
                          <p className="text-xs font-extrabold text-amber-300">
                            Quality Gate Approval Required
                          </p>
                          <p className="text-[10px] text-amber-200/70 leading-relaxed">
                            This phase cannot be locked or completed until its quality gate checklist is approved.
                            Go to the <span className="font-bold text-amber-300">Quality Gates</span> tab, review all criteria, and sign off the gate first.
                          </p>
                          <div className="flex items-center space-x-1.5 pt-1">
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-zinc-400">Gate Status:</span>
                            <span className={`text-[9px] uppercase tracking-wider font-extrabold px-2 py-0.5 rounded border ${
                              gateStatus === 'rejected'
                                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                                : gateStatus === 'resubmitted'
                                ? 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                : 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                            }`}>
                              {gateStatus}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  }

                  // Gate IS approved — show success confirmation
                  return (
                    <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 animate-fade-in">
                      <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <p className="text-[11px] text-emerald-300 font-semibold">
                        Quality gate approved — this phase is eligible to be locked and completed.
                      </p>
                    </div>
                  );
                })()}
                {/* ─────────────────────────────────────────────────────────── */}

                <div className="flex flex-wrap gap-3.5 pt-2">
                  {/* Activate Phase Button */}
                  {(selectedPhase.status === 'pending' || selectedPhase.status === 'blocked') && (
                    <PermissionGate
                      permission={PERMISSIONS.PROJECT_MANAGE}
                      behavior="disable"
                      tooltipMessage="Only Project Managers can activate lifecycle stages"
                    >
                      <button
                        onClick={() => activateMutation.mutate(selectedPhase.id)}
                        disabled={isPending}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg glow-primary disabled:opacity-50 transition-all w-full sm:w-auto"
                      >
                        <Play className="w-4 h-4" />
                        <span>Activate Stage</span>
                      </button>
                    </PermissionGate>
                  )}

                  {/* Complete Phase Button — disabled when gate is not approved */}
                  {selectedPhase.status === 'active' && (() => {
                    const phaseGate = selectedPhaseGates[0];
                    const gateApproved = phaseGate?.status === 'approved';
                    return (
                      <PermissionGate
                        permission={PERMISSIONS.PROJECT_MANAGE}
                        behavior="disable"
                        tooltipMessage="Only Project Managers can complete lifecycle stages"
                      >
                        <button
                          onClick={() => {
                            if (!gateApproved) return; // extra safety — backend also blocks
                            if (confirm('Verify that all sprint increments and quality gate criteria have been closed before locking this lifecycle stage.')) {
                              completeMutation.mutate(selectedPhase.id);
                            }
                          }}
                          disabled={isPending || !gateApproved}
                          title={!gateApproved ? 'Approve the quality gate checklist before completing this phase' : undefined}
                          className={`flex items-center space-x-2 px-4 py-2.5 rounded-xl text-white text-xs font-bold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-all w-full sm:w-auto ${
                            gateApproved
                              ? 'bg-emerald-600 hover:bg-emerald-500'
                              : 'bg-zinc-700 cursor-not-allowed'
                          }`}
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>Lock & Complete Phase</span>
                        </button>
                      </PermissionGate>
                    );
                  })()}

                  {/* Block Phase Button */}
                  {selectedPhase.status === 'active' && (
                    <PermissionGate
                      permission={PERMISSIONS.PROJECT_MANAGE}
                      behavior="disable"
                      tooltipMessage="Only Project Managers can block lifecycle stages"
                    >
                      <button
                        onClick={() => blockMutation.mutate(selectedPhase.id)}
                        disabled={isPending}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg disabled:opacity-50 transition-all w-full sm:w-auto"
                      >
                        <AlertOctagon className="w-4 h-4" />
                        <span>Mark as Blocked</span>
                      </button>
                    </PermissionGate>
                  )}

                  {/* Reopen Phase Button */}
                  {selectedPhase.status === 'completed' && (
                    <PermissionGate
                      permission={PERMISSIONS.PROJECT_MANAGE}
                      behavior="disable"
                      tooltipMessage="Only Project Managers can reopen completed stages"
                    >
                      <button
                        onClick={() => reopenMutation.mutate(selectedPhase.id)}
                        disabled={isPending}
                        className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-lg disabled:opacity-50 transition-all w-full sm:w-auto"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Reopen Stage</span>
                      </button>
                    </PermissionGate>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Connected Sprints & Checklist Quickview */}
          <div className="space-y-4">
            
            {/* Quick Sprints view */}
            <div className="glass-panel rounded-xl p-5 border border-border flex flex-col h-[210px]">
              <div className="flex items-center justify-between mb-3.5 border-b border-slate-100 dark:border-white/5 pb-2.5">
                <h5 className="text-xs font-bold text-zinc-900 dark:text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <Activity className="w-4 h-4 text-blue-400" />
                  <span>Sprints List ({selectedPhaseSprints.length})</span>
                </h5>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {selectedPhaseSprints.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 font-light italic py-4">No sprints created in this stage.</p>
                ) : (
                  selectedPhaseSprints.map((sprint) => (
                    <div key={sprint.id} className="flex justify-between items-center p-2 rounded bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-xs">
                      <span className="font-semibold text-zinc-900 dark:text-slate-900 dark:text-white truncate max-w-[150px]">{sprint.name}</span>
                      <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                        sprint.status === 'active' 
                          ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' 
                          : sprint.status === 'closed'
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-500/10 border-zinc-500/20 text-slate-500 dark:text-zinc-500'
                      }`}>
                        {sprint.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Quick Quality Gates View */}
            <div className="glass-panel rounded-xl p-5 border border-border flex flex-col h-[210px]">
              <div className="flex items-center justify-between mb-3.5 border-b border-slate-100 dark:border-white/5 pb-2.5">
                <h5 className="text-xs font-bold text-zinc-900 dark:text-slate-900 dark:text-white uppercase tracking-wider flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Quality Gates ({selectedPhaseGates.length})</span>
                </h5>
              </div>

              <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {selectedPhaseGates.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-zinc-500 font-light italic py-4">No quality gates bound to this stage.</p>
                ) : (
                  selectedPhaseGates.map((gate) => (
                    <div key={gate.id} className="flex justify-between items-center p-2 rounded bg-slate-100/60 dark:bg-white/5 border border-slate-100 dark:border-white/5 text-xs">
                      <div className="min-w-0 pr-2">
                        <p className="font-bold text-zinc-900 dark:text-slate-900 dark:text-white truncate">Criteria Rules</p>
                        <p className="text-[9px] text-muted-foreground truncate">
                          Keys: {Object.keys(gate.criteria).join(', ') || 'N/A'}
                        </p>
                      </div>
                      <span className={`text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded border ${
                        gate.status === 'approved' 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' 
                          : gate.status === 'rejected'
                          ? 'bg-red-500/10 border-red-500/20 text-red-400'
                          : 'bg-blue-500/10 border-blue-500/20 text-blue-400'
                      }`}>
                        {gate.status}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
export default ProjectWorkflow;
