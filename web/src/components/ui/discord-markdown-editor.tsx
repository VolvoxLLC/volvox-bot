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
  /** Maps variable names to sample values displayed inside the preview badges. */
  variableSamples?: Readonly<Record<string, string>>;
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

function clampEditResult(
  result: ReturnType<ToolbarAction['action']>,
  maxLength: number,
): ReturnType<ToolbarAction['action']> {
  if (result.text.length <= maxLength) {
    return result;
  }

  const text = result.text.slice(0, maxLength);
  const clampIndex = (index: number | undefined) =>
    index === undefined ? undefined : Math.min(index, maxLength);

  return {
    text,
    selectionStart: clampIndex(result.selectionStart),
    selectionEnd: clampIndex(result.selectionEnd),
    cursorPos: clampIndex(result.cursorPos),
  };
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

const EDITOR_PANE_CONTENT_CLASSES = 'w-full px-3 py-2 text-sm leading-relaxed';

export function DiscordMarkdownEditor({
  value,
  onChange,
  variables = [],
  variableSamples,
  maxLength = 2000,
  placeholder = 'Enter your message...',
  className,
  disabled = false,
}: DiscordMarkdownEditorProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const rafIdsRef = React.useRef<number[]>([]);
  const [showVariables, setShowVariables] = React.useState(false);
  const activeVariables = React.useMemo(
    () => (variables.length > 0 ? [...variables] : undefined),
    [variables],
  );

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
      const result = clampEditResult(action(value, start, end), maxLength);

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
    [maxLength, onChange, value],
  );

  const insertVariable = React.useCallback(
    (varName: string) => {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const cursor = textarea.selectionStart;
      const result = clampEditResult(insertAtCursor(value, cursor, `{{${varName}}}`), maxLength);

      onChange(result.text);
      setShowVariables(false);

      const rafId = requestAnimationFrame(() => {
        rafIdsRef.current = rafIdsRef.current.filter((id) => id !== rafId);
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(result.cursorPos ?? null, result.cursorPos ?? null);
        }
      });
      rafIdsRef.current.push(rafId);
    },
    [maxLength, onChange, value],
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

  const previewContent = React.useMemo(() => {
    if (!isMounted) return null;
    let html = parseDiscordMarkdown(value, activeVariables);
    if (variableSamples) {
      html = html.replace(/data-variable="(\w+)">[^<]+<\/span>/g, (match, name: string) => {
        const sample = variableSamples[name];
        if (sample === undefined) return match;
        const escaped = sample.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return `data-variable="${name}">${escaped}</span>`;
      });
    }
    return renderPreviewContent(html);
  }, [value, isMounted, variableSamples, activeVariables]);

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
        <div className="md:border-r md:border-input">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={maxLength}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
              EDITOR_PANE_CONTENT_CLASSES,
              'resize-none bg-transparent font-mono [field-sizing:content] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            )}
            aria-label="Markdown editor"
          />
        </div>

        <section className="border-t border-input md:border-t-0" aria-label="Preview">
          <div
            className={cn(
              EDITOR_PANE_CONTENT_CLASSES,
              'discord-preview relative -top-[3px] max-w-none',
              'font-mono md:overflow-x-auto md:overflow-y-hidden md:whitespace-nowrap',
            )}
          >
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
