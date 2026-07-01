import React, { useEffect, useRef, useState } from 'react';
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  List as ListIcon,
  ListOrdered as ListOrderedIcon,
  Palette as PaletteIcon,
  Eraser as EraserIcon
} from 'lucide-react';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  minHeight?: string;
}

const COLORS = [
  { name: 'Default', hex: 'currentColor', class: 'bg-slate-700 dark:bg-zinc-300' },
  { name: 'Indigo', hex: '#6366f1', class: 'bg-indigo-500' },
  { name: 'Emerald', hex: '#10b981', class: 'bg-emerald-500' },
  { name: 'Rose', hex: '#f43f5e', class: 'bg-rose-500' },
  { name: 'Amber', hex: '#f59e0b', class: 'bg-amber-500' },
  { name: 'Sky', hex: '#0ea5e9', class: 'bg-sky-500' },
  { name: 'Violet', hex: '#8b5cf6', class: 'bg-violet-500' },
];

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write here...',
  minHeight = '150px',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Set initial content if editor is empty and value is provided
  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      // Avoid resetting cursor if value was updated internally
      if (value === '' || editorRef.current.innerHTML === '<p><br></p>' || editorRef.current.innerHTML === '') {
        editorRef.current.innerHTML = value || '<p><br></p>';
      }
    }
  }, [value]);

  // Handle color picker click-away
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(event.target as Node)) {
        setShowColorPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCommand = (command: string, arg: string = '') => {
    // Keep focus in the editor
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    triggerChange();
  };

  const triggerChange = () => {
    if (editorRef.current) {
      let content = editorRef.current.innerHTML;
      // Normalize empty content
      if (content === '<p><br></p>' || content === '<br>' || content === '') {
        content = '';
      }
      onChange(content);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // If editor is empty and user pressed backspace, prevent deleting the initial structure
    if (e.key === 'Backspace' && editorRef.current) {
      const html = editorRef.current.innerHTML;
      if (html === '<p><br></p>' || html === '') {
        e.preventDefault();
      }
    }
  };

  return (
    <div className="border border-border/80 rounded-xl overflow-hidden bg-slate-50 dark:bg-background focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all duration-200">
      
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-100/50 dark:bg-zinc-900/50 border-b border-border/60">
        <button
          type="button"
          onClick={() => handleCommand('bold')}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          title="Bold"
        >
          <BoldIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => handleCommand('italic')}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          title="Italic"
        >
          <ItalicIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => handleCommand('underline')}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          title="Underline"
        >
          <UnderlineIcon className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border/60 mx-1" />

        {/* Color picker button */}
        <div className="relative" ref={colorPickerRef}>
          <button
            type="button"
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer flex items-center space-x-1"
            title="Text Color"
          >
            <PaletteIcon className="w-3.5 h-3.5" />
          </button>

          {showColorPicker && (
            <div className="absolute left-0 mt-1.5 p-2 bg-white dark:bg-zinc-950 border border-border rounded-xl shadow-xl z-20 flex gap-1.5">
              {COLORS.map((color) => (
                <button
                  key={color.name}
                  type="button"
                  onClick={() => {
                    handleCommand('foreColor', color.hex);
                    setShowColorPicker(false);
                  }}
                  className={`w-5 h-5 rounded-full ${color.class} border border-black/10 dark:border-white/10 hover:scale-110 active:scale-95 transition cursor-pointer`}
                  title={color.name}
                />
              ))}
            </div>
          )}
        </div>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <button
          type="button"
          onClick={() => handleCommand('insertUnorderedList')}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          title="Bullet List"
        >
          <ListIcon className="w-3.5 h-3.5" />
        </button>

        <button
          type="button"
          onClick={() => handleCommand('insertOrderedList')}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          title="Numbered List"
        >
          <ListOrderedIcon className="w-3.5 h-3.5" />
        </button>

        <div className="w-px h-4 bg-border/60 mx-1" />

        <button
          type="button"
          onClick={() => handleCommand('removeFormat')}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-white/5 text-slate-650 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-white transition cursor-pointer"
          title="Clear Formatting"
        >
          <EraserIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Editable Area */}
      <div
        ref={editorRef}
        contentEditable
        onInput={triggerChange}
        onBlur={triggerChange}
        onKeyDown={handleKeyDown}
        className="px-4 py-3 text-xs text-slate-900 dark:text-zinc-150 focus:outline-none overflow-y-auto leading-relaxed relative"
        style={{ minHeight }}
        data-placeholder={placeholder}
      />

      {/* Styled Placeholder CSS via inline style tags (safe for Vite CSS modules) */}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #94a3b8;
          font-style: italic;
          font-weight: 300;
          position: absolute;
          pointer-events: none;
        }
        .dark [contenteditable]:empty:before {
          color: #52525b;
        }
        [contenteditable] ul {
          list-style-type: disc;
          padding-left: 1.25rem;
          margin-top: 0.25rem;
          margin-bottom: 0.25rem;
        }
        [contenteditable] ol {
          list-style-type: decimal;
          padding-left: 1.25rem;
          margin-top: 0.25rem;
          margin-bottom: 0.25rem;
        }
        [contenteditable] p {
          margin-bottom: 0.5rem;
        }
        [contenteditable] strong,
        [contenteditable] b {
          font-weight: 700 !important;
        }
        [contenteditable] em,
        [contenteditable] i {
          font-style: italic !important;
        }
        [contenteditable] u {
          text-decoration: underline !important;
        }
      `}</style>
    </div>
  );
};

export default RichTextEditor;
