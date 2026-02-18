import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  useCreateTemplate,
  useDeleteTemplate,
  type TaskTemplate,
} from '@/hooks/useTemplates';
import { useTaskTypesManager, getTypeIcon } from '@/hooks/useTaskTypes';
import { Trash2, FileText } from 'lucide-react';
import type { TaskPriority, AgentType } from '@veritas-kanban/shared';
import { TEMPLATE_CATEGORIES, getCategoryIcon, getCategoryLabel } from '@/lib/template-categories';

export function AddTemplateForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [project, setProject] = useState('');
  const [agent, setAgent] = useState<AgentType | ''>('');
  const [descriptionTemplate, setDescriptionTemplate] = useState('');
  const createTemplate = useCreateTemplate();
  const { items: taskTypes } = useTaskTypesManager();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await createTemplate.mutateAsync({
      name: name.trim(),
      description: description.trim() || undefined,
      category: category || undefined,
      taskDefaults: {
        type: type || undefined,
        priority: priority || undefined,
        project: project.trim() || undefined,
        agent: agent || undefined,
        descriptionTemplate: descriptionTemplate.trim() || undefined,
      },
    });
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center gap-2 text-sm font-medium"><FileText className="h-4 w-4" /> Add Template</div>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., Bug Fix" />
          </div>
          <div className="grid gap-2">
            <Label>Description</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g., Template for bug fixes" />
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              {Object.entries(TEMPLATE_CATEGORIES).map(([key, { label, icon }]) => (
                <SelectItem key={key} value={key}>{icon} {label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Default Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                {taskTypes.map((taskType) => {
                  const IconComponent = getTypeIcon(taskType.icon);
                  return (
                    <SelectItem key={taskType.id} value={taskType.id}>
                      <div className="flex items-center gap-2">
                        {IconComponent && <IconComponent className="h-4 w-4" />}
                        {taskType.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>Default Priority</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as TaskPriority)}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label>Default Project</Label>
            <Input value={project} onChange={(e) => setProject(e.target.value)} placeholder="e.g., rubicon" />
          </div>
          <div className="grid gap-2">
            <Label>Preferred Agent</Label>
            <Select value={agent} onValueChange={(v) => setAgent(v as AgentType)}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-code">Claude Code</SelectItem>
                <SelectItem value="amp">Amp</SelectItem>
                <SelectItem value="copilot">Copilot</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
                <SelectItem value="veritas">Veritas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-2">
          <Label>Description Template</Label>
          <Textarea value={descriptionTemplate} onChange={(e) => setDescriptionTemplate(e.target.value)} placeholder="Pre-filled description text..." rows={2} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={!name.trim() || createTemplate.isPending}>
          {createTemplate.isPending ? 'Creating...' : 'Create Template'}
        </Button>
      </div>
    </form>
  );
}

export function TemplateItem({ template }: { template: TaskTemplate }) {
  const deleteTemplate = useDeleteTemplate();
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-md border bg-card">
      <div className="flex items-center gap-3">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{template.name}</span>
            {template.category && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted">
                {getCategoryIcon(template.category)} {getCategoryLabel(template.category)}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {[template.taskDefaults.type, template.taskDefaults.priority, template.taskDefaults.project, template.taskDefaults.agent].filter(Boolean).join(' • ') || 'No defaults'}
          </div>
        </div>
      </div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>This will delete "{template.name}".</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteTemplate.mutate(template.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
