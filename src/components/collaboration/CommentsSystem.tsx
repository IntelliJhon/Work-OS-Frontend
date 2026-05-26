import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../services/socket/socket-context';
import { useSocketEvent, useSocketRoom } from '../../services/socket/socket-events';
import { useCollaborationStore } from '../../store/collaborationStore';
import type { Comment } from '../../store/collaborationStore';
import { useAuthStore } from '../../store/authStore';
import { usersApi } from '../../services/api/users';
import type { User } from '../../services/api/users';
import { 
  MessageSquare, Send, Reply, Trash2, Smile, Paperclip, 
  CornerDownRight, CheckSquare, Bold, Italic, Code, 
  ExternalLink, FileText, Image as ImageIcon
} from 'lucide-react';
import { uploadsApi } from '../../services/api/uploads';

interface CommentsSystemProps {
  projectId: string;
  entityId: string; // e.g., task ID, gate ID
  entityType: 'TASK' | 'GATE' | 'PROJECT' | 'PHASE' | 'SPRINT';
}

const AVAILABLE_EMOJIS = ['👍', '❤️', '🔥', '👀', '🚀', '👏', '🎉', '💡'];

export const CommentsSystem: React.FC<CommentsSystemProps> = ({ projectId, entityId, entityType }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuthStore();
  const { comments, loadComments, saveComments, addComment, deleteComment, addReaction } = useCollaborationStore();
  
  // State
  const [commentText, setCommentText] = useState('');
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [members, setMembers] = useState<User[]>([]);
  const [showEmojiPickerId, setShowEmojiPickerId] = useState<string | null>(null);
  
  // Autocomplete Mentions State
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [mentionTriggerIndex, setMentionTriggerIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Attachments State
  const [attachments, setAttachments] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load baseline comments & tenant members
  useEffect(() => {
    if (user?.tenantId) {
      loadComments(user.tenantId, projectId);
      
      // Load members for @mention
      usersApi.list()
        .then((res) => setMembers(res))
        .catch((err) => console.error('[Comments] Failed to load members', err));
    }
  }, [projectId, user, loadComments]);

  // Join socket room for project to receive real-time comment/discussion events
  useSocketRoom(`project:${projectId}`, isConnected && !!user);

  // Request comments sync on mount
  useEffect(() => {
    if (socket && isConnected && user?.tenantId) {
      socket.emit('request_comments_sync', { projectId });
    }
  }, [socket, isConnected, projectId, user]);

  // Handle requests for comments sync from other peers
  useSocketEvent<{ requesterId: string }>('request_comments_sync_received', (data) => {
    if (socket && isConnected) {
      const currentComments = useCollaborationStore.getState().comments;
      socket.emit('send_comments_sync', {
        targetSocketId: data.requesterId,
        comments: currentComments
      });
    }
  });

  // Handle receiving comments sync from another peer
  useSocketEvent<{ comments: Record<string, Comment[]> }>('send_comments_sync_received', (data) => {
    if (!user?.tenantId) return;
    const storeComments = useCollaborationStore.getState().comments;
    
    // Merge: for each entityId, we take the union of comments to prevent overriding newer comments
    const merged = { ...storeComments };
    Object.entries(data.comments).forEach(([entId, incomingList]) => {
      const existingList = merged[entId] || [];
      const incomingFiltered = incomingList.filter(
        inc => !existingList.some(est => est.id === inc.id)
      );
      if (incomingFiltered.length > 0) {
        merged[entId] = [...existingList, ...incomingFiltered];
      }
    });

    saveComments(user.tenantId, projectId, merged);
  });

  // Socket Events integration to receive updates
  useSocketEvent<{ entityId: string; comment: Comment }>('comment_received', (data) => {
    if (data.entityId !== entityId || !user?.tenantId) return;
    const currentComments = useCollaborationStore.getState().comments;
    const current = { ...currentComments };
    const list = current[entityId] || [];
    if (!list.some(c => c.id === data.comment.id)) {
      current[entityId] = [...list, data.comment];
      saveComments(user.tenantId, projectId, current);
    }
  });

  useSocketEvent<{ entityId: string; commentId: string }>('comment_deleted', (data) => {
    if (data.entityId !== entityId || !user?.tenantId) return;
    const currentComments = useCollaborationStore.getState().comments;
    const current = { ...currentComments };
    const list = current[entityId] || [];
    current[entityId] = list.filter(c => c.id !== data.commentId);
    saveComments(user.tenantId, projectId, current);
  });

  useSocketEvent<{ entityId: string; commentId: string; reaction: string; userId: string }>('comment_reaction_received', (data) => {
    if (data.entityId !== entityId || !user?.tenantId) return;
    const currentComments = useCollaborationStore.getState().comments;
    const current = { ...currentComments };
    const list = current[entityId] || [];
    current[entityId] = list.map(c => {
      if (c.id !== data.commentId) return c;
      const reactions = { ...c.reactions };
      const users = reactions[data.reaction] || [];
      if (users.includes(data.userId)) {
        reactions[data.reaction] = users.filter(u => u !== data.userId);
      } else {
        reactions[data.reaction] = [...users, data.userId];
      }
      if (reactions[data.reaction].length === 0) delete reactions[data.reaction];
      return { ...c, reactions };
    });
    saveComments(user.tenantId, projectId, current);
  });

  // Typing Start/End indicators triggers
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>, isReply = false) => {
    const val = e.target.value;
    if (isReply) {
      setReplyText(val);
    } else {
      setCommentText(val);
    }

    // Trigger typing event via sockets
    if (socket && isConnected) {
      socket.emit('typing_start', { roomId: `project:${projectId}`, entityId });
      
      const debounceTimer = setTimeout(() => {
        socket.emit('typing_end', { roomId: `project:${projectId}`, entityId });
      }, 2000);
      
      return () => clearTimeout(debounceTimer);
    }

    // Handle @mentions detection
    const caretPos = e.target.selectionStart;
    const textBeforeCaret = val.substring(0, caretPos);
    const lastAtPos = textBeforeCaret.lastIndexOf('@');
    
    if (lastAtPos !== -1 && (lastAtPos === 0 || /\s/.test(textBeforeCaret[lastAtPos - 1]))) {
      const searchWord = textBeforeCaret.substring(lastAtPos + 1);
      if (!/\s/.test(searchWord)) {
        setMentionSearch(searchWord);
        setMentionTriggerIndex(lastAtPos);
        setMentionIndex(0);
        return;
      }
    }
    
    setMentionSearch(null);
    setMentionTriggerIndex(-1);
  };

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setMentionSearch(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectMention = (member: User, isReply = false) => {
    const activeText = isReply ? replyText : commentText;
    const activeSetter = isReply ? setReplyText : setCommentText;
    const activeRef = isReply ? replyTextareaRef : textareaRef;

    if (mentionTriggerIndex !== -1 && activeRef.current) {
      const before = activeText.substring(0, mentionTriggerIndex);
      const after = activeText.substring(activeRef.current.selectionStart);
      const insert = `@${member.firstName} ${member.lastName} `;
      
      activeSetter(before + insert + after);
      setMentionSearch(null);
      setMentionTriggerIndex(-1);
      
      setTimeout(() => {
        if (activeRef.current) {
          activeRef.current.focus();
          const newPos = before.length + insert.length;
          activeRef.current.setSelectionRange(newPos, newPos);
        }
      }, 0);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, isReply = false) => {
    if (mentionSearch !== null && filteredMembers.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIndex((prev) => (prev + 1) % filteredMembers.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        selectMention(filteredMembers[mentionIndex], isReply);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMentionSearch(null);
      }
    }
  };

  // Handle files uploading
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const filesArray = Array.from(e.target.files);
    setAttachments((prev) => [...prev, ...filesArray]);

    setUploading(true);
    try {
      const res = await uploadsApi.upload(entityType, entityId, filesArray);
      const urls = res.uploads.map((u) => u.publicUrl);
      setUploadedUrls((prev) => [...prev, ...urls]);
    } catch (err) {
      console.error('[Comments] Upload failed', err);
    } finally {
      setUploading(false);
    }
  };

  const submitComment = (parentId?: string) => {
    if (!user || !user.tenantId) return;
    
    const text = parentId ? replyText : commentText;
    if (!text.trim() && uploadedUrls.length === 0) return;

    addComment(user.tenantId, projectId, entityId, {
      entityId,
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      text: text,
      parentId,
      attachments: uploadedUrls.length > 0 ? uploadedUrls : undefined
    });

    if (parentId) {
      setReplyText('');
      setActiveReplyId(null);
    } else {
      setCommentText('');
    }
    
    setAttachments([]);
    setUploadedUrls([]);
  };

  // Get active lists
  const allComments = comments[entityId] || [];
  const parentComments = allComments.filter(c => !c.parentId);
  const getReplies = (commentId: string) => allComments.filter(c => c.parentId === commentId);

  // Filter members for @mentions
  const filteredMembers = mentionSearch !== null
    ? members.filter(m => 
        `${m.firstName} ${m.lastName}`.toLowerCase().includes(mentionSearch.toLowerCase()) ||
        m.email.toLowerCase().includes(mentionSearch.toLowerCase())
      )
    : [];

  // Procedural HSL background generator for avatars
  const getAvatarBg = (userName: string) => {
    let charCodeSum = 0;
    for (let i = 0; i < userName.length; i++) charCodeSum += userName.charCodeAt(i);
    const hues = [200, 240, 280, 320, 360, 25, 140, 175];
    return `hsl(${hues[charCodeSum % hues.length]}, 70%, 40%)`;
  };

  // Modern procedural Markdown Renderer to safe components
  const renderMarkdown = (text: string) => {
    let rendered = text;

    // Encode HTML tags to prevent XSS
    rendered = rendered
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 1. Highlight Mentions
    const mentionRegex = /@([A-Za-z0-9]+ [A-Za-z0-9]+)/g;
    rendered = rendered.replace(mentionRegex, '<span class="px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-blue-500/10 border border-blue-500/25 text-blue-400 inline-flex items-center space-x-1"><span>@</span><span>$1</span></span>');

    // 2. Bold
    rendered = rendered.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 3. Italic
    rendered = rendered.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // 4. Code Blocks
    rendered = rendered.replace(/```([\s\S]*?)```/g, '<pre class="bg-black/30 border border-border px-3 py-2 rounded-xl text-[11px] font-mono text-slate-700 dark:text-zinc-300 my-2 overflow-x-auto">$1</pre>');

    // 5. Inline Code
    rendered = rendered.replace(/`(.*?)`/g, '<code class="bg-black/40 px-1.5 py-0.5 rounded text-[10px] font-mono text-pink-400">$1</code>');

    // 6. Checklists
    rendered = rendered.replace(/- \[[ ]\] (.*?)/g, '<div class="flex items-center space-x-2 my-1 text-slate-600 dark:text-zinc-400"><span class="w-3.5 h-3.5 border border-zinc-600 rounded flex items-center justify-center bg-black/20"></span><span>$1</span></div>');
    rendered = rendered.replace(/- \[[xX]\] (.*?)/g, '<div class="flex items-center space-x-2 my-1 text-blue-400 line-through"><span class="w-3.5 h-3.5 border border-blue-500/40 rounded flex items-center justify-center bg-blue-500/10"><span class="w-1.5 h-1.5 rounded-sm bg-blue-400"></span></span><span>$1</span></div>');

    // 7. Bullet Lists
    rendered = rendered.replace(/^- (.*?)/gm, '<li class="ml-4 list-disc text-slate-700 dark:text-zinc-300">$1</li>');

    // Line breaks to <br />
    rendered = rendered.replace(/\n/g, '<br />');

    return <div dangerouslySetInnerHTML={{ __html: rendered }} className="text-xs text-slate-700 dark:text-zinc-300 space-y-1 mt-1 leading-relaxed" />;
  };

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.substring(0, 2).toUpperCase();
  };

  return (
    <div className="w-full space-y-6 flex flex-col h-full justify-between">
      {/* Scrollable list of comments */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 max-h-[400px]">
        {parentComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center space-y-2 border border-dashed border-zinc-800 rounded-2xl bg-white/1">
            <MessageSquare className="w-8 h-8 text-zinc-600 animate-pulse" />
            <p className="text-xs font-bold text-slate-600 dark:text-zinc-400">No discussions yet</p>
            <p className="text-[10px] text-slate-500 dark:text-zinc-500">Ask a question or tag team members to start working.</p>
          </div>
        ) : (
          parentComments.map((c) => {
            const replies = getReplies(c.id);
            return (
              <div key={c.id} className="space-y-3">
                {/* Parent Comment */}
                <div className="group/item relative flex space-x-3 p-3 bg-zinc-900/40 hover:bg-zinc-900/70 border border-slate-100 dark:border-white/5 rounded-2xl transition duration-200">
                  {/* Initials Avatar */}
                  <div 
                    className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-extrabold text-slate-900 dark:text-white"
                    style={{ backgroundColor: getAvatarBg(c.userName) }}
                  >
                    {getInitials(c.userName)}
                  </div>

                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-extrabold text-slate-900 dark:text-white hover:underline cursor-pointer">{c.userName}</span>
                        <span className="text-[9px] text-slate-500 dark:text-zinc-500 ml-2 font-medium">
                          {new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      
                      {/* Action buttons */}
                      <div className="opacity-0 group-hover/item:opacity-100 flex items-center space-x-2 transition">
                        <button 
                          onClick={() => setActiveReplyId(activeReplyId === c.id ? null : c.id)}
                          className="p-1 rounded hover:bg-slate-100/60 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-white transition"
                          title="Reply to thread"
                        >
                          <Reply className="w-3.5 h-3.5" />
                        </button>
                        {user && user.id === c.userId && (
                          <button 
                            onClick={() => user?.tenantId && deleteComment(user.tenantId, projectId, entityId, c.id)}
                            className="p-1 rounded hover:bg-red-500/10 text-slate-500 dark:text-zinc-500 hover:text-red-400 transition"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Text Body */}
                    {renderMarkdown(c.text)}

                    {/* Attachments preview */}
                    {c.attachments && c.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {c.attachments.map((url, i) => (
                          <a 
                            key={i} 
                            href={url} 
                            target="_blank" 
                            rel="noopener noreferrer" 
                            className="flex items-center space-x-1.5 px-2 py-1 rounded-lg bg-black/40 border border-slate-100 dark:border-white/5 text-[10px] text-blue-400 hover:bg-black/60 transition"
                          >
                            {url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                              <ImageIcon className="w-3.5 h-3.5" />
                            ) : (
                              <FileText className="w-3.5 h-3.5" />
                            )}
                            <span className="max-w-[120px] truncate">Attachment #{i+1}</span>
                            <ExternalLink className="w-2.5 h-2.5 opacity-50" />
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Reactions display */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <div className="relative">
                        <button 
                          onClick={() => setShowEmojiPickerId(showEmojiPickerId === c.id ? null : c.id)}
                          className="flex items-center justify-center p-1 rounded-lg hover:bg-slate-100/60 dark:bg-white/5 border border-zinc-800 text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:text-zinc-300 transition"
                        >
                          <Smile className="w-3 h-3" />
                        </button>

                        {/* Emoji Picker Popover */}
                        {showEmojiPickerId === c.id && (
                          <div className="absolute z-50 bottom-full mb-1 left-0 flex items-center space-x-1 p-1.5 bg-card border border-border rounded-xl shadow-2xl">
                            {AVAILABLE_EMOJIS.map(emoji => (
                              <button
                                key={emoji}
                                onClick={() => {
                                  if (user) {
                                    addReaction(user.tenantId, projectId, entityId, c.id, emoji, user.id);
                                    setShowEmojiPickerId(null);
                                  }
                                }}
                                className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-200/60 dark:bg-white/10 text-xs transition"
                              >
                                {emoji}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {Object.entries(c.reactions).map(([reaction, users]) => {
                        const hasReacted = user && users.includes(user.id);
                        return (
                          <button
                            key={reaction}
                            onClick={() => user && addReaction(user.tenantId, projectId, entityId, c.id, reaction, user.id)}
                            className={`flex items-center space-x-1 px-1.5 py-0.5 rounded-lg text-[10px] font-bold border transition ${
                              hasReacted 
                                ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                                : 'bg-black/20 border-zinc-800 text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:text-zinc-300'
                            }`}
                          >
                            <span>{reaction}</span>
                            <span>{users.length}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sub-Replies Threads */}
                {replies.map((reply) => (
                  <div key={reply.id} className="flex pl-8 space-x-2.5 group/item relative">
                    <CornerDownRight className="w-4 h-4 text-slate-800 dark:text-zinc-300 mt-2 shrink-0" />
                    
                    <div className="flex-1 flex space-x-3 p-2.5 bg-zinc-950/20 hover:bg-zinc-950/40 border border-slate-100 dark:border-white/5 rounded-2xl transition duration-200">
                      <div 
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-extrabold text-slate-900 dark:text-white"
                        style={{ backgroundColor: getAvatarBg(reply.userName) }}
                      >
                        {getInitials(reply.userName)}
                      </div>

                      <div className="flex-1 space-y-0.5">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-[11px] font-extrabold text-slate-900 dark:text-white">{reply.userName}</span>
                            <span className="text-[8px] text-slate-500 dark:text-zinc-500 ml-2 font-medium">
                              {new Date(reply.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>

                          {user && user.id === reply.userId && (
                            <button 
                              onClick={() => user?.tenantId && deleteComment(user.tenantId, projectId, entityId, reply.id)}
                              className="opacity-0 group-hover/item:opacity-100 p-1 rounded hover:bg-red-500/10 text-slate-500 dark:text-zinc-500 hover:text-red-400 transition"
                              title="Delete reply"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {renderMarkdown(reply.text)}

                        {/* Reactions for replies */}
                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                          <div className="relative">
                            <button 
                              onClick={() => setShowEmojiPickerId(showEmojiPickerId === reply.id ? null : reply.id)}
                              className="flex items-center justify-center p-0.5 rounded hover:bg-slate-100/60 dark:bg-white/5 border border-zinc-800 text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:text-zinc-300"
                            >
                              <Smile className="w-2.5 h-2.5" />
                            </button>
                            {showEmojiPickerId === reply.id && (
                              <div className="absolute z-50 bottom-full mb-1 left-0 flex items-center space-x-1 p-1 bg-card border border-border rounded-xl shadow-2xl">
                                {AVAILABLE_EMOJIS.map(emoji => (
                                  <button
                                    key={emoji}
                                    onClick={() => {
                                      if (user) {
                                        addReaction(user.tenantId, projectId, entityId, reply.id, emoji, user.id);
                                        setShowEmojiPickerId(null);
                                      }
                                    }}
                                    className="w-5.5 h-5.5 flex items-center justify-center rounded hover:bg-slate-200/60 dark:bg-white/10 text-[10px] transition"
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {Object.entries(reply.reactions).map(([reaction, users]) => {
                            const hasReacted = user && users.includes(user.id);
                            return (
                              <button
                                key={reaction}
                                onClick={() => user && addReaction(user.tenantId, projectId, entityId, reply.id, reaction, user.id)}
                                className={`flex items-center space-x-1 px-1 py-0.5 rounded text-[8px] font-bold border transition ${
                                  hasReacted 
                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' 
                                    : 'bg-black/20 border-zinc-800 text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:text-zinc-300'
                                }`}
                              >
                                <span>{reaction}</span>
                                <span>{users.length}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Reply Input Box inline */}
                {activeReplyId === c.id && (
                  <div className="pl-8 flex space-x-2.5 items-end">
                    <CornerDownRight className="w-4 h-4 text-slate-800 dark:text-zinc-300 mb-2 shrink-0" />
                    <div className="flex-1 relative flex items-center bg-zinc-950 border border-zinc-800 rounded-2xl px-3 py-1.5 focus-within:border-blue-500/40">
                      <textarea
                        ref={replyTextareaRef}
                        rows={1}
                        value={replyText}
                        onChange={(e) => handleTextareaChange(e, true)}
                        onKeyDown={(e) => handleKeyDown(e, true)}
                        placeholder={`Reply to ${c.userName}... (Use @ to tag)`}
                        className="flex-1 bg-transparent text-xs text-white focus:outline-none resize-none placeholder-zinc-500 pr-10 min-h-[22px] max-h-[80px]"
                      />

                      {/* inline mentions autocomplete inside reply */}
                      {mentionSearch !== null && activeReplyId === c.id && (
                        <div 
                          ref={dropdownRef}
                          className="absolute bottom-full left-0 mb-2 z-50 w-52 max-h-40 overflow-y-auto bg-card border border-border rounded-xl shadow-2xl p-1"
                        >
                          {filteredMembers.length === 0 ? (
                            <p className="text-[10px] text-slate-500 dark:text-zinc-500 p-2 italic">No members matched</p>
                          ) : (
                            filteredMembers.map((m, idx) => (
                              <button
                                key={m.id}
                                onClick={() => selectMention(m, true)}
                                className={`w-full text-left px-2 py-1.5 text-[11px] rounded-lg font-medium flex items-center justify-between ${
                                  idx === mentionIndex ? 'bg-blue-500/10 text-blue-400' : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100/60 dark:bg-white/5'
                                }`}
                              >
                                <span>{m.firstName} {m.lastName}</span>
                                <span className="text-[8px] text-slate-500 dark:text-zinc-500">{m.email}</span>
                              </button>
                            ))
                          )}
                        </div>
                      )}

                      <button
                        onClick={() => submitComment(c.id)}
                        className="p-1 rounded bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Main Comment Composer */}
      <div className="relative pt-4 border-t border-slate-100 dark:border-white/5 space-y-2 shrink-0">
        {/* Markdown Hint Toolbar */}
        <div className="flex items-center space-x-2.5 text-[10px] text-slate-500 dark:text-zinc-500 px-1">
          <span className="font-extrabold uppercase tracking-wide text-zinc-600 mr-2">Editor:</span>
          <button className="flex items-center space-x-0.5 hover:text-slate-700 dark:text-zinc-300 cursor-help" title="Use **text** for bold text">
            <Bold className="w-3 h-3 text-zinc-600" />
            <span>Bold</span>
          </button>
          <button className="flex items-center space-x-0.5 hover:text-slate-700 dark:text-zinc-300 cursor-help" title="Use *text* for italic text">
            <Italic className="w-3 h-3 text-zinc-600" />
            <span>Italic</span>
          </button>
          <button className="flex items-center space-x-0.5 hover:text-slate-700 dark:text-zinc-300 cursor-help" title="Use `code` for code snippets">
            <Code className="w-3 h-3 text-zinc-600" />
            <span>Code</span>
          </button>
          <button className="flex items-center space-x-0.5 hover:text-slate-700 dark:text-zinc-300 cursor-help" title="Use - [ ] for checklists">
            <CheckSquare className="w-3 h-3 text-zinc-600" />
            <span>Checklist</span>
          </button>
        </div>

        {/* Input Bar */}
        <div className="relative flex items-end space-x-2.5 bg-zinc-950 border border-zinc-800 rounded-2xl p-2 focus-within:border-blue-500/40 transition duration-150">
          <textarea
            ref={textareaRef}
            rows={2}
            value={commentText}
            onChange={(e) => handleTextareaChange(e, false)}
            onKeyDown={(e) => handleKeyDown(e, false)}
            placeholder="Add notes, checklists, or comments... Use @ to mention."
            className="flex-1 bg-transparent text-xs text-white focus:outline-none resize-none placeholder-zinc-500 min-h-[36px] max-h-[140px] leading-relaxed"
          />

          {/* Autocomplete mentions panel */}
          {mentionSearch !== null && !activeReplyId && (
            <div 
              ref={dropdownRef}
              className="absolute bottom-full left-2 mb-2 z-50 w-60 max-h-48 overflow-y-auto bg-card border border-border rounded-xl shadow-2xl p-1 animate-scale-in"
            >
              <div className="px-2 py-1 text-[9px] uppercase tracking-wider text-slate-500 dark:text-zinc-500 font-extrabold border-b border-slate-100 dark:border-white/5 mb-1">
                Mention Team Member
              </div>
              {filteredMembers.length === 0 ? (
                <p className="text-[10px] text-slate-500 dark:text-zinc-500 p-2 italic">No members matched</p>
              ) : (
                filteredMembers.map((m, idx) => (
                  <button
                    key={m.id}
                    onClick={() => selectMention(m, false)}
                    className={`w-full text-left px-2 py-1.5 text-xs rounded-lg font-medium flex items-center justify-between transition ${
                      idx === mentionIndex ? 'bg-blue-500/10 text-blue-400' : 'text-slate-700 dark:text-zinc-300 hover:bg-slate-100/60 dark:bg-white/5'
                    }`}
                  >
                    <span>{m.firstName} {m.lastName}</span>
                    <span className="text-[9px] text-slate-500 dark:text-zinc-500">{m.email}</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* Attachments preview inside the composer */}
          {attachments.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 mb-2 p-2 bg-black/80 border border-zinc-800 rounded-xl flex items-center gap-2 flex-wrap">
              {attachments.map((file, i) => (
                <div key={i} className="flex items-center space-x-1.5 px-2 py-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[10px] text-slate-700 dark:text-zinc-300">
                  <span className="max-w-[100px] truncate">{file.name}</span>
                  <span className="text-[8px] text-slate-500 dark:text-zinc-500">({(file.size / 1024).toFixed(0)} KB)</span>
                </div>
              ))}
              {uploading && <span className="text-[9px] text-blue-400 animate-pulse">Uploading file...</span>}
            </div>
          )}

          {/* Side Actions (Paperclip, Submit) */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              className="hidden" 
              multiple 
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 rounded-xl hover:bg-slate-100/60 dark:bg-white/5 text-slate-600 dark:text-zinc-400 hover:text-zinc-200 transition"
              title="Attach document"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <button
              onClick={() => submitComment()}
              disabled={uploading}
              className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white shadow-lg transition cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
export default CommentsSystem;
