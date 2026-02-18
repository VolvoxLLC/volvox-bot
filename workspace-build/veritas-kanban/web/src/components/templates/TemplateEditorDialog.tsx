import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCreateTemplate, useUpdateTemplate, type TaskTemplate } from '@/hooks/useTemplates';
import { useTaskTypesManager, getTypeIcon } from '@/hooks/useTaskTypes';
import { useToast } from '@/hooks/useToast';
import { TEMPLATE_CATEGORIES, getCategoryIcon } from '@/lib/template-categories';
import type { TaskPriority, AgentType } from '@veritas-kanban/shared';
import { Loader2 } from 'lucide-react';

interface TemplateEditorDialogProps {
  template: TaskTemplate | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TemplateEditorDialog({ template, open, onOpenChange }: TemplateEditorDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>('');
  const [type, setType] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [project, setProject] = useState('');
  const [agent, setAgent] = useState<AgentType | ''>('');
  const [descriptionTemplate, setDescriptionTemplate] = useState('');

  const { toast } = useToast();
  const { items: taskTypes } = useTaskTypesManager();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const isLoading = createTemplate.isPending || updateTemplate.isPending;

  // Populate form when editing
  useEffect(() => {
    if (template) {
      setName(template.name);
      setDescription(template.description || '');
      setCategory(template.category || '');
      setType(template.taskDefaults?.type || '');
      setPriority((template.taskDefaults?.priority as TaskPriority) || '');
      setProject(template.taskDefaults?.project || '');
      setAgent((template.taskDefaults?.agent as AgentType) || '');
      setDescriptionTemplate(template.taskDefaults?.descriptionTemplate || '');
    } else {
      resetForm();
    }
  }, [template, open]);

  const resetForm = () => {
    setName('');
    setDescription('');
    setCategory('');
    setType('');
    setPriority('');
    setProject('');
    setAgent('');
    setDescriptionTemplate('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({
        title: 'Validation Error',
        description: 'Template name is required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const input = {
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
      };

      if (template) {
        await updateTemplate.mutateAsync({ id: template.id, input });
        toast({
          title: 'Success',
          description: `Template "${name}" updated successfully.`,
        });
      } else {
        await createTemplate.mutateAsync(input);
        toast({
          title: 'Success',
          description: `Template "${name}" created successfully.`,
        });
      }

      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast({
        title: 'Error',
        description: err instanceof Error ? err.message : 'Failed to save template',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{template ? 'Edit Template' : 'Create New Template'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="defaults">Task Defaults</TabsTrigger>
            </TabsList>

            {/* Basic Info Tab */}
            <TabsContent value="basic" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">
                    Template Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Bug Fix, Feature Implementation"
                    required
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What is this template used for?"
                    rows={3}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select a category..." />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TEMPLATE_CATEGORIES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>
                          {getCategoryIcon(key)} {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            {/* Task Defaults Tab */}
            <TabsContent value="defaults" className="space-y-4 mt-4">
              <div className="grid gap-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="type">Default Type</Label>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger id="type">
                        <SelectValue placeholder="Any" />
                      </SelectTrigger>
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
                    <Label htmlFor="priority">Default Priority</Label>
                    <Select
                      value={priority}
                      onValueChange={(v) => setPriority(v as TaskPriority | '')}
                    >
                      <SelectTrigger id="priority">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                        <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="project">Default Project</Label>
                    <Input
                      id="project"
                      value={project}
                      onChange={(e) => setProject(e.target.value)}
                      placeholder="e.g., VK-001"
                    />
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="agent">Default Agent</Label>
                    <Select value={agent} onValueChange={(v) => setAgent(v as AgentType | '')}>
                      <SelectTrigger id="agent">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="claude-opus-4">Claude Opus 4</SelectItem>
                        <SelectItem value="claude-sonnet-4">Claude Sonnet 4</SelectItem>
                        <SelectItem value="gpt-4">GPT-4</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="descriptionTemplate">Description Template</Label>
                  <Textarea
                    id="descriptionTemplate"
                    value={descriptionTemplate}
                    onChange={(e) => setDescriptionTemplate(e.target.value)}
                    placeholder="Template for task description (can include variables like {{date}}, {{project}})"
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tip: Use variables like {'{{date}}'} to auto-populate values
                  </p>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {template ? 'Update Template' : 'Create Template'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
