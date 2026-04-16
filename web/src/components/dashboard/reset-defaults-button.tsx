'use client';

import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

interface DiscardChangesButtonProps {
  /** Called when the user confirms the reset. */
  onReset: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Description of what will be discarded, shown in the confirmation dialog. */
  sectionLabel?: string;
}

/**
 * Renders a "Discard Changes" button that opens a confirmation dialog to discard unsaved changes.
 *
 * The dialog asks the user to confirm discarding either all unsaved changes or a specific section,
 * and invokes the provided callback when the user confirms.
 *
 * @param onReset - Callback invoked when the user confirms discarding changes
 * @param disabled - If true, the trigger button is disabled
 * @param sectionLabel - Optional label used in the dialog description to indicate what will be discarded
 * @returns The rendered button and confirmation dialog React element
 */
export function DiscardChangesButton({
  onReset,
  disabled = false,
  sectionLabel,
}: DiscardChangesButtonProps) {
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setOpen(false);
    onReset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={
            'flex h-8 items-center gap-1.5 rounded-xl border border-white/10 ' +
            'bg-background/40 px-3 text-[10px] font-black uppercase tracking-wider ' +
            'text-muted-foreground/80 transition-all hover:bg-white/[0.06] ' +
            'hover:text-foreground active:scale-95 backdrop-blur-xl ' +
            'disabled:opacity-50 whitespace-nowrap shadow-none'
          }
        >
          <Undo2 aria-hidden="true" className="h-3 w-3 opacity-60" />
          <span className="hidden sm:inline">Discard Changes</span>
          <span className="sm:hidden">Discard</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard Changes?</DialogTitle>
          <DialogDescription>
            {sectionLabel
              ? `This will discard ${sectionLabel}. Your configuration will revert to the last saved state.`
              : 'This will discard all unsaved changes. Your configuration will revert to the last saved state.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
