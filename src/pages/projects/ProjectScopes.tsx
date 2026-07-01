import React, { useState, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { projectsApi } from '../../services/api/projects';
import { uploadsApi } from '../../services/api/uploads';
import type { Project } from '../../services/api/projects';
import {
  ClipboardList,
  FileText,
  UploadCloud,
  FileCode,
  FileArchive,
  FileSpreadsheet,
  Image as ImageIcon,
  Edit3,
  Check,
  X,
  Loader2,
  Download,
  AlertCircle
} from 'lucide-react';
import axios from 'axios';

export const ProjectScopes: React.FC = () => {
  const { project, refetch: refetchProject } = useOutletContext<{ project: Project; refetch: () => void }>();

  const [isEditing, setIsEditing] = useState(false);
  const [overviewText, setOverviewText] = useState(project.overview || '');
  const [scopesText, setScopesText] = useState(project.scopes || '');
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Upload state
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Consolidated documents query
  const { data: documents = [], isLoading: docsLoading, refetch: refetchDocs } = useQuery({
    queryKey: ['project-all-uploads', project.id],
    queryFn: () => uploadsApi.listAllProjectUploads(project.id),
    enabled: !!project.id,
  });

  // Mutation for updating overview & scopes
  const updateProjectMutation = useMutation({
    mutationFn: (payload: { overview: string; scopes: string }) =>
      projectsApi.update(project.id, payload),
    onSuccess: () => {
      refetchProject();
      setIsEditing(false);
      setUpdateError(null);
    },
    onError: (err: any) => {
      setUpdateError(err.response?.data?.message || 'Failed to save project details');
    }
  });

  const handleSave = () => {
    updateProjectMutation.mutate({
      overview: overviewText.trim(),
      scopes: scopesText.trim()
    });
  };

  const handleCancel = () => {
    setOverviewText(project.overview || '');
    setScopesText(project.scopes || '');
    setIsEditing(false);
    setUpdateError(null);
  };

  // Upload handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploading(true);
    setProgress(0);
    setUploadError(null);

    try {
      await uploadsApi.upload(
        'PROJECT',
        project.id,
        files,
        (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total || 1)
          );
          setProgress(percentCompleted);
        }
      );
      refetchDocs();
    } catch (err) {
      console.error(err);
      let msg = 'Upload failed. Please check file format and size limits.';
      if (axios.isAxiosError(err)) {
        msg = err.response?.data?.message || err.message || msg;
      }
      setUploadError(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const filesArray = Array.from(e.dataTransfer.files);
      processFiles(filesArray);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const filesArray = Array.from(e.target.files);
      processFiles(filesArray);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleDownload = async (fileId: string) => {
    try {
      setDownloadingFileId(fileId);
      const { downloadUrl } = await uploadsApi.getDownloadUrl(fileId);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.target = '_self';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error(err);
      setUploadError('Failed to prepare download URL.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  // Helper formatting functions
  const formatBytes = (bytes: number, decimals = 1) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return <ImageIcon className="w-5 h-5 text-indigo-400" />;
    if (mimeType === 'application/pdf') return <FileText className="w-5 h-5 text-rose-400" />;
    if (
      mimeType.includes('word') ||
      mimeType.includes('document')
    ) {
      return <FileText className="w-5 h-5 text-blue-400" />;
    }
    if (mimeType.includes('excel') || mimeType.includes('sheet')) {
      return <FileSpreadsheet className="w-5 h-5 text-emerald-400" />;
    }
    if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) {
      return <FileArchive className="w-5 h-5 text-amber-400" />;
    }
    return <FileCode className="w-5 h-5 text-slate-400" />;
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      
      {/* Left Column: Scope Statement & Objectives */}
      <div className="lg:col-span-2 space-y-6">
        <div className="glass-panel rounded-2xl p-6 border border-border/80 relative">
          <div className="flex justify-between items-center pb-4 border-b border-border/60 mb-5">
            <div className="flex items-center space-x-2">
              <ClipboardList className="w-5 h-5 text-blue-500" />
              <h2 className="text-base font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider">
                Scopes & Objectives
              </h2>
            </div>
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 text-xs font-semibold cursor-pointer transition-all border border-blue-500/10"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit Scope</span>
              </button>
            )}
          </div>

          {updateError && (
            <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 mb-4 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{updateError}</span>
            </div>
          )}

          {isEditing ? (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-300">
                  Project Overview
                </label>
                <textarea
                  className="w-full bg-slate-50 dark:bg-background border border-border/80 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-150 focus:outline-none focus:border-blue-500 min-h-[120px] resize-y font-light leading-relaxed"
                  value={overviewText}
                  onChange={(e) => setOverviewText(e.target.value)}
                  placeholder="Summarize the project's background context, core objectives, and mission..."
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-800 dark:text-zinc-300">
                  Detailed Scopes & Inclusions
                </label>
                <textarea
                  className="w-full bg-slate-50 dark:bg-background border border-border/80 rounded-xl px-4 py-3 text-xs text-slate-900 dark:text-zinc-150 focus:outline-none focus:border-blue-500 min-h-[160px] resize-y font-light leading-relaxed"
                  value={scopesText}
                  onChange={(e) => setScopesText(e.target.value)}
                  placeholder="Define strict scope boundaries, key deliverables, inclusions, and objectives..."
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  onClick={handleCancel}
                  disabled={updateProjectMutation.isPending}
                  className="px-4 py-2 border border-border/80 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-xs font-bold text-slate-700 dark:text-zinc-300 cursor-pointer transition disabled:opacity-50"
                >
                  <span className="flex items-center space-x-1.5">
                    <X className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateProjectMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold cursor-pointer transition active:scale-95 flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {updateProjectMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-slate-800 dark:text-zinc-400 uppercase tracking-widest">
                  Overview
                </h3>
                {project.overview ? (
                  <p className="text-xs font-light text-slate-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {project.overview}
                  </p>
                ) : (
                  <p className="text-xs font-light text-zinc-400 italic">
                    No overview description specified. Click Edit Scope to define this statement.
                  </p>
                )}
              </div>

              <div className="space-y-2 pt-4 border-t border-border/40">
                <h3 className="text-xs font-bold text-slate-800 dark:text-zinc-400 uppercase tracking-widest">
                  Scope boundaries & Objectives
                </h3>
                {project.scopes ? (
                  <p className="text-xs font-light text-slate-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {project.scopes}
                  </p>
                ) : (
                  <p className="text-xs font-light text-zinc-400 italic">
                    Scope inclusions have not been defined yet. Detail scope lists, exclusions, and deliverables to ensure alignment.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Files & Uploads workspace */}
      <div className="space-y-6">
        
        {/* Document Uploader */}
        <div className="glass-panel rounded-2xl p-5 border border-border/80">
          <h3 className="text-xs font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">
            Upload Workspace File
          </h3>

          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={triggerFileSelect}
            className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all duration-200 ${
              dragActive
                ? 'border-blue-500 bg-blue-500/5'
                : 'border-border hover:border-slate-350 hover:bg-slate-50 dark:hover:bg-white/5'
            }`}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              multiple
            />
            {uploading ? (
              <div className="space-y-3 py-2">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                <div className="text-xs font-semibold text-slate-700 dark:text-zinc-300">
                  Uploading files ({progress}%)
                </div>
                <div className="w-full bg-slate-100 dark:bg-white/5 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2 py-1">
                <UploadCloud className="w-9 h-9 text-slate-400 mx-auto" />
                <p className="text-xs text-slate-800 dark:text-zinc-300 font-semibold">
                  Drag & Drop files here
                </p>
                <p className="text-[10px] text-muted-foreground font-light">
                  Supports PDF, DOCX, XLS, PNG, JPEG, TXT up to 10MB
                </p>
              </div>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center space-x-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl p-3 mt-4 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{uploadError}</span>
            </div>
          )}
        </div>

        {/* Consolidated Files List */}
        <div className="glass-panel rounded-2xl p-5 border border-border/80">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xs font-extrabold text-zinc-900 dark:text-white uppercase tracking-wider">
              Consolidated Documents
            </h3>
            <span className="text-[10px] bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-full text-slate-500 font-bold">
              {documents.length}
            </span>
          </div>

          {docsLoading ? (
            <div className="flex flex-col items-center justify-center py-10 space-y-2">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-light animate-pulse">
                Fetching archives...
              </span>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-border/50 rounded-xl">
              <FileText className="w-8 h-8 text-slate-400 mx-auto opacity-40 mb-2" />
              <p className="text-xs text-muted-foreground font-light">No documents uploaded yet</p>
            </div>
          ) : (
            <div className="max-h-[350px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
              {documents.map((doc: any) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-border bg-slate-50/50 dark:bg-white/2 hover:bg-slate-100/50 dark:hover:bg-white/5 transition-all"
                >
                  <div className="flex items-center space-x-3 truncate">
                    <div className="shrink-0">{getFileIcon(doc.mimeType)}</div>
                    <div className="truncate">
                      <p
                        onClick={() => handleDownload(doc.id)}
                        className="text-xs font-semibold text-slate-800 dark:text-zinc-200 hover:text-blue-500 dark:hover:text-blue-400 transition cursor-pointer truncate"
                        title="Click to download file"
                      >
                        {doc.originalName}
                      </p>
                      <div className="flex items-center space-x-2 text-[9px] text-muted-foreground mt-0.5 font-light">
                        <span>{formatBytes(doc.size)}</span>
                        <span>•</span>
                        <span
                          className={`font-semibold ${
                            doc.entityType === 'TASK'
                              ? 'text-purple-400'
                              : doc.entityType === 'GATE'
                              ? 'text-pink-400'
                              : 'text-blue-400'
                          }`}
                        >
                          {doc.sourceName}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDownload(doc.id)}
                    disabled={downloadingFileId === doc.id}
                    className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 hover:text-white transition cursor-pointer shrink-0 ml-2"
                  >
                    {downloadingFileId === doc.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProjectScopes;
