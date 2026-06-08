import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, AlertTriangle, XCircle, FileText, Check, ShieldAlert,
  FileCheck, UserCheck, ScrollText, AlertCircle, Sparkles
} from 'lucide-react';
import { useCollaborationStore } from '../../store/collaborationStore';
import { useAuthStore } from '../../store/authStore';
import { uploadsApi } from '../../services/api/uploads';
import type { UploadRow } from '../../services/api/uploads';
import { FilePreviewModal } from './FilePreviewModal';

interface QualityGate {
  id: string;
  projectId: string;
  phaseId: string;
  criteria: Record<string, boolean>;
  status: 'pending' | 'approved' | 'rejected' | 'remediation_required' | 'resubmitted';
  notes: string | null;
}

interface ApproveModalProps {
  isOpen: boolean;
  onClose: () => void;
  gate: QualityGate;
  onConfirm: () => Promise<void>;
}

export const ApproveModal: React.FC<ApproveModalProps> = ({ isOpen, onClose, gate, onConfirm }) => {
  const { user } = useAuthStore();
  const { addComment, addActivity } = useCollaborationStore();
  
  // Checklist State: map of criteria name to checked state
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [gateFiles, setGateFiles] = useState<UploadRow[]>([]);
  const [selectedPreviewFile, setSelectedPreviewFile] = useState<UploadRow | null>(null);

  // Initialize checklist based on gate criteria
  useEffect(() => {
    if (gate && gate.criteria) {
      const initial: Record<string, boolean> = {};
      Object.keys(gate.criteria).forEach(c => {
        initial[c] = false;
      });
      setChecklist(initial);
      
      // Load any associated uploads for evidence
      uploadsApi.listByEntity('GATE', gate.id)
        .then(res => setGateFiles(res))
        .catch(err => console.error('[ApproveModal] Evidence lookup failed', err));
    }
    setSignature('');
    setError('');
  }, [gate]);

  if (!isOpen) return null;

  const criteriaKeys = Object.keys(gate.criteria || {});
  const isChecklistComplete = criteriaKeys.every(k => checklist[k]);
  const isSignatureMatched = signature.trim().toLowerCase() === `${user?.firstName} ${user?.lastName}`.trim().toLowerCase();
  const hasEvidence = gateFiles.length > 0;
  const canSubmit = isChecklistComplete && isSignatureMatched && hasEvidence;

  const toggleChecklist = (key: string) => {
    setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleApprove = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      
      // Post audit comment in collaboration store
      if (user && user.tenantId) {
        addComment(user.tenantId, gate.projectId, gate.id, {
          entityId: gate.id,
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          text: `✅ **Gate approved and digitally signed.**\n\n*Verified criteria:*\n${criteriaKeys.map(k => `- [x] ${k}`).join('\n')}\n\n*Signed by: ${user.firstName} ${user.lastName} (${user.role})*`
        });

        addActivity(user.tenantId, gate.projectId, {
          projectId: gate.projectId,
          type: 'gate_approved',
          title: 'Quality Gate Approved',
          message: `${user.firstName} signed off on gate criteria.`,
          severity: 'high',
          actor: `${user.firstName} ${user.lastName}`
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to approve gate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-xl bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-emerald-600/10 via-teal-600/5 to-transparent border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-500 dark:text-emerald-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <span>Sign off Quality Gate</span>
                <Sparkles className="w-3.5 h-3.5 text-yellow-500 dark:text-yellow-400 animate-pulse" />
              </h2>
              <p className="text-[10px] text-slate-600 dark:text-zinc-400">Review deliverables, evidence documents, and authorize phase transition.</p>
            </div>
          </div>
        </div>        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Evidence Attachments */}
          <div className="space-y-2">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center space-x-1">
              <ScrollText className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
              <span>Evidence Documentation ({gateFiles.length})</span>
            </h3>
            {gateFiles.length === 0 ? (
              <div className="p-3.5 rounded-2xl bg-red-500/5 border border-red-500/20 text-xs text-red-500 dark:text-red-400 flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="font-light">
                  <strong>Compliance Evidence is not uploaded.</strong> You must upload at least one compliance evidence document in the vault before this gate can be approved.
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {gateFiles.map(file => (
                  <button
                    key={file.id}
                    onClick={() => setSelectedPreviewFile(file)}
                    className="flex items-center space-x-2.5 p-2 rounded-xl bg-slate-50 hover:bg-slate-100/80 dark:bg-zinc-900 dark:hover:bg-zinc-800/80 border border-slate-200 dark:border-zinc-800 text-left transition"
                  >
                    <FileText className="w-4 h-4 text-blue-500 dark:text-blue-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 dark:text-zinc-300 truncate">{file.originalName}</p>
                      <p className="text-[9px] text-slate-500 dark:text-zinc-500 uppercase font-extrabold">{(file.size / 1024).toFixed(0)} KB</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Gate Criteria Checklist */}
          <div className="space-y-2.5">
            <h3 className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-zinc-400 flex items-center space-x-1">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
              <span>Deliverable Requirements Checklist</span>
            </h3>
            <p className="text-[10px] text-slate-600 dark:text-zinc-400 italic">Please manually inspect all deliverables and verify they satisfy standard compliance.</p>
            
            <div className="space-y-1.5">
              {criteriaKeys.map(k => (
                <button
                  key={k}
                  onClick={() => toggleChecklist(k)}
                  className={`w-full flex items-center space-x-3 p-3 rounded-2xl border transition text-left ${
                    checklist[k] 
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-300' 
                      : 'bg-slate-50 border-slate-200 hover:bg-slate-100 dark:bg-zinc-900 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/80 text-slate-800'
                  }`}
                >
                  <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition ${
                    checklist[k] ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 dark:border-zinc-700'
                  }`}>
                    {checklist[k] && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                  <span className="text-xs font-semibold">{k}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Secure Audit Signature Panel */}
          <div className="p-4 rounded-3xl bg-slate-50 dark:bg-zinc-900/40 border border-slate-200 dark:border-zinc-800 space-y-3">
            <div className="flex items-start space-x-2.5">
              <ShieldAlert className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-extrabold text-slate-900 dark:text-zinc-200">Legal Authorization Signature</h4>
                <p className="text-[10px] text-slate-500 dark:text-zinc-400 leading-relaxed">
                  By signing, you confirm that all deliverables have been thoroughly inspected and satisfy Acme's security, quality, and operational standards.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[9px] uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-extrabold flex justify-between">
                <span>Type full name to sign: <span className="text-slate-700 dark:text-zinc-300 italic">{user?.firstName} {user?.lastName}</span></span>
                {isSignatureMatched && <span className="text-emerald-600 dark:text-emerald-400 font-bold flex items-center space-x-0.5"><UserCheck className="w-3 h-3" /> <span>Authorized</span></span>}
              </label>
              <input
                type="text"
                value={signature}
                onChange={e => setSignature(e.target.value)}
                placeholder={`${user?.firstName} ${user?.lastName}`}
                className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 focus:border-emerald-500/50 focus:outline-none rounded-xl px-3 py-2 text-xs font-mono text-slate-800 dark:text-zinc-200 placeholder-slate-400 dark:placeholder-zinc-600"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 dark:text-red-400 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

        </div>

        {/* Footer controls */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-850 flex items-center justify-between shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition"
          >
            Cancel
          </button>
          
          <button
            onClick={handleApprove}
            disabled={!canSubmit || submitting}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-emerald-600/15 flex items-center space-x-1.5 transition cursor-pointer"
          >
            {submitting ? 'Signing...' : 'Approve & Digital Sign'}
          </button>
        </div>

      </div>

      {/* Embedded File Preview Widget */}
      {selectedPreviewFile && (
        <FilePreviewModal
          isOpen={!!selectedPreviewFile}
          onClose={() => setSelectedPreviewFile(null)}
          file={{
            name: selectedPreviewFile.originalName,
            url: selectedPreviewFile.publicUrl,
            mimeType: selectedPreviewFile.mimeType,
            size: selectedPreviewFile.size,
            uploadedBy: selectedPreviewFile.uploaderUserId ?? undefined,
            createdAt: selectedPreviewFile.createdAt
          }}
        />
      )}
    </div>
  );
};


interface RejectModalProps {
  isOpen: boolean;
  onClose: () => void;
  gate: QualityGate;
  onConfirm: () => Promise<void>;
}

export const RejectModal: React.FC<RejectModalProps> = ({ isOpen, onClose, gate, onConfirm }) => {
  const { user } = useAuthStore();
  const { addComment, addActivity } = useCollaborationStore();
  
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setReason('');
    setError('');
  }, [gate]);

  if (!isOpen) return null;

  const handleReject = async () => {
    if (!reason.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm();
      
      // Save rejection notes as comments
      if (user && user.tenantId) {
        addComment(user.tenantId, gate.projectId, gate.id, {
          entityId: gate.id,
          userId: user.id,
          userName: `${user.firstName} ${user.lastName}`,
          email: user.email,
          text: `🚨 **Gate review rejected by governance authority.**\n\n**Rejection Rationale:**\n> ${reason.trim()}\n\n*Action required: Please address outstanding comments, upload new evidence, and resubmit gate.*`
        });

        addActivity(user.tenantId, gate.projectId, {
          projectId: gate.projectId,
          type: 'gate_rejected',
          title: 'Quality Gate Rejected',
          message: `${user.firstName} rejected gate deliverables.`,
          severity: 'high',
          actor: `${user.firstName} ${user.lastName}`
        });
      }
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to reject gate.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-red-600/10 via-orange-600/5 to-transparent border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center justify-center text-red-500 dark:text-red-400">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">Reject Gate Sign-off</h2>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Record blockers and request immediate remediation.</p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 bg-white dark:bg-zinc-950">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-extrabold flex justify-between">
              <span>Detailed Rejection Rationale</span>
              <span className="text-red-500 dark:text-red-400 font-extrabold">Required</span>
            </label>
            <textarea
              rows={4}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Detail exactly why this quality gate does not meet required specifications. Tag team members using @..."
              className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 focus:border-red-500/50 focus:outline-none rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-600 leading-relaxed resize-none"
            />
          </div>

          {error && (
            <div className="p-3 rounded-2xl bg-red-500/10 border border-red-500/20 text-xs text-red-500 dark:text-red-400 flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-950 border-t border-slate-200 dark:border-zinc-850 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-200 transition"
          >
            Cancel
          </button>
          
          <button
            onClick={handleReject}
            disabled={!reason.trim() || submitting}
            className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-red-600/15 flex items-center space-x-1.5 transition cursor-pointer"
          >
            {submitting ? 'Rejecting...' : 'Reject Sign-off'}
          </button>
        </div>

      </div>
    </div>
  );
};


interface RemediationModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  gateId: string;
}

export const RemediationModal: React.FC<RemediationModalProps> = ({ isOpen, onClose, projectId, gateId }) => {
  const { user } = useAuthStore();
  const { addComment, addActivity } = useCollaborationStore();
  
  const [remediationNotes, setRemediationNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleCreateRemediation = () => {
    if (!remediationNotes.trim() || !user || !user.tenantId) return;
    setSubmitting(true);

    // Save remediation checklist as a threaded note
    addComment(user.tenantId, projectId, gateId, {
      entityId: gateId,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      text: `🛠️ **Remediation Plan Proposed**\n\n**Action Items:**\n${remediationNotes.trim()}\n\n*Critical attention required by engineering group.*`
    });

    // Alert group by adding high severity activity log
    addActivity(user.tenantId, projectId, {
      projectId,
      type: 'remediation_proposed',
      title: 'Remediation Action Filed',
      message: `${user.firstName} filed specialized mitigation plan.`,
      severity: 'medium',
      actor: `${user.firstName} ${user.lastName}`
    });

    setSubmitting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-md bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-orange-600/10 via-amber-600/5 to-transparent border-b border-slate-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center text-orange-500 dark:text-orange-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">File Remediation Action</h2>
              <p className="text-[10px] text-slate-500 dark:text-zinc-400 font-medium">Create outstanding tasks to bypass blockers.</p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4 bg-white dark:bg-zinc-950">
          <div className="space-y-2">
            <label className="text-[9px] uppercase tracking-wider text-slate-600 dark:text-zinc-400 font-extrabold flex justify-between">
              <span>Remediation checklist instructions</span>
              <span className="text-orange-500 dark:text-orange-400 font-extrabold">Checklist Format</span>
            </label>
            <textarea
              rows={5}
              value={remediationNotes}
              onChange={e => setRemediationNotes(e.target.value)}
              placeholder="Use checklist format:\n- [ ] Fix critical security leak\n- [ ] Update legal review doc\n- [ ] Re-run static code analysis"
              className="w-full bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 hover:border-slate-300 dark:hover:border-zinc-700 focus:border-orange-500/50 focus:outline-none rounded-xl p-3 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-zinc-650 leading-relaxed font-mono resize-none"
            />
          </div>
        </div>

        {/* Footer controls */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-zinc-955 border-t border-slate-200 dark:border-zinc-850 flex items-center justify-between">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-zinc-400 hover:text-slate-950 dark:hover:text-zinc-200 transition"
          >
            Cancel
          </button>
          
          <button
            onClick={handleCreateRemediation}
            disabled={!remediationNotes.trim() || submitting}
            className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-extrabold text-xs shadow-lg shadow-orange-600/15 flex items-center space-x-1.5 transition cursor-pointer"
          >
            {submitting ? 'Filing...' : 'File Mitigation Checklist'}
          </button>
        </div>

      </div>
    </div>
  );
};
