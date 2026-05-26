import React, { useEffect } from 'react';
import { useSocket } from '../../services/socket/socket-context';
import { useSocketEvent, useSocketRoom } from '../../services/socket/socket-events';
import { useCollaborationStore } from '../../store/collaborationStore';
import type { Collaborator } from '../../store/collaborationStore';
import { useAuthStore } from '../../store/authStore';
import { Users, Eye, Radio } from 'lucide-react';

interface TeamPresenceProps {
  projectId: string;
  currentPage: 'workflow' | 'sprints' | 'gates' | 'activities';
}

export const TeamPresence: React.FC<TeamPresenceProps> = ({ projectId, currentPage }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuthStore();
  const { collaborators, setCollaborators, typingUsers, setTyping, clearTyping } = useCollaborationStore();

  // Helper to generate consistent tailored colors based on user initials
  const getAvatarBgColor = (firstName = '', lastName = '') => {
    const fn = firstName || '';
    const ln = lastName || '';
    const charCodeSum = (fn.charCodeAt(0) || 0) + (ln.charCodeAt(0) || 0);
    const hues = [200, 240, 280, 320, 360, 25, 140, 175];
    const selectedHue = hues[charCodeSum % hues.length];
    return `hsl(${selectedHue}, 70%, 45%)`;
  };

  // Join socket room for project with proper reference counting
  useSocketRoom(`project:${projectId}`, isConnected && !!user);

  useEffect(() => {
    if (!socket || !isConnected || !user) return;

    // Send initial focus report
    socket.emit('report_focus', { projectId, page: currentPage });

    // Periodically report focus
    const focusInterval = setInterval(() => {
      socket.emit('report_focus', { projectId, page: currentPage });
    }, 5000);

    return () => {
      clearInterval(focusInterval);
    };
  }, [socket, isConnected, projectId, currentPage, user]);

  // Event handlers
  useSocketEvent<{ user: any; roomId: string }>('user_joined_room', ({ user: joinedUser }) => {
    const uid = String(joinedUser.userId);
    if (uid === user?.id) return;
    setCollaborators([
      ...collaborators.filter((c) => c.userId !== uid),
      { ...joinedUser, userId: uid, page: currentPage }
    ]);
  });

  useSocketEvent<{ userId: string; roomId: string }>('user_left_room', ({ userId }) => {
    const uid = String(userId);
    setCollaborators(collaborators.filter((c) => c.userId !== uid));
  });

  useSocketEvent<{
    userId: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    projectId: string;
    page: string;
  }>('collaborator_focus_updated', (data) => {
    const uid = String(data.userId);
    if (uid === user?.id || data.projectId !== projectId) return;
    
    const updatedCollaborator: Collaborator = {
      userId: uid,
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      role: data.role,
      page: data.page
    };

    setCollaborators([
      ...collaborators.filter((c) => c.userId !== uid),
      updatedCollaborator
    ]);
  });

  useSocketEvent<{ userId: string; userName: string; entityId: string }>('user_typing_start', ({ userName, entityId }) => {
    setTyping(entityId, userName);
  });

  useSocketEvent<{ userId: string; entityId: string }>('user_typing_end', ({ entityId }) => {
    clearTyping(entityId);
  });

  // Combine online users, filtering duplicates
  const visibleCollaborators = collaborators.filter((c) => c.userId !== user?.id);

  return (
    <div className="flex items-center space-x-4 glass-panel px-4 py-2.5 rounded-2xl border border-border shadow-md">
      <div className="flex items-center space-x-2 text-slate-600 dark:text-zinc-400">
        <Users className="w-4 h-4 text-blue-400" />
        <span className="text-[10px] font-bold uppercase tracking-wider">Operational Presence</span>
      </div>

      <div className="flex -space-x-2.5 overflow-hidden">
        {/* Current logged in user (Self) */}
        {user && (
          <div
            className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-extrabold text-slate-900 dark:text-white cursor-help relative group"
            style={{ backgroundColor: getAvatarBgColor(user.firstName, user.lastName) }}
            title={`You: ${user.firstName} ${user.lastName} (${user.role})`}
          >
            {user.firstName ? user.firstName[0] : '?'}{user.lastName ? user.lastName[0] : '?'}
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-500 border border-background ring-1 ring-emerald-500/30" />
            
            {/* Elegant Popover */}
            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block z-50 w-44 p-2 bg-card/95 border border-border rounded-xl shadow-xl text-left pointer-events-none">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{user.firstName} {user.lastName}</p>
              <p className="text-[9px] text-slate-600 dark:text-zinc-400">{user.email}</p>
              <span className="inline-block mt-1 text-[8px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-blue-500/20 bg-blue-500/10 text-blue-400 font-extrabold">
                {user.role} (Self)
              </span>
            </div>
          </div>
        )}

        {/* Remote Collaborators */}
        {visibleCollaborators.map((c) => (
          <div
            key={c.userId}
            className="w-7 h-7 rounded-full border-2 border-background flex items-center justify-center text-[10px] font-extrabold text-slate-900 dark:text-white cursor-help relative group animate-scale-in"
            style={{ backgroundColor: getAvatarBgColor(c.firstName, c.lastName) }}
          >
            {c.firstName ? c.firstName[0] : '?'}{c.lastName ? c.lastName[0] : '?'}
            <span className="absolute bottom-0 right-0 w-2 h-2 rounded-full bg-emerald-400 border border-background animate-pulse" />

            <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 hidden group-hover:block z-50 w-48 p-2 bg-card/95 border border-border rounded-xl shadow-xl text-left pointer-events-none">
              <p className="text-xs font-bold text-slate-900 dark:text-white">{c.firstName} {c.lastName}</p>
              <p className="text-[9px] text-slate-600 dark:text-zinc-400">{c.email}</p>
              <p className="text-[9px] text-blue-400 flex items-center space-x-1 mt-1 font-semibold">
                <Eye className="w-3 h-3" />
                <span>Viewing: {c.page.replace(/^\w/, (c) => c.toUpperCase())}</span>
              </p>
              <span className="inline-block mt-1.5 text-[8px] uppercase tracking-wide px-1.5 py-0.5 rounded border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 font-extrabold">
                {c.role}
              </span>
            </div>
          </div>
        ))}

        {visibleCollaborators.length === 0 && (
          <div className="w-7 h-7 rounded-full border border-dashed border-zinc-700 bg-white/2 flex items-center justify-center" title="Solo session">
            <Radio className="w-3.5 h-3.5 text-slate-500 dark:text-zinc-500 animate-pulse" />
          </div>
        )}
      </div>

      {visibleCollaborators.length > 0 && (
        <span className="text-[9px] text-slate-500 dark:text-zinc-500 font-extrabold uppercase tracking-wide pl-1">
          {visibleCollaborators.length} active observer{visibleCollaborators.length > 1 ? 's' : ''}
        </span>
      )}

      {/* Typing indications banner */}
      {Object.keys(typingUsers).length > 0 && (
        <div className="flex items-center space-x-1.5 pl-3 border-l border-slate-100 dark:border-white/5 animate-pulse">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
          <span className="text-[9px] text-blue-400 italic">
            {Object.values(typingUsers).join(', ')} is typing discussion notes...
          </span>
        </div>
      )}
    </div>
  );
};
export default TeamPresence;
