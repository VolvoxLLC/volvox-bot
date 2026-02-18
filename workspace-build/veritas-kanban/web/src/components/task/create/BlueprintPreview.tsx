import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';
import type { TaskTemplate } from '@/hooks/useTemplates';

interface BlueprintPreviewProps {
  template: TaskTemplate;
}

export function BlueprintPreview({ template }: BlueprintPreviewProps) {
  if (!template.blueprint || template.blueprint.length === 0) {
    return null;
  }

  return (
    <div className="border rounded-md p-3 bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        <AlertCircle className="h-4 w-4 text-blue-500" />
        <Label className="text-sm font-medium">Blueprint: Multiple Tasks</Label>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        This template will create {template.blueprint.length} linked tasks.
      </p>
      <div className="space-y-2">
        {template.blueprint.map((bt, idx) => (
          <div key={bt.refId} className="text-sm border-l-2 border-primary/50 pl-3 py-1">
            <div className="font-medium">
              {idx + 1}. {bt.title}
            </div>
            {bt.blockedByRefs && bt.blockedByRefs.length > 0 && (
              <div className="text-xs text-muted-foreground">
                Blocked by: {bt.blockedByRefs.join(', ')}
              </div>
            )}
            {bt.subtaskTemplates && bt.subtaskTemplates.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {bt.subtaskTemplates.length} subtasks
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
