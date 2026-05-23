import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { uploadsApi } from '../../services/api/uploads';
import { PermissionGate } from '../../features/auth/PermissionGate';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  Loader2,
  Download
} from 'lucide-react';

interface DragDropUploadProps {
  entityType: 'TASK' | 'GATE' | 'PROJECT' | 'PHASE' | 'SPRINT';
  entityId: string;
  onUploadSuccess?: () => void;
}

export const DragDropUpload: React.FC<DragDropUploadProps> = ({
  entityType,
  entityId,
  onUploadSuccess
}) => {
  const queryClient = useQueryClient();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Query to fetch existing uploads for this entity
  const { data: uploads = [], isLoading, refetch } = useQuery({
    queryKey: ['uploads', entityType, entityId],
    queryFn: () => uploadsApi.listByEntity(entityType, entityId),
    enabled: !!entityId,
  });

  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      setUploading(true);
      setProgress(0);
      setErrorMsg(null);
      return uploadsApi.upload(
        entityType,
        entityId,
        files,
        (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total || 1));
          setProgress(percentCompleted);
        }
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['uploads', entityType, entityId] });
      refetch();
      if (onUploadSuccess) onUploadSuccess();
      setUploading(false);
      setProgress(0);
    },
    onError: (error: unknown) => {
      setUploading(false);
      setProgress(0);
      let message = 'File upload failed. Please try again.';
      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message || error.message || message;
      }
      setErrorMsg(message);
    }
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndUpload = (files: FileList) => {
    const fileList: File[] = [];
    const maxSizeBytes = 10 * 1024 * 1024; // 10MB
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'image/png',
      'image/jpeg',
      'image/jpg'
    ];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSizeBytes) {
        setErrorMsg(`File "${file.name}" exceeds the 10MB limit.`);
        return;
      }
      if (!allowedMimeTypes.includes(file.type) && 
          !file.name.endsWith('.pdf') && 
          !file.name.endsWith('.doc') && 
          !file.name.endsWith('.docx') && 
          !file.name.endsWith('.txt') && 
          !file.name.endsWith('.png') && 
          !file.name.endsWith('.jpg') && 
          !file.name.endsWith('.jpeg')) {
        setErrorMsg(`File "${file.name}" has an unsupported format. (Allowed: PDF, Word, TXT, PNG, JPEG)`);
        return;
      }
      fileList.push(file);
    }

    if (fileList.length > 0) {
      uploadMutation.mutate(fileList);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndUpload(e.dataTransfer.files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndUpload(e.target.files);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  return (
    <div className="space-y-4">
      {/* Upload Drag Area */}
      <PermissionGate
        permission={PERMISSIONS.TASK_CREATE}
        behavior="disable"
        tooltipMessage="Only authorized team members can upload compliance evidence"
      >
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`relative border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center transition-all ${
            dragActive 
              ? 'border-blue-500 bg-blue-500/5 glow-primary' 
              : 'border-border bg-white/5 hover:bg-white/10 hover:border-zinc-500'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            onChange={handleChange}
            accept=".pdf,.doc,.docx,.txt,image/png,image/jpeg,image/jpg"
          />

          {uploading ? (
            <div className="flex flex-col items-center space-y-3 w-full py-4">
              <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
              <div className="w-full max-w-xs space-y-1.5">
                <div className="flex justify-between text-xs font-bold text-zinc-400">
                  <span>Uploading files...</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                  <div 
                    className="bg-blue-500 h-full rounded-full transition-all duration-100" 
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center space-y-2 flex flex-col items-center cursor-pointer" onClick={onButtonClick}>
              <div className="p-3 rounded-full bg-white/5 border border-white/10 text-muted-foreground group-hover:text-white transition-all">
                <UploadCloud className="w-8 h-8 text-blue-400" />
              </div>
              <div>
                <p className="text-xs font-semibold text-white">
                  Drag and drop your evidence here, or <span className="text-blue-400 underline">browse</span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  Supports PDF, Word, TXT, PNG, JPEG (Max 10MB per file)
                </p>
              </div>
            </div>
          )}
        </div>
      </PermissionGate>

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-center space-x-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <AlertCircle className="w-4.5 h-4.5 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Uploaded Evidence list */}
      <div className="space-y-2">
        <h5 className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
          Evidence Attachments ({uploads.length})
        </h5>
        
        {isLoading ? (
          <div className="space-y-1.5">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 rounded-lg bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : uploads.length === 0 ? (
          <p className="text-xs text-zinc-500 font-light italic">No evidence uploaded yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {uploads.map((file) => (
              <div 
                key={file.id} 
                className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 border border-white/5 text-xs hover:bg-white/10 transition-all"
              >
                <div className="flex items-center space-x-2.5 min-w-0">
                  <FileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-white font-semibold truncate max-w-[200px]" title={file.originalName}>
                      {file.originalName}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-light">
                      {formatBytes(file.size)} • {new Date(file.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-1">
                  <a
                    href={file.publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded hover:bg-white/5 text-zinc-400 hover:text-white transition-all"
                    title="Download Evidence File"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
