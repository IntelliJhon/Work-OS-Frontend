import React, { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Project, QualityGate } from '../../services/api/projects';
import { gatesApi } from '../../services/api/gates';
import { DragDropUpload } from './DragDropUpload';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  UploadCloud,
  ChevronDown,
  ChevronUp,
  Activity,
  History,
  MessageSquare,
  Wrench
} from 'lucide-react';
import { ApproveModal, RejectModal, RemediationModal } from '../../components/collaboration/ApprovalModals';
import CommentsSystem from '../../components/collaboration/CommentsSystem';

export const ProjectGates: React.FC = () => {
  const { project, refetch: refetchProject } = useOutletContext<{ project: Project; refetch: () => void }>();
  const queryClient = useQueryClient();
  const [expandedGateId, setExpandedGateId] = useState<string | null>(null);
  
  const [activeApproveGate, setActiveApproveGate] = useState<QualityGate | null>(null);
  const [activeRejectGate, setActiveRejectGate] = useState<QualityGate | null>(null);
  const [activeRemediationGate, setActiveRemediationGate] = useState<QualityGate | null>(null);

  // Query Quality Gates
  const { data: gates = [], isLoading, refetch: refetchGates } = useQuery({
    queryKey: ['gates', project.id],
    queryFn: () => gatesApi.listByProject(project.id),
    enabled: !!project.id,
  });

  const queryKey = ['gates', project.id];

  // Mutations
  const approveMutation = useMutation({
    mutationFn: gatesApi.approve,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      refetchGates();
      refetchProject();
    }
  });

  const rejectMutation = useMutation({
    mutationFn: gatesApi.reject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      refetchGates();
      refetchProject();
    }
  });

  const resubmitMutation = useMutation({
    mutationFn: gatesApi.resubmit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      refetchGates();
      refetchProject();
    }
  });

  const toggleExpand = (id: string) => {
    setExpandedGateId((prev) => (prev === id ? null : id));
  };

  const getStatusBadge = (status: QualityGate['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            <span>Approved</span>
          </span>
        );
      case 'rejected':
      case 'remediation_required':
        return (
          <span className="flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-400 px-2.5 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" />
            <span>Remediation Required</span>
          </span>
        );
      case 'resubmitted':
        return (
          <span className="flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2.5 py-0.5 rounded-full animate-pulse">
            <Clock className="w-3 h-3" />
            <span>Pending Review</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="flex items-center space-x-1 text-[10px] font-extrabold uppercase tracking-wider bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2.5 py-0.5 rounded-full">
            <Activity className="w-3 h-3" />
            <span>In Checklist</span>
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="w-full h-48 flex items-center justify-center space-x-2">
        <Clock className="w-6 h-6 text-zinc-600 animate-spin" />
        <span className="text-xs text-muted-foreground font-light">Loading quality gate checklists...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-foreground animate-fade-in">
      <div className="pb-3 border-b border-white/5">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-white uppercase tracking-wider flex items-center space-x-2">
          <ShieldCheck className="w-5 h-5 text-emerald-400" />
          <span>Stage Quality Gates</span>
        </h3>
        <p className="text-xs text-muted-foreground mt-1 font-light">
          Audit checklists and evidence criteria must be finalized to advance between stage gates.
        </p>
      </div>

      {gates.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center border border-border">
          <ShieldCheck className="w-12 h-12 text-zinc-500 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground font-light">No quality gates bound to project phases.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {gates.map((gate) => {
            const isExpanded = expandedGateId === gate.id;
            const parentPhase = project.phases?.find((p) => p.id === gate.phaseId);
            
            // Format dynamic criteria keys
            const criteriaList = Object.entries(gate.criteria || {});

            return (
              <div
                key={gate.id}
                className={`glass-panel-heavy rounded-2xl border transition-all duration-300 ${
                  isExpanded ? 'border-zinc-500 bg-white/5' : 'border-border bg-white/5 hover:border-zinc-700'
                }`}
              >
                {/* Gate Summary Header */}
                <div
                  onClick={() => toggleExpand(gate.id)}
                  className="p-5 flex justify-between items-center cursor-pointer select-none"
                >
                  <div className="flex items-center space-x-4">
                    <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                      <ShieldCheck className="w-5.5 h-5.5" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center space-x-2">
                        <span>Stage Gate Check: {parentPhase?.name || 'Governance Gate'}</span>
                      </h4>
                      <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mt-1">
                        Linked Stage: {parentPhase?.status || 'Pending'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    {getStatusBadge(gate.status)}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
                  </div>
                </div>

                {/* Gate Expandable Details */}
                {isExpanded && (
                  <div className="px-5 pb-5 pt-1 border-t border-white/5 grid grid-cols-1 lg:grid-cols-2 gap-6 animate-scale-in">
                    {/* Left Column: Criteria Checklists & Decisions */}
                    <div className="space-y-5">
                      <div className="space-y-3.5">
                        <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center space-x-1.5">
                          <CheckCircle2 className="w-4 h-4 text-blue-400" />
                          <span>Required Quality Criteria Checklist</span>
                        </h5>

                        <div className="space-y-2 bg-background/50 p-4 rounded-xl border border-white/5">
                          {criteriaList.length === 0 ? (
                            <p className="text-xs text-zinc-500 font-light italic">No criteria specified for this gate.</p>
                          ) : (
                            criteriaList.map(([criterion, isSatisfied]) => (
                              <div key={criterion} className="flex items-center justify-between text-xs py-1">
                                <span className="font-semibold text-zinc-300">{criterion.replace(/([A-Z])/g, ' $1')}</span>
                                <span className={`text-[9px] uppercase font-extrabold tracking-widest px-2 py-0.5 rounded ${
                                  isSatisfied 
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                                    : 'bg-zinc-500/10 text-zinc-500 border border-white/5'
                                }`}>
                                  {isSatisfied ? 'Satisfied' : 'Auditing'}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Decisions Board / Actions Panel */}
                      <div className="bg-white/5 border border-white/5 p-4 rounded-xl space-y-3">
                        <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center space-x-1.5">
                          <History className="w-4 h-4 text-amber-400" />
                          <span>Governance Decision Desk</span>
                        </h5>

                        {gate.approvedBy && (
                          <div className="text-xs text-zinc-400 font-light space-y-1 pb-2 border-b border-white/5">
                            <div className="flex justify-between">
                              <span>Approved By ID:</span>
                              <span className="font-mono text-zinc-900 dark:text-white text-[10px] truncate max-w-[120px]">{gate.approvedBy}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Approved Date:</span>
                              <span className="text-zinc-900 dark:text-white">{gate.approvedAt ? new Date(gate.approvedAt).toLocaleString() : 'N/A'}</span>
                            </div>
                          </div>
                        )}

                        <div className="flex flex-wrap gap-3 pt-1">
                          {/* Approve/Reject actions: shown if pending or resubmitted */}
                          {(gate.status === 'pending' || gate.status === 'resubmitted') && (
                            <PermissionGate
                              permission={PERMISSIONS.PROJECT_MANAGE}
                              behavior="disable"
                              tooltipMessage="Only Project Managers can approve or reject quality gates"
                            >
                              <div className="flex flex-wrap gap-3">
                                <button
                                  onClick={() => setActiveApproveGate(gate)}
                                  disabled={approveMutation.isPending || rejectMutation.isPending}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-lg cursor-pointer"
                                >
                                  Certify & Approve Gate
                                </button>
                                <button
                                  onClick={() => setActiveRejectGate(gate)}
                                  disabled={approveMutation.isPending || rejectMutation.isPending}
                                  className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-xs font-bold shadow-lg cursor-pointer"
                                >
                                  Flag Remediation / Reject
                                </button>
                              </div>
                            </PermissionGate>
                          )}

                          {/* Resubmit action: shown if rejected */}
                          {gate.status === 'rejected' && (
                            <div className="w-full space-y-3">
                              <div className="flex items-center space-x-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                <AlertTriangle className="w-4.5 h-4.5 flex-shrink-0" />
                                <span>Timeline Flagged: Please upload required evidence and resubmit stage gate for review.</span>
                              </div>
                              <PermissionGate
                                permission={PERMISSIONS.PROJECT_MANAGE}
                                behavior="disable"
                                tooltipMessage="Only Project Managers can manage stage gates"
                              >
                                <div className="flex flex-wrap gap-3">
                                  <button
                                    onClick={() => resubmitMutation.mutate(gate.id)}
                                    className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg glow-primary transition-all w-full sm:w-auto cursor-pointer"
                                  >
                                    Resubmit Gate Checklist
                                  </button>
                                  <button
                                    onClick={() => setActiveRemediationGate(gate)}
                                    className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-bold shadow-lg transition-all w-full sm:w-auto flex items-center space-x-1.5 cursor-pointer"
                                  >
                                    <Wrench className="w-3.5 h-3.5" />
                                    <span>File Remediation Plan</span>
                                  </button>
                                </div>
                              </PermissionGate>
                            </div>
                          )}

                          {gate.status === 'approved' && (
                            <div className="flex items-center space-x-2 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs w-full">
                              <CheckCircle2 className="w-4.5 h-4.5 flex-shrink-0" />
                              <span>Compliance Certified. Drizzle transaction securely locked into tenant archives.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Column: Multi-tenant Evidence Upload Zone */}
                    <div className="space-y-4 border-l border-white/5 lg:pl-6">
                      <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center space-x-1.5">
                        <UploadCloud className="w-4 h-4 text-blue-400" />
                        <span>Compliance Evidence Vault</span>
                      </h5>

                      <p className="text-xs text-muted-foreground font-light leading-relaxed">
                        To certify compliance, attach design sheets, test outputs, or risk verification lists. Max 10MB per file.
                      </p>

                      {/* Mount our awesome drag drop zone bound strictly to this Gate ID! */}
                      <DragDropUpload entityType="GATE" entityId={gate.id} />
                    </div>

                    {/* Inline Comments Thread */}
                    <div className="col-span-1 lg:col-span-2 border-t border-white/5 pt-6 mt-6">
                      <h5 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest flex items-center space-x-1.5 mb-4">
                        <MessageSquare className="w-3.5 h-3.5 text-pink-400" />
                        <span>Remediation Debate & Evidence Sign-offs</span>
                      </h5>
                      <CommentsSystem projectId={project.id} entityId={gate.id} entityType="GATE" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Interactive Modals */}
      {activeApproveGate && (
        <ApproveModal
          isOpen={!!activeApproveGate}
          onClose={() => setActiveApproveGate(null)}
          gate={activeApproveGate}
          onConfirm={async () => {
            await approveMutation.mutateAsync(activeApproveGate.id);
          }}
        />
      )}
      {activeRejectGate && (
        <RejectModal
          isOpen={!!activeRejectGate}
          onClose={() => setActiveRejectGate(null)}
          gate={activeRejectGate}
          onConfirm={async () => {
            await rejectMutation.mutateAsync(activeRejectGate.id);
          }}
        />
      )}
      {activeRemediationGate && (
        <RemediationModal
          isOpen={!!activeRemediationGate}
          onClose={() => setActiveRemediationGate(null)}
          projectId={project.id}
          gateId={activeRemediationGate.id}
        />
      )}
    </div>
  );
};
export default ProjectGates;
