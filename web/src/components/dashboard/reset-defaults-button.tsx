"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";
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
  /** Optional description shown in the confirmation dialog. */
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
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reset to Defaults</DialogTitle>
          <DialogDescription>
            {sectionLabel
              ? `This will reset ${sectionLabel} to the default configuration. Any custom changes will be lost.`
              : "This will reset all settings to their default values. Any custom changes will be lost."}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Reset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
