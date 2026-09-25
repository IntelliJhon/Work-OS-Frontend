import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mic, Loader2, Inbox, AlertTriangle } from 'lucide-react';
import { voiceNotesApi, getVoiceApiError } from '../../services/api/voiceNotes';
import type { VoiceNote, VoiceNoteStatus } from '../../services/api/voiceNotes';
import { tasksApi } from '../../services/api/tasks.api';
import { usersApi } from '../../services/api/users';
import { usePermissions } from '../../features/auth/usePermissions';
import { PERMISSIONS } from '../../features/auth/permission.constants';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { CreateTaskModal } from '../tasks/TasksPage';
import { VoiceNoteCard } from './VoiceNoteCard';
import { useVoiceNotesList, VOICE_NOTES_KEY } from './useVoiceNotes';

const TABS: { status: VoiceNoteStatus; label: string }[] = [
  { status: 'new', label: 'New' },
  { status: 'awaiting_assignee', label: 'Needs assignee' },
  { status: 'unclear', label: 'Unclear' },
  { status: 'converted', label: 'Converted' },
  { status: 'dismissed', label: 'Dismissed' },
];

const EMPTY_MESSAGES: Record<VoiceNoteStatus, string> = {
  new: 'No new voice notes. Notes sent from the verified WhatsApp number appear here.',
  awaiting_assignee: 'No voice notes waiting for an employee name.',
  unclear: 'No unclear voice notes.',
  converted: 'No voice notes have been converted to tasks yet.',
  dismissed: 'No dismissed voice notes.',
};

/** Short task title from the note: first sentence, capped to fit comfortably under the 255-char limit. */
const deriveTaskName = (note: VoiceNote): string => {
  const text = (note.englishText || note.originalTranscript || '').trim();
  if (!text) return `Voice note from ${note.senderName || note.senderPhone}`;
  const firstSentence = text.split(/(?<=[.!?])\s|\n/)[0].trim();
  return firstSentence.length > 120 ? `${firstSentence.slice(0, 117).trimEnd()}...` : firstSentence;
};

export const VoiceNotesPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canUpdate = can(PERMISSIONS.VOICE_NOTES_UPDATE);
  const canCreateTask = can(PERMISSIONS.TASK_CREATE);

  const [activeTab, setActiveTab] = useState<VoiceNoteStatus>('new');
  const [taskSource, setTaskSource] = useState<VoiceNote | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading, isError, error, fetchNextPage, hasNextPage, isFetchingNextPage } = useVoiceNotesList(activeTab);
  const notes = useMemo(() => data?.pages.flatMap((p) => p.data) ?? [], [data]);
  const counts = data?.pages[0]?.counts;

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await usersApi.list({ limit: 1000 });
      return Array.isArray(res) ? res : [];
    },
    enabled: canCreateTask,
  });

  const refreshNotes = () => queryClient.invalidateQueries({ queryKey: VOICE_NOTES_KEY });

  const updateStatus = useMutation({
    mutationFn: ({ note, status }: { note: VoiceNote; status: VoiceNoteStatus }) =>
      voiceNotesApi.update(note.id, { status }),
    onMutate: ({ note }) => setBusyId(note.id),
    onSuccess: (_updated, { status }) => {
      toast.success(status === 'dismissed' ? 'Voice note dismissed.' : 'Voice note restored to New.');
      refreshNotes();
    },
    onError: (err) => toast.error(getVoiceApiError(err, 'Could not update the voice note.'), 'Voice Notes'),
    onSettled: () => setBusyId(null),
  });

  const removeNote = useMutation({
    mutationFn: (note: VoiceNote) => voiceNotesApi.remove(note.id),
    onMutate: (note) => setBusyId(note.id),
    onSuccess: () => {
      toast.success('Voice note deleted.');
      refreshNotes();
    },
    onError: (err) => toast.error(getVoiceApiError(err, 'Could not delete the voice note.'), 'Voice Notes'),
    onSettled: () => setBusyId(null),
  });

  const handleDelete = async (note: VoiceNote) => {
    const ok = await confirm({
      title: 'Delete this voice note?',
      message: 'It will be removed permanently from Work OS. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) removeNote.mutate(note);
  };

  const handleCreateTask = async (taskData: {
    name: string;
    description: string;
    assigneeId: string;
    priority: string;
    dueDate: string;
    timeEstimate?: number | null;
  }) => {
    const note = taskSource;
    if (!note) return;

    let taskId: string;
    try {
      // Same payload shape as a workspace task created from the Tasks page
      const task = await tasksApi.create({
        projectId: null,
        storyId: null,
        sprintId: null,
        assigneeId: taskData.assigneeId || null,
        name: taskData.name,
        description: taskData.description || undefined,
        status: 'to_do',
        timeEstimate: taskData.timeEstimate,
        customFields: {
          priority: taskData.priority as 'low' | 'medium' | 'high' | 'critical',
          dueDate: taskData.dueDate || undefined,
          storyPoints: 0,
          subtasks: [],
          createdFrom: 'sidebar',
          source: 'voice_note',
          voiceNoteId: note.id,
        } as any,
      });
      taskId = task.id;
    } catch (err) {
      toast.error(getVoiceApiError(err, 'Could not create the task.'), 'Tasks');
      throw err; // keep the modal open so nothing typed is lost
    }

    queryClient.invalidateQueries({ queryKey: ['tasks'] });

    // The task exists now; never rethrow from here, or a retry would create a duplicate task.
    try {
      await voiceNotesApi.update(note.id, { taskId });
      toast.success('Task created from voice note.', 'Voice Notes');
    } catch (err) {
      toast.warning(
        `The task was created, but the voice note could not be marked as converted: ${getVoiceApiError(err, 'unknown error')}`,
        'Voice Notes',
        7000,
      );
    }
    refreshNotes();
  };

  const taskInitialValues = useMemo(
    () =>
      taskSource
        ? {
            name: taskSource.taskTitle || deriveTaskName(taskSource),
            description: taskSource.englishText || taskSource.originalTranscript || '',
            dueDate: taskSource.dueDate || '',
            // Preselect only when there is exactly one likely employee
            assigneeId: taskSource.assigneeCandidates?.length === 1 ? taskSource.assigneeCandidates[0].id : '',
          }
        : undefined,
    [taskSource],
  );

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start gap-3">
        <span className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <Mic className="w-5 h-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Voice Notes</h1>
          <p className="text-xs text-muted-foreground mt-1 font-light">
            Work sent on WhatsApp from your workspace's verified number, as voice notes or typed messages, translated to English.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-2">
        {TABS.map((tab) => {
          const isActive = tab.status === activeTab;
          const count = counts?.[tab.status];
          return (
            <button
              key={tab.status}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setActiveTab(tab.status)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                isActive
                  ? 'bg-blue-600/10 border-blue-500/30 text-blue-400'
                  : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
            >
              <span>{tab.label}</span>
              {count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                    (tab.status === 'unclear' || tab.status === 'awaiting_assignee') && count > 0
                      ? 'bg-amber-500/15 text-amber-500 dark:text-amber-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="glass-panel rounded-2xl p-10 border border-border bg-card/40 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
        </div>
      ) : isError ? (
        <div className="glass-panel rounded-2xl p-6 border border-rose-500/20 bg-rose-500/5 flex items-center gap-3 text-xs text-rose-400">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{getVoiceApiError(error, 'Failed to load voice notes.')}</span>
        </div>
      ) : notes.length === 0 ? (
        <div className="glass-panel rounded-2xl p-10 border border-border bg-card/40 flex flex-col items-center text-center gap-3">
          <Inbox className="w-8 h-8 text-muted-foreground" />
          <p className="text-xs text-muted-foreground max-w-sm">{EMPTY_MESSAGES[activeTab]}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map((note) => (
            <VoiceNoteCard
              key={note.id}
              note={note}
              canUpdate={canUpdate}
              canCreateTask={canCreateTask}
              isBusy={busyId === note.id}
              onCreateTask={setTaskSource}
              onDismiss={(n) => updateStatus.mutate({ note: n, status: 'dismissed' })}
              onRestore={(n) => updateStatus.mutate({ note: n, status: 'new' })}
              onDelete={handleDelete}
            />
          ))}
          {hasNextPage && (
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-muted hover:bg-accent text-muted-foreground hover:text-foreground text-xs font-bold transition-all disabled:opacity-50 cursor-pointer"
              >
                {isFetchingNextPage && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Load more</span>
              </button>
            </div>
          )}
        </div>
      )}

      <CreateTaskModal
        isOpen={!!taskSource}
        onClose={() => setTaskSource(null)}
        users={users}
        onCreate={handleCreateTask}
        initialValues={taskInitialValues}
      />
    </div>
  );
};

export default VoiceNotesPage;
