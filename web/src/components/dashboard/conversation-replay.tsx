'use client';

import { AlertTriangle, Clock, Flag, Hash, Zap } from 'lucide-react';
import { useCallback, useState } from 'react';
import { Badge } from '@/components/ui/badge';
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
  createdAt: string;
  flagStatus?: string | null;
}

interface ConversationReplayProps {
  messages: ConversationMessage[];
  channelId: string;
  duration: number;
  tokenEstimate: number;
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
  return diff > 5 * 60 * 1000; // 5 minute gap
}

/**
 * Chat-style conversation replay component.
 * User messages on the right (blue), assistant on the left (gray), system messages small/italic.
 */
export function ConversationReplay({
  messages,
  channelId,
  duration,
  tokenEstimate,
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

  return (
    <div className="space-y-4">
      {/* Header stats */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-1">
          <Hash className="h-3 w-3" />
          {channelId}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Clock className="h-3 w-3" />
          {formatDuration(duration)}
        </Badge>
        <Badge variant="outline" className="gap-1">
          <Zap className="h-3 w-3" />~{tokenEstimate.toLocaleString()} tokens
        </Badge>
        <Badge variant="secondary">{messages.length} messages</Badge>
      </div>

      {/* Messages */}
      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
        {messages.map((msg, idx) => {
          const prevTimestamp = idx > 0 ? messages[idx - 1].createdAt : null;
          const showTimestamp = shouldShowTimestamp(msg.createdAt, prevTimestamp);
          const isFlagged = msg.flagStatus === 'open';

          return (
            <div key={msg.id}>
              {showTimestamp && (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {formatTimestamp(msg.createdAt)}
                  </span>
                </div>
              )}

              {msg.role === 'system' ? (
                <div className="flex justify-center">
                  <p className="max-w-lg text-center text-xs italic text-muted-foreground">
                    {msg.content}
                  </p>
                </div>
              ) : (
                <div
                  className={cn(
                    'flex gap-2',
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row',
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white',
                      msg.role === 'user' ? 'bg-blue-500' : 'bg-gray-500',
                    )}
                  >
                    {(msg.username || msg.role).slice(0, 2).toUpperCase()}
                  </div>

                  {/* Bubble */}
                  <div
                    className={cn(
                      'group relative max-w-[75%] rounded-lg px-3 py-2',
                      msg.role === 'user' ? 'bg-blue-500 text-white' : 'bg-background border',
                      isFlagged && 'ring-2 ring-red-500',
                    )}
                  >
                    <p className="mb-1 text-xs font-medium opacity-70">
                      {msg.username || msg.role}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>

                    {/* Flag button for assistant messages */}
                    {msg.role === 'assistant' && (
                      <div className="absolute -top-2 -right-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          variant="destructive"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => openFlagDialog(msg.id)}
                          title="Flag this response"
                        >
                          <Flag className="h-3 w-3" />
                        </Button>
                      </div>
                    )}

                    {/* Flagged indicator */}
                    {isFlagged && (
                      <div className="mt-1 flex items-center gap-1 text-xs text-red-500">
                        <AlertTriangle className="h-3 w-3" />
                        Flagged
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Flag Dialog */}
      <Dialog open={flagDialogOpen} onOpenChange={setFlagDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Flag AI Response</DialogTitle>
            <DialogDescription>Report a problematic AI response for review.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flag-reason">Reason</Label>
              <Select value={flagReason} onValueChange={setFlagReason}>
                <SelectTrigger id="flag-reason">
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="inaccurate">Inaccurate information</SelectItem>
                  <SelectItem value="inappropriate">Inappropriate content</SelectItem>
                  <SelectItem value="off-topic">Off-topic response</SelectItem>
                  <SelectItem value="harmful">Potentially harmful</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="flag-notes">Notes (optional)</Label>
              <Textarea
                id="flag-notes"
                placeholder="Additional context..."
                value={flagNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFlagNotes(e.target.value)}
                maxLength={2000}
              />
            </div>
            {flagError && <p className="text-sm text-destructive">{flagError}</p>}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFlagDialogOpen(false)}
              disabled={flagSubmitting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={submitFlag}
              disabled={!flagReason || flagSubmitting}
            >
              {flagSubmitting ? 'Submitting...' : 'Flag Response'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
