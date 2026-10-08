import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, CheckCheck, CornerUpLeft, FileText, Image as ImageIcon, Info, ListChecks, Loader2, LogOut, MessagesSquare, Paperclip, Pin, PinOff, Plus, Search, Send, Shield, Sparkles, Trash2, UserPlus, X,
} from 'lucide-react';
import { CreateTaskModal, PinnedModal, SearchModal, SummaryModal } from './GroupTools';
import { useAuthStore } from '../../store/authStore';
import { useToast } from '../../components/ui/Toast';
import { useConfirm } from '../../components/ui/ConfirmDialog';
import { useSocketEvent } from '../../services/socket/socket-events';
import { MicButton, RecordingBar, VoicePlayer } from './VoiceNotes';
import { useVoiceRecorder, type Recording } from './useVoiceRecorder';
import { fileLabel, fileSize, groupsApi, type ChatAttachment, type ChatMessage, type GroupDetail, type GroupSummary } from '../../services/api/groups';

// ─── Groups ─────────────────────────────────────────────────────────────────────
// Company group chats, like WhatsApp groups: Admins and Project Managers create a group and add members, who
// message each other with text, @mentions and files. New messages arrive live.

const apiError = (err: any, fallback: string) => err?.response?.data?.error || fallback;
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const COLORS = ['text-blue-600', 'text-emerald-600', 'text-fuchsia-600', 'text-amber-600', 'text-sky-600', 'text-rose-600', 'text-indigo-600', 'text-teal-600'];
const BG = ['bg-blue-500', 'bg-emerald-500', 'bg-fuchsia-500', 'bg-amber-500', 'bg-sky-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?';

const timeLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString();
  if (yesterday) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (new Date(now.getTime() - 86_400_000).toDateString() === d.toDateString()) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' });
};

const Avatar: React.FC<{ name: string; size?: string }> = ({ name, size = 'w-10 h-10 text-sm' }) => (
  <span className={`${size} ${BG[hash(name) % BG.length]} rounded-full text-white font-bold flex items-center justify-center shrink-0`} aria-hidden>
    {initials(name)}
  </span>
);

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-background/70 backdrop-blur-sm overflow-y-auto" role="dialog" aria-modal="true" aria-label={title}>
    <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl my-8">
      <div className="flex items-center justify-between gap-3 p-5 border-b border-border">
        <h2 className="text-base font-bold text-foreground truncate">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

const inputClass = 'w-full px-3 py-2 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/50';
const primaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold disabled:opacity-50 cursor-pointer';
const secondaryButton = 'flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer';

// ─── People picker ───────────────────────────────────────────────────────────────

const PeoplePicker: React.FC<{ exclude: string[]; selected: string[]; onChange: (ids: string[]) => void }> = ({ exclude, selected, onChange }) => {
  const [q, setQ] = useState('');
  const { data: everyone = [], isLoading } = useQuery({ queryKey: ['groups', 'people'], queryFn: groupsApi.people, staleTime: 60_000 });
  const list = everyone.filter((p) => !exclude.includes(p.id) && p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className={`${inputClass} pl-9`} />
      </div>
      <ul className="max-h-60 overflow-y-auto rounded-xl border border-border divide-y divide-border">
        {isLoading ? <li className="p-3 text-xs text-muted-foreground">Loading…</li> : list.length === 0 ? <li className="p-3 text-xs text-muted-foreground">Nobody to add</li> : list.map((p) => (
          <li key={p.id}>
            <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/60">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => onChange(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
              <Avatar name={p.name} size="w-7 h-7 text-[10px]" />
              <span className="text-sm text-foreground">{p.name}</span>
            </label>
          </li>
        ))}
      </ul>
      {selected.length > 0 && <p className="text-[11px] text-muted-foreground">{selected.length} selected</p>}
    </div>
  );
};

const NewGroupModal: React.FC<{ onClose: () => void; onCreated: (id: string) => void }> = ({ onClose, onCreated }) => {
  const { toast } = useToast();
  const me = useAuthStore((s) => s.user);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () => groupsApi.create({ name: name.trim(), description: description.trim() || null, memberIds: members }),
    onSuccess: (g) => { toast.success(`${g.name} created.`, 'Groups'); onCreated(g.id); },
    onError: (err) => toast.error(apiError(err, 'Could not create the group.'), 'Groups'),
  });
  return (
    <Modal title="New group" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (name.trim().length >= 2) create.mutate(); }} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="group-name" className="text-xs font-semibold text-foreground">Group name</label>
          <input id="group-name" autoFocus maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Team" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="group-desc" className="text-xs font-semibold text-foreground">Description (optional)</label>
          <input id="group-desc" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this group for?" className={inputClass} />
        </div>
        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-foreground">Members</span>
          <PeoplePicker exclude={me ? [me.id] : []} selected={members} onChange={setMembers} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Cancel</button>
          <button type="submit" disabled={name.trim().length < 2 || create.isPending} className={primaryButton}>
            {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Create group
          </button>
        </div>
      </form>
    </Modal>
  );
};

// ─── Group info ──────────────────────────────────────────────────────────────────

const GroupInfo: React.FC<{ group: GroupDetail; onClose: () => void; onLeft: () => void }> = ({ group, onClose, onLeft }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState<string[] | null>(null);
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? '');
  const refresh = () => { queryClient.invalidateQueries({ queryKey: ['groups'] }); };
  const run = async (fn: () => Promise<unknown>, done: string) => {
    try { await fn(); toast.success(done, 'Groups'); refresh(); } catch (err) { toast.error(apiError(err, 'Something went wrong.'), 'Groups'); }
  };
  const changed = name.trim() !== group.name || (description.trim() || null) !== (group.description ?? null);

  return (
    <Modal title="Group info" onClose={onClose}>
      <div className="space-y-5">
        {group.canManage ? (
          <div className="space-y-2">
            <input aria-label="Group name" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input aria-label="Description" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className={inputClass} />
            {changed && <button type="button" disabled={name.trim().length < 2} onClick={() => run(() => groupsApi.update(group.id, { name: name.trim(), description: description.trim() || null }), 'Saved.')} className={primaryButton}>Save</button>}
          </div>
        ) : (
          <div>
            <p className="text-base font-bold text-foreground">{group.name}</p>
            {group.description && <p className="text-sm text-muted-foreground mt-1">{group.description}</p>}
          </div>
        )}

        <section>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{group.members.length} members</h3>
            {group.canManage && adding === null && (
              <button type="button" onClick={() => setAdding([])} className="flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 cursor-pointer"><UserPlus className="w-3.5 h-3.5" /> Add people</button>
            )}
          </div>
          {adding !== null && (
            <div className="space-y-2 mb-3">
              <PeoplePicker exclude={group.members.map((m) => m.id)} selected={adding} onChange={setAdding} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setAdding(null)} className={secondaryButton}>Cancel</button>
                <button type="button" disabled={!adding.length} onClick={() => run(async () => { await groupsApi.addMembers(group.id, adding); setAdding(null); }, 'People added.')} className={primaryButton}>Add {adding.length || ''}</button>
              </div>
            </div>
          )}
          <ul className="rounded-xl border border-border divide-y divide-border">
            {group.members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={m.name} size="w-8 h-8 text-xs" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground truncate">{m.name}{m.id === me?.id ? ' (you)' : ''}</p>
                  {m.role === 'admin' && <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Shield className="w-3 h-3" /> Group admin</p>}
                </div>
                {group.canManage && m.id !== me?.id && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => run(() => groupsApi.setRole(group.id, m.id, m.role === 'admin' ? 'member' : 'admin'), m.role === 'admin' ? 'No longer a group admin.' : 'Made group admin.')}
                      className="px-2 py-1 rounded-lg text-[11px] font-semibold text-muted-foreground hover:bg-muted cursor-pointer">
                      {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                    </button>
                    <button type="button" aria-label={`Remove ${m.name}`}
                      onClick={async () => { if (await confirm({ title: `Remove ${m.name}?`, message: 'They will no longer see this group.', confirmLabel: 'Remove', cancelLabel: 'Cancel', variant: 'danger' })) run(() => groupsApi.removeMember(group.id, m.id), `${m.name} removed.`); }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 cursor-pointer"><X className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>

        <div className="flex flex-wrap justify-between gap-2 pt-1">
          <button type="button"
            onClick={async () => { if (me && await confirm({ title: 'Leave this group?', message: 'You will stop getting its messages.', confirmLabel: 'Leave', cancelLabel: 'Stay', variant: 'warning' })) { await run(() => groupsApi.removeMember(group.id, me.id), 'You left the group.'); onLeft(); } }}
            className="flex items-center gap-1.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:underline cursor-pointer"><LogOut className="w-4 h-4" /> Leave group</button>
          {group.canManage && (
            <button type="button"
              onClick={async () => { if (await confirm({ title: `Delete ${group.name}?`, message: 'The group and its messages disappear for everyone.', confirmLabel: 'Delete group', cancelLabel: 'Cancel', variant: 'danger' })) { await run(() => groupsApi.archive(group.id), 'Group deleted.'); onLeft(); } }}
              className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-red-500 cursor-pointer"><Trash2 className="w-4 h-4" /> Delete group</button>
          )}
        </div>
      </div>
    </Modal>
  );
};

// ─── Messages ────────────────────────────────────────────────────────────────────

/** Opens (and for images, previews) a shared file through a short-lived link */
const Attachment: React.FC<{ groupId: string; a: ChatAttachment; mine: boolean }> = ({ groupId, a, mine }) => {
  const { toast } = useToast();
  const isImage = a.mimeType.startsWith('image/');
  const isAudio = !!a.voice || a.mimeType.startsWith('audio/');
  const { data: preview } = useQuery({ queryKey: ['groups', 'file', a.uploadId], queryFn: () => groupsApi.fileUrl(groupId, a.uploadId), enabled: isImage, staleTime: 50 * 60_000 });
  const open = async () => {
    const tab = window.open('', '_blank');
    try {
      const url = await groupsApi.fileUrl(groupId, a.uploadId);
      if (tab) tab.location.href = url; else window.location.href = url;
    } catch (err) {
      tab?.close();
      toast.error(apiError(err, 'Could not open the file.'), 'Groups');
    }
  };
  if (isAudio) {
    return <VoicePlayer groupId={groupId} uploadId={a.uploadId} durationMs={a.durationMs} mine={mine} onError={(msg) => toast.error(msg, 'Groups')} />;
  }
  if (isImage && preview) {
    return (
      <button type="button" onClick={open} className="block rounded-xl overflow-hidden max-w-[16rem] cursor-pointer" aria-label={`Open ${a.name}`}>
        <img src={preview} alt={a.name} className="max-h-60 w-auto object-cover" loading="lazy" />
      </button>
    );
  }
  return (
    <button type="button" onClick={open}
      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl text-left max-w-[16rem] cursor-pointer ${mine ? 'bg-white/15 hover:bg-white/25' : 'bg-muted hover:bg-muted/70'}`}>
      {isImage ? <ImageIcon className="w-4 h-4 shrink-0" /> : <FileText className="w-4 h-4 shrink-0" />}
      <span className="min-w-0">
        <span className="block text-xs font-semibold truncate">{a.name}</span>
        <span className={`block text-[10px] ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>{fileSize(a.size)}</span>
      </span>
    </button>
  );
};

/** Message text with @mentions of group members highlighted */
const MessageText: React.FC<{ text: string; mentionNames: string[]; mine: boolean }> = ({ text, mentionNames, mine }) => {
  if (!mentionNames.length) return <>{text}</>;
  const pattern = new RegExp(`(@(?:${mentionNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g');
  return (
    <>
      {text.split(pattern).map((part, i) =>
        part.startsWith('@') && mentionNames.includes(part.slice(1))
          ? <span key={i} className={`font-semibold ${mine ? 'text-white underline' : 'text-blue-600 dark:text-blue-400'}`}>{part}</span>
          : <React.Fragment key={i}>{part}</React.Fragment>,
      )}
    </>
  );
};

const Chat: React.FC<{ groupId: string; onBack: () => void }> = ({ groupId, onBack }) => {
  const me = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<{ id: string; name: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [tool, setTool] = useState<'summary' | 'search' | 'pinned' | null>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [taskFrom, setTaskFrom] = useState<ChatMessage | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: group, error: groupError } = useQuery({ queryKey: ['groups', 'detail', groupId], queryFn: () => groupsApi.get(groupId), retry: false });
  const { data: pinned = [] } = useQuery({ queryKey: ['groups', 'pinned', groupId], queryFn: () => groupsApi.pinned(groupId) });
  // Someone read the group: "Seen by" changes. Pins changed: refresh the pinned bar.
  useSocketEvent<{ groupId: string }>('group_read', ({ groupId: gid }) => { if (gid === groupId) queryClient.invalidateQueries({ queryKey: ['groups', 'detail', groupId] }); });
  useSocketEvent<{ groupId: string }>('group_pins', ({ groupId: gid }) => {
    if (gid !== groupId) return;
    queryClient.invalidateQueries({ queryKey: ['groups', 'pinned', groupId] });
    groupsApi.messages(groupId).then((r) => setMessages((prev) => prev.map((m) => r.messages.find((x) => x.id === m.id) ?? m))).catch(() => undefined);
  });

  const scrollToEnd = () => requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight }));
  const markRead = useCallback(() => {
    groupsApi.markRead(groupId).then(() => {
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['groups', 'unread'] });
    }).catch(() => undefined);
  }, [groupId, queryClient]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setMessages([]);
    groupsApi.messages(groupId).then((r) => {
      if (!alive) return;
      setMessages(r.messages);
      setMore(r.more);
      setLoading(false);
      scrollToEnd();
      markRead();
    }).catch(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [groupId, markRead]);

  useSocketEvent<{ groupId: string; message: ChatMessage }>('group_message', ({ groupId: gid, message }) => {
    if (gid !== groupId) return;
    setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
    const el = listRef.current;
    if (!el || el.scrollHeight - el.scrollTop - el.clientHeight < 200) scrollToEnd();
    if (message.senderId !== me?.id && document.visibilityState === 'visible') markRead();
  });
  useSocketEvent<{ groupId: string; messageId: string }>('group_message_deleted', ({ groupId: gid, messageId }) => {
    if (gid === groupId) setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, deleted: true, body: null, attachments: [], mentions: [] } : m)));
  });

  const loadOlder = async () => {
    if (!messages.length) return;
    setLoadingOlder(true);
    const el = listRef.current;
    const before = el?.scrollHeight ?? 0;
    try {
      const r = await groupsApi.messages(groupId, messages[0].createdAt);
      setMessages((prev) => [...r.messages.filter((m) => !prev.some((p) => p.id === m.id)), ...prev]);
      setMore(r.more);
      requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - before; });
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = useMutation({
    mutationFn: () => {
      const body = text.trim();
      const used = mentions.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id);
      return groupsApi.send(groupId, body, used, files, replyTo?.id ?? null);
    },
    onSuccess: (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setText(''); setFiles([]); setMentions([]); setReplyTo(null);
      scrollToEnd();
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
      textRef.current?.focus();
    },
    onError: (err) => toast.error(apiError(err, 'Could not send the message.'), 'Groups'),
  });
  const canSend = (text.trim().length > 0 || files.length > 0) && !send.isPending;

  // Voice messages: tap the mic to record, then send or delete (stops by itself at 5 minutes)
  const sendVoice = useMutation({
    mutationFn: (r: Recording) => groupsApi.sendVoice(groupId, r.file, r.durationMs, replyTo?.id ?? null),
    onSuccess: (m) => {
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      setReplyTo(null);
      scrollToEnd();
      queryClient.invalidateQueries({ queryKey: ['groups', 'list'] });
    },
    onError: (err) => toast.error(apiError(err, 'Could not send the voice message.'), 'Groups'),
  });
  // The recorder calls this when it reaches its 5-minute limit (set below, once finishRecording exists)
  const atLimit = useRef<() => void>(() => {});
  const voice = useVoiceRecorder(useCallback(() => atLimit.current(), []));
  const finishRecording = async () => {
    const r = await voice.stop();
    if (!r) return;
    if (r.durationMs < 800) { toast.error('That was too short. Tap the mic and speak, then send.', 'Groups'); return; }
    sendVoice.mutate(r);
  };
  useEffect(() => { atLimit.current = () => { void finishRecording(); }; });
  const startRecording = async () => {
    try {
      await voice.start();
    } catch (err) {
      toast.error((err as Error).message, 'Groups');
    }
  };

  const memberOptions = useMemo(() => {
    if (mentionQuery === null || !group) return [];
    const q = mentionQuery.toLowerCase();
    return group.members.filter((m) => m.id !== me?.id && m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, group, me?.id]);
  const onText = (value: string, caret: number) => {
    setText(value);
    const upto = value.slice(0, caret);
    const at = upto.match(/(?:^|\s)@([^\s@]{0,30})$/);
    setMentionQuery(at ? at[1] : null);
  };
  const pickMention = (m: { id: string; name: string }) => {
    const el = textRef.current;
    const caret = el?.selectionStart ?? text.length;
    const upto = text.slice(0, caret).replace(/@([^\s@]{0,30})$/, `@${m.name} `);
    const next = upto + text.slice(caret);
    setText(next);
    setMentions((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    setMentionQuery(null);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(upto.length, upto.length); });
  };
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const picked = Array.from(list);
    const big = picked.find((f) => f.size > MAX_BYTES);
    if (big) toast.error(`${big.name} is larger than 10 MB.`, 'Groups');
    setFiles((prev) => [...prev, ...picked.filter((f) => f.size <= MAX_BYTES)].slice(0, MAX_FILES));
    if (fileRef.current) fileRef.current.value = '';
  };

  if (groupError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <p className="text-sm font-semibold text-foreground">This group isn't available</p>
        <p className="text-xs text-muted-foreground mt-1">You may have left it, or it was deleted.</p>
        <button type="button" onClick={onBack} className={`${secondaryButton} mt-4`}>Back to groups</button>
      </div>
    );
  }

  const memberNames = group?.members.map((m) => m.name) ?? [];
  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0">
      <header className="flex items-center gap-3 px-4 py-3 border-b border-border">
        <button type="button" onClick={onBack} aria-label="Back to groups" className="md:hidden p-1.5 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><ArrowLeft className="w-4 h-4" /></button>
        {group ? <Avatar name={group.name} /> : <span className="w-10 h-10 rounded-full bg-muted" />}
        <button type="button" onClick={() => setShowInfo(true)} className="min-w-0 flex-1 text-left cursor-pointer">
          <p className="text-sm font-bold text-foreground truncate">{group?.name ?? '…'}</p>
          <p className="text-[11px] text-muted-foreground truncate">{group ? group.members.map((m) => (m.id === me?.id ? 'You' : m.name.split(' ')[0])).join(', ') : ''}</p>
        </button>
        <button type="button" onClick={() => setTool('summary')} aria-label="Summary" title="Summary"
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 text-xs font-semibold hover:bg-violet-500/20 cursor-pointer">
          <Sparkles className="w-4 h-4" /><span className="hidden sm:inline">Summary</span>
        </button>
        <button type="button" onClick={() => setTool('search')} aria-label="Search messages" title="Search" className="p-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><Search className="w-4 h-4" /></button>
        <button type="button" onClick={() => setShowInfo(true)} aria-label="Group info" className="p-2 rounded-lg text-muted-foreground hover:bg-muted cursor-pointer"><Info className="w-4 h-4" /></button>
      </header>
      {pinned.length > 0 && (
        <button type="button" onClick={() => setTool('pinned')} className="flex items-center gap-2 px-4 py-2 border-b border-border bg-amber-500/5 text-left cursor-pointer hover:bg-amber-500/10">
          <Pin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="min-w-0 flex-1 text-xs text-foreground truncate">
            <span className="font-semibold">{pinned[0].senderName}:</span> {pinned[0].body || (pinned[0].attachments[0] ? fileLabel(pinned[0].attachments[0].name, pinned[0].attachments[0].voice) : '')}
          </span>
          {pinned.length > 1 && <span className="text-[10px] text-muted-foreground shrink-0">+{pinned.length - 1} more</span>}
        </button>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-1 bg-muted/30" aria-live="polite">
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
        ) : (
          <>
            {more && (
              <div className="flex justify-center pb-2">
                <button type="button" onClick={loadOlder} disabled={loadingOlder} className="px-3 py-1 rounded-full bg-card border border-border text-xs text-muted-foreground hover:text-foreground cursor-pointer">
                  {loadingOlder ? 'Loading…' : 'Load earlier messages'}
                </button>
              </div>
            )}
            {messages.length === 0 && <p className="text-center text-xs text-muted-foreground py-10">No messages yet. Say hello 👋</p>}
            {messages.map((m, i) => {
              const mine = m.senderId === me?.id;
              const prev = messages[i - 1];
              const newDay = !prev || new Date(prev.createdAt).toDateString() !== new Date(m.createdAt).toDateString();
              const grouped = !newDay && prev?.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
              const canDelete = !m.deleted && (mine || group?.canManage);
              return (
                <React.Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center py-2"><span className="px-3 py-1 rounded-full bg-card border border-border text-[11px] text-muted-foreground">{dayLabel(m.createdAt)}</span></div>
                  )}
                  <div id={`msg-${m.id}`} className={`group flex ${mine ? 'justify-end' : 'justify-start'} ${grouped ? '' : 'pt-1.5'}`}>
                    <div className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl px-3 py-2 shadow-sm ${mine ? 'bg-blue-600 text-white rounded-br-md' : 'bg-card text-foreground border border-border rounded-bl-md'}`}>
                      {!mine && !grouped && <p className={`text-xs font-bold mb-0.5 ${COLORS[hash(m.senderName) % COLORS.length]}`}>{m.senderName}</p>}
                      {m.deleted ? (
                        <p className={`text-sm italic ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>This message was deleted</p>
                      ) : (
                        <div className="space-y-1.5">
                          {m.replyTo && (
                            <button type="button"
                              onClick={() => document.getElementById(`msg-${m.replyTo!.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                              className={`block w-full text-left rounded-lg border-l-4 px-2 py-1 text-xs cursor-pointer ${mine ? 'bg-white/15 border-white/60' : 'bg-muted border-blue-500'}`}>
                              <span className="block font-semibold truncate">{m.replyTo.deleted ? 'Deleted message' : m.replyTo.senderName}</span>
                              <span className={`block truncate ${mine ? 'text-white/80' : 'text-muted-foreground'}`}>{m.replyTo.deleted ? '' : m.replyTo.body || (m.replyTo.attachmentName ? fileLabel(m.replyTo.attachmentName) : '')}</span>
                            </button>
                          )}
                          {m.attachments.map((a) => <Attachment key={a.uploadId} groupId={groupId} a={a} mine={mine} />)}
                          {m.body && <p className="text-sm whitespace-pre-wrap break-words"><MessageText text={m.body} mentionNames={memberNames} mine={mine} /></p>}
                        </div>
                      )}
                      <p className={`flex items-center justify-end gap-1 text-[10px] mt-0.5 ${mine ? 'text-white/70' : 'text-muted-foreground'}`}>
                        {m.pinnedAt && <Pin className="w-3 h-3" aria-label="Pinned" />}
                        {new Date(m.createdAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}
                        {mine && !m.deleted && group && (() => {
                          const others = group.members.filter((x) => x.id !== me?.id);
                          const seen = others.filter((x) => new Date(x.lastReadAt).getTime() >= new Date(m.createdAt).getTime());
                          return (
                            <span className="flex items-center gap-0.5" title={seen.length ? `Seen by ${seen.map((x) => x.name).join(', ')}` : 'Not seen yet'}>
                              <CheckCheck className={`w-3.5 h-3.5 ${seen.length === others.length && others.length ? 'text-sky-200' : ''}`} />
                              {others.length > 0 && <span>{seen.length === others.length ? 'Seen' : `Seen by ${seen.length}/${others.length}`}</span>}
                            </span>
                          );
                        })()}
                      </p>
                      {!m.deleted && (
                        <div className={`absolute -top-3 ${mine ? 'left-0 -translate-x-1/2' : 'right-0 translate-x-1/2'} flex items-center gap-0.5 rounded-full bg-card border border-border shadow-sm px-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100`}>
                          <button type="button" aria-label="Reply" title="Reply" onClick={() => { setReplyTo(m); textRef.current?.focus(); }} className="p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"><CornerUpLeft className="w-3.5 h-3.5" /></button>
                          <button type="button" aria-label="Create task" title="Create task" onClick={() => setTaskFrom(m)} className="p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"><ListChecks className="w-3.5 h-3.5" /></button>
                          {group?.canManage && (
                            <button type="button" aria-label={m.pinnedAt ? 'Unpin' : 'Pin'} title={m.pinnedAt ? 'Unpin' : 'Pin'}
                              onClick={() => (m.pinnedAt ? groupsApi.unpin(groupId, m.id) : groupsApi.pin(groupId, m.id))
                                .then(() => { setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pinnedAt: x.pinnedAt ? null : new Date().toISOString() } : x))); queryClient.invalidateQueries({ queryKey: ['groups', 'pinned', groupId] }); })
                                .catch((err) => toast.error(apiError(err, 'Could not change the pin.'), 'Groups'))}
                              className="p-1 rounded-full text-muted-foreground hover:text-foreground cursor-pointer">
                              {m.pinnedAt ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          {canDelete && (
                            <button type="button" aria-label="Delete message" title="Delete"
                          onClick={async () => {
                            if (await confirm({ title: 'Delete this message?', message: 'It will show as "This message was deleted" for everyone.', confirmLabel: 'Delete', cancelLabel: 'Cancel', variant: 'danger' })) {
                              groupsApi.deleteMessage(groupId, m.id).catch((err) => toast.error(apiError(err, 'Could not delete it.'), 'Groups'));
                            }
                          }}
                              className="p-1 rounded-full text-muted-foreground hover:text-red-500 cursor-pointer">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </>
        )}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); if (canSend) send.mutate(); }} className="relative border-t border-border p-3 space-y-2 bg-card">
        {memberOptions.length > 0 && (
          <ul className="absolute bottom-full left-3 mb-1 w-64 rounded-xl border border-border bg-card shadow-xl overflow-hidden" role="listbox" aria-label="Mention someone">
            {memberOptions.map((m) => (
              <li key={m.id}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); pickMention(m); }} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted cursor-pointer">
                  <Avatar name={m.name} size="w-6 h-6 text-[9px]" /> {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 rounded-xl border-l-4 border-blue-500 bg-muted px-3 py-1.5">
            <CornerUpLeft className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="min-w-0 flex-1 text-xs">
              <span className="block font-semibold text-foreground truncate">Replying to {replyTo.senderId === me?.id ? 'yourself' : replyTo.senderName}</span>
              <span className="block text-muted-foreground truncate">{replyTo.body || (replyTo.attachments[0] ? fileLabel(replyTo.attachments[0].name, replyTo.attachments[0].voice) : '')}</span>
            </span>
            <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply" className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {files.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-muted text-xs text-foreground max-w-[14rem]">
                <Paperclip className="w-3 h-3 shrink-0" /><span className="truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="p-0.5 rounded hover:text-red-500 cursor-pointer"><X className="w-3 h-3" /></button>
              </li>
            ))}
          </ul>
        )}
        {voice.recording ? (
          <RecordingBar elapsed={voice.elapsed} sending={sendVoice.isPending} onCancel={voice.cancel} onSend={() => { void finishRecording(); }} />
        ) : (
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" multiple className="hidden" id="group-files" onChange={(e) => addFiles(e.target.files)}
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" />
          <label htmlFor="group-files" aria-label="Attach files" className="p-2.5 rounded-xl text-muted-foreground hover:bg-muted cursor-pointer"><Paperclip className="w-5 h-5" /></label>
          <textarea
            ref={textRef}
            rows={1}
            value={text}
            maxLength={4000}
            aria-label="Message"
            placeholder="Type a message · @ to mention"
            onChange={(e) => onText(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (memberOptions.length) pickMention(memberOptions[0]);
                else if (canSend) send.mutate();
              }
              if (e.key === 'Escape') setMentionQuery(null);
            }}
            className={`${inputClass} resize-none max-h-32`}
            style={{ height: 'auto' }}
            onInput={(e) => { const el = e.currentTarget; el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 128)}px`; }}
          />
          {!canSend && !send.isPending && voice.supported ? (
            <MicButton onClick={() => { void startRecording(); }} disabled={sendVoice.isPending} />
          ) : (
          <button type="submit" disabled={!canSend} aria-label="Send" className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-40 cursor-pointer">
            {send.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          </button>
          )}
        </div>
        )}
      </form>

      {tool === 'summary' && group && <SummaryModal group={group} onClose={() => setTool(null)} />}
      {tool === 'search' && group && <SearchModal group={group} onClose={() => setTool(null)} />}
      {tool === 'pinned' && group && <PinnedModal group={group} onClose={() => setTool(null)} />}
      {taskFrom && group && (
        <CreateTaskModal group={group} messageId={taskFrom.id} initialName={taskFrom.body ?? taskFrom.attachments.map((a) => (a.voice ? 'Voice message' : a.name)).join(', ')}
          initialAssigneeId={taskFrom.mentions[0] ?? null} onClose={() => setTaskFrom(null)} />
      )}
      {showInfo && group && <GroupInfo group={group} onClose={() => setShowInfo(false)} onLeft={() => { setShowInfo(false); navigate('/groups'); }} />}
    </div>
  );
};

// ─── Page ────────────────────────────────────────────────────────────────────────

export const GroupsPage: React.FC = () => {
  const { id: openId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['groups', 'list'], queryFn: groupsApi.list });

  useSocketEvent('group_message', () => queryClient.invalidateQueries({ queryKey: ['groups', 'list'] }));
  useSocketEvent<{ groupId: string; archived?: boolean }>('group_updated', ({ groupId, archived }) => {
    queryClient.invalidateQueries({ queryKey: ['groups'] });
    if (archived && groupId === openId) navigate('/groups');
  });

  const groups = (data?.groups ?? []).filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase()));
  const preview = (g: GroupSummary) => {
    const m = g.lastMessage;
    if (!m) return g.description || 'No messages yet';
    if (m.deleted) return 'This message was deleted';
    const who = m.senderId === me?.id ? 'You' : m.senderName.split(' ')[0];
    const what = m.body || (m.attachments.length ? fileLabel(m.attachments[0].name, m.attachments[0].voice) : '');
    return `${who}: ${what}`;
  };

  return (
    <div className="h-[calc(100vh-8rem)] min-h-[28rem] flex rounded-2xl border border-border bg-card overflow-hidden">
      <aside className={`${openId ? 'hidden md:flex' : 'flex'} w-full md:w-80 md:border-r border-border flex-col min-h-0`}>
        <div className="p-4 space-y-3 border-b border-border">
          <div className="flex items-center justify-between gap-2">
            <h1 className="text-lg font-bold text-foreground flex items-center gap-2"><MessagesSquare className="w-5 h-5 text-blue-500" /> Groups</h1>
            {data?.canCreate && (
              <button type="button" onClick={() => setCreating(true)} aria-label="New group" className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold cursor-pointer">
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            )}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search groups" aria-label="Search groups" className={`${inputClass} pl-9 py-1.5`} />
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto">
          {isLoading ? (
            <li className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></li>
          ) : groups.length === 0 ? (
            <li className="p-6 text-center text-xs text-muted-foreground">
              {data?.groups.length ? 'No group matches.' : data?.canCreate ? 'No groups yet. Create one for your team.' : "You're not in any group yet. An Admin or Project Manager can add you."}
            </li>
          ) : groups.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => navigate(`/groups/${g.id}`)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/60 cursor-pointer ${g.id === openId ? 'bg-muted' : ''}`}>
                <Avatar name={g.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">{g.name}</span>
                    <span className={`text-[10px] shrink-0 ${g.unread ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-muted-foreground'}`}>
                      {timeLabel(g.lastMessageAt ?? g.createdAt)}
                    </span>
                  </span>
                  <span className="flex items-center justify-between gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground truncate">{preview(g)}</span>
                    {g.unread > 0 && <span className="min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">{g.unread > 99 ? '99+' : g.unread}</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <section className={`${openId ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 min-h-0`}>
        {openId ? (
          <Chat key={openId} groupId={openId} onBack={() => navigate('/groups')} />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <MessagesSquare className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground mt-3">Choose a group to start chatting</p>
            <p className="text-xs text-muted-foreground mt-1">Messages, @mentions and files, shared with the group.</p>
          </div>
        )}
      </section>

      {creating && <NewGroupModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); queryClient.invalidateQueries({ queryKey: ['groups'] }); navigate(`/groups/${id}`); }} />}
    </div>
  );
};

export default GroupsPage;
