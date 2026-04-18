'use client';

import { AlertTriangle, Clock, ExternalLink, Flag, Hash, Zap } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

export interface ConversationMessage {
  id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  username: string;
  userId?: string | null;
  avatarUrl?: string | null;
  createdAt: string;
  flagStatus?: string | null;
  messageUrl?: string | null;
}

interface ConversationReplayProps {
  messages: ConversationMessage[];
  channelId: string;
  channelName?: string | null;
  duration: number;
  tokenEstimate: number;
  mentionMap?: Record<string, string>;
  guildId: string;
  onFlagSubmitted?: () => void;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hours}h ${remainMins}m`;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function shouldShowTimestamp(current: string, previous: string | null): boolean {
  if (!previous) return true;
  const diff = new Date(current).getTime() - new Date(previous).getTime();
  return diff > 5 * 60 * 1000;
}

export function ConversationReplay({
  messages,
  channelId,
  channelName,
  duration,
  tokenEstimate,
  mentionMap,
  guildId,
  onFlagSubmitted,
}: ConversationReplayProps) {
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagMessageId, setFlagMessageId] = useState<number | null>(null);
  const [flagReason, setFlagReason] = useState('');
  const [flagNotes, setFlagNotes] = useState('');
  const [flagSubmitting, setFlagSubmitting] = useState(false);
  const [flagError, setFlagError] = useState<string | null>(null);

  const conversationId = messages[0]?.id;

  const openFlagDialog = useCallback((messageId: number) => {
    setFlagMessageId(messageId);
    setFlagReason('');
    setFlagNotes('');
    setFlagError(null);
    setFlagDialogOpen(true);
  }, []);

  const submitFlag = useCallback(async () => {
    if (!flagMessageId || !flagReason || !conversationId || !guildId) return;
    setFlagSubmitting(true);
    setFlagError(null);
    try {
      const res = await fetch(
        `/api/guilds/${encodeURIComponent(guildId)}/conversations/${conversationId}/flag`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messageId: flagMessageId,
            reason: flagReason,
            notes: flagNotes || undefined,
          }),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to flag message (${res.status})`);
      }
      setFlagDialogOpen(false);
      onFlagSubmitted?.();
    } catch (err) {
      setFlagError(err instanceof Error ? err.message : 'Failed to flag message');
    } finally {
      setFlagSubmitting(false);
    }
  }, [flagMessageId, flagReason, flagNotes, conversationId, guildId, onFlagSubmitted]);

  // Map of userId -> username for resolving mentions
  const participantMap = new Map<string, string>();
  for (const msg of messages) {
    if (msg.userId && msg.username) {
      participantMap.set(msg.userId, msg.username);
    }
  }

  const resolveMentions = (content: string) => {
    // Matches <@123...> or <@!123...>
    return content.replace(/<@!?(\d+)>/g, (match, userId) => {
      const username = mentionMap?.[userId] || participantMap.get(userId);
      return username ? `@${username}` : match;
    });
  };

  return (
    <div className="space-y-6">
      {/* Stats Strip */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-3 py-1 backdrop-blur-md">
          <Hash className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
            {channelName ?? channelId}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-3 py-1 backdrop-blur-md">
          <Clock className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
            {formatDuration(duration)}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full border border-border/40 bg-card/40 px-3 py-1 backdrop-blur-md">
          <Zap className="h-3 w-3 text-muted-foreground/40" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
            ~{tokenEstimate.toLocaleString()} tokens
          </span>
        </div>
        <div className="ml-auto text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">
          {messages.length} messages captured
        </div>
      </div>

      {/* Message Replay Area */}
      <div className="relative overflow-hidden rounded-[28px] border border-border/40 bg-card/20 backdrop-blur-2xl p-6 shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-4">
          {messages.map((msg, idx) => {
            const prevTimestamp = idx > 0 ? messages[idx - 1].createdAt : null;
            const showTimestamp = shouldShowTimestamp(msg.createdAt, prevTimestamp);
            const isFlagged = msg.flagStatus === 'open';
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';

            if (isSystem) {
              return (
                <div key={msg.id} className="flex justify-center py-2">
                  <p className="max-w-lg rounded-full border border-border/20 bg-white/5 px-4 py-1 text-[10px] font-medium uppercase tracking-widest text-muted-foreground/40">
                    {msg.content}
                  </p>
                </div>
              );
            }

            return (
              <div key={msg.id} className="space-y-1">
                {showTimestamp && (
                  <div className="flex justify-center py-4">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground/20">
                      {formatTimestamp(msg.createdAt)}
                    </span>
                  </div>
                )}
                <div className={cn('flex gap-3', isUser ? 'flex-row-reverse' : 'flex-row')}>
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[10px] font-black text-white shadow-lg ring-1 ring-white/10 transition-transform hover:scale-110 overflow-hidden',
                      isUser
                        ? 'bg-gradient-to-br from-primary to-primary/60'
                        : 'bg-gradient-to-br from-muted-foreground/40 to-muted-foreground/20',
                    )}
                  >
                    {msg.avatarUrl ? (
                      <img
                        src={msg.avatarUrl}
                        alt={msg.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (msg.username || msg.role).slice(0, 2).toUpperCase()
                    )}
                  </div>

                  {/* Bubble Container */}
                  <div
                    className={cn(
                      'group relative max-w-[80%] space-y-1',
                      isUser ? 'items-end' : 'items-start',
                    )}
                  >
                    <div
                      className={cn(
                        'flex items-center gap-2 px-1',
                        isUser ? 'flex-row-reverse' : 'flex-row',
                      )}
                    >
                      <span className="text-[10px] font-bold text-muted-foreground/60">
                        {msg.username || msg.role}
                      </span>
                      {msg.messageUrl && (
                        <a
                          href={msg.messageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <ExternalLink className="h-3 w-3 text-muted-foreground/40 hover:text-primary" />
                        </a>
                      )}
                    </div>

                    <div
                      className={cn(
                        'relative overflow-hidden rounded-[20px] px-4 py-3 shadow-xl ring-1',
                        isUser
                          ? 'bg-primary/90 text-primary-foreground ring-white/10 rounded-tr-none'
                          : 'bg-card/80 text-foreground ring-white/5 rounded-tl-none border-t border-white/5',
                        isFlagged && 'ring-2 ring-red-500/50 bg-red-500/5',
                      )}
                    >
                      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                        {resolveMentions(msg.content)}
                      </p>

                      {/* Flagging actions for assistant messages */}
                      {!isUser && !isFlagged && (
                        <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-500"
                            onClick={() => openFlagDialog(msg.id)}
                          >
                            <Flag className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {isFlagged && (
                        <div className="mt-2 flex items-center gap-1.5 border-t border-red-500/20 pt-2 text-[10px] font-bold uppercase tracking-widest text-red-400">
                          <AlertTriangle className="h-3 w-3" />
                          Marked for review
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent className="rounded-[28px] border-border/40 bg-card/95 backdrop-blur-3xl shadow-2xl">
          <DialogHeader>
            <DialogTitle>Flag AI Response</DialogTitle>
            <DialogDescription>Report a problematic AI response for review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label
                htmlFor="flag-reason"
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60"
              >
                Reason
              </Label>
              <Select value={flagReason} onValueChange={setFlagReason}>
                <SelectTrigger
                  id="flag-reason"
                  className="h-11 rounded-xl border-border/40 bg-background/30 backdrop-blur-sm shadow-inner"
                >
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-white/10 bg-popover/95 backdrop-blur-xl">
                  <SelectItem value="inaccurate">Inaccurate information</SelectItem>
                  <SelectItem value="inappropriate">Inappropriate content</SelectItem>
                  <SelectItem value="off-topic">Off-topic response</SelectItem>
                  <SelectItem value="harmful">Potentially harmful</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label
                htmlFor="flag-notes"
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60"
              >
                Notes (optional)
              </Label>
              <Textarea
                id="flag-notes"
                className="min-h-[100px] resize-none rounded-xl border-border/40 bg-background/30 backdrop-blur-sm shadow-inner focus:ring-primary/20"
                placeholder="Additional context..."
                value={flagNotes}
                onChange={(e) => setFlagNotes(e.target.value)}
                maxLength={2000}
              />
            </div>
            {flagError && <p className="text-xs font-bold text-red-400">{flagError}</p>}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="ghost"
              onClick={() => setFlagDialogOpen(false)}
              disabled={flagSubmitting}
              className="rounded-xl font-bold uppercase tracking-widest text-[10px]"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitFlag}
              disabled={!flagReason || flagSubmitting}
              className="rounded-xl font-bold uppercase tracking-widest text-[10px]"
            >
              {flagSubmitting ? 'Submitting...' : 'Flag Response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
