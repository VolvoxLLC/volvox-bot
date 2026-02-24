"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ResetDefaultsButtonProps {
  /** Called when the user confirms the reset. */
  onReset: () => void;
  /** Whether the button is disabled. */
  disabled?: boolean;
  /** Description of what will be discarded, shown in the confirmation dialog. */
  sectionLabel?: string;
}

export function ResetDefaultsButton({
  onReset,
  disabled = false,
  sectionLabel,
}: ResetDefaultsButtonProps) {
  const [open, setOpen] = useState(false);

  function handleConfirm() {
    setOpen(false);
    onReset();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}>
          <Undo2 className="mr-2 h-4 w-4" aria-hidden="true" />
          Discard Changes
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Discard Changes?</DialogTitle>
          <DialogDescription>
            {sectionLabel
              ? `This will discard ${sectionLabel}. Your configuration will revert to the last saved state.`
              : "This will discard all unsaved changes. Your configuration will revert to the last saved state."}
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
