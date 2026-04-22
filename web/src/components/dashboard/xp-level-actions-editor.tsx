'use client';

import { Check, ChevronDown, ChevronsUpDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { generateId, inputClasses } from '@/components/dashboard/config-editor-utils';
import { Button } from '@/components/ui/button';
import { ChannelSelector } from '@/components/ui/channel-selector';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { DiscordMarkdownEditor } from '@/components/ui/discord-markdown-editor';
import { defaultEmbedConfig, EmbedBuilder, type EmbedConfig } from '@/components/ui/embed-builder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RoleSelector } from '@/components/ui/role-selector';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type {
  BotConfig,
  DeepPartial,
  XpActionEmbedConfig,
  XpLevelAction,
  XpLevelActionEntry,
} from '@/types/config';

type GuildConfig = DeepPartial<BotConfig>;
type SearchSelectOption<T extends string> = {
  value: T;
  label: string;
  description?: string;
};

const ACTION_TYPE_OPTIONS: Array<SearchSelectOption<XpLevelAction['type']>> = [
  { value: 'grantRole', label: 'Grant Role', description: 'Add a role when this action runs.' },
  {
    value: 'removeRole',
    label: 'Remove Role',
    description: 'Remove a role when this action runs.',
  },
  { value: 'sendDm', label: 'Send DM', description: 'Message the member privately.' },
  {
    value: 'announce',
    label: 'Post Announcement',
    description: 'Post a level-up message in a server channel.',
  },
  { value: 'xpBonus', label: 'Grant XP Bonus', description: 'Award extra XP.' },
  { value: 'addReaction', label: 'Add Reaction', description: 'React to the triggering message.' },
  {
    value: 'nickPrefix',
    label: 'Nickname Prefix',
    description: 'Add text before the member nickname.',
  },
  {
    value: 'nickSuffix',
    label: 'Nickname Suffix',
    description: 'Add text after the member nickname.',
  },
  { value: 'webhook', label: 'Run Webhook', description: 'Send a templated webhook payload.' },
];

const CHANNEL_MODE_OPTIONS: Array<SearchSelectOption<NonNullable<XpLevelAction['channelMode']>>> = [
  {
    value: 'current',
    label: 'Current Channel',
    description: 'Post where the level-up happened.',
  },
  {
    value: 'specific',
    label: 'Specific Channel',
    description: 'Always post in one configured channel.',
  },
  {
    value: 'none',
    label: 'No Public Announcement',
    description: 'Skip the public message for this action.',
  },
];

const MESSAGE_FORMAT_OPTIONS: Array<SearchSelectOption<NonNullable<XpLevelAction['format']>>> = [
  { value: 'text', label: 'Text', description: 'Send a Discord markdown message.' },
  { value: 'embed', label: 'Embed', description: 'Send a rich embed message.' },
  { value: 'both', label: 'Text + Embed', description: 'Send both message types.' },
];

const TEMPLATE_VARIABLES = [
  'username',
  'mention',
  'userId',
  'level',
  'previousLevel',
  'xp',
  'xpToNext',
  'serverName',
  'serverId',
  'serverIcon',
  'memberCount',
  'channel',
  'rank',
  'messages',
  'roleName',
  'roleMention',
  'voiceHours',
  'daysActive',
  'joinDate',
  'avatar',
  'nextLevel',
];

const TEMPLATE_SAMPLES: Record<string, string> = {
  username: 'Ada',
  mention: '<@1234567890>',
  userId: '1234567890',
  level: '10',
  previousLevel: '9',
  xp: '4,250',
  xpToNext: '750',
  serverName: 'Volvox',
  serverId: '9876543210',
  serverIcon: 'https://cdn.discordapp.com/icons/server/icon.png',
  memberCount: '1,234',
  channel: '#general',
  rank: '#12',
  messages: '523',
  roleName: 'Regular',
  roleMention: '<@&234567890>',
  voiceHours: '42.5',
  daysActive: '89',
  joinDate: 'Jan 15, 2025',
  avatar: 'https://cdn.discordapp.com/avatars/user/avatar.png',
  nextLevel: '11',
};

const MAX_XP_BONUS_AMOUNT = 1_000_000;
const DEFAULT_EMBED_DESCRIPTION = '{{mention}} reached **Level {{level}}**!';

function createStableId(): string {
  return generateId();
}

function toKeySegment(value: string): string {
  return value.toLowerCase().replaceAll(' ', '-');
}

function getNextUnusedLevel(entries: XpLevelActionEntry[] = []): number | null {
  const levels = new Set(entries.map((entry) => entry.level).filter(Number.isFinite));
  let candidate = 1;
  while (levels.has(candidate) && candidate <= 1000) {
    candidate += 1;
  }
  return candidate <= 1000 ? candidate : null;
}

function createAction(type: XpLevelAction['type']): XpLevelAction {
  const id = createStableId();

  switch (type) {
    case 'grantRole':
    case 'removeRole':
      return { id, type, roleId: '' };
    case 'sendDm':
      return {
        id,
        type,
        format: 'text',
        message: '🎉 You reached **Level {{level}}** in **{{serverName}}**!',
      };
    case 'announce':
      return {
        id,
        type,
        channelMode: 'current',
        format: 'text',
        message: '🎉 {{mention}} reached **Level {{level}}**!',
      };
    case 'xpBonus':
      return { id, type, amount: 100 };
    case 'addReaction':
      return { id, type, emoji: '🎉' };
    case 'nickPrefix':
      return { id, type, prefix: '[Lvl {{level}}] ' };
    case 'nickSuffix':
      return { id, type, suffix: ' [Lvl {{level}}]' };
    case 'webhook':
      return {
        id,
        type,
        url: '',
        payload:
          '{"user":"{{username}}","userId":"{{userId}}","serverId":"{{serverId}}","level":"{{level}}"}',
      };
    default:
      return { id, type };
  }
}

function normalizeDraftEmbed(
  embed?: DeepPartial<XpActionEmbedConfig> | null,
): XpActionEmbedConfig | undefined {
  if (!embed) return undefined;
  return {
    ...embed,
    fields: Array.isArray(embed.fields)
      ? embed.fields.map((field) => ({
          id: field?.id ?? createStableId(),
          name: field?.name ?? '',
          value: field?.value ?? '',
          inline: Boolean(field?.inline),
        }))
      : undefined,
  };
}

function normalizeDraftAction(action?: DeepPartial<XpLevelAction> | null): XpLevelAction {
  const type = action?.type ?? 'grantRole';
  const hydratedAction =
    action && typeof action.template === 'string' && !action.message
      ? { ...action, message: action.template }
      : action;

  return {
    ...createAction(type),
    ...hydratedAction,
    id: hydratedAction?.id ?? createStableId(),
    embed: normalizeDraftEmbed(hydratedAction?.embed),
    type,
  };
}

function normalizeDraftEntry(entry?: DeepPartial<XpLevelActionEntry> | null): XpLevelActionEntry {
  return {
    id: entry?.id ?? createStableId(),
    level: entry?.level ?? 1,
    actions: Array.isArray(entry?.actions) ? entry.actions.map(normalizeDraftAction) : [],
  };
}

function draftEmbedNeedsStableIds(embed?: DeepPartial<XpActionEmbedConfig> | null): boolean {
  if (!embed || !Array.isArray(embed.fields)) {
    return false;
  }

  return embed.fields.some((field) => field && !field.id);
}

function draftActionNeedsStableIds(action?: DeepPartial<XpLevelAction> | null): boolean {
  if (!action?.id) {
    return true;
  }

  return draftEmbedNeedsStableIds(action.embed);
}

function draftEntryNeedsStableIds(entry?: DeepPartial<XpLevelActionEntry> | null): boolean {
  if (!entry?.id) {
    return true;
  }

  return Array.isArray(entry.actions) && entry.actions.some(draftActionNeedsStableIds);
}

function toSingleSelection(value?: string | null): string[] {
  return value ? [value] : [];
}

function fromSingleSelection(values: string[]): string | undefined {
  return values[0];
}

function resolveThumbnailType(embed?: XpActionEmbedConfig): EmbedConfig['thumbnailType'] {
  if (
    embed?.thumbnailType === 'user_avatar' ||
    embed?.thumbnailType === 'server_icon' ||
    embed?.thumbnailType === 'custom'
  ) {
    return embed.thumbnailType;
  }

  return 'none';
}

function toBuilderFields(embed?: XpActionEmbedConfig): EmbedConfig['fields'] {
  if (!Array.isArray(embed?.fields)) {
    return [];
  }

  return embed.fields.map((field) => ({
    id: field.id ?? createStableId(),
    name: field.name ?? '',
    value: field.value ?? '',
    inline: Boolean(field.inline),
  }));
}

function resolveFooterText(embed?: XpActionEmbedConfig): string {
  if (typeof embed?.footer === 'string') {
    return embed.footer;
  }

  if (typeof embed?.footerText === 'string') {
    return embed.footerText;
  }

  if (typeof embed?.footer?.text === 'string') {
    return embed.footer.text;
  }

  return '';
}

function resolveFooterIconUrl(embed?: XpActionEmbedConfig): string {
  if (typeof embed?.footerIconUrl === 'string') {
    return embed.footerIconUrl;
  }

  if (
    typeof embed?.footer === 'object' &&
    embed.footer &&
    typeof embed.footer.iconURL === 'string'
  ) {
    return embed.footer.iconURL;
  }

  return '';
}

function resolveImageUrl(embed?: XpActionEmbedConfig): string {
  if (typeof embed?.imageUrl === 'string') {
    return embed.imageUrl;
  }

  if (typeof embed?.image === 'string') {
    return embed.image;
  }

  return '';
}

function resolveLegacyThumbnailType(
  legacyThumbnail: string | undefined,
  embed?: XpActionEmbedConfig,
): EmbedConfig['thumbnailType'] {
  if (legacyThumbnail === '{{avatar}}') {
    return 'user_avatar';
  }

  if (legacyThumbnail === '{{serverIcon}}') {
    return 'server_icon';
  }

  if (legacyThumbnail) {
    return 'custom';
  }

  return resolveThumbnailType(embed);
}

function resolveLegacyThumbnailUrl(
  thumbnailType: EmbedConfig['thumbnailType'],
  legacyThumbnail: string | undefined,
  embed?: XpActionEmbedConfig,
): string {
  const configuredThumbnailUrl = typeof embed?.thumbnailUrl === 'string' ? embed.thumbnailUrl : '';

  if (thumbnailType === 'custom') {
    return legacyThumbnail ?? configuredThumbnailUrl;
  }

  return configuredThumbnailUrl;
}

function toBuilderConfig(
  embed?: XpActionEmbedConfig,
  format?: XpLevelAction['format'],
): EmbedConfig {
  const base = defaultEmbedConfig();
  const legacyThumbnail = typeof embed?.thumbnail === 'string' ? embed.thumbnail : undefined;
  const thumbnailType = resolveLegacyThumbnailType(legacyThumbnail, embed);
  const thumbnailUrl = resolveLegacyThumbnailUrl(thumbnailType, legacyThumbnail, embed);

  return {
    ...base,
    color: typeof embed?.color === 'string' ? embed.color : base.color,
    title: typeof embed?.title === 'string' ? embed.title : '',
    description: typeof embed?.description === 'string' ? embed.description : '',
    thumbnailType,
    thumbnailUrl,
    fields: toBuilderFields(embed),
    footerText: resolveFooterText(embed),
    footerIconUrl: resolveFooterIconUrl(embed),
    imageUrl: resolveImageUrl(embed),
    showTimestamp: embed?.showTimestamp === true || embed?.timestamp === true,
    format: format ?? 'embed',
  };
}

function fromBuilderConfig(config: EmbedConfig): XpActionEmbedConfig {
  return {
    color: config.color,
    title: config.title,
    description: config.description,
    thumbnailType: config.thumbnailType,
    thumbnailUrl: config.thumbnailUrl,
    fields: config.fields.map(({ id, ...field }) => ({ id, ...field })),
    footerText: config.footerText,
    footerIconUrl: config.footerIconUrl,
    imageUrl: config.imageUrl,
    showTimestamp: config.showTimestamp,
  };
}

function createDefaultActionEmbed(
  action: XpLevelAction,
  format: Extract<XpLevelAction['format'], 'embed' | 'both'>,
): XpActionEmbedConfig {
  return fromBuilderConfig({
    ...defaultEmbedConfig(),
    description: action.message ?? action.template ?? DEFAULT_EMBED_DESCRIPTION,
    format,
  });
}

function withMessageFormat(
  action: XpLevelAction,
  format: NonNullable<XpLevelAction['format']>,
): XpLevelAction {
  if (format === 'text' || action.embed) {
    return { ...action, format };
  }

  return {
    ...action,
    format,
    embed: createDefaultActionEmbed(action, format),
  };
}

interface SearchableActionSelectProps<T extends string> {
  readonly id: string;
  readonly value: T;
  readonly options: Array<SearchSelectOption<T>>;
  readonly disabled: boolean;
  readonly placeholder: string;
  readonly searchPlaceholder: string;
  readonly onChange: (value: T) => void;
}

function SearchableActionSelect<T extends string>({
  id,
  value,
  options,
  disabled,
  placeholder,
  searchPlaceholder,
  onChange,
}: SearchableActionSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            inputClasses,
            'h-auto min-h-[42px] justify-between px-4 py-2 text-left font-medium text-muted-foreground transition-all duration-500 hover:border-border hover:bg-muted/30 hover:text-foreground focus:ring-primary/20 group',
          )}
        >
          <span className="min-w-0 truncate">{selected?.label ?? placeholder}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-40 transition-opacity group-hover:opacity-80" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[260px] overflow-hidden rounded-2xl border-border bg-popover/95 p-0 shadow-2xl backdrop-blur-xl"
        align="start"
      >
        <Command className="bg-transparent">
          <CommandInput
            placeholder={searchPlaceholder}
            className="h-12 border-none bg-transparent text-sm focus:ring-0"
          />
          <CommandList className="max-h-[300px] scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary/10">
            <CommandEmpty className="py-8 text-center text-xs font-medium uppercase tracking-widest text-muted-foreground">
              No options found
            </CommandEmpty>
            <CommandGroup className="p-2">
              {options.map((option) => {
                const isSelected = option.value === value;

                return (
                  <CommandItem
                    key={option.value}
                    value={`${option.label} ${option.value} ${option.description ?? ''}`}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    className={cn(
                      'mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200',
                      isSelected
                        ? 'border border-primary/20 bg-primary/10 text-primary shadow-[inset_0_0_12px_hsl(var(--primary)/0.1)]'
                        : 'border border-transparent text-muted-foreground hover:bg-muted/10',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{option.label}</div>
                      {option.description ? (
                        <div className="truncate text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      ) : null}
                    </div>
                    <div
                      className={cn(
                        'flex h-4 w-4 items-center justify-center rounded-full border transition-all duration-300',
                        isSelected ? 'border-primary bg-primary' : 'border-border',
                      )}
                    >
                      {isSelected ? (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={4} />
                      ) : null}
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TemplateVariableList() {
  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-3">
      <Label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        Variables
      </Label>
      <div className="mt-3 flex flex-wrap gap-2">
        {TEMPLATE_VARIABLES.map((variable) => (
          <span
            key={variable}
            className="inline-flex min-w-0 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2 py-1 font-mono text-[11px] text-primary"
            title={
              TEMPLATE_SAMPLES[variable] ? `Example: ${TEMPLATE_SAMPLES[variable]}` : undefined
            }
          >
            {`{{${variable}}}`}
            {TEMPLATE_SAMPLES[variable] ? (
              <span className="max-w-28 truncate text-muted-foreground">
                {TEMPLATE_SAMPLES[variable]}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

function normalizeLevelActionsForWriteback(
  shouldNormalize: boolean,
  levelActions: DeepPartial<XpLevelActionEntry>[] | undefined,
): XpLevelActionEntry[] | DeepPartial<XpLevelActionEntry>[] | undefined {
  if (!shouldNormalize) {
    return levelActions;
  }

  return (Array.isArray(levelActions) ? levelActions : []).map(normalizeDraftEntry);
}

function normalizeDefaultActionsForWriteback(
  shouldNormalize: boolean,
  defaultActions: DeepPartial<XpLevelAction>[] | undefined,
): XpLevelAction[] | DeepPartial<XpLevelAction>[] | undefined {
  if (!shouldNormalize) {
    return defaultActions;
  }

  return (Array.isArray(defaultActions) ? defaultActions : []).map(normalizeDraftAction);
}

function reorderItem<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= items.length) return items;
  const copy = [...items];
  [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
  return copy;
}

interface ActionCardProps {
  readonly action: XpLevelAction;
  readonly actionIndex: number;
  readonly actionsLength: number;
  readonly guildId: string;
  readonly saving: boolean;
  readonly title: string;
  readonly actionId: string;
  readonly onChange: (action: XpLevelAction) => void;
  readonly onDelete: () => void;
  readonly onMove: (direction: -1 | 1) => void;
}

function ActionCard({
  action,
  actionIndex,
  actionsLength,
  guildId,
  saving,
  title,
  actionId,
  onChange,
  onDelete,
  onMove,
}: ActionCardProps) {
  const format = action.format ?? 'text';
  const webhookUrlId = `${actionId}-webhook-url`;
  const webhookPayloadId = `${actionId}-webhook-payload`;

  return (
    <div className="space-y-4 rounded-xl border border-border/50 bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">Action {actionIndex + 1}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onMove(-1)}
            disabled={saving || actionIndex === 0}
            aria-label="Move action up"
          >
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onMove(1)}
            disabled={saving || actionIndex === actionsLength - 1}
            aria-label="Move action down"
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onDelete}
            disabled={saving}
            aria-label="Delete action"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${actionId}-type`}>Action Type</Label>
        <SearchableActionSelect
          id={`${actionId}-type`}
          value={action.type}
          options={ACTION_TYPE_OPTIONS}
          disabled={saving}
          placeholder="Select action type"
          searchPlaceholder="Search action types..."
          onChange={(value) =>
            onChange({
              ...createAction(value),
              id: action.id,
            })
          }
        />
      </div>

      {(action.type === 'grantRole' || action.type === 'removeRole') && (
        <div className="space-y-2">
          <Label htmlFor={`${actionId}-role`}>Role</Label>
          <RoleSelector
            id={`${actionId}-role`}
            guildId={guildId}
            selected={toSingleSelection(action.roleId)}
            onChange={(selected) => onChange({ ...action, roleId: fromSingleSelection(selected) })}
            maxSelections={1}
            disabled={saving}
            placeholder="Select a role..."
          />
        </div>
      )}

      {(action.type === 'sendDm' || action.type === 'announce') && (
        <div className="space-y-4">
          {action.type === 'announce' && (
            <div className="space-y-2">
              <Label htmlFor={`${actionId}-channel-mode`}>Announcement Channel</Label>
              <SearchableActionSelect
                id={`${actionId}-channel-mode`}
                value={action.channelMode ?? 'current'}
                options={CHANNEL_MODE_OPTIONS}
                disabled={saving}
                placeholder="Select announcement channel"
                searchPlaceholder="Search channel routing..."
                onChange={(value) =>
                  onChange({
                    ...action,
                    channelMode: value,
                  })
                }
              />
              {(action.channelMode ?? 'current') === 'specific' && (
                <ChannelSelector
                  guildId={guildId}
                  selected={toSingleSelection(action.channelId)}
                  onChange={(selected) =>
                    onChange({ ...action, channelId: fromSingleSelection(selected) })
                  }
                  maxSelections={1}
                  disabled={saving}
                  placeholder="Select a channel..."
                  filter="text"
                />
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor={`${actionId}-format`}>Message Format</Label>
            <SearchableActionSelect
              id={`${actionId}-format`}
              value={format}
              options={MESSAGE_FORMAT_OPTIONS}
              disabled={saving}
              placeholder="Select message format"
              searchPlaceholder="Search formats..."
              onChange={(value) => onChange(withMessageFormat(action, value))}
            />
          </div>

          {(format === 'text' || format === 'both') && (
            <div className="space-y-2">
              <Label>{action.type === 'sendDm' ? 'DM Message' : 'Announcement Message'}</Label>
              <DiscordMarkdownEditor
                value={action.message ?? action.template ?? ''}
                onChange={(message) => onChange({ ...action, message, template: message })}
                variables={TEMPLATE_VARIABLES}
                variableSamples={TEMPLATE_SAMPLES}
                maxLength={2000}
                disabled={saving}
                placeholder="Write a Discord markdown message..."
              />
            </div>
          )}

          {(format === 'embed' || format === 'both') && (
            <div className="space-y-2">
              <Label>Embed</Label>
              <EmbedBuilder
                value={toBuilderConfig(action.embed, format)}
                onChange={(embedConfig) =>
                  onChange({
                    ...action,
                    format: embedConfig.format,
                    embed: fromBuilderConfig(embedConfig),
                  })
                }
                variables={TEMPLATE_VARIABLES}
              />
            </div>
          )}
        </div>
      )}

      {action.type === 'xpBonus' && (
        <div className="space-y-2">
          <Label htmlFor={`${actionId}-bonus-xp`}>Bonus XP</Label>
          <Input
            id={`${actionId}-bonus-xp`}
            type="number"
            min={1}
            max={MAX_XP_BONUS_AMOUNT}
            step={1}
            value={action.amount ?? 100}
            disabled={saving}
            onChange={(event) =>
              onChange({
                ...action,
                amount: Math.max(
                  1,
                  Math.min(
                    MAX_XP_BONUS_AMOUNT,
                    Number.parseInt(event.target.value || '0', 10) || 1,
                  ),
                ),
              })
            }
          />
        </div>
      )}

      {action.type === 'addReaction' && (
        <div className="space-y-2">
          <Label htmlFor={`${actionId}-emoji`}>Reaction Emoji</Label>
          <Input
            id={`${actionId}-emoji`}
            value={action.emoji ?? ''}
            disabled={saving}
            onChange={(event) => onChange({ ...action, emoji: event.target.value })}
            placeholder="🎉"
          />
        </div>
      )}

      {(action.type === 'nickPrefix' || action.type === 'nickSuffix') && (
        <div className="space-y-2">
          <Label>{action.type === 'nickPrefix' ? 'Nickname Prefix' : 'Nickname Suffix'}</Label>
          <DiscordMarkdownEditor
            value={
              action.type === 'nickPrefix'
                ? (action.prefix ?? action.template ?? '')
                : (action.suffix ?? action.template ?? '')
            }
            onChange={(value) =>
              onChange(
                action.type === 'nickPrefix'
                  ? { ...action, prefix: value, template: value }
                  : { ...action, suffix: value, template: value },
              )
            }
            variables={TEMPLATE_VARIABLES}
            variableSamples={TEMPLATE_SAMPLES}
            maxLength={32}
            disabled={saving}
            placeholder={action.type === 'nickPrefix' ? '[Lvl {{level}}] ' : ' [Lvl {{level}}]'}
          />
          <p className="text-xs text-muted-foreground">
            Discord nicknames max out at 32 characters after template rendering.
          </p>
        </div>
      )}

      {action.type === 'webhook' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={webhookUrlId}>Webhook URL</Label>
            <Input
              id={webhookUrlId}
              value={action.url ?? ''}
              disabled={saving}
              onChange={(event) => onChange({ ...action, url: event.target.value })}
              placeholder="https://example.com/hook"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor={webhookPayloadId}>Payload Template</Label>
            <Textarea
              id={webhookPayloadId}
              value={action.payload ?? ''}
              disabled={saving}
              onChange={(event) => onChange({ ...action, payload: event.target.value })}
              rows={4}
              placeholder='{"userId":"{{userId}}","serverId":"{{serverId}}","level":"{{level}}"}'
            />
            <TemplateVariableList />
          </div>
        </div>
      )}
    </div>
  );
}

interface ActionGroupProps {
  readonly title: string;
  readonly description: string;
  readonly actions: XpLevelAction[];
  readonly guildId: string;
  readonly saving: boolean;
  readonly onChange: (actions: XpLevelAction[]) => void;
}

function ActionGroup({ title, description, actions, guildId, saving, onChange }: ActionGroupProps) {
  const titleKey = toKeySegment(title);
  const updateAction = (index: number, nextAction: XpLevelAction) => {
    const next = [...actions];
    next[index] = nextAction;
    onChange(next);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, candidateIndex) => candidateIndex !== index));
  };

  const moveAction = (index: number, direction: -1 | 1) => {
    onChange(reorderItem(actions, index, direction));
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...actions, createAction('grantRole')])}
          disabled={saving}
        >
          <Plus className="mr-1 h-4 w-4" />
          Add Action
        </Button>
      </div>

      {actions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No actions configured yet. Add one to start building the pipeline.
        </p>
      )}

      {actions.map((action, actionIndex) => (
        <ActionCard
          key={action.id ?? `${titleKey}-action-${actionIndex}`}
          action={action}
          actionIndex={actionIndex}
          actionsLength={actions.length}
          guildId={guildId}
          saving={saving}
          title={title}
          actionId={`${titleKey}-${action.id ?? `action-${actionIndex}`}`}
          onChange={(nextAction) => updateAction(actionIndex, nextAction)}
          onDelete={() => removeAction(actionIndex)}
          onMove={(direction) => moveAction(actionIndex, direction)}
        />
      ))}
    </div>
  );
}

interface XpLevelActionsEditorProps {
  readonly draftConfig: GuildConfig;
  readonly guildId: string;
  readonly saving: boolean;
  readonly updateDraftConfig: (updater: (prev: GuildConfig) => GuildConfig) => void;
}

export function XpLevelActionsEditor({
  draftConfig,
  guildId,
  saving,
  updateDraftConfig,
}: XpLevelActionsEditorProps) {
  const rawLevelActions = Array.isArray(draftConfig.xp?.levelActions)
    ? draftConfig.xp.levelActions
    : [];
  const rawDefaultActions = Array.isArray(draftConfig.xp?.defaultActions)
    ? draftConfig.xp.defaultActions
    : [];
  const levelEntries = useMemo(() => rawLevelActions.map(normalizeDraftEntry), [rawLevelActions]);
  const defaultActions = useMemo(
    () => rawDefaultActions.map(normalizeDraftAction),
    [rawDefaultActions],
  );
  const nextUnusedLevel = getNextUnusedLevel(levelEntries);

  useEffect(() => {
    const shouldNormalizeLevelActions = rawLevelActions.some(draftEntryNeedsStableIds);
    const shouldNormalizeDefaultActions = rawDefaultActions.some(draftActionNeedsStableIds);

    if (!shouldNormalizeLevelActions && !shouldNormalizeDefaultActions) {
      return;
    }

    updateDraftConfig((prev) => ({
      ...prev,
      xp: {
        ...prev.xp,
        levelActions: normalizeLevelActionsForWriteback(
          shouldNormalizeLevelActions,
          prev.xp?.levelActions,
        ),
        defaultActions: normalizeDefaultActionsForWriteback(
          shouldNormalizeDefaultActions,
          prev.xp?.defaultActions,
        ),
      },
    }));
  }, [rawDefaultActions, rawLevelActions, updateDraftConfig]);

  const updateLevelEntries = (updater: (entries: XpLevelActionEntry[]) => XpLevelActionEntry[]) => {
    updateDraftConfig((prev) => ({
      ...prev,
      xp: {
        ...prev.xp,
        levelActions: updater(
          (Array.isArray(prev.xp?.levelActions) ? prev.xp.levelActions : []).map(
            normalizeDraftEntry,
          ),
        ),
      },
    }));
  };

  const updateLevelEntry = (
    entryIndex: number,
    updater: (entry: XpLevelActionEntry) => XpLevelActionEntry,
  ) => {
    updateLevelEntries((entries) => {
      const nextEntries = [...entries];
      nextEntries[entryIndex] = updater(nextEntries[entryIndex] ?? normalizeDraftEntry());
      return nextEntries;
    });
  };

  const handleDeleteLevelEntry = (entryIndex: number) => {
    updateLevelEntries((entries) =>
      entries.filter((_, candidateIndex) => candidateIndex !== entryIndex),
    );
  };

  const handleMoveLevelEntry = (entryIndex: number, direction: -1 | 1) => {
    updateLevelEntries((entries) => reorderItem(entries, entryIndex, direction));
  };

  const handleAddLevelEntry = () => {
    updateLevelEntries((entries) => {
      const level = getNextUnusedLevel(entries);
      if (level == null) {
        return entries;
      }

      return [
        ...entries,
        {
          id: createStableId(),
          level,
          actions: [],
        },
      ];
    });
  };

  return (
    <div className="space-y-6">
      <ActionGroup
        title="Default Actions"
        description="These run on every level-up unless a specific level has its own action list."
        actions={defaultActions}
        guildId={guildId}
        saving={saving}
        onChange={(actions) =>
          updateDraftConfig((prev) => ({
            ...prev,
            xp: { ...prev.xp, defaultActions: actions.map(normalizeDraftAction) },
          }))
        }
      />

      <div className="space-y-4 rounded-2xl border border-border/60 bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold">Per-Level Actions</h4>
            <p className="text-xs text-muted-foreground">
              Add level-specific pipelines for milestones like 5, 10, and 25.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleAddLevelEntry}
            disabled={saving || nextUnusedLevel == null}
          >
            <Plus className="mr-1 h-4 w-4" />
            Add Level
          </Button>
        </div>

        {levelEntries.length === 0 && (
          <p className="text-sm text-muted-foreground">No level-specific action groups yet.</p>
        )}

        {levelEntries.map((entry, entryIndex) => (
          <div
            key={entry.id ?? `level-action-entry-${entryIndex}`}
            className="space-y-4 rounded-xl border border-border/50 bg-background/70 p-4"
          >
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor={`level-entry-${entry.id ?? entryIndex}`}>Level</Label>
                <Input
                  id={`level-entry-${entry.id ?? entryIndex}`}
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={entry.level ?? 1}
                  disabled={saving}
                  onChange={(event) => {
                    const nextLevel = Math.max(
                      1,
                      Math.min(1000, Number.parseInt(event.target.value || '1', 10) || 1),
                    );
                    const alreadyUsed = levelEntries.some(
                      (candidate, candidateIndex) =>
                        candidateIndex !== entryIndex && candidate.level === nextLevel,
                    );
                    if (!alreadyUsed) {
                      updateLevelEntry(entryIndex, (currentEntry) => ({
                        ...currentEntry,
                        level: nextLevel,
                      }));
                    }
                  }}
                />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleMoveLevelEntry(entryIndex, -1)}
                  disabled={saving || entryIndex === 0}
                  aria-label="Move level up"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleMoveLevelEntry(entryIndex, 1)}
                  disabled={saving || entryIndex === levelEntries.length - 1}
                  aria-label="Move level down"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => handleDeleteLevelEntry(entryIndex)}
                  disabled={saving}
                  aria-label="Delete level"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <ActionGroup
              title={`Level ${entry.level ?? 1}`}
              description="These actions override the default list when the member reaches this exact level."
              actions={entry.actions ?? []}
              guildId={guildId}
              saving={saving}
              onChange={(actions) =>
                updateLevelEntry(entryIndex, (currentEntry) => ({
                  ...currentEntry,
                  actions: actions.map(normalizeDraftAction),
                }))
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
