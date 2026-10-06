import React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { useSocketEvent } from '../../services/socket/socket-events';
import { groupsApi, type ChatMessage } from '../../services/api/groups';

/** Sidebar badge with unread group messages; kept live by the socket on every page */
export const GroupsNavBadge: React.FC = () => {
  const queryClient = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const { data: count = 0 } = useQuery({ queryKey: ['groups', 'unread'], queryFn: groupsApi.unread, refetchInterval: 120_000, retry: false });
  useSocketEvent<{ groupId: string; message: ChatMessage }>('group_message', ({ message }) => {
    if (message.senderId !== me?.id) queryClient.invalidateQueries({ queryKey: ['groups', 'unread'] });
  });
  useSocketEvent('group_read', () => queryClient.invalidateQueries({ queryKey: ['groups', 'unread'] }));
  useSocketEvent('group_updated', () => queryClient.invalidateQueries({ queryKey: ['groups', 'unread'] }));

  if (count <= 0) return null;
  return (
    <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
      {count > 99 ? '99+' : count}
    </span>
  );
};
