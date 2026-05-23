import React, { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import { initializeSocket, disconnectSocket } from './socket';
import { SocketContext } from './socket-context';
import { queryClient } from '../api/queryClient';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { accessToken, isAuthenticated } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [currentSocket, setCurrentSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (isAuthenticated && accessToken) {
      const sock = initializeSocket(accessToken);
      
      // Defer state update to avoid synchronous cascading render warning
      const timer = setTimeout(() => {
        setCurrentSocket(sock);
      }, 0);

      const onConnect = () => {
        setIsConnected(true);
        console.log('[Socket] Connected to server');
      };

      const onDisconnect = () => {
        setIsConnected(false);
        console.log('[Socket] Disconnected from server');
      };

      const onConnectError = (err: unknown) => {
        setIsConnected(false);
        const errorMessage = err instanceof Error ? err.message : 'Unknown connection error';
        console.error('[Socket] Connection error:', errorMessage);
      };

      // Invalidation event handlers
      const onTaskUpdated = (data: { projectId?: string; payload?: { projectId?: string } }) => {
        console.log('[Socket] TASK_UPDATED received', data);
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        const pId = data.projectId || (data.payload && data.payload.projectId);
        if (pId) {
          queryClient.invalidateQueries({ queryKey: ['project', pId] });
          queryClient.invalidateQueries({ queryKey: ['project-detail', pId] });
        }
      };

      const onPhaseEvent = (data: { projectId?: string; payload?: { projectId?: string } }) => {
        console.log('[Socket] PHASE event received', data);
        const pId = data.projectId || (data.payload && data.payload.projectId);
        if (pId) {
          queryClient.invalidateQueries({ queryKey: ['project', pId] });
          queryClient.invalidateQueries({ queryKey: ['project-detail', pId] });
        }
      };

      const onSprintEvent = (data: { projectId?: string; payload?: { projectId?: string } }) => {
        console.log('[Socket] SPRINT event received', data);
        const pId = data.projectId || (data.payload && data.payload.projectId);
        if (pId) {
          queryClient.invalidateQueries({ queryKey: ['project', pId] });
          queryClient.invalidateQueries({ queryKey: ['project-detail', pId] });
          queryClient.invalidateQueries({ queryKey: ['sprints', pId] });
        }
      };

      const onGateEvent = (data: { projectId?: string; payload?: { projectId?: string } }) => {
        console.log('[Socket] GATE event received', data);
        const pId = data.projectId || (data.payload && data.payload.projectId);
        if (pId) {
          queryClient.invalidateQueries({ queryKey: ['project', pId] });
          queryClient.invalidateQueries({ queryKey: ['project-detail', pId] });
          queryClient.invalidateQueries({ queryKey: ['gates', pId] });
        }
      };

      const onNotificationEvent = () => {
        console.log('[Socket] NOTIFICATION event received');
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      };

      // Attach all listeners
      sock.on('connect', onConnect);
      sock.on('disconnect', onDisconnect);
      sock.on('connect_error', onConnectError);
      
      sock.on('TASK_UPDATED', onTaskUpdated);
      sock.on('PHASE_ACTIVATED', onPhaseEvent);
      sock.on('PHASE_COMPLETED', onPhaseEvent);
      sock.on('PHASE_BLOCKED', onPhaseEvent);
      sock.on('PHASE_REOPENED', onPhaseEvent);
      
      sock.on('SPRINT_STARTED', onSprintEvent);
      sock.on('SPRINT_CLOSED', onSprintEvent);
      sock.on('SPRINT_CANCELLED', onSprintEvent);
      sock.on('SPRINT_REOPENED', onSprintEvent);
      
      sock.on('GATE_APPROVED', onGateEvent);
      sock.on('GATE_REJECTED', onGateEvent);
      sock.on('GATE_RESUBMITTED', onGateEvent);
      
      sock.on('NOTIFICATION_CREATED', onNotificationEvent);
      sock.on('UNREAD_COUNT_UPDATED', onNotificationEvent);

      if (sock.connected) {
        setTimeout(() => {
          setIsConnected(true);
        }, 0);
      }

      return () => {
        clearTimeout(timer);
        sock.off('connect', onConnect);
        sock.off('disconnect', onDisconnect);
        sock.off('connect_error', onConnectError);
        
        sock.off('TASK_UPDATED', onTaskUpdated);
        sock.off('PHASE_ACTIVATED', onPhaseEvent);
        sock.off('PHASE_COMPLETED', onPhaseEvent);
        sock.off('PHASE_BLOCKED', onPhaseEvent);
        sock.off('PHASE_REOPENED', onPhaseEvent);
        
        sock.off('SPRINT_STARTED', onSprintEvent);
        sock.off('SPRINT_CLOSED', onSprintEvent);
        sock.off('SPRINT_CANCELLED', onSprintEvent);
        sock.off('SPRINT_REOPENED', onSprintEvent);
        
        sock.off('GATE_APPROVED', onGateEvent);
        sock.off('GATE_REJECTED', onGateEvent);
        sock.off('GATE_RESUBMITTED', onGateEvent);
        
        sock.off('NOTIFICATION_CREATED', onNotificationEvent);
        sock.off('UNREAD_COUNT_UPDATED', onNotificationEvent);

        disconnectSocket();
        setCurrentSocket(null);
        setIsConnected(false);
      };
    } else {
      disconnectSocket();
      setTimeout(() => {
        setCurrentSocket(null);
        setIsConnected(false);
      }, 0);
    }
  }, [accessToken, isAuthenticated]);

  return (
    <SocketContext.Provider value={{ socket: currentSocket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};
