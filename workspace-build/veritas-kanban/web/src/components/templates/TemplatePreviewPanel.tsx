import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TaskTemplate } from '@/hooks/useTemplates';
import { getCategoryIcon, getCategoryLabel } from '@/lib/template-categories';
import { Calendar, Flag, FileText, ClipboardList, Link2 } from 'lucide-react';

interface TemplatePreviewPanelProps {
  template: TaskTemplate;
}

export function TemplatePreviewPanel({ template }: TemplatePreviewPanelProps) {
  // Note: getTypeIcon expects the icon name, not the type ID
  // For preview, we'll just show the type name

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/50';
      case 'high':
        return 'bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/50';
      case 'medium':
        return 'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/50';
      case 'low':
        return 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/50';
      default:
        return 'bg-gray-500/20 text-gray-700 dark:text-gray-400 border-gray-500/50';
    }
  };

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Template Title */}
        <div className="space-y-2 pb-4 border-b">
          <h2 className="font-semibold text-lg">{template.name}</h2>
          {template.description && (
            <p className="text-sm text-muted-foreground">{template.description}</p>
          )}
        </div>

        {/* Category */}
        {template.category && (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground">CATEGORY</label>
            <Badge variant="outline" className="text-sm">
              {getCategoryIcon(template.category)}
              {getCategoryLabel(template.category)}
            </Badge>
          </div>
        )}

        {/* Task Preview */}
        <div className="space-y-4 pt-2">
          <div className="text-xs font-semibold text-muted-foreground">TASK PREVIEW</div>

          {/* Task Type */}
          {template.taskDefaults?.type && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">TYPE</label>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-muted-foreground/20">
                <span className="text-sm">{template.taskDefaults.type}</span>
              </div>
            </div>
          )}

          {/* Priority */}
          {template.taskDefaults?.priority && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">PRIORITY</label>
              <div className="flex items-center gap-2">
                <Flag className="h-4 w-4 text-muted-foreground" />
                <Badge
                  className={`capitalize border ${getPriorityColor(template.taskDefaults.priority)}`}
                >
                  {template.taskDefaults.priority}
                </Badge>
              </div>
            </div>
          )}

          {/* Project */}
          {template.taskDefaults?.project && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">PROJECT</label>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-muted-foreground/20">
                <span className="text-sm font-medium">{template.taskDefaults.project}</span>
              </div>
            </div>
          )}

          {/* Agent */}
          {template.taskDefaults?.agent && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">ASSIGNED AGENT</label>
              <div className="flex items-center gap-2 p-2 rounded bg-muted/30 border border-muted-foreground/20">
                <span className="text-sm">{template.taskDefaults.agent}</span>
              </div>
            </div>
          )}

          {/* Description Template */}
          {template.taskDefaults?.descriptionTemplate && (
            <div className="space-y-2">
              <label className="text-xs font-semibold text-muted-foreground">
                <FileText className="h-3.5 w-3.5 inline mr-1" />
                DESCRIPTION TEMPLATE
              </label>
              <div className="p-2 rounded bg-muted/30 border border-muted-foreground/20 text-xs whitespace-pre-wrap">
                {template.taskDefaults.descriptionTemplate}
              </div>
            </div>
          )}
        </div>

        {/* Subtasks */}
        {template.subtaskTemplates && template.subtaskTemplates.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <label className="text-xs font-semibold text-muted-foreground">
              <ClipboardList className="h-3.5 w-3.5 inline mr-1" />
              SUBTASKS ({template.subtaskTemplates.length})
            </label>
            <ul className="space-y-2">
              {template.subtaskTemplates.map((subtask, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2 p-2 rounded bg-muted/30 border border-muted-foreground/20 text-sm"
                >
                  <input
                    type="checkbox"
                    disabled
                    className="mt-0.5"
                    aria-label={`Subtask ${idx + 1}`}
                  />
                  <span>{subtask.title}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Blueprint Tasks */}
        {template.blueprint && template.blueprint.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <label className="text-xs font-semibold text-muted-foreground">
              <Link2 className="h-3.5 w-3.5 inline mr-1" />
              BLUEPRINT TASKS ({template.blueprint.length})
            </label>
            <div className="space-y-2">
              {template.blueprint.map((task, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-muted/30 border border-muted-foreground/20 text-sm space-y-1"
                >
                  <div className="font-medium">{task.title}</div>
                  <div className="text-xs text-muted-foreground">
                    <span className="inline-block bg-muted px-1.5 py-0.5 rounded mr-2">
                      {task.refId}
                    </span>
                  </div>

                  {task.blockedByRefs && task.blockedByRefs.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      Depends on: {task.blockedByRefs.join(', ')}
                    </div>
                  )}

                  {task.taskDefaults && (
                    <div className="text-xs space-y-1 mt-2">
                      {task.taskDefaults.type && <div>Type: {task.taskDefaults.type}</div>}
                      {task.taskDefaults.priority && (
                        <div>Priority: {task.taskDefaults.priority}</div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!template.taskDefaults?.type &&
          !template.taskDefaults?.priority &&
          !template.taskDefaults?.project &&
          !template.taskDefaults?.agent &&
          !template.taskDefaults?.descriptionTemplate &&
          !template.subtaskTemplates?.length &&
          !template.blueprint?.length && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>This template doesn't have any defaults configured yet.</p>
              <p className="text-xs mt-1">Edit the template to add defaults.</p>
            </div>
          )}
      </div>
    </ScrollArea>
  );
}
