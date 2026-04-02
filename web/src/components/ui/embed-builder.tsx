'use client';

import * as React from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Eye,
  Settings,
  Clock,
  ImageIcon,
  Type,
  AlignLeft,
  Columns,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { Label } from './label';
import { Switch } from './switch';

// ── Types ───────────────────────────────────────────────────────────

export interface EmbedField {
  name: string;
  value: string;
  inline: boolean;
}

export type ThumbnailType = 'none' | 'user_avatar' | 'server_icon' | 'custom';
export type FormatType = 'text' | 'embed' | 'text_embed';

export interface EmbedConfig {
  color: string;
  title: string;
  description: string;
  thumbnailType: ThumbnailType;
  thumbnailUrl: string;
  fields: EmbedField[];
  footerText: string;
  footerIconUrl: string;
  imageUrl: string;
  showTimestamp: boolean;
  format: FormatType;
}

export interface EmbedBuilderProps {
  value: EmbedConfig;
  onChange: (config: EmbedConfig) => void;
  variables?: string[];
  className?: string;
}

// ── Constants ───────────────────────────────────────────────────────

export const CHAR_LIMITS = {
  title: 256,
  description: 4096,
  fieldName: 256,
  fieldValue: 1024,
  footer: 2048,
  total: 6000,
} as const;

const DISCORD_PRESET_COLORS = [
  '#5865F2', // Blurple
  '#57F287', // Green
  '#FEE75C', // Yellow
  '#EB459E', // Fuchsia
  '#ED4245', // Red
  '#FFFFFF', // White
  '#E67E22', // Orange
  '#1ABC9C', // Teal
  '#3498DB', // Blue
  '#9B59B6', // Purple
];

const THUMBNAIL_OPTIONS: { value: ThumbnailType; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'user_avatar', label: 'User Avatar' },
  { value: 'server_icon', label: 'Server Icon' },
  { value: 'custom', label: 'Custom URL' },
];

const FORMAT_OPTIONS: { value: FormatType; label: string }[] = [
  { value: 'text', label: 'Text Only' },
  { value: 'embed', label: 'Embed Only' },
  { value: 'text_embed', label: 'Text + Embed' },
];

// ── Helpers ─────────────────────────────────────────────────────────

export function defaultEmbedConfig(): EmbedConfig {
  return {
    color: '#5865F2',
    title: '',
    description: '',
    thumbnailType: 'none',
    thumbnailUrl: '',
    fields: [],
    footerText: '',
    footerIconUrl: '',
    imageUrl: '',
    showTimestamp: false,
    format: 'embed',
  };
}

export function getTotalCharCount(config: EmbedConfig): number {
  let total = config.title.length + config.description.length + config.footerText.length;
  for (const field of config.fields) {
    total += field.name.length + field.value.length;
  }
  return total;
}

/** Render template variables as styled badges in a string for preview */
function renderVariablePreview(text: string): React.ReactNode[] {
  const parts = text.split(/({{[^}]+}})/g);
  return parts.map((part, i) => {
    if (part.startsWith('{{') && part.endsWith('}}')) {
      const varName = part.slice(2, -2);
      return (
        <span
          key={`${varName}-${i}`}
          className="inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary"
        >
          {varName}
        </span>
      );
    }
    return <span key={`text-${i}`}>{part}</span>;
  });
}

/** Very lightweight Discord markdown → HTML (bold, italic, code, codeblock) */
function renderDiscordMarkdown(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];

  for (let li = 0; li < lines.length; li++) {
    if (li > 0) result.push(<br key={`br-${li}`} />);
    const line = lines[li];
    // Split by variable tokens first, then process markdown in text segments
    const segments = line.split(/({{[^}]+}}|\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
    for (let si = 0; si < segments.length; si++) {
      const seg = segments[si];
      if (!seg) continue;
      if (seg.startsWith('{{') && seg.endsWith('}}')) {
        const varName = seg.slice(2, -2);
        result.push(
          <span
            key={`var-${li}-${si}`}
            className="inline-flex items-center rounded bg-primary/20 px-1.5 py-0.5 text-xs font-medium text-primary"
          >
            {varName}
          </span>,
        );
      } else if (seg.startsWith('**') && seg.endsWith('**')) {
        result.push(
          <strong key={`b-${li}-${si}`}>{seg.slice(2, -2)}</strong>,
        );
      } else if (seg.startsWith('*') && seg.endsWith('*')) {
        result.push(<em key={`i-${li}-${si}`}>{seg.slice(1, -1)}</em>);
      } else if (seg.startsWith('`') && seg.endsWith('`')) {
        result.push(
          <code
            key={`c-${li}-${si}`}
            className="rounded bg-muted px-1 py-0.5 text-xs font-mono"
          >
            {seg.slice(1, -1)}
          </code>,
        );
      } else {
        result.push(<span key={`t-${li}-${si}`}>{seg}</span>);
      }
    }
  }
  return result;
}

// ── CharCount indicator ─────────────────────────────────────────────

function CharCount({ current, max }: { current: number; max: number }) {
  const ratio = current / max;
  return (
    <span
      data-testid="char-count"
      className={cn(
        'text-xs tabular-nums',
        ratio >= 1 ? 'text-destructive font-semibold' : ratio >= 0.9 ? 'text-yellow-500' : 'text-muted-foreground',
      )}
    >
      {current}/{max}
    </span>
  );
}

// ── Variable Badge Palette ──────────────────────────────────────────

function VariablePalette({
  variables,
  onInsert,
}: {
  variables: string[];
  onInsert: (variable: string) => void;
}) {
  if (!variables.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {variables.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onInsert(v)}
          className="inline-flex items-center rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/20 transition-colors cursor-pointer"
        >
          {`{{${v}}}`}
        </button>
      ))}
    </div>
  );
}

// ── Embed Preview ───────────────────────────────────────────────────

function EmbedPreview({ config }: { config: EmbedConfig }) {
  const hasContent =
    config.title || config.description || config.fields.length > 0 || config.footerText || config.imageUrl;

  if (!hasContent) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        Start editing to see a preview
      </div>
    );
  }

  return (
    <div
      data-testid="embed-preview"
      className="rounded-md overflow-hidden border border-border bg-[#2b2d31] text-[#dbdee1] text-sm"
    >
      <div className="flex">
        {/* Accent color bar */}
        <div
          className="w-1 shrink-0 rounded-l"
          style={{ backgroundColor: config.color }}
          data-testid="embed-color-bar"
        />

        <div className="flex-1 p-3 space-y-2 min-w-0">
          <div className="flex gap-3">
            <div className="flex-1 min-w-0 space-y-1">
              {/* Title */}
              {config.title && (
                <div className="font-semibold text-white" data-testid="embed-preview-title">
                  {renderVariablePreview(config.title)}
                </div>
              )}

              {/* Description */}
              {config.description && (
                <div className="text-sm leading-relaxed whitespace-pre-wrap" data-testid="embed-preview-description">
                  {renderDiscordMarkdown(config.description)}
                </div>
              )}
            </div>

            {/* Thumbnail */}
            {config.thumbnailType !== 'none' && (
              <div className="shrink-0">
                {config.thumbnailType === 'custom' && config.thumbnailUrl ? (
                  <img
                    src={config.thumbnailUrl}
                    alt="Thumbnail"
                    className="w-16 h-16 rounded object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded bg-[#404249] flex items-center justify-center text-xs text-[#80848e]">
                    {config.thumbnailType === 'user_avatar' ? 'Avatar' : 'Icon'}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Fields */}
          {config.fields.length > 0 && (
            <div className="grid grid-cols-3 gap-2" data-testid="embed-preview-fields">
              {config.fields.map((field, i) => (
                <div
                  key={`field-${i}`}
                  className={cn(field.inline ? 'col-span-1' : 'col-span-3')}
                >
                  <div className="font-semibold text-xs text-white">
                    {renderVariablePreview(field.name) || '\u200b'}
                  </div>
                  <div className="text-xs">
                    {renderDiscordMarkdown(field.value) || '\u200b'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Image */}
          {config.imageUrl && (
            <div className="mt-2">
              <img
                src={config.imageUrl}
                alt="Embed"
                className="max-w-full rounded max-h-64 object-contain"
              />
            </div>
          )}

          {/* Footer */}
          {(config.footerText || config.showTimestamp) && (
            <div className="flex items-center gap-1.5 text-xs text-[#80848e]" data-testid="embed-preview-footer">
              {config.footerIconUrl && (
                <img
                  src={config.footerIconUrl}
                  alt="Footer icon"
                  className="w-5 h-5 rounded-full object-cover"
                />
              )}
              {config.footerText && <span>{renderVariablePreview(config.footerText)}</span>}
              {config.footerText && config.showTimestamp && <span>•</span>}
              {config.showTimestamp && <span>Today at 12:00 PM</span>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

function EmbedBuilder({ value, onChange, variables = [], className }: EmbedBuilderProps) {
  const update = React.useCallback(
    (patch: Partial<EmbedConfig>) => {
      onChange({ ...value, ...patch });
    },
    [value, onChange],
  );

  const updateField = React.useCallback(
    (index: number, patch: Partial<EmbedField>) => {
      const fields = [...value.fields];
      fields[index] = { ...fields[index], ...patch };
      onChange({ ...value, fields });
    },
    [value, onChange],
  );

  const addField = React.useCallback(() => {
    onChange({
      ...value,
      fields: [...value.fields, { name: '', value: '', inline: false }],
    });
  }, [value, onChange]);

  const removeField = React.useCallback(
    (index: number) => {
      onChange({
        ...value,
        fields: value.fields.filter((_, i) => i !== index),
      });
    },
    [value, onChange],
  );

  const moveField = React.useCallback(
    (index: number, direction: 'up' | 'down') => {
      const fields = [...value.fields];
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= fields.length) return;
      [fields[index], fields[target]] = [fields[target], fields[index]];
      onChange({ ...value, fields });
    },
    [value, onChange],
  );

  const totalChars = getTotalCharCount(value);

  return (
    <div className={cn('grid gap-6 lg:grid-cols-2', className)}>
      {/* ── Editor Panel ─────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Settings className="size-4" />
            Embed Editor
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Total:</span>
            <CharCount current={totalChars} max={CHAR_LIMITS.total} />
          </div>
        </div>

        {/* Format selector */}
        <div className="space-y-1.5">
          <Label className="text-xs">Format</Label>
          <div className="flex gap-1">
            {FORMAT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ format: opt.value })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  value.format === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div className="space-y-1.5">
          <Label className="text-xs">Accent Color</Label>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 flex-wrap">
              {DISCORD_PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => update({ color: c })}
                  className={cn(
                    'size-6 rounded-md border-2 transition-all',
                    value.color === c ? 'border-foreground scale-110' : 'border-transparent',
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
            <Input
              value={value.color}
              onChange={(e) => update({ color: e.target.value })}
              className="w-24 h-8 text-xs font-mono"
              maxLength={7}
              placeholder="#5865F2"
            />
          </div>
        </div>

        {/* Title */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <Type className="size-3" /> Title
            </Label>
            <CharCount current={value.title.length} max={CHAR_LIMITS.title} />
          </div>
          <Input
            value={value.title}
            onChange={(e) => update({ title: e.target.value })}
            placeholder="Embed title..."
            maxLength={CHAR_LIMITS.title}
          />
          {variables.length > 0 && (
            <VariablePalette
              variables={variables}
              onInsert={(v) => update({ title: `${value.title}{{${v}}}` })}
            />
          )}
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <AlignLeft className="size-3" /> Description
            </Label>
            <CharCount current={value.description.length} max={CHAR_LIMITS.description} />
          </div>
          <Textarea
            value={value.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="Embed description... Supports **bold**, *italic*, `code`"
            maxLength={CHAR_LIMITS.description}
            rows={4}
          />
          {variables.length > 0 && (
            <VariablePalette
              variables={variables}
              onInsert={(v) => update({ description: `${value.description}{{${v}}}` })}
            />
          )}
        </div>

        {/* Thumbnail */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <ImageIcon className="size-3" /> Thumbnail
          </Label>
          <div className="flex gap-1 flex-wrap">
            {THUMBNAIL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ thumbnailType: opt.value })}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
                  value.thumbnailType === opt.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {value.thumbnailType === 'custom' && (
            <Input
              value={value.thumbnailUrl}
              onChange={(e) => update({ thumbnailUrl: e.target.value })}
              placeholder="https://example.com/thumbnail.png"
              className="h-8 text-xs"
            />
          )}
        </div>

        {/* Fields */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs flex items-center gap-1">
              <Columns className="size-3" /> Fields
            </Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addField}
              className="h-7 text-xs"
            >
              <Plus className="size-3 mr-1" />
              Add Field
            </Button>
          </div>

          {value.fields.map((field, i) => (
            <div
              key={`field-editor-${i}`}
              className="rounded-md border border-border p-3 space-y-2 bg-muted/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Field {i + 1}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => moveField(i, 'up')}
                    disabled={i === 0}
                    aria-label="Move field up"
                  >
                    <ChevronUp className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    onClick={() => moveField(i, 'down')}
                    disabled={i === value.fields.length - 1}
                    aria-label="Move field down"
                  >
                    <ChevronDown className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 text-destructive hover:text-destructive"
                    onClick={() => removeField(i)}
                    aria-label="Remove field"
                  >
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Name</Label>
                  <CharCount current={field.name.length} max={CHAR_LIMITS.fieldName} />
                </div>
                <Input
                  value={field.name}
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  placeholder="Field name"
                  maxLength={CHAR_LIMITS.fieldName}
                  className="h-8 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">Value</Label>
                  <CharCount current={field.value.length} max={CHAR_LIMITS.fieldValue} />
                </div>
                <Textarea
                  value={field.value}
                  onChange={(e) => updateField(i, { value: e.target.value })}
                  placeholder="Field value"
                  maxLength={CHAR_LIMITS.fieldValue}
                  rows={2}
                  className="text-xs min-h-[60px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={field.inline}
                  onCheckedChange={(checked: boolean) => updateField(i, { inline: checked })}
                  size="sm"
                  aria-label={`Field ${i + 1} inline`}
                />
                <Label className="text-xs">Inline</Label>
              </div>

              {variables.length > 0 && (
                <VariablePalette
                  variables={variables}
                  onInsert={(v) => updateField(i, { name: `${field.name}{{${v}}}` })}
                />
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Footer Text</Label>
            <CharCount current={value.footerText.length} max={CHAR_LIMITS.footer} />
          </div>
          <Input
            value={value.footerText}
            onChange={(e) => update({ footerText: e.target.value })}
            placeholder="Footer text..."
            maxLength={CHAR_LIMITS.footer}
          />
          <Input
            value={value.footerIconUrl}
            onChange={(e) => update({ footerIconUrl: e.target.value })}
            placeholder="Footer icon URL (optional)"
            className="h-8 text-xs"
          />
        </div>

        {/* Image */}
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            <ImageIcon className="size-3" /> Image URL
          </Label>
          <Input
            value={value.imageUrl}
            onChange={(e) => update({ imageUrl: e.target.value })}
            placeholder="https://example.com/image.png"
          />
        </div>

        {/* Timestamp toggle */}
        <div className="flex items-center gap-2">
          <Switch
            checked={value.showTimestamp}
            onCheckedChange={(checked: boolean) => update({ showTimestamp: checked })}
            aria-label="Show Timestamp"
          />
          <Label className="text-xs flex items-center gap-1">
            <Clock className="size-3" /> Show Timestamp
          </Label>
        </div>
      </div>

      {/* ── Preview Panel ────────────────── */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Eye className="size-4" />
          Preview
        </h3>
        <EmbedPreview config={value} />
      </div>
    </div>
  );
}

export {
  EmbedBuilder,
  EmbedPreview,
  CharCount,
  VariablePalette,
  renderDiscordMarkdown,
  renderVariablePreview,
};
