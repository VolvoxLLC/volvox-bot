import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  useWorktreeStatus,
  useCreateWorktree,
  useDeleteWorktree,
  useRebaseWorktree,
  useMergeWorktree,
} from '@/hooks/useWorktree';
import { useGitHubStatus } from '@/hooks/useGitHub';
import { useConflictStatus } from '@/hooks/useConflicts';
import { ConflictResolver } from '../ConflictResolver';
import { PRDialog } from './PRDialog';
import {
  Loader2,
  AlertCircle,
  Play,
  ExternalLink,
  RefreshCw,
  GitMerge,
  Trash2,
  FileCode,
  ArrowUp,
  ArrowDown,
  GitPullRequest,
  AlertTriangle,
} from 'lucide-react';
import type { Task } from '@veritas-kanban/shared';
import { cn } from '@/lib/utils';

interface WorktreeStatusProps {
  task: Task;
}

export function WorktreeStatus({ task }: WorktreeStatusProps) {
  const hasWorktree = !!task.git?.worktreePath;
  const hasPR = !!task.git?.prUrl;
  const { data: status, isLoading, error } = useWorktreeStatus(task.id, hasWorktree);
  const { data: ghStatus } = useGitHubStatus();
  const { data: conflictStatus } = useConflictStatus(hasWorktree ? task.id : undefined);

  const createWorktree = useCreateWorktree();
  const deleteWorktree = useDeleteWorktree();
  const rebaseWorktree = useRebaseWorktree();
  const mergeWorktree = useMergeWorktree();

  // Conflict resolver state
  const [conflictResolverOpen, setConflictResolverOpen] = useState(false);
  const [prDialogOpen, setPrDialogOpen] = useState(false);

  const handleOpenInVSCode = () => {
    if (task.git?.worktreePath) {
      window.open(`vscode://file/${task.git.worktreePath}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleOpenPR = () => {
    if (task.git?.prUrl) {
      window.open(task.git.prUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!task.git?.repo || !task.git?.branch) {
    return null;
  }

  // No worktree yet - show create button
  if (!hasWorktree) {
    return (
      <div className="mt-3 pt-3 border-t">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => createWorktree.mutate(task.id)}
          disabled={createWorktree.isPending}
        >
          {createWorktree.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Create Worktree
        </Button>
        {createWorktree.error && (
          <p className="text-xs text-red-500 mt-2">{(createWorktree.error as Error).message}</p>
        )}
      </div>
    );
  }

  // Loading worktree status
  if (isLoading) {
    return (
      <div className="mt-3 pt-3 border-t">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading worktree status...
        </div>
      </div>
    );
  }

  // Error loading status
  if (error) {
    return (
      <div className="mt-3 pt-3 border-t">
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="h-4 w-4" />
          {(error as Error).message}
        </div>
      </div>
    );
  }

  // Show worktree status
  return (
    <div className="mt-3 pt-3 border-t space-y-3">
      {/* Conflict warning banner */}
      {conflictStatus?.hasConflicts && (
        <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                {conflictStatus.conflictingFiles.length} conflict
                {conflictStatus.conflictingFiles.length !== 1 ? 's' : ''} detected
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {conflictStatus.rebaseInProgress ? 'Rebase' : 'Merge'} requires manual resolution
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConflictResolverOpen(true)}
            className="border-amber-500/30 hover:bg-amber-500/10"
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Resolve Conflicts
          </Button>
        </div>
      )}

      {/* Status indicators */}
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              conflictStatus?.hasConflicts ? 'bg-amber-500' : 'bg-green-500'
            )}
          >
            <span className="sr-only">
              {conflictStatus?.hasConflicts
                ? 'Warning: conflicts detected'
                : 'Status: active and healthy'}
            </span>
          </span>
          <span className="text-muted-foreground">
            {conflictStatus?.hasConflicts ? 'Conflicts detected' : 'Worktree active'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {status && (
            <>
              {status.aheadBehind.ahead > 0 && (
                <span className="flex items-center gap-1">
                  <ArrowUp className="h-3 w-3" />
                  {status.aheadBehind.ahead} ahead
                </span>
              )}
              {status.aheadBehind.behind > 0 && (
                <span className="flex items-center gap-1 text-amber-500">
                  <ArrowDown className="h-3 w-3" />
                  {status.aheadBehind.behind} behind
                </span>
              )}
              {status.hasChanges && (
                <span className="flex items-center gap-1">
                  <FileCode className="h-3 w-3" />
                  {status.changedFiles} changed
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={handleOpenInVSCode}>
          <ExternalLink className="h-3 w-3 mr-1" />
          Open in VS Code
        </Button>

        {/* PR Button - show View PR if exists, Create PR if not */}
        {hasPR ? (
          <Button variant="outline" size="sm" onClick={handleOpenPR}>
            <GitPullRequest className="h-3 w-3 mr-1" />
            View PR #{task.git?.prNumber}
          </Button>
        ) : (
          status &&
          status.aheadBehind.ahead > 0 &&
          ghStatus?.authenticated && (
            <Button variant="outline" size="sm" onClick={() => setPrDialogOpen(true)}>
              <GitPullRequest className="h-3 w-3 mr-1" />
              Create PR
            </Button>
          )
        )}

        {status && status.aheadBehind.behind > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => rebaseWorktree.mutate(task.id)}
            disabled={rebaseWorktree.isPending}
          >
            {rebaseWorktree.isPending ? (
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Rebase
          </Button>
        )}

        {status && status.aheadBehind.ahead > 0 && !status.hasChanges && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="default" size="sm">
                <GitMerge className="h-3 w-3 mr-1" />
                Merge
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Merge to {task.git?.baseBranch}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will merge {task.git?.branch} into {task.git?.baseBranch}, push to remote,
                  delete the worktree, and mark the task as Done.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => mergeWorktree.mutate(task.id)}
                  disabled={mergeWorktree.isPending}
                >
                  {mergeWorktree.isPending ? 'Merging...' : 'Merge & Complete'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground">
              <Trash2 className="h-3 w-3 mr-1" />
              Delete Worktree
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete worktree?</AlertDialogTitle>
              <AlertDialogDescription>
                {status?.hasChanges
                  ? 'Warning: This worktree has uncommitted changes that will be lost.'
                  : 'This will remove the worktree but keep the branch.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() =>
                  deleteWorktree.mutate({
                    taskId: task.id,
                    force: status?.hasChanges,
                  })
                }
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Worktree path */}
      <div className="text-xs text-muted-foreground font-mono truncate">
        {task.git.worktreePath}
      </div>

      {/* Conflict Resolver */}
      <ConflictResolver
        task={task}
        open={conflictResolverOpen}
        onOpenChange={setConflictResolverOpen}
      />

      {/* PR Dialog */}
      <PRDialog task={task} open={prDialogOpen} onOpenChange={setPrDialogOpen} />
    </div>
  );
}
