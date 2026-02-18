import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  useAddSubtask,
  useUpdateSubtask,
  useDeleteSubtask,
  useToggleSubtaskCriteria,
} from '@/hooks/useTasks';
import { cn } from '@/lib/utils';
import type { Task, Subtask } from '@veritas-kanban/shared';

interface SubtasksSectionProps {
  task: Task;
  onAutoCompleteChange: (value: boolean) => void;
}

export function SubtasksSection({ task, onAutoCompleteChange }: SubtasksSectionProps) {
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showCriteriaInput, setShowCriteriaInput] = useState(false);
  const [criteriaInputs, setCriteriaInputs] = useState<string[]>(['']);
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());

  const addSubtask = useAddSubtask();
  const updateSubtask = useUpdateSubtask();
  const deleteSubtask = useDeleteSubtask();
  const toggleCriteria = useToggleSubtaskCriteria();

  const subtasks = task.subtasks || [];
  const completedCount = subtasks.filter((s) => s.completed).length;
  const totalCount = subtasks.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  const handleAddSubtask = async () => {
    if (!newSubtaskTitle.trim()) return;

    setIsAdding(true);
    try {
      const criteria = criteriaInputs.filter((c) => c.trim() !== '');
      await addSubtask.mutateAsync({
        taskId: task.id,
        title: newSubtaskTitle.trim(),
        ...(criteria.length > 0 && { acceptanceCriteria: criteria }),
      });
      setNewSubtaskTitle('');
      setCriteriaInputs(['']);
      setShowCriteriaInput(false);
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleSubtask = async (subtask: Subtask) => {
    await updateSubtask.mutateAsync({
      taskId: task.id,
      subtaskId: subtask.id,
      updates: { completed: !subtask.completed },
    });
  };

  const handleDeleteSubtask = async (subtaskId: string) => {
    await deleteSubtask.mutateAsync({ taskId: task.id, subtaskId });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddSubtask();
    }
  };

  const handleAddCriteriaInput = () => {
    setCriteriaInputs([...criteriaInputs, '']);
  };

  const handleRemoveCriteriaInput = (index: number) => {
    setCriteriaInputs(criteriaInputs.filter((_, i) => i !== index));
  };

  const handleCriteriaInputChange = (index: number, value: string) => {
    const updated = [...criteriaInputs];
    updated[index] = value;
    setCriteriaInputs(updated);
  };

  const toggleSubtaskExpanded = (subtaskId: string) => {
    const newExpanded = new Set(expandedSubtasks);
    if (newExpanded.has(subtaskId)) {
      newExpanded.delete(subtaskId);
    } else {
      newExpanded.add(subtaskId);
    }
    setExpandedSubtasks(newExpanded);
  };

  const handleToggleCriteria = async (subtaskId: string, criteriaIndex: number) => {
    await toggleCriteria.mutateAsync({ taskId: task.id, subtaskId, criteriaIndex });
  };

  const getCriteriaProgress = (subtask: Subtask) => {
    if (!subtask.acceptanceCriteria || subtask.acceptanceCriteria.length === 0) return null;
    const checked = subtask.criteriaChecked?.filter((c) => c).length || 0;
    const total = subtask.acceptanceCriteria.length;
    return { checked, total };
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-muted-foreground">Subtasks</Label>
        {totalCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalCount} complete
          </span>
        )}
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Subtask list */}
      <div className="space-y-1">
        {subtasks.map((subtask) => {
          const criteriaProgress = getCriteriaProgress(subtask);
          const isExpanded = expandedSubtasks.has(subtask.id);
          const hasCriteria = subtask.acceptanceCriteria && subtask.acceptanceCriteria.length > 0;

          return (
            <div key={subtask.id} className="space-y-1">
              <div
                className={cn(
                  'flex items-center gap-2 p-2 rounded-md group hover:bg-muted/50 transition-colors',
                  subtask.completed && 'opacity-60'
                )}
              >
                <Checkbox
                  checked={subtask.completed}
                  onCheckedChange={() => handleToggleSubtask(subtask)}
                  className="flex-shrink-0"
                />
                {hasCriteria && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-4 w-4 p-0"
                    onClick={() => toggleSubtaskExpanded(subtask.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </Button>
                )}
                <span
                  className={cn(
                    'flex-1 text-sm',
                    subtask.completed && 'line-through text-muted-foreground'
                  )}
                >
                  {subtask.title}
                </span>
                {criteriaProgress && (
                  <Badge variant="outline" className="text-xs">
                    {criteriaProgress.checked}/{criteriaProgress.total}
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handleDeleteSubtask(subtask.id)}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>

              {/* Acceptance criteria checklist */}
              {hasCriteria && isExpanded && (
                <div className="ml-10 space-y-1">
                  {subtask.acceptanceCriteria!.map((criterion, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-1">
                      <Checkbox
                        checked={subtask.criteriaChecked?.[idx] || false}
                        onCheckedChange={() => handleToggleCriteria(subtask.id, idx)}
                        className="flex-shrink-0 mt-0.5"
                      />
                      <span className="text-xs text-muted-foreground">{criterion}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add subtask input */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a subtask..."
            className="text-sm"
            disabled={isAdding}
          />
          <Button
            size="icon"
            onClick={handleAddSubtask}
            disabled={!newSubtaskTitle.trim() || isAdding}
            className="h-9 w-9 shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {/* Add Acceptance Criteria toggle */}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowCriteriaInput(!showCriteriaInput)}
          className="text-xs text-muted-foreground"
        >
          {showCriteriaInput ? '− Hide' : '+ Add'} Acceptance Criteria
        </Button>

        {/* Acceptance Criteria inputs */}
        {showCriteriaInput && (
          <div className="space-y-2 pl-4 border-l-2 border-muted">
            {criteriaInputs.map((criterion, idx) => (
              <div key={idx} className="flex gap-2">
                <Input
                  value={criterion}
                  onChange={(e) => handleCriteriaInputChange(idx, e.target.value)}
                  placeholder={`Criterion ${idx + 1}...`}
                  className="text-xs"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleRemoveCriteriaInput(idx)}
                  disabled={criteriaInputs.length === 1}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddCriteriaInput}
              className="text-xs"
            >
              <Plus className="h-3 w-3 mr-1" /> Add Criterion
            </Button>
          </div>
        )}
      </div>

      {/* Auto-complete toggle */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <Label htmlFor="auto-complete" className="text-xs text-muted-foreground cursor-pointer">
            Auto-complete task when all subtasks done
          </Label>
          <Switch
            id="auto-complete"
            checked={task.autoCompleteOnSubtasks || false}
            onCheckedChange={onAutoCompleteChange}
          />
        </div>
      )}
    </div>
  );
}
