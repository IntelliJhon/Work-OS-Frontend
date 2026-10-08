import { useCallback, useEffect, useRef, useState } from 'react';

// The browser's own recorder (MediaRecorder) for voice messages in group chats: Android records WebM, iPhone MP4.

export const MAX_VOICE_MS = 5 * 60_000;

/** m:ss */
export const clock = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const pickType = () => {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported?.(t)) return t;
  }
  return '';
};

const extFor = (mime: string) => (mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm');

/** Why recording could not start, in words people can act on */
function micProblem(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone is blocked. Allow it for this site (tap the lock icon next to the address, then Microphone) and try again.';
  }
  if (name === 'NotFoundError') return 'No microphone was found on this device.';
  if (name === 'NotReadableError') return 'The microphone is being used by another app. Close it and try again.';
  return 'Could not start recording on this browser.';
}

export interface Recording { file: File; durationMs: number }

/** Records one voice message: start → stop (gives the file) or cancel */
export function useVoiceRecorder(onLimit: () => void) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<number | null>(null);
  const finish = useRef<((r: Recording | null) => void) | null>(null);
  const limitRef = useRef(onLimit);
  useEffect(() => { limitRef.current = onLimit; }, [onLimit]);

  const cleanup = useCallback(() => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
    recorder.current?.stream.getTracks().forEach((t) => t.stop());
    recorder.current = null;
    setRecording(false);
    setElapsed(0);
  }, []);

  useEffect(() => () => { finish.current = null; if (recorder.current?.state === 'recording') recorder.current.stop(); cleanup(); }, [cleanup]);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && pickType() !== null;

  const start = async () => {
    if (!supported) throw new Error('This browser cannot record voice messages. Please use Chrome, Edge or Safari.');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (err) {
      throw new Error(micProblem(err), { cause: err });
    }
    const type = pickType() || undefined;
    const rec = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.current.push(e.data); };
    rec.onstop = () => {
      const durationMs = Date.now() - startedAt.current;
      const mime = rec.mimeType || type || 'audio/webm';
      const blob = new Blob(chunks.current, { type: mime });
      cleanup();
      const done = finish.current;
      finish.current = null;
      done?.(blob.size ? { file: new File([blob], `voice.${extFor(mime)}`, { type: mime }), durationMs } : null);
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
    setRecording(true);
    setElapsed(0);
    timer.current = window.setInterval(() => {
      const ms = Date.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= MAX_VOICE_MS) limitRef.current();
    }, 250);
  };

  /** Stops and gives the recording (null when nothing was recorded) */
  const stop = () => new Promise<Recording | null>((resolve) => {
    const rec = recorder.current;
    if (!rec || rec.state === 'inactive') return resolve(null);
    finish.current = resolve;
    rec.stop();
  });

  const cancel = () => {
    finish.current = null;
    const rec = recorder.current;
    if (rec && rec.state !== 'inactive') rec.stop();
    else cleanup();
  };

  return { supported, recording, elapsed, start, stop, cancel };
}
