import { Button } from '@/components/ui/button';
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
import { RotateCcw } from 'lucide-react';

export function SectionHeader({ title, onReset }: { title: string; onReset?: () => void }) {
  return (
    <div className="flex items-center justify-between pb-2 mb-2 border-b">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h4>
      {onReset && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground">
              <RotateCcw className="h-3 w-3 mr-1" />
              Reset
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset to defaults?</AlertDialogTitle>
              <AlertDialogDescription>
                This will reset all {title.toLowerCase()} settings to their default values.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
