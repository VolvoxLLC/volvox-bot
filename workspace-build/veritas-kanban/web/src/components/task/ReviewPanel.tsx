import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
  CheckCircle,
  XCircle,
  RefreshCcw,
  MessageSquare,
  GitMerge,
  Loader2,
} from 'lucide-react';
import { useMergeWorktree } from '@/hooks/useWorktree';
import type { Task, ReviewDecision, ReviewState } from '@veritas-kanban/shared';
import { cn } from '@/lib/utils';

interface ReviewPanelProps {
  task: Task;
  onReview: (review: ReviewState) => void;
  onMergeComplete?: () => void;
}

const decisionStyles: Record<ReviewDecision, { icon: React.ReactNode; label: string; className: string }> = {
  'approved': {
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Approved',
    className: 'bg-green-500/10 text-green-600 border-green-500/30',
  },
  'changes-requested': {
    icon: <RefreshCcw className="h-4 w-4" />,
    label: 'Changes Requested',
    className: 'bg-amber-500/10 text-amber-600 border-amber-500/30',
  },
  'rejected': {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Rejected',
    className: 'bg-red-500/10 text-red-600 border-red-500/30',
  },
};

export function ReviewPanel({ task, onReview, onMergeComplete }: ReviewPanelProps) {
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [pendingDecision, setPendingDecision] = useState<ReviewDecision | null>(null);

  const mergeWorktree = useMergeWorktree();
  const hasWorktree = !!task.git?.worktreePath;
  const comments = task.reviewComments || [];
  const currentReview = task.review;
  const isApproved = currentReview?.decision === 'approved';

  const handleDecision = (decision: ReviewDecision) => {
    if (decision === 'changes-requested' || decision === 'rejected') {
      setPendingDecision(decision);
      setShowSummary(true);
    } else {
      submitReview(decision);
    }
  };

  const submitReview = (decision: ReviewDecision, reviewSummary?: string) => {
    onReview({
      decision,
      decidedAt: new Date().toISOString(),
      summary: reviewSummary,
    });
    setShowSummary(false);
    setSummary('');
    setPendingDecision(null);
  };

  if (!hasWorktree) {
    return (
      <div className="text-center text-muted-foreground py-8">
        Start a worktree to enable code review
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current review status */}
      {currentReview?.decision && (
        <div
          className={cn(
            'flex items-center gap-2 p-3 rounded-md border',
            decisionStyles[currentReview.decision].className
          )}
        >
          {decisionStyles[currentReview.decision].icon}
          <div className="flex-1">
            <div className="font-medium">
              {decisionStyles[currentReview.decision].label}
            </div>
            {currentReview.decidedAt && (
              <div className="text-xs opacity-75">
                {new Date(currentReview.decidedAt).toLocaleString()}
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onReview({})}
          >
            Clear
          </Button>
        </div>
      )}

      {currentReview?.summary && (
        <div className="p-3 rounded-md border bg-muted/50">
          <p className="text-sm whitespace-pre-wrap">{currentReview.summary}</p>
        </div>
      )}

      {/* Merge button when approved */}
      {isApproved && hasWorktree && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="w-full bg-green-600 hover:bg-green-700" disabled={mergeWorktree.isPending}>
              {mergeWorktree.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Merging...
                </>
              ) : (
                <>
                  <GitMerge className="h-4 w-4 mr-2" />
                  Merge & Close Task
                </>
              )}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Merge changes to {task.git?.baseBranch || 'main'}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will merge the branch <code className="px-1 bg-muted rounded">{task.git?.branch}</code> into{' '}
                <code className="px-1 bg-muted rounded">{task.git?.baseBranch || 'main'}</code>,
                delete the worktree, and mark this task as done.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  mergeWorktree.mutate(task.id, {
                    onSuccess: () => {
                      onMergeComplete?.();
                    },
                  });
                }}
                className="bg-green-600 hover:bg-green-700"
              >
                Merge & Close
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Comment summary */}
      {comments.length > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <MessageSquare className="h-4 w-4" />
          {comments.length} review comment{comments.length === 1 ? '' : 's'}
        </div>
      )}

      {/* Summary input for changes-requested/rejected */}
      {showSummary && pendingDecision && (
        <div className="space-y-2 p-3 rounded-md border bg-muted/50">
          <Textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder={
              pendingDecision === 'rejected'
                ? 'Explain why this is rejected...'
                : 'Describe the changes needed...'
            }
            rows={3}
          />
          <div className="flex gap-2">
            <Button
              onClick={() => submitReview(pendingDecision, summary || undefined)}
              variant={pendingDecision === 'rejected' ? 'destructive' : 'default'}
            >
              Submit {decisionStyles[pendingDecision].label}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowSummary(false);
                setSummary('');
                setPendingDecision(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!currentReview?.decision && !showSummary && (
        <div className="flex gap-2">
          <Button
            onClick={() => handleDecision('approved')}
            className="flex-1 bg-green-600 hover:bg-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Approve
          </Button>
          <Button
            onClick={() => handleDecision('changes-requested')}
            variant="outline"
            className="flex-1"
          >
            <RefreshCcw className="h-4 w-4 mr-2" />
            Request Changes
          </Button>
          <Button
            onClick={() => handleDecision('rejected')}
            variant="destructive"
            className="flex-1"
          >
            <XCircle className="h-4 w-4 mr-2" />
            Reject
          </Button>
        </div>
      )}
    </div>
  );
}
