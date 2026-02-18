import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { MarkdownText } from '@/components/shared/MarkdownText';
import { useTaskProgress, useUpdateProgress } from '@/hooks/useTaskProgress';
import { Pencil, Save, X, FileText } from 'lucide-react';
import type { Task } from '@veritas-kanban/shared';

interface ProgressTabProps {
  task: Task;
}

/**
 * Progress Tab - Displays and edits cross-session agent memory for a task
 */
export function ProgressTab({ task }: ProgressTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  const { data: progress, isLoading } = useTaskProgress(task.id);
  const updateProgress = useUpdateProgress();

  const handleEdit = () => {
    setEditContent(progress || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    await updateProgress.mutateAsync({ taskId: task.id, content: editContent });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditContent('');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const isEmpty = !progress || progress.trim() === '';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Progress Notes</h3>
        </div>
        {!isEditing && (
          <Button variant="outline" size="sm" onClick={handleEdit}>
            <Pencil className="h-3 w-3 mr-1" />
            Edit
          </Button>
        )}
      </div>

      {/* Edit Mode */}
      {isEditing && (
        <div className="space-y-3">
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            placeholder="# Progress Notes

## Learnings
- Document insights discovered during work

## Issues Encountered
- Track problems and their solutions

## Next Steps
- List actionable items for future sessions"
            className="font-mono text-sm min-h-[400px]"
            autoFocus
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={updateProgress.isPending}>
              <Save className="h-3 w-3 mr-1" />
              {updateProgress.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCancel}>
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* View Mode */}
      {!isEditing && (
        <div className="rounded-lg border bg-card p-4 min-h-[200px]">
          {isEmpty ? (
            <div className="text-center text-muted-foreground py-8">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm mb-1">No progress notes yet</p>
              <p className="text-xs">
                Click Edit to add learnings, issues, and next steps for future sessions
              </p>
            </div>
          ) : (
            <MarkdownText>{progress}</MarkdownText>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="text-xs text-muted-foreground border-t pt-3">
        <p className="font-medium mb-1">💡 Progress Notes Best Practices:</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li>Document key learnings and insights discovered during work</li>
          <li>Track issues encountered and their solutions</li>
          <li>List next steps for future sessions to pick up where you left off</li>
          <li>Use markdown sections (##) to organize by category</li>
        </ul>
      </div>
    </div>
  );
}
