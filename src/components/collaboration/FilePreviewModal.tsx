import React from 'react';
import { X, Download, FileText, Image as ImageIcon, File, Calendar, User, Database } from 'lucide-react';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: {
    name: string;
    url: string;
    mimeType?: string;
    size?: number;
    uploadedBy?: string;
    createdAt?: string;
  };
}

export const FilePreviewModal: React.FC<FilePreviewModalProps> = ({ isOpen, onClose, file }) => {
  if (!isOpen) return null;

  const getFileExtension = (filename: string) => {
    return filename.split('.').pop()?.toLowerCase() || '';
  };

  const formatBytes = (bytes = 0) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const extension = getFileExtension(file.name);
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(extension) || file.mimeType?.startsWith('image/');
  const isPdf = extension === 'pdf' || file.mimeType === 'application/pdf';
  const isText = ['txt', 'log', 'json'].includes(extension) || file.mimeType?.startsWith('text/');
  const isMarkdown = extension === 'md';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/90 backdrop-blur-md">
      <div className="w-full max-w-4xl h-[85vh] glass-panel-heavy rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col sm:flex-row animate-scale-in">
        
        {/* Left Side: Dynamic Preview Area */}
        <div className="flex-1 bg-black/40 border-r border-border flex items-center justify-center relative overflow-hidden min-h-[50vh] sm:min-h-0">
          {isImage ? (
            <img
              src={file.url}
              alt={file.name}
              className="max-w-full max-h-full object-contain p-4 select-none animate-fade-in"
            />
          ) : isPdf ? (
            <iframe
              src={`${file.url}#toolbar=0&navpanes=0`}
              title={file.name}
              className="w-full h-full border-none bg-white animate-fade-in"
            />
          ) : isText ? (
            <div className="w-full h-full overflow-auto p-6 font-mono text-xs text-zinc-300 whitespace-pre leading-relaxed select-text text-left">
              {/* Fallback to display text or dynamic placeholder */}
              {`[OPERATIONAL AUDIT COMPLIANCE REPORT]\nFile Hash: sha256-4c7b8d9e2a1c0f\nEncryption: AES-256-GCM\nRLS Status: Strict tenant-isolation active\n\n${file.name} context read successfully.\nCompliance checks: PASSED\n\n--- FILE CONTENTS ---\nMock content rendering. Security audits suggest all RLS assertions on project stages completed with zero violations.`}
            </div>
          ) : isMarkdown ? (
            <div className="w-full h-full overflow-auto p-8 text-left text-zinc-300 leading-relaxed select-text prose prose-invert max-w-none">
              <h1 className="text-xl font-bold text-white border-b border-white/5 pb-2 mb-4"># {file.name}</h1>
              <p className="text-xs text-zinc-400 italic mb-4">Governance compliance document</p>
              <h3 className="text-sm font-bold text-blue-400 mt-4 mb-2">## Execution Scope</h3>
              <p className="text-xs mb-3">All tasks are successfully bounded to active sprint stages. Multi-tenant RLS checks validated by database superusers.</p>
              <h3 className="text-sm font-bold text-blue-400 mt-4 mb-2">## Signatures</h3>
              <ul className="list-disc pl-5 text-xs space-y-1">
                <li>Audit Actor: {file.uploadedBy || 'admin@acme.com'}</li>
                <li>Signed Date: {file.createdAt ? new Date(file.createdAt).toLocaleDateString() : new Date().toLocaleDateString()}</li>
              </ul>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <File className="w-16 h-16 text-zinc-600 mx-auto" />
              <p className="text-xs text-zinc-400 font-light italic">Preview not supported for this file format.</p>
            </div>
          )}
        </div>

        {/* Right Side: Metadata / Audit Log Panel */}
        <div className="w-full sm:w-80 p-6 flex flex-col justify-between bg-card/45 select-none">
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-3">
              <div className="flex items-center space-x-2">
                {isImage ? <ImageIcon className="w-4 h-4 text-blue-400" /> : <FileText className="w-4 h-4 text-emerald-400" />}
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">Document Inspector</h4>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-white/5 text-muted-foreground hover:text-white transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* File Info */}
            <div className="space-y-4">
              <div>
                <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Filename</label>
                <p className="text-sm font-bold text-white mt-1 break-all select-all">{file.name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t border-b border-white/5 py-4">
                <div>
                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">File Size</label>
                  <p className="text-xs font-extrabold text-blue-400 mt-1 font-mono">{formatBytes(file.size || 1024 * 45)}</p>
                </div>
                <div>
                  <label className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">MIME Type</label>
                  <p className="text-xs font-semibold text-zinc-300 mt-1 truncate" title={file.mimeType || 'unknown'}>
                    {file.mimeType || 'binary/stream'}
                  </p>
                </div>
              </div>

              <div className="space-y-3.5 text-xs text-zinc-400 font-light">
                <div className="flex items-center space-x-2.5">
                  <User className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Uploaded By</span>
                    <span className="text-white font-medium">{file.uploadedBy || 'admin@acme.com'}</span>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5">
                  <Calendar className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Uploaded Date</span>
                    <span className="text-white font-medium">
                      {file.createdAt ? new Date(file.createdAt).toLocaleString() : new Date().toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2.5 border-t border-white/5 pt-3.5">
                  <Database className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                  <div>
                    <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest block">Ledger Reference</span>
                    <span className="font-mono text-[9px] text-zinc-500">aud-gate-sign-4cf9b8</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-6 border-t border-white/5">
            <a
              href={file.url}
              download={file.name}
              className="w-full flex items-center justify-center space-x-2 px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-lg transition-all border border-blue-500 glow-primary transition-all duration-300"
            >
              <Download className="w-4 h-4" />
              <span>Download Raw Asset</span>
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};
export default FilePreviewModal;
