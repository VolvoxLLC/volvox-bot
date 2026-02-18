import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle } from 'lucide-react';

interface TemplateVariableInputsProps {
  variables: string[];
  values: Record<string, string>;
  onChange: (name: string, value: string) => void;
}

export function TemplateVariableInputs({ variables, values, onChange }: TemplateVariableInputsProps) {
  if (variables.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-3 border rounded-md p-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-blue-500" />
        <Label className="text-sm font-medium">Template Variables</Label>
      </div>
      {variables.map((varName) => (
        <div key={varName} className="grid gap-1.5">
          <Label htmlFor={`var-${varName}`} className="text-xs">
            {varName}
          </Label>
          <Input
            id={`var-${varName}`}
            value={values[varName] || ''}
            onChange={(e) => onChange(varName, e.target.value)}
            placeholder={`Enter ${varName}...`}
            className="h-8"
          />
        </div>
      ))}
    </div>
  );
}
