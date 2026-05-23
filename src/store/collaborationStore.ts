import { create } from 'zustand';
import { getSocket } from '../services/socket/socket';

export interface Collaborator {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  page: string; // 'workflow' | 'sprints' | 'gates'
  isTyping?: boolean;
}

export interface Comment {
  id: string;
  entityId: string; // taskId, gateId, sprintId
  userId: string;
  userName: string;
  email: string;
  text: string;
  createdAt: string;
  parentId?: string; // for threading
  reactions: Record<string, string[]>; // e.g., { '👍': ['userId1', 'userId2'], '❤️': [] }
  attachments?: string[];
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  type: string;
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  actor: string;
  createdAt: string;
}

interface CollaborationState {
  collaborators: Collaborator[];
  comments: Record<string, Comment[]>; // entityId -> Comment[]
  activities: Record<string, ActivityEvent[]>; // projectId -> ActivityEvent[]
  typingUsers: Record<string, string>; // entityId -> userName (who is typing)
  
  // Actions
  setCollaborators: (list: Collaborator[]) => void;
  loadComments: (tenantId: string, projectId: string) => void;
  saveComments: (tenantId: string, projectId: string, commentsMap: Record<string, Comment[]>) => void;
  addComment: (tenantId: string, projectId: string, entityId: string, comment: Omit<Comment, 'id' | 'createdAt' | 'reactions'>) => void;
  deleteComment: (tenantId: string, projectId: string, entityId: string, commentId: string) => void;
  addReaction: (tenantId: string, projectId: string, entityId: string, commentId: string, reaction: string, userId: string) => void;
  
  loadActivities: (tenantId: string, projectId: string) => void;
  addActivity: (tenantId: string, projectId: string, event: Omit<ActivityEvent, 'id' | 'createdAt'>) => void;
  
  setTyping: (entityId: string, userName: string) => void;
  clearTyping: (entityId: string) => void;
}

export const useCollaborationStore = create<CollaborationState>((set, get) => ({
  collaborators: [],
  comments: {},
  activities: {},
  typingUsers: {},

  setCollaborators: (list) => set({ collaborators: list }),

  loadComments: (tenantId, projectId) => {
    try {
      const key = `workos_comments_${tenantId}_${projectId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') {
          set((state) => ({
            comments: {
              ...state.comments,
              ...parsed
            }
          }));
        }
      }
    } catch {
      // Keep existing comments if parse fails
    }
  },

  saveComments: (tenantId, projectId, commentsMap) => {
    try {
      const key = `workos_comments_${tenantId}_${projectId}`;
      localStorage.setItem(key, JSON.stringify(commentsMap));
      set({ comments: commentsMap });
    } catch (e) {
      console.error('[CollaborationStore] Failed to save comments', e);
    }
  },

  addComment: (tenantId, projectId, entityId, commentData) => {
    const newComment: Comment = {
      ...commentData,
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      reactions: {},
    };

    const currentComments = { ...get().comments };
    const list = currentComments[entityId] || [];
    currentComments[entityId] = [...list, newComment];

    get().saveComments(tenantId, projectId, currentComments);

    // Broadcast to server if socket is active
    const socket = getSocket();
    if (socket) {
      socket.emit('broadcast_comment', {
        projectId,
        entityId,
        comment: newComment
      });
    }

    // Auto-generate a timeline activity for comment addition
    get().addActivity(tenantId, projectId, {
      projectId,
      type: 'comment_added',
      title: 'New discussion posted',
      message: `${commentData.userName} added a note on deliverable checklist.`,
      severity: 'low',
      actor: commentData.userName
    });
  },

  deleteComment: (tenantId, projectId, entityId, commentId) => {
    const currentComments = { ...get().comments };
    const list = currentComments[entityId] || [];
    currentComments[entityId] = list.filter((c) => c.id !== commentId);

    get().saveComments(tenantId, projectId, currentComments);

    const socket = getSocket();
    if (socket) {
      socket.emit('broadcast_comment_delete', {
        projectId,
        entityId,
        commentId
      });
    }
  },

  addReaction: (tenantId, projectId, entityId, commentId, reaction, userId) => {
    const currentComments = { ...get().comments };
    const list = currentComments[entityId] || [];
    
    currentComments[entityId] = list.map((c) => {
      if (c.id !== commentId) return c;
      
      const reactions = { ...c.reactions };
      const users = reactions[reaction] || [];
      
      if (users.includes(userId)) {
        reactions[reaction] = users.filter((u) => u !== userId);
      } else {
        reactions[reaction] = [...users, userId];
      }
      
      // Clean empty arrays
      if (reactions[reaction].length === 0) {
        delete reactions[reaction];
      }

      return { ...c, reactions };
    });

    get().saveComments(tenantId, projectId, currentComments);

    const socket = getSocket();
    if (socket) {
      socket.emit('broadcast_comment_reaction', {
        projectId,
        entityId,
        commentId,
        reaction,
        userId
      });
    }
  },

  loadActivities: (tenantId, projectId) => {
    try {
      const key = `workos_activities_${tenantId}_${projectId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          set((state) => ({
            activities: {
              ...state.activities,
              [projectId]: parsed
            }
          }));
        } else if (parsed && typeof parsed === 'object') {
          // Backward compatibility for legacy full map format
          set((state) => ({
            activities: {
              ...state.activities,
              ...parsed
            }
          }));
        }
      }
    } catch {
      // Keep existing activities if parse fails
    }
  },

  addActivity: (tenantId, projectId, eventData) => {
    const newEvent: ActivityEvent = {
      ...eventData,
      id: `act_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
    };

    const currentActivities = { ...get().activities };
    const list = currentActivities[projectId] || [];
    
    // Prevent duplicated notification/activities if they trigger in close succession
    const isDuplicate = list.some(
      (a) => a.type === eventData.type && a.message === eventData.message && Date.now() - new Date(a.createdAt).getTime() < 3000
    );

    if (isDuplicate) return;

    currentActivities[projectId] = [newEvent, ...list].slice(0, 100); // capped at 100 history nodes

    try {
      const key = `workos_activities_${tenantId}_${projectId}`;
      localStorage.setItem(key, JSON.stringify(currentActivities[projectId]));
      set({ activities: currentActivities });
    } catch (e) {
      console.error('[CollaborationStore] Failed to save activities', e);
    }
  },

  setTyping: (entityId, userName) => {
    set((state) => ({
      typingUsers: { ...state.typingUsers, [entityId]: userName }
    }));
  },

  clearTyping: (entityId) => {
    set((state) => {
      const typingUsers = { ...state.typingUsers };
      delete typingUsers[entityId];
      return { typingUsers };
    });
  }
}));
