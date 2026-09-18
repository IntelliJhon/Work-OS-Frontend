import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Building2, Sparkles } from 'lucide-react';

export interface MentionCandidate {
  id: string;
  name: string;
  type: 'onboarded' | 'onboarding';
  email?: string;
  stage?: string;
  contactPerson?: string;
}

interface MentionTextareaProps {
  value: string;
  onChange: (val: string) => void;
  candidates: MentionCandidate[];
  placeholder?: string;
  rows?: number;
  className?: string;
  required?: boolean;
}

export const MentionTextarea: React.FC<MentionTextareaProps> = ({
  value,
  onChange,
  candidates,
  placeholder,
  rows = 6,
  className = '',
  required = false,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStartIndex, setMentionStartIndex] = useState<number>(-1);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Suppress immediate re-check after mention insertion
  const justInsertedRef = useRef<boolean>(false);

  // Filter candidates based on current mention query
  const filteredCandidates = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase().trim();
    if (!q) return candidates.slice(0, 15);

    return candidates
      .filter((c) => {
        const nameMatch = c.name.toLowerCase().includes(q);
        const emailMatch = c.email?.toLowerCase().includes(q);
        const contactMatch = c.contactPerson?.toLowerCase().includes(q);
        return nameMatch || emailMatch || contactMatch;
      })
      .slice(0, 15);
  }, [candidates, mentionQuery]);

  // Reset selected index when query or candidates change
  useEffect(() => {
    setSelectedIndex(0);
  }, [mentionQuery, filteredCandidates.length]);

  // Scroll active item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // Check for mention trigger on input change or cursor movement
  const checkForMention = useCallback(() => {
    if (justInsertedRef.current) {
      justInsertedRef.current = false;
      return;
    }

    const textarea = textareaRef.current;
    if (!textarea) return;

    const cursor = textarea.selectionStart;
    const textBeforeCursor = value.slice(0, cursor);

    // Look for the closest '@' before cursor
    const lastAtIndex = textBeforeCursor.lastIndexOf('@');
    if (lastAtIndex === -1) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    // '@' must be at start of string or preceded by whitespace / punctuation
    const charBeforeAt = lastAtIndex > 0 ? textBeforeCursor[lastAtIndex - 1] : ' ';
    if (!/[\s\n(.,;:-]/.test(charBeforeAt)) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    const rawQuery = textBeforeCursor.slice(lastAtIndex + 1);

    // If query contains newlines or is over 40 chars, abort
    if (rawQuery.includes('\n') || rawQuery.length > 40) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    // Check if rawQuery is ALREADY a completed client mention
    // (e.g. starts with a known candidate name followed by space or punctuation)
    const isAlreadyCompleted = candidates.some((c) => {
      const cName = c.name.toLowerCase();
      const lowerRaw = rawQuery.toLowerCase();
      return (
        lowerRaw.startsWith(cName + ' ') ||
        lowerRaw.startsWith(cName + ',') ||
        lowerRaw.startsWith(cName + '.') ||
        lowerRaw === cName + ' '
      );
    });

    if (isAlreadyCompleted) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    // Check if any candidate matches the query
    const qTrimmed = rawQuery.toLowerCase().trim();
    const hasAnyMatch =
      !qTrimmed ||
      candidates.some((c) => {
        return (
          c.name.toLowerCase().includes(qTrimmed) ||
          c.email?.toLowerCase().includes(qTrimmed) ||
          c.contactPerson?.toLowerCase().includes(qTrimmed)
        );
      });

    // If no candidate matches, do not show popover
    if (!hasAnyMatch) {
      setMentionQuery(null);
      setMentionStartIndex(-1);
      return;
    }

    setMentionQuery(rawQuery);
    setMentionStartIndex(lastAtIndex);

    const lines = textBeforeCursor.slice(0, lastAtIndex).split('\n');
    const currentLineIndex = lines.length - 1;
    const lineHeight = 20;
    const approxTop = Math.min(
      (currentLineIndex + 1) * lineHeight + 35,
      Math.max(textarea.clientHeight - 40, 60)
    );

    setCoords({
      top: approxTop,
      left: 12,
    });
  }, [value, candidates]);

  const insertMention = (candidate: MentionCandidate) => {
    const textarea = textareaRef.current;
    if (!textarea || mentionStartIndex === -1) return;

    const cursor = textarea.selectionStart;
    const beforeMention = value.slice(0, mentionStartIndex);
    const afterCursor = value.slice(cursor);

    const mentionText = `@${candidate.name} `;
    const nextValue = `${beforeMention}${mentionText}${afterCursor}`;

    // Mark as just inserted to suppress immediate re-opening
    justInsertedRef.current = true;
    setMentionQuery(null);
    setMentionStartIndex(-1);
    setSelectedIndex(0);

    onChange(nextValue);

    // Place cursor right after the space of the inserted mention
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const nextCursorPos = beforeMention.length + mentionText.length;
        textareaRef.current.setSelectionRange(nextCursorPos, nextCursorPos);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // If popover is active and has candidate items
    if (mentionQuery !== null && filteredCandidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % filteredCandidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + filteredCandidates.length) % filteredCandidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const targetCandidate = filteredCandidates[selectedIndex] || filteredCandidates[0];
        if (targetCandidate) {
          insertMention(targetCandidate);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMentionQuery(null);
        setMentionStartIndex(-1);
        return;
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  useEffect(() => {
    checkForMention();
  }, [value, checkForMention]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        listRef.current &&
        !listRef.current.contains(e.target as Node) &&
        textareaRef.current &&
        !textareaRef.current.contains(e.target as Node)
      ) {
        setMentionQuery(null);
        setMentionStartIndex(-1);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isOpen = mentionQuery !== null && filteredCandidates.length > 0;

  return (
    <div className="relative w-full">
      <textarea
        ref={textareaRef}
        rows={rows}
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={checkForMention}
        className={className}
      />

      {/* Floating Autocomplete Popover */}
      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 w-80 max-h-64 overflow-y-auto rounded-2xl bg-white dark:bg-zinc-900 border border-purple-200 dark:border-purple-900/60 shadow-2xl p-1.5 space-y-1 animate-in fade-in zoom-in-95 duration-100"
          style={{
            top: `${coords.top}px`,
            left: `${coords.left}px`,
          }}
        >
          <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center justify-between border-b border-slate-100 dark:border-zinc-800 pb-1.5 mb-1">
            <span className="flex items-center gap-1 text-purple-600 dark:text-purple-400">
              <Sparkles className="w-3 h-3" />
              <span>Select Client (Enter or Tab)</span>
            </span>
            <span className="font-mono text-[9px] text-slate-400">
              {filteredCandidates.length} found
            </span>
          </div>

          {filteredCandidates.map((candidate, idx) => {
            const isSelected = idx === selectedIndex;
            const isOnboarded = candidate.type === 'onboarded';

            return (
              <div
                key={`${candidate.type}-${candidate.id}`}
                ref={isSelected ? selectedItemRef : null}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  insertMention(candidate);
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`flex items-center justify-between px-2.5 py-2 rounded-xl text-xs cursor-pointer transition ${
                  isSelected
                    ? 'bg-purple-600 text-white font-semibold shadow-sm'
                    : 'hover:bg-purple-50 dark:hover:bg-purple-950/40 text-slate-800 dark:text-zinc-200'
                }`}
              >
                <div className="flex items-center space-x-2 truncate mr-2">
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : isOnboarded
                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400'
                        : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="truncate">
                    <div className="truncate font-medium">{candidate.name}</div>
                    {candidate.contactPerson && (
                      <div
                        className={`text-[10px] truncate ${
                          isSelected ? 'text-white/80' : 'text-slate-400 dark:text-zinc-500'
                        }`}
                      >
                        {candidate.contactPerson}
                      </div>
                    )}
                  </div>
                </div>

                <span
                  className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0 uppercase tracking-tight ${
                    isSelected
                      ? 'bg-white/20 text-white'
                      : isOnboarded
                      ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {isOnboarded ? 'Onboarded' : 'Pipeline'}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
