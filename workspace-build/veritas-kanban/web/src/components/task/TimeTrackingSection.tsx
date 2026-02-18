import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDuration, parseDuration } from '@/hooks/useTimeTracking';
import { api } from '@/lib/api';
import { Play, Square, Plus, Trash2, Clock, Loader2, Timer } from 'lucide-react';
import type { Task, TimeEntry, TimeTracking } from '@veritas-kanban/shared';
import { cn } from '@/lib/utils';
import { sanitizeText } from '@/lib/sanitize';

interface TimeTrackingSectionProps {
  task: Task;
}

// ─── Running Timer Display ──────────────────────────────────────────────────

function RunningTimer({ startTime }: { startTime: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = new Date(startTime).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startTime]);

  return (
    <span className="font-mono tabular-nums text-green-600 dark:text-green-400">
      {formatDuration(elapsed)}
    </span>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
//
// Architecture: fully self-contained local state.
//
// The component owns a `timeTracking` state variable that is:
//   1. Initialized from the task prop on mount / task change
//   2. Updated ONLY from direct API responses (start, stop, add, delete)
//
// There is NO cache sync. The React Query ['tasks'] cache is patched after
// each mutation (so other components like the board stay current), but this
// component never reads back from it. This eliminates all race conditions
// with debounced saves, background refetches, and invalidation storms.
//
// Trade-off: external timer changes (another browser tab, direct API call)
// won't appear until the panel is closed and reopened. Acceptable.

export function TimeTrackingSection({ task }: TimeTrackingSectionProps) {
  const queryClient = useQueryClient();

  // ── Local state ──
  const [timeTracking, setTimeTracking] = useState<TimeTracking | undefined>(task.timeTracking);
  const [busy, setBusy] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [durationInput, setDurationInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');

  // Reset when a different task is opened
  const taskIdRef = useRef(task.id);
  useEffect(() => {
    if (task.id !== taskIdRef.current) {
      taskIdRef.current = task.id;
      setTimeTracking(task.timeTracking);
    }
  }, [task.id, task.timeTracking]);

  // ── Derived values ──
  const isRunning = timeTracking?.isRunning ?? false;
  const totalSeconds = timeTracking?.totalSeconds ?? 0;
  const entries = timeTracking?.entries ?? [];
  const activeEntry = entries.find((e) => e.id === timeTracking?.activeEntryId);

  // ── Cache helper: patch React Query so the board/other components stay current ──
  const patchCache = (updated: Task) => {
    queryClient.setQueryData<Task[]>(['tasks'], (old) =>
      old ? old.map((t) => (t.id === updated.id ? updated : t)) : old
    );
    queryClient.setQueryData(['tasks', updated.id], updated);
  };

  // ── Handlers ──

  const handleStartStop = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = isRunning ? await api.time.stop(task.id) : await api.time.start(task.id);
      setTimeTracking(result.timeTracking);
      patchCache(result);
    } catch (err) {
      // API rejected — fetch fresh state so UI converges
      try {
        const fresh = await api.tasks.get(task.id);
        setTimeTracking(fresh.timeTracking);
        patchCache(fresh);
      } catch {
        // network down — leave UI as-is
      }
      console.warn('[TimeTracking] start/stop failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleAddEntry = async () => {
    const seconds = parseDuration(durationInput);
    if (!seconds || busy) return;
    setBusy(true);
    try {
      const result = await api.time.addEntry(task.id, seconds, descriptionInput || undefined);
      setTimeTracking(result.timeTracking);
      patchCache(result);
      setDurationInput('');
      setDescriptionInput('');
      setAddDialogOpen(false);
    } catch (err) {
      console.warn('[TimeTracking] add entry failed:', err);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.time.deleteEntry(task.id, entryId);
      setTimeTracking(result.timeTracking);
      patchCache(result);
    } catch (err) {
      console.warn('[TimeTracking] delete entry failed:', err);
    } finally {
      setBusy(false);
    }
  };

  // ── Formatters ──

  const formatEntryTime = (entry: TimeEntry) =>
    new Date(entry.startTime).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  // ── Render ──

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Time Tracking
        </Label>
        <span className="text-sm font-medium">Total: {formatDuration(totalSeconds)}</span>
      </div>

      <div className="p-4 rounded-lg border bg-muted/30 space-y-4">
        {/* Timer Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isRunning ? (
              <Button variant="destructive" size="sm" onClick={handleStartStop} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Square className="h-4 w-4 mr-2" />
                    Stop
                  </>
                )}
              </Button>
            ) : (
              <Button variant="default" size="sm" onClick={handleStartStop} disabled={busy}>
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Start
                  </>
                )}
              </Button>
            )}

            {isRunning && activeEntry && (
              <div className="flex items-center gap-2">
                <Timer className="h-4 w-4 text-green-500 animate-pulse" />
                <RunningTimer startTime={activeEntry.startTime} />
              </div>
            )}
          </div>

          {/* Add Manual Entry */}
          <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="h-4 w-4 mr-1" />
                Add Time
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Time Entry</DialogTitle>
                <DialogDescription>Manually add time spent on this task.</DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid gap-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Input
                    id="duration"
                    value={durationInput}
                    onChange={(e) => setDurationInput(e.target.value)}
                    placeholder="e.g., 1h 30m or 45m or 30"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter as &quot;1h 30m&quot;, &quot;45m&quot;, or just minutes (e.g.,
                    &quot;30&quot;)
                  </p>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="description">Description (optional)</Label>
                  <Input
                    id="description"
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="What did you work on?"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddEntry} disabled={!parseDuration(durationInput) || busy}>
                  {busy ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Entry
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Time Entries List */}
        {entries.length > 0 && (
          <div className="border-t pt-3">
            <Label className="text-xs text-muted-foreground mb-2 block">
              Time Entries ({entries.length})
            </Label>
            <ScrollArea className="max-h-48">
              <div className="space-y-2">
                {entries
                  .slice()
                  .reverse()
                  .map((entry) => {
                    const isActive = entry.id === timeTracking?.activeEntryId;
                    return (
                      <div
                        key={entry.id}
                        className={cn(
                          'flex items-center justify-between p-2 rounded text-sm',
                          isActive ? 'bg-green-500/10 border border-green-500/20' : 'bg-muted/50'
                        )}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isActive ? (
                              <Timer className="h-3 w-3 text-green-500 animate-pulse flex-shrink-0" />
                            ) : (
                              <Clock className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                            )}
                            <span className="font-medium">
                              {entry.duration != null ? (
                                formatDuration(entry.duration)
                              ) : (
                                <RunningTimer startTime={entry.startTime} />
                              )}
                            </span>
                            {entry.manual && (
                              <span className="text-xs text-muted-foreground">(manual)</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground pl-5 truncate">
                            {entry.description
                              ? sanitizeText(entry.description)
                              : formatEntryTime(entry)}
                          </div>
                        </div>
                        {!isActive && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => handleDeleteEntry(entry.id)}
                            disabled={busy}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
              </div>
            </ScrollArea>
          </div>
        )}
      </div>
    </div>
  );
}
