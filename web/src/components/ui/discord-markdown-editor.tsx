'use client';

import {
  Bold,
  Code,
  CodeSquare,
  EyeOff,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
  Underline,
  Variable,
} from 'lucide-react';
import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  insertAtCursor,
  parseDiscordMarkdown,
  wrapLine,
  wrapSelection,
} from '@/lib/discord-markdown';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DiscordMarkdownEditorProps = Readonly<{
  value: string;
  onChange: (value: string) => void;
  variables?: string[];
  maxLength?: number;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}>;

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

function renderPreviewNode(node: ChildNode, key: string): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent;
  }

  if (!(node instanceof HTMLElement)) {
    return null;
  }

  const props: Record<string, unknown> = { key };
  // SECURITY: Safe to forward attributes because parseDiscordMarkdown only generates
  // attributes from escaped content or constrained patterns (e.g., \w+ for variables)
  for (const attr of node.getAttributeNames()) {
    props[attr === 'class' ? 'className' : attr] = node.getAttribute(attr) ?? undefined;
  }

  const children = Array.from(node.childNodes).map((child, index) =>
    renderPreviewNode(child, `${key}-${index}`),
  );

  return React.createElement(node.tagName.toLowerCase(), props, ...children);
}

function renderPreviewContent(html: string): React.ReactNode {
  if (typeof window === 'undefined') {
    return null;
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.body.childNodes).map((node, index) =>
    renderPreviewNode(node, `preview-${index}`),
  );
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
    action: (t, s, _e) => wrapLine(t, s, '> '),
  },
  {
    icon: Heading1,
    label: 'Heading 1',
    action: (t, s, _e) => wrapLine(t, s, '# '),
  },
  {
    icon: Heading2,
    label: 'Heading 2',
    action: (t, s, _e) => wrapLine(t, s, '## '),
  },
  {
    icon: Heading3,
    label: 'Heading 3',
    action: (t, s, _e) => wrapLine(t, s, '### '),
  },
  {
    icon: List,
    label: 'Bullet List',
    action: (t, s, _e) => wrapLine(t, s, '- '),
  },
  {
    icon: ListOrdered,
    label: 'Numbered List',
    action: (t, s, _e) => wrapLine(t, s, '1. '),
  },
];

// ---------------------------------------------------------------------------
// Keyboard shortcut map
// ---------------------------------------------------------------------------

const SHORTCUT_MAP: Record<string, string> = {
  'ctrl+b': 'Bold',
  'ctrl+i': 'Italic',
  'ctrl+u': 'Underline',
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
  const rafIdsRef = React.useRef<number[]>([]);
  const [showVariables, setShowVariables] = React.useState(false);

  React.useEffect(
    () => () => {
      for (const id of rafIdsRef.current) {
        cancelAnimationFrame(id);
      }
      rafIdsRef.current = [];
    },
    [],
  );

  const applyAction = React.useCallback(
    (action: ToolbarAction['action']) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const result = action(value, start, end);

      onChange(result.text);

      const rafId = requestAnimationFrame(() => {
        rafIdsRef.current = rafIdsRef.current.filter((id) => id !== rafId);
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newStart = result.selectionStart ?? result.cursorPos ?? end;
          const newEnd = result.selectionEnd ?? result.cursorPos ?? end;
          textareaRef.current.setSelectionRange(newStart, newEnd);
        }
      });
      rafIdsRef.current.push(rafId);
    },
    [value, onChange],
  );

  const insertVariable = React.useCallback(
    (varName: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart;
      const result = insertAtCursor(value, cursor, `{{${varName}}}`);

      onChange(result.text);
      setShowVariables(false);

      const rafId = requestAnimationFrame(() => {
        rafIdsRef.current = rafIdsRef.current.filter((id) => id !== rafId);
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(result.cursorPos, result.cursorPos);
        }
      });
      rafIdsRef.current.push(rafId);
    },
    [value, onChange],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const key = `${e.ctrlKey || e.metaKey ? 'ctrl+' : ''}${e.key.toLowerCase()}`;
      const actionLabel = SHORTCUT_MAP[key];
      if (actionLabel !== undefined) {
        const matched = TOOLBAR_ACTIONS.find((a) => a.label === actionLabel);
        if (matched) {
          e.preventDefault();
          applyAction(matched.action);
        }
      }
    },
    [applyAction],
  );

  const isOverLimit = value.length > maxLength;
  const [isMounted, setIsMounted] = React.useState(false);
  React.useEffect(() => {
    setIsMounted(true);
  }, []);
  const previewContent = React.useMemo(
    () => (isMounted ? renderPreviewContent(parseDiscordMarkdown(value)) : null),
    [value, isMounted],
  );
  const getCharCountColor = (): string => {
    if (isOverLimit) {
      return 'text-red-500';
    }

    if (value.length > maxLength * 0.9) {
      return 'text-yellow-500';
    }

    return 'text-muted-foreground';
  };
  const charCountColor = getCharCountColor();

  return (
    <div className={cn('rounded-md border border-input bg-background', className)}>
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

        {variables.length > 0 && (
          <DropdownMenu modal={false} open={showVariables} onOpenChange={setShowVariables}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1 text-xs"
                disabled={disabled}
                aria-label="Insert variable"
                aria-expanded={showVariables}
              >
                <Variable className="h-4 w-4" />
                Variables
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-48 min-w-[160px] overflow-auto p-1">
              {variables.map((variable) => (
                <DropdownMenuItem
                  key={variable}
                  className="gap-1.5 text-xs"
                  onSelect={() => insertVariable(variable)}
                >
                  <span className="rounded bg-primary/10 px-1 py-0.5 font-mono text-primary">
                    {`{{${variable}}}`}
                  </span>
                  {variable}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2">
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

        <section
          className="min-h-[200px] border-t border-input px-3 py-2 md:border-t-0"
          aria-label="Preview"
        >
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </div>
          <div className="discord-preview prose prose-sm dark:prose-invert max-w-none text-sm">
            {previewContent}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-end border-t border-input px-3 py-1">
        <output className={cn('text-xs', charCountColor)} aria-label="Character count">
          {value.length} / {maxLength}
        </output>
      </div>
    </div>
  );
}
