import { memo, useState, useMemo, useCallback } from 'react';
import { useDiffSummary } from '@/hooks/useDiff';
import { FileTree } from './diff/FileTree';
import { FileDiffView } from './diff/FileDiffView';
import { Loader2, AlertCircle, ChevronRight } from 'lucide-react';
import type { Task, ReviewComment } from '@veritas-kanban/shared';
import FeatureErrorBoundary from '@/components/shared/FeatureErrorBoundary';

interface DiffViewerProps {
  task: Task;
  onAddComment: (comment: ReviewComment) => void;
  onRemoveComment: (commentId: string) => void;
}

export const DiffViewer = memo(function DiffViewer({ task, onAddComment, onRemoveComment }: DiffViewerProps) {
  const hasWorktree = !!task.git?.worktreePath;
  const { data: summary, isLoading, error } = useDiffSummary(task.id, hasWorktree);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const comments = useMemo(() => task.reviewComments || [], [task.reviewComments]);

  const handleSelectFile = useCallback((file: string | null) => {
    setSelectedFile(file);
  }, []);

  if (!hasWorktree) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <AlertCircle className="h-5 w-5 mr-2" />
        No worktree active
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading changes...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <AlertCircle className="h-5 w-5 mr-2" />
        {(error as Error)?.message || 'Failed to load changes'}
      </div>
    );
  }

  if (!summary || summary.files.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No changes detected
      </div>
    );
  }

  return (
    <FeatureErrorBoundary fallbackTitle="Diff viewer failed to render">
      <div className="flex gap-4 h-[500px]">
        {/* File tree */}
        <div className="w-64 flex-shrink-0 border rounded-md overflow-hidden bg-card">
          <div className="px-3 py-2 border-b bg-muted/50">
            <div className="text-sm font-medium">
              Changed Files ({summary.totalFiles})
            </div>
            <div className="text-xs text-muted-foreground">
              <span className="text-green-500">+{summary.totalAdditions}</span>
              {' / '}
              <span className="text-red-500">-{summary.totalDeletions}</span>
              {comments.length > 0 && (
                <>
                  {' / '}
                  <span className="text-amber-500">{comments.length} comments</span>
                </>
              )}
            </div>
          </div>
          <div className="p-2 overflow-y-auto h-[calc(100%-60px)]">
            <FileTree
              files={summary.files}
              selectedFile={selectedFile}
              onSelectFile={handleSelectFile}
              comments={comments}
            />
          </div>
        </div>

        {/* Diff view */}
        <div className="flex-1 overflow-y-auto">
          {selectedFile ? (
            <FileDiffView
              taskId={task.id}
              filePath={selectedFile}
              comments={comments}
              onAddComment={onAddComment}
              onRemoveComment={onRemoveComment}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground border rounded-md">
              <ChevronRight className="h-5 w-5 mr-2" />
              Select a file to view changes
            </div>
          )}
        </div>
      </div>
    </FeatureErrorBoundary>
  );
});
