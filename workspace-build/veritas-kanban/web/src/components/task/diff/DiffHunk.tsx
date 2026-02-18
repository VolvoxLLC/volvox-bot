import { memo } from 'react';
import { DiffLineView } from './DiffLine';
import type { DiffHunk } from '@/lib/api';
import type { ReviewComment } from '@veritas-kanban/shared';

interface DiffHunkProps {
  hunk: DiffHunk;
  comments: ReviewComment[];
  addingCommentAtLine: number | null;
  onStartAddComment: (line: number) => void;
  onSubmitComment: (content: string) => void;
  onCancelComment: () => void;
  onRemoveComment: (commentId: string) => void;
}

export const DiffHunkView = memo(function DiffHunkView({
  hunk,
  comments,
  addingCommentAtLine,
  onStartAddComment,
  onSubmitComment,
  onCancelComment,
  onRemoveComment,
}: DiffHunkProps) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="bg-muted/50 px-4 py-1 text-xs text-muted-foreground font-mono">
        @@ -{hunk.oldStart},{hunk.oldLines} +{hunk.newStart},{hunk.newLines} @@
      </div>
      
      <div className="font-mono text-xs">
        {hunk.lines.map((line, idx) => (
          <DiffLineView
            key={idx}
            line={line}
            comments={comments}
            addingCommentAtLine={addingCommentAtLine}
            onStartAddComment={onStartAddComment}
            onSubmitComment={onSubmitComment}
            onCancelComment={onCancelComment}
            onRemoveComment={onRemoveComment}
          />
        ))}
      </div>
    </div>
  );
});
