import { useEffect, useRef } from 'react';
import { useSocket } from './socket-context';

export interface PresenceEvent {
  type: 'USER_ONLINE' | 'USER_OFFLINE';
  userId: string;
  tenantId: string;
  timestamp: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: string;
}

export interface WorkflowEvent {
  type: string;
  tenantId: string;
  actorId: string;
  timestamp: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
}

export interface NotificationPayload {
  id: string;
  tenantId: string;
  recipientUserId: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  entityType?: string;
  entityId?: string;
  priority?: string;
  metadata?: any;
}

export const useSocketEvent = <T>(
  eventName: string,
  callback: (data: T) => void
) => {
  const callbackRef = useRef(callback);
  const { socket } = useSocket();

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!socket) return;

    const handler = (data: T) => {
      callbackRef.current(data);
    };

    socket.on(eventName, handler);

    return () => {
      socket.off(eventName, handler);
    };
  }, [eventName, socket]);
};

const roomRefs = new Map<string, number>();

export const useSocketRoom = (roomId: string, active: boolean) => {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !active) return;

    const count = roomRefs.get(roomId) || 0;
    roomRefs.set(roomId, count + 1);

    if (count === 0) {
      socket.emit('join_room', { roomId });
      console.log(`[SocketRoom] Joined room: ${roomId} (first subscriber)`);
    } else {
      console.log(`[SocketRoom] Already in room: ${roomId} (subscribers: ${count + 1})`);
    }

    return () => {
      const currentCount = roomRefs.get(roomId) || 0;
      if (currentCount <= 1) {
        roomRefs.delete(roomId);
        socket.emit('leave_room', { roomId });
        console.log(`[SocketRoom] Left room: ${roomId} (last subscriber)`);
      } else {
        roomRefs.set(roomId, currentCount - 1);
        console.log(`[SocketRoom] Remaining subscribers in room: ${roomId} is ${currentCount - 1}`);
      }
    };
  }, [socket, roomId, active]);
};

