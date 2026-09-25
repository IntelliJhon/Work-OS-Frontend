import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Clock,
  Languages,
  ListPlus,
  Loader2,
  RotateCcw,
  User,
  XCircle,
  CheckCircle2,
  UserSearch,
  CalendarClock,
  Keyboard,
} from 'lucide-react';
import type { VoiceNote } from '../../services/api/voiceNotes';

interface VoiceNoteCardProps {
  note: VoiceNote;
  canUpdate: boolean;
  canCreateTask: boolean;
  isBusy: boolean;
  onCreateTask: (note: VoiceNote) => void;
  onDismiss: (note: VoiceNote) => void;
  onRestore: (note: VoiceNote) => void;
}

const isPlayableUrl = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

/** "25 Sep, 5:00 pm" from the local date/time stored on the note (no timezone shifting). */
const formatDue = (dueDate: string, dueTime: string | null): string => {
  const [y, m, d] = dueDate.split('-').map(Number);
  const [h, min] = (dueTime || '00:00').split(':').map(Number);
  const when = new Date(y, m - 1, d, h, min);
  const date = when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return dueTime ? `${date}, ${when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : date;
};

export const VoiceNoteCard: React.FC<VoiceNoteCardProps> = ({
  note,
  canUpdate,
  canCreateTask,
  isBusy,
  onCreateTask,
  onDismiss,
  onRestore,
}) => {
  const [showOriginal, setShowOriginal] = useState(false);
  const isUnclear = note.status === 'unclear';
  const hasOriginal = !!note.originalTranscript && note.originalTranscript.trim() !== note.englishText.trim();
  const sender = note.senderName || note.senderPhone;
  // Work typed on WhatsApp instead of spoken: stored the same way, without audio
  const isTyped = !note.audioUrl;

  const actionBtn =
    'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';

  return (
    <div
      className={`glass-panel rounded-2xl p-5 border space-y-4 ${
        isUnclear ? 'border-amber-500/30 bg-amber-500/5' : 'border-border bg-card/40'
      }`}
    >
      {/* Meta */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-muted-foreground font-medium">
        {isUnclear && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 dark:text-amber-400 font-bold uppercase tracking-wider">
            <AlertTriangle className="w-3 h-3" />
            Unclear
          </span>
        )}
        {note.status === 'converted' && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 font-bold uppercase tracking-wider">
            <CheckCircle2 className="w-3 h-3" />
            {note.workId ? `${note.workId}${note.taskAssigneeName ? ` → ${note.taskAssigneeName}` : ''}` : 'Task created'}
          </span>
        )}
        {note.status === 'awaiting_assignee' && (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-500 dark:text-blue-400 font-bold uppercase tracking-wider">
            <UserSearch className="w-3 h-3" />
            {note.assigneeName ? `Who is "${note.assigneeName}"?` : 'Needs assignee'}
          </span>
        )}
        {note.dueDate && (
          <span className="flex items-center gap-1">
            <CalendarClock className="w-3 h-3" />
            Due {formatDue(note.dueDate, note.dueTime)}
          </span>
        )}
        <span className="flex items-center gap-1">
          <User className="w-3 h-3" />
          {sender}
        </span>
        {isTyped && (
          <span className="flex items-center gap-1">
            <Keyboard className="w-3 h-3" />
            Typed
          </span>
        )}
        {note.detectedLanguage && (
          <span className="flex items-center gap-1">
            <Languages className="w-3 h-3" />
            {note.detectedLanguage}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(note.createdAt).toLocaleString()}
        </span>
      </div>

      {/* English text */}
      {note.englishText ? (
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">{note.englishText}</p>
      ) : (
        <p className="text-sm text-amber-500 dark:text-amber-400 italic">
          The voice note could not be transcribed clearly. Listen to the recording below.
        </p>
      )}

      {/* Original transcript */}
      {hasOriginal && (
        <div>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            aria-expanded={showOriginal}
            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-all cursor-pointer"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showOriginal ? 'rotate-180' : ''}`} />
            {isTyped ? 'Original message' : 'Original transcript'}
          </button>
          {showOriginal && (
            <p className="mt-2 p-3 rounded-xl bg-muted/50 border border-border text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
              {note.originalTranscript}
            </p>
          )}
        </div>
      )}

      {/* Audio */}
      {isPlayableUrl(note.audioUrl) && (
        <audio controls preload="none" src={note.audioUrl} className="w-full h-9">
          Your browser does not support audio playback.
        </audio>
      )}

      {/* Actions */}
      {canUpdate && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-border">
          {isBusy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mr-auto" />}

          {(note.status === 'new' || note.status === 'unclear' || note.status === 'awaiting_assignee') && (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => onDismiss(note)}
                className={`${actionBtn} bg-muted hover:bg-accent text-muted-foreground hover:text-foreground`}
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>Dismiss</span>
              </button>
              {canCreateTask && (
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onCreateTask(note)}
                  className={`${actionBtn} bg-blue-600 hover:bg-blue-500 text-white`}
                >
                  <ListPlus className="w-3.5 h-3.5" />
                  <span>Create task</span>
                </button>
              )}
            </>
          )}

          {note.status === 'dismissed' && (
            <button
              type="button"
              disabled={isBusy}
              onClick={() => onRestore(note)}
              className={`${actionBtn} bg-muted hover:bg-accent text-muted-foreground hover:text-foreground`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Restore</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
