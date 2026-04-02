'use client';

import * as React from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  CodeSquare,
  EyeOff,
  Quote,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Variable,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  parseDiscordMarkdown,
  wrapSelection,
  insertAtCursor,
  wrapLine,
} from '@/lib/discord-markdown';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiscordMarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  variables?: string[];
  maxLength?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// ---------------------------------------------------------------------------
// Toolbar action definitions
// ---------------------------------------------------------------------------

interface ToolbarAction {
  icon: React.ElementType;
  label: string;
  shortcut?: string;
  action: (
    text: string,
    start: number,
    end: number,
  ) => { text: string; selectionStart?: number; selectionEnd?: number; cursorPos?: number };
}

const TOOLBAR_ACTIONS: ToolbarAction[] = [
  {
    icon: Bold,
    label: 'Bold',
    shortcut: 'Ctrl+B',
    action: (t, s, e) => wrapSelection(t, s, e, '**', '**'),
  },
  {
    icon: Italic,
    label: 'Italic',
    shortcut: 'Ctrl+I',
    action: (t, s, e) => wrapSelection(t, s, e, '*', '*'),
  },
  {
    icon: Underline,
    label: 'Underline',
    shortcut: 'Ctrl+U',
    action: (t, s, e) => wrapSelection(t, s, e, '__', '__'),
  },
  {
    icon: Strikethrough,
    label: 'Strikethrough',
    action: (t, s, e) => wrapSelection(t, s, e, '~~', '~~'),
  },
  {
    icon: Code,
    label: 'Inline Code',
    action: (t, s, e) => wrapSelection(t, s, e, '`', '`'),
  },
  {
    icon: CodeSquare,
    label: 'Code Block',
    action: (t, s, e) => wrapSelection(t, s, e, '```\n', '\n```'),
  },
  {
    icon: EyeOff,
    label: 'Spoiler',
    action: (t, s, e) => wrapSelection(t, s, e, '||', '||'),
  },
  {
    icon: Quote,
    label: 'Quote',
    action: (t, _s, e) => wrapLine(t, e, '> '),
  },
  {
    icon: Heading1,
    label: 'Heading 1',
    action: (t, _s, e) => wrapLine(t, e, '# '),
  },
  {
    icon: Heading2,
    label: 'Heading 2',
    action: (t, _s, e) => wrapLine(t, e, '## '),
  },
  {
    icon: Heading3,
    label: 'Heading 3',
    action: (t, _s, e) => wrapLine(t, e, '### '),
  },
  {
    icon: List,
    label: 'Bullet List',
    action: (t, _s, e) => wrapLine(t, e, '- '),
  },
  {
    icon: ListOrdered,
    label: 'Numbered List',
    action: (t, _s, e) => wrapLine(t, e, '1. '),
  },
];

// ---------------------------------------------------------------------------
// Keyboard shortcut map
// ---------------------------------------------------------------------------

const SHORTCUT_MAP: Record<string, number> = {
  'ctrl+b': 0, // Bold
  'ctrl+i': 1, // Italic
  'ctrl+u': 2, // Underline
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiscordMarkdownEditor({
  value,
  onChange,
  variables = [],
  maxLength = 2000,
  placeholder = 'Enter your message...',
  className,
  disabled = false,
}: DiscordMarkdownEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [showVariables, setShowVariables] = React.useState(false);

  // Apply a toolbar action
  const applyAction = React.useCallback(
    (action: ToolbarAction['action']) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const result = action(value, start, end);

      onChange(result.text);

      // Restore cursor position after React re-render
      requestAnimationFrame(() => {
        textarea.focus();
        const newStart = result.selectionStart ?? result.cursorPos ?? end;
        const newEnd = result.selectionEnd ?? result.cursorPos ?? end;
        textarea.setSelectionRange(newStart, newEnd);
      });
    },
    [value, onChange],
  );

  // Insert a template variable at cursor
  const insertVariable = React.useCallback(
    (varName: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      const cursor = textarea.selectionStart;
      const result = insertAtCursor(value, cursor, `{{${varName}}}`);

      onChange(result.text);
      setShowVariables(false);

      requestAnimationFrame(() => {
        textarea.focus();
        textarea.setSelectionRange(result.cursorPos, result.cursorPos);
      });
    },
    [value, onChange],
  );

  // Keyboard shortcuts
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const key = `${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${e.key.toLowerCase()}`;
      const actionIndex = SHORTCUT_MAP[key];
      if (actionIndex !== undefined) {
        e.preventDefault();
        applyAction(TOOLBAR_ACTIONS[actionIndex].action);
      }
    },
    [applyAction],
  );

  const isOverLimit = value.length > maxLength;
  const charCountColor = isOverLimit
    ? 'text-red-500'
    : value.length > maxLength * 0.9
      ? 'text-yellow-500'
      : 'text-muted-foreground';

  return (
    <div className={cn('rounded-md border border-input bg-background', className)}>
      {/* Toolbar */}
      <div
        className="flex flex-wrap items-center gap-0.5 border-b border-input px-2 py-1"
        role="toolbar"
        aria-label="Formatting toolbar"
      >
        {TOOLBAR_ACTIONS.map((action) => (
          <Tooltip key={action.label}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => applyAction(action.action)}
                disabled={disabled}
                aria-label={action.label}
              >
                <action.icon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {action.label}
              {action.shortcut && (
                <span className="ml-1 text-muted-foreground">({action.shortcut})</span>
              )}
            </TooltipContent>
          </Tooltip>
        ))}

        {/* Variable inserter */}
        {variables.length > 0 && (
          <div className="relative ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={() => setShowVariables(!showVariables)}
              disabled={disabled}
              aria-label="Insert variable"
              aria-expanded={showVariables}
            >
              <Variable className="h-4 w-4" />
              Variables
            </Button>
            {showVariables && (
              <div className="absolute right-0 top-full z-50 mt-1 max-h-48 min-w-[160px] overflow-auto rounded-md border border-input bg-popover p-1 shadow-md">
                {variables.map((v) => (
                  <button
                    key={v}
                    type="button"
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground"
                    onClick={() => insertVariable(v)}
                  >
                    <span className="mr-1.5 rounded bg-primary/10 px-1 py-0.5 font-mono text-primary">
                      {`{{${v}}}`}
                    </span>
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Split view: Editor + Preview */}
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Editor */}
        <div className="relative md:border-r md:border-input">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className="min-h-[200px] w-full resize-y bg-transparent px-3 py-2 font-mono text-sm focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Markdown editor"
          />
        </div>

        {/* Preview */}
        <div
          className="min-h-[200px] border-t border-input px-3 py-2 md:border-t-0"
          aria-label="Preview"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </div>
          <div
            className="discord-preview prose prose-sm dark:prose-invert max-w-none text-sm"
            dangerouslySetInnerHTML={{ __html: parseDiscordMarkdown(value) }}
          />
        </div>
      </div>

      {/* Character counter */}
      <div className="flex items-center justify-end border-t border-input px-3 py-1">
        <span className={cn('text-xs', charCountColor)} aria-label="Character count">
          {value.length} / {maxLength}
        </span>
      </div>
    </div>
  );
}
