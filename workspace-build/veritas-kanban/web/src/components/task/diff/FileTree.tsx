import { memo, useMemo } from 'react';
import { 
  FileCode,
  FilePlus,
  FileMinus,
  FileEdit,
  MessageSquare,
} from 'lucide-react';
import type { FileChange } from '@/lib/api';
import type { ReviewComment } from '@veritas-kanban/shared';
import { cn } from '@/lib/utils';

const statusIcons: Record<FileChange['status'], React.ReactNode> = {
  added: <FilePlus className="h-4 w-4 text-green-500" />,
  modified: <FileEdit className="h-4 w-4 text-amber-500" />,
  deleted: <FileMinus className="h-4 w-4 text-red-500" />,
  renamed: <FileCode className="h-4 w-4 text-blue-500" />,
};

interface FileTreeProps {
  files: FileChange[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
  comments: ReviewComment[];
}

export const FileTree = memo(function FileTree({ files, selectedFile, onSelectFile, comments }: FileTreeProps) {
  const commentsByFile = useMemo(() => comments.reduce((acc, c) => {
    acc[c.file] = (acc[c.file] || 0) + 1;
    return acc;
  }, {} as Record<string, number>), [comments]);

  return (
    <div className="space-y-1">
      {files.map((file) => (
        <button
          key={file.path}
          onClick={() => onSelectFile(file.path)}
          className={cn(
            'w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded-md text-left',
            'hover:bg-muted transition-colors',
            selectedFile === file.path && 'bg-muted'
          )}
        >
          {statusIcons[file.status]}
          <span className="truncate flex-1 font-mono text-xs">{file.path}</span>
          <span className="flex items-center gap-1 text-xs">
            {commentsByFile[file.path] && (
              <span className="flex items-center gap-0.5 text-amber-500">
                <MessageSquare className="h-3 w-3" />
                {commentsByFile[file.path]}
              </span>
            )}
            {file.additions > 0 && (
              <span className="text-green-500">+{file.additions}</span>
            )}
            {file.deletions > 0 && (
              <span className="text-red-500">-{file.deletions}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
});
