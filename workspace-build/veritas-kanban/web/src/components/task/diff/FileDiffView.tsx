import { memo, useState, useMemo, useCallback } from 'react';
import { useFileDiff } from '@/hooks/useDiff';
import { DiffHunkView } from './DiffHunk';
import { 
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  Loader2,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';
import type { ReviewComment } from '@veritas-kanban/shared';
import type { FileChange } from '@/lib/api';
import { nanoid } from 'nanoid';

const statusIcons: Record<FileChange['status'], React.ReactNode> = {
  added: <FilePlus className="h-4 w-4 text-green-500" />,
  modified: <FileEdit className="h-4 w-4 text-amber-500" />,
  deleted: <FileMinus className="h-4 w-4 text-red-500" />,
  renamed: <FileCode className="h-4 w-4 text-blue-500" />,
};

interface FileDiffViewProps {
  taskId: string;
  filePath: string;
  comments: ReviewComment[];
  onAddComment: (comment: ReviewComment) => void;
  onRemoveComment: (commentId: string) => void;
}

export const FileDiffView = memo(function FileDiffView({
  taskId,
  filePath,
  comments,
  onAddComment,
  onRemoveComment,
}: FileDiffViewProps) {
  const { data: diff, isLoading, error } = useFileDiff(taskId, filePath);
  const [addingCommentAtLine, setAddingCommentAtLine] = useState<number | null>(null);

  const fileComments = useMemo(
    () => comments.filter(c => c.file === filePath),
    [comments, filePath]
  );

  const handleSubmitComment = useCallback((content: string) => {
    if (addingCommentAtLine === null) return;
    
    const comment: ReviewComment = {
      id: `comment_${nanoid(8)}`,
      file: filePath,
      line: addingCommentAtLine,
      content,
      created: new Date().toISOString(),
    };
    
    onAddComment(comment);
    setAddingCommentAtLine(null);
  }, [addingCommentAtLine, filePath, onAddComment]);

  const handleCancelComment = useCallback(() => setAddingCommentAtLine(null), []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading diff...
      </div>
    );
  }

  if (error || !diff) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <AlertCircle className="h-5 w-5 mr-2" />
        {(error as Error)?.message || 'Failed to load diff'}
      </div>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        No changes in this file
      </div>
    );
  }

  return (
    <div className="border rounded-md overflow-hidden bg-card">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <div className="flex items-center gap-2">
          {statusIcons[diff.status]}
          <span className="font-mono text-sm">{diff.path}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {fileComments.length > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <MessageSquare className="h-3 w-3" />
              {fileComments.length}
            </span>
          )}
          <span className="text-green-500">+{diff.additions}</span>
          <span className="text-red-500">-{diff.deletions}</span>
        </div>
      </div>
      
      <div className="overflow-x-auto">
        {diff.hunks.map((hunk, idx) => (
          <DiffHunkView
            key={idx}
            hunk={hunk}
            comments={fileComments}
            addingCommentAtLine={addingCommentAtLine}
            onStartAddComment={setAddingCommentAtLine}
            onSubmitComment={handleSubmitComment}
            onCancelComment={handleCancelComment}
            onRemoveComment={onRemoveComment}
          />
        ))}
      </div>
    </div>
  );
});
