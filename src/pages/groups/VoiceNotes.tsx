import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Send, Trash2 } from 'lucide-react';
import { groupsApi } from '../../services/api/groups';
import { MAX_VOICE_MS, clock } from './useVoiceRecorder';

// Voice messages in group chats, recorded with the browser's own recorder (MediaRecorder): Android records WebM,
// iPhone MP4. The server keeps the recording; playback goes through an MP3 link that every browser can play.

/** The bar shown in place of the message box while recording */
export const RecordingBar: React.FC<{ elapsed: number; sending: boolean; onCancel: () => void; onSend: () => void }> = ({ elapsed, sending, onCancel, onSend }) => (
  <div className="flex items-center gap-2 w-full" role="status" aria-live="polite">
    <button type="button" onClick={onCancel} disabled={sending} aria-label="Delete recording" className="p-2.5 rounded-xl text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer disabled:opacity-40">
      <Trash2 className="w-5 h-5" />
    </button>
    <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border border-red-500/30 bg-red-500/5 text-sm">
      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
      <span className="font-semibold tabular-nums text-foreground">{clock(elapsed)}</span>
      <span className="text-xs text-muted-foreground truncate">Recording… up to {clock(MAX_VOICE_MS)}</span>
    </div>
    <button type="button" onClick={onSend} disabled={sending} aria-label="Send voice message" className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-40">
      {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
    </button>
  </div>
);

export const MicButton: React.FC<{ onClick: () => void; disabled?: boolean }> = ({ onClick, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} aria-label="Record a voice message" title="Record a voice message"
    className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white cursor-pointer disabled:opacity-40">
    <Mic className="w-5 h-5" />
  </button>
);

const SPEEDS = [1, 1.5, 2];

/** Play button, progress and speed for a voice message (the link is fetched on first play) */
export const VoicePlayer: React.FC<{ groupId: string; uploadId: string; durationMs?: number; mine: boolean; onError: (msg: string) => void }> = ({ groupId, uploadId, durationMs, mine, onError }) => {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [mediaMs, setMediaMs] = useState(0);
  const total = mediaMs || durationMs || 0;

  useEffect(() => () => { audio.current?.pause(); }, []);

  const toggle = async () => {
    if (audio.current && !audio.current.paused) { audio.current.pause(); return; }
    if (!audio.current) {
      setLoading(true);
      try {
        const url = await groupsApi.fileUrl(groupId, uploadId);
        const el = new Audio(url);
        el.preload = 'auto';
        el.playbackRate = speed;
        el.ontimeupdate = () => setPos(el.currentTime * 1000);
        el.onloadedmetadata = () => { if (Number.isFinite(el.duration)) setMediaMs(el.duration * 1000); };
        el.onplay = () => setPlaying(true);
        el.onpause = () => setPlaying(false);
        el.onended = () => { setPlaying(false); setPos(0); };
        el.onerror = () => { setPlaying(false); setLoading(false); onError('Could not play this voice message.'); };
        audio.current = el;
      } catch {
        setLoading(false);
        onError('Could not load this voice message.');
        return;
      }
    }
    try {
      await audio.current.play();
    } catch {
      onError('Could not play this voice message.');
    } finally {
      setLoading(false);
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audio.current || !total) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.current.currentTime = (ratio * total) / 1000;
    setPos(ratio * total);
  };

  const nextSpeed = () => {
    const s = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(s);
    if (audio.current) audio.current.playbackRate = s;
  };

  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  const tone = mine ? 'text-white' : 'text-foreground';
  return (
    <div className={`flex items-center gap-2.5 w-60 max-w-full px-2.5 py-2 rounded-xl ${mine ? 'bg-white/15' : 'bg-muted'}`}>
      <button type="button" onClick={toggle} aria-label={playing ? 'Pause voice message' : 'Play voice message'}
        className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center cursor-pointer ${mine ? 'bg-white text-blue-600' : 'bg-blue-600 text-white'}`}>
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div onClick={seek} role="presentation" className={`h-1.5 rounded-full cursor-pointer ${mine ? 'bg-white/30' : 'bg-foreground/15'}`}>
          <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-blue-600'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`flex justify-between mt-1 text-[10px] tabular-nums ${mine ? 'text-white/80' : 'text-muted-foreground'}`}>
          <span>{playing || pos ? clock(pos) : '🎤 Voice'}</span>
          <span>{total ? clock(total) : ''}</span>
        </div>
      </div>
      <button type="button" onClick={nextSpeed} aria-label={`Playback speed ${speed}×`}
        className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${tone} ${mine ? 'bg-white/20' : 'bg-foreground/10'}`}>
        {speed}×
      </button>
    </div>
  );
};
