import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { voiceNotesApi } from '../../services/api/voiceNotes';
import type { VoiceNoteEvent, VoiceNoteStatus } from '../../services/api/voiceNotes';
import { useSocketEvent } from '../../services/socket/socket-events';

export const VOICE_NOTES_KEY = ['voice-notes'];
const PAGE_SIZE = 30;

/** Paginated notes for one status tab. The first page also carries the per-status counts. */
export const useVoiceNotesList = (status: VoiceNoteStatus) =>
  useInfiniteQuery({
    queryKey: [...VOICE_NOTES_KEY, 'list', status],
    queryFn: ({ pageParam }) => voiceNotesApi.list({ status, limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, _pages, lastOffset) =>
      lastPage.data.length === PAGE_SIZE ? lastOffset + PAGE_SIZE : undefined,
  });

/** Count of notes awaiting review, for the sidebar badge. */
export const useNewVoiceNotesCount = () =>
  useQuery({
    queryKey: [...VOICE_NOTES_KEY, 'new-count'],
    queryFn: async () => (await voiceNotesApi.list({ status: 'new', limit: 1 })).counts.new,
    staleTime: 60_000,
  });

/**
 * Live updates. Socket events only carry { id, status }, so they just mark every voice-notes
 * query stale; active ones refetch through the permission-checked API.
 */
export const useVoiceNotesLive = () => {
  const queryClient = useQueryClient();
  const refresh = useCallback(
    (_event: VoiceNoteEvent) => queryClient.invalidateQueries({ queryKey: VOICE_NOTES_KEY }),
    [queryClient],
  );
  useSocketEvent<VoiceNoteEvent>('voice_note_new', refresh);
  useSocketEvent<VoiceNoteEvent>('voice_note_updated', refresh);
};
