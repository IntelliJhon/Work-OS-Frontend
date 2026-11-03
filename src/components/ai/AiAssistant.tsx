import React, { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ChevronDown, FileText, History, Loader2, Mail, MessageCircle, Paperclip, Plus, Send, Target, Trash2, UserPlus, X, XCircle } from 'lucide-react';
import { useToast } from '../ui/Toast';
import { BotAvatar } from './BotAvatar';
import { aiApi, type AiAction, type AiChatItem, type AiConversation } from '../../services/api/ai';

// ─── Ask AI ─────────────────────────────────────────────────────────────────────
// A chat with Claude on every page, opened from the floating robot. It works on leads and proposals with the person's
// own permissions; anything that reaches a client (a proposal on WhatsApp) waits on a Send / Cancel card.

const MAX_FILES = 5;
const MAX_BYTES = 15 * 1024 * 1024;
const apiError = (err: unknown, fallback: string) => (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
const SUGGESTIONS: { icon: React.ElementType; text: string }[] = [
  { icon: Target, text: 'Show my leads waiting for a follow-up' },
  { icon: UserPlus, text: 'Add a lead: Ravi Menon, 98470 12345, wants a WhatsApp bot' },
  { icon: FileText, text: 'Here is a proposal — attach it to the right lead and send it on WhatsApp' },
];
const HEADER = 'bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-500';

const ActionCard: React.FC<{ action: AiAction; busy: boolean; onSend: () => void; onCancel: () => void }> = ({ action, busy, onSend, onCancel }) => {
  const p = action.payload;
  const tone = action.status === 'pending' ? 'border-emerald-500/40 bg-emerald-500/5 shadow-sm'
    : action.status === 'done' ? 'border-emerald-500/20 bg-card' : action.status === 'failed' ? 'border-red-500/30 bg-red-500/5' : 'border-border bg-card opacity-70';
  const email = action.kind === 'send_email';
  return (
    <div className={`ml-9 rounded-2xl border p-3 space-y-2 ${tone}`}>
      {email ? (
        <>
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><Mail className="w-3.5 h-3.5 text-blue-600" /> Send email</p>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p>From <span className="text-foreground">{p.from}</span></p>
            <p>To <span className="font-semibold text-foreground">{p.to?.join(', ')}</span>{p.cc?.length ? <> · CC {p.cc.join(', ')}</> : null}</p>
            <p className="font-semibold text-foreground">{p.subject}</p>
          </div>
          <details className="group">
            <summary className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 cursor-pointer list-none">Show message</summary>
            <p className="mt-1.5 text-xs text-foreground whitespace-pre-wrap break-words rounded-xl bg-background border border-border p-2.5 max-h-56 overflow-y-auto">{p.body}</p>
          </details>
          {p.attachments?.map((x) => <p key={x.name} className="text-[11px] text-muted-foreground flex items-center gap-1"><Paperclip className="w-3 h-3" /> {x.name}</p>)}
        </>
      ) : (
        <>
          <p className="text-xs font-bold text-foreground flex items-center gap-1.5"><MessageCircle className="w-3.5 h-3.5 text-emerald-600" /> Send proposal on WhatsApp</p>
          <div className="text-xs text-muted-foreground space-y-0.5">
            <p><span className="font-semibold text-foreground">{p.leadName}</span> · {p.phone}</p>
            <p className="flex items-center gap-1"><FileText className="w-3 h-3" /> v{p.version} · {p.fileName}</p>
            <p>With a short message saying the proposal was emailed (no amount).</p>
          </div>
        </>
      )}
      {action.status === 'pending' ? (
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={onSend} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Send
          </button>
          <button type="button" disabled={busy} onClick={onCancel} className="flex-1 px-3 py-1.5 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50 cursor-pointer">Cancel</button>
        </div>
      ) : (
        <p className={`text-xs font-semibold flex items-center gap-1 ${action.status === 'done' ? 'text-emerald-700 dark:text-emerald-400' : action.status === 'failed' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
          {action.status === 'done' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
          {action.status === 'done' ? 'Sent' : action.status === 'failed' ? action.result ?? 'Not sent' : 'Cancelled — nothing was sent'}
        </p>
      )}
    </div>
  );
};

const Bubble: React.FC<{ item: AiChatItem }> = ({ item }) => {
  if (item.role === 'event') {
    return <p className="text-[11px] text-center text-muted-foreground px-6">{item.text}</p>;
  }
  if (item.role === 'user') {
    return (
      <div className="flex justify-end ai-pop">
        <div className="max-w-[82%] rounded-2xl rounded-br-md bg-gradient-to-br from-violet-600 to-indigo-600 text-white px-3.5 py-2 text-sm shadow-sm space-y-1">
          {item.files.map((f) => <p key={f} className="flex items-center gap-1 text-xs font-semibold bg-white/15 rounded-lg px-2 py-1"><FileText className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{f}</span></p>)}
          {item.text && <p className="whitespace-pre-wrap break-words">{item.text}</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 items-end ai-pop">
      <BotAvatar size={28} animated={false} className="shrink-0 mb-0.5" />
      <div className="max-w-[86%] space-y-1">
        {item.steps.length > 0 && (
          <ul className="text-[11px] text-muted-foreground space-y-0.5 pl-1">
            {item.steps.map((s, i) => <li key={i} className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-600" /> {s}</li>)}
          </ul>
        )}
        {item.text && <div className="rounded-2xl rounded-bl-md bg-muted/80 border border-border px-3.5 py-2 text-sm text-foreground whitespace-pre-wrap break-words">{item.text}</div>}
      </div>
    </div>
  );
};

const Typing: React.FC = () => (
  <div className="flex gap-2 items-end ai-pop">
    <BotAvatar size={28} className="shrink-0" />
    <div className="rounded-2xl rounded-bl-md bg-muted/80 border border-border px-3.5 py-3 flex items-center gap-1" aria-label="Working on it">
      {[0, 1, 2].map((i) => <span key={i} className="w-1.5 h-1.5 rounded-full bg-violet-500 ai-dot" style={{ animationDelay: `${i * 0.15}s` }} />)}
    </div>
  </div>
);

const AiAssistant: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [chat, setChat] = useState<AiConversation | null>(null);
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [pendingText, setPendingText] = useState<{ text: string; files: string[] } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const { data: status } = useQuery({ queryKey: ['ai', 'status'], queryFn: aiApi.status, enabled: open, staleTime: 300_000 });
  const { data: history = [] } = useQuery({ queryKey: ['ai', 'conversations'], queryFn: aiApi.conversations, enabled: open && showHistory });

  const afterChange = (c: AiConversation) => {
    setChat(c);
    queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] });
    // The assistant may have changed leads
    queryClient.invalidateQueries({ queryKey: ['leads'] });
  };
  const send = useMutation({
    mutationFn: (input: { text: string; files: File[] }) => aiApi.send({ conversationId: chat?.id, ...input }),
    onMutate: (input) => setPendingText({ text: input.text, files: input.files.map((f) => f.name) }),
    onSuccess: (c) => { afterChange(c); setPendingText(null); },
    onError: (err, input) => {
      setPendingText(null);
      setDraft(input.text);
      setFiles(input.files);
      toast.error(apiError(err, 'The AI could not answer right now.'), 'Ask AI');
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, ok }: { id: string; ok: boolean }) => (ok ? aiApi.confirm(id) : aiApi.cancel(id)),
    onSuccess: (c, { ok }) => {
      afterChange(c);
      const last = c.items[c.items.length - 1];
      if (ok && last?.role === 'event') (last.text.includes('could not') || last.text.includes('was not sent') ? toast.error : toast.success)(last.text.replace('The user clicked Send. ', ''), 'Ask AI');
    },
    onError: (err) => toast.error(apiError(err, 'That did not work.'), 'Ask AI'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => aiApi.remove(id),
    onSuccess: (_d, id) => { if (chat?.id === id) setChat(null); queryClient.invalidateQueries({ queryKey: ['ai', 'conversations'] }); },
  });

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [chat, pendingText, open]);

  const submit = (text = draft) => {
    if (send.isPending || (!text.trim() && !files.length)) return;
    send.mutate({ text: text.trim(), files });
    setDraft('');
    setFiles([]);
  };
  const pick = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (fileInput.current) fileInput.current.value = '';
    const all = [...files, ...picked];
    if (all.length > MAX_FILES) return toast.error(`Share at most ${MAX_FILES} files at a time.`, 'Ask AI');
    const big = picked.find((f) => f.size > MAX_BYTES);
    if (big) return toast.error(`"${big.name}" is larger than 15 MB.`, 'Ask AI');
    setFiles(all);
  };
  const openChat = async (id: string) => {
    setShowHistory(false);
    try { setChat(await aiApi.conversation(id)); } catch (err) { toast.error(apiError(err, 'Could not open the chat.'), 'Ask AI'); }
  };

  // Items and cards in time order
  const timeline: ({ kind: 'item'; at: number; item: AiChatItem } | { kind: 'action'; at: number; action: AiAction })[] = chat
    ? [...chat.items.map((item) => ({ kind: 'item' as const, at: new Date(item.createdAt).getTime(), item })),
      ...chat.actions.filter((a) => a.result !== 'Replaced by a newer card').map((action) => ({ kind: 'action' as const, at: new Date(action.createdAt).getTime() + 1, action }))]
      .sort((a, b) => a.at - b.at)
    : [];
  const iconButton = 'p-1.5 rounded-lg text-white/85 hover:text-white hover:bg-white/15 cursor-pointer';

  return (
    <>
      <style>{`
        .ai-panel-in { animation: aiPanelIn .28s cubic-bezier(.2,.9,.3,1.2); transform-origin: bottom right; }
        @keyframes aiPanelIn { from { opacity: 0; transform: translateY(16px) scale(.92); } to { opacity: 1; transform: none; } }
        .ai-pop { animation: aiPop .22s ease-out; }
        @keyframes aiPop { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
        .ai-dot { animation: aiDot 1s infinite ease-in-out; }
        @keyframes aiDot { 0%, 80%, 100% { transform: translateY(0); opacity: .5; } 40% { transform: translateY(-4px); opacity: 1; } }
        .ai-halo { animation: aiHalo 2.4s ease-out infinite; }
        @keyframes aiHalo { 0% { transform: scale(.85); opacity: .55; } 100% { transform: scale(1.35); opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { .ai-panel-in, .ai-pop, .ai-dot, .ai-halo { animation: none; } }
      `}</style>

      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ask AI"
          className="group fixed bottom-4 right-4 z-40 w-[76px] h-[76px] flex items-center justify-center cursor-pointer">
          <span className="ai-halo absolute inset-2 rounded-full bg-gradient-to-br from-violet-500 to-sky-400" />
          <span className="absolute inset-3 rounded-full bg-gradient-to-br from-violet-500/25 to-sky-400/25 backdrop-blur-sm border border-white/40 shadow-xl" />
          <BotAvatar size={70} className="relative drop-shadow-lg transition-transform group-hover:scale-110" />
          <span className="pointer-events-none absolute right-full mr-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-xl bg-foreground text-background text-xs font-semibold px-3 py-1.5 opacity-0 translate-x-1 transition group-hover:opacity-100 group-hover:translate-x-0">
            Ask AI
          </span>
        </button>
      )}

      {open && (
        <section aria-label="Ask AI" className="ai-panel-in fixed z-50 inset-0 sm:inset-auto sm:bottom-5 sm:right-5 sm:w-[26rem] sm:h-[40rem] sm:max-h-[calc(100vh-2.5rem)] flex flex-col bg-card sm:rounded-3xl border border-border shadow-2xl overflow-hidden">
          <header className={`${HEADER} relative px-4 py-3 flex items-center gap-3 text-white`}>
            <div className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_20%_0%,white,transparent_55%)]" />
            <BotAvatar size={42} className="relative shrink-0" />
            <div className="relative min-w-0 flex-1">
              <h2 className="text-sm font-bold truncate">{chat?.title ?? 'Work OS AI'}</h2>
              <p className="text-[11px] text-white/80 flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${status && !status.available ? 'bg-amber-300' : 'bg-emerald-300'}`} />
                {status && !status.available ? 'Not set up yet' : 'Online · leads & proposals'}
              </p>
            </div>
            <div className="relative flex items-center">
              <button type="button" title="Previous chats" aria-label="Previous chats" onClick={() => setShowHistory((s) => !s)} className={iconButton}><History className="w-4 h-4" /></button>
              <button type="button" title="New chat" aria-label="New chat" onClick={() => { setChat(null); setShowHistory(false); }} className={iconButton}><Plus className="w-4 h-4" /></button>
              <button type="button" title="Close" aria-label="Close" onClick={() => setOpen(false)} className={iconButton}><ChevronDown className="w-4 h-4" /></button>
            </div>
          </header>

          {showHistory ? (
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground px-2 pb-2">Previous chats</p>
              {history.length === 0 ? <p className="text-xs text-muted-foreground text-center py-8">No chats yet.</p> : (
                <ul className="space-y-1">
                  {history.map((h) => (
                    <li key={h.id} className="flex items-center gap-1 rounded-xl hover:bg-muted">
                      <button type="button" onClick={() => openChat(h.id)} className="flex-1 min-w-0 text-left px-3 py-2 cursor-pointer">
                        <p className="text-sm font-semibold text-foreground truncate">{h.title}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(h.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>
                      </button>
                      <button type="button" aria-label={`Delete ${h.title}`} onClick={() => remove.mutate(h.id)} className="p-2 text-muted-foreground hover:text-red-500 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gradient-to-b from-violet-500/[0.04] to-transparent">
              {status && !status.available && (
                <p className="text-xs rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-800 dark:text-amber-300">The AI assistant is not set up on this server yet.</p>
              )}
              {!chat && !pendingText && (
                <div className="flex flex-col items-center text-center pt-2 pb-1 ai-pop">
                  <BotAvatar size={96} />
                  <p className="text-base font-bold text-foreground mt-1">Hi! I'm your Work OS AI</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-[18rem]">I work on your leads and proposals. Share a proposal PDF and I'll attach it to the right lead and get it ready for WhatsApp.</p>
                  <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 rounded-full px-2.5 py-1">
                    <CheckCircle2 className="w-3 h-3" /> Nothing goes to a client until you click Send
                  </p>
                  <div className="w-full space-y-2 mt-4 text-left">
                    {SUGGESTIONS.map(({ icon: Icon, text }) => (
                      <button key={text} type="button" onClick={() => setDraft(text)}
                        className="w-full flex items-center gap-2.5 text-xs px-3 py-2.5 rounded-2xl border border-border bg-card hover:border-violet-500/40 hover:bg-violet-500/5 text-foreground shadow-sm cursor-pointer transition">
                        <span className="w-7 h-7 shrink-0 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center"><Icon className="w-3.5 h-3.5" /></span>
                        {text}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {timeline.map((t) => t.kind === 'item'
                ? <Bubble key={t.item.id} item={t.item} />
                : <ActionCard key={t.action.id} action={t.action} busy={decide.isPending} onSend={() => decide.mutate({ id: t.action.id, ok: true })} onCancel={() => decide.mutate({ id: t.action.id, ok: false })} />)}
              {pendingText && (
                <>
                  <Bubble item={{ id: 'pending', role: 'user', text: pendingText.text, files: pendingText.files, steps: [], createdAt: '' }} />
                  <Typing />
                </>
              )}
              <div ref={bottom} />
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="p-3 border-t border-border bg-card space-y-2">
            {files.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-violet-500/10 text-violet-700 dark:text-violet-300 text-xs max-w-full">
                    <FileText className="w-3 h-3 shrink-0" /> <span className="truncate max-w-[12rem]">{f.name}</span>
                    <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))} className="cursor-pointer"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-end gap-1.5 rounded-2xl border border-border bg-background px-1.5 py-1.5 focus-within:ring-2 focus-within:ring-violet-500/30 focus-within:border-violet-500/40">
              <input ref={fileInput} type="file" multiple hidden accept=".pdf,.png,.jpg,.jpeg,.webp,.gif" onChange={(e) => pick(e.target.files)} />
              <button type="button" aria-label="Share a file" title="Share a PDF or image" onClick={() => fileInput.current?.click()} className="p-2 rounded-xl text-muted-foreground hover:text-violet-600 hover:bg-violet-500/10 cursor-pointer"><Paperclip className="w-4 h-4" /></button>
              <label htmlFor="ai-draft" className="sr-only">Message</label>
              <textarea
                id="ai-draft" rows={1} value={draft} maxLength={8000} onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                placeholder="Ask or tell me what to do…"
                className="flex-1 resize-none max-h-32 py-2 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button type="submit" aria-label="Send" disabled={send.isPending || (!draft.trim() && !files.length)}
                className="p-2 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm disabled:opacity-40 cursor-pointer">
                {send.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </form>
        </section>
      )}
    </>
  );
};

export default AiAssistant;
