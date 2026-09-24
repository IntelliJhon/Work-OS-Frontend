import React from 'react';
import { useNewVoiceNotesCount, useVoiceNotesLive } from './useVoiceNotes';

/**
 * Sidebar badge with the number of new voice notes. Also owns the socket listeners,
 * so the badge and any open inbox stay live on every page.
 */
export const VoiceNotesNavBadge: React.FC = () => {
  useVoiceNotesLive();
  const { data: count = 0 } = useNewVoiceNotesCount();

  if (count <= 0) return null;
  return (
    <span className="ml-auto min-w-[1.25rem] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
      {count > 99 ? '99+' : count}
    </span>
  );
};
