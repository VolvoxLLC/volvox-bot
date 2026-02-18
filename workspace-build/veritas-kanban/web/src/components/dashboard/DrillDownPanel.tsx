import { ArrowLeft } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';

export type DrillDownType = 'tasks' | 'errors' | 'tokens' | 'duration' | null;

interface DrillDownPanelProps {
  type: DrillDownType;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

export function DrillDownPanel({ type, title, onClose, children }: DrillDownPanelProps) {
  return (
    <Sheet open={type !== null} onOpenChange={() => onClose()}>
      <SheetContent className="w-[600px] sm:max-w-[600px] overflow-hidden flex flex-col">
        <SheetHeader className="flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <SheetTitle className="flex-1">{title}</SheetTitle>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto mt-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
