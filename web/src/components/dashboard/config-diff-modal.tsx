'use client';

import { Loader2, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfigDiff } from './config-diff';

interface ConfigDiffModalProps {
  /** Whether the modal is open. */
  open: boolean;
  /** Callback to open/close the modal. Blocked while saving. */
  onOpenChange: (open: boolean) => void;
  /** The original (saved) config to diff against. */
  original: object;
  /** The modified (draft) config to diff. */
  modified: object;
  /** Top-level section keys that have changes. */
  changedSections: string[];
  /** Called when user confirms the save. */
  onConfirm: () => void;
  /** Called when user reverts a specific top-level section. */
  onRevertSection: (section: string) => void;
  /** Whether a save is in progress. */
  saving: boolean;
}

/**
 * A modal dialog that shows a diff preview of pending config changes before saving.
 *
 * Displays the changed sections as badges with individual revert buttons, a scrollable
 * line-by-line diff, and Cancel / Confirm Save actions.
 *
 * @param open - Whether the dialog is visible.
 * @param onOpenChange - Callback to open/close the dialog (blocked while saving).
 * @param original - The original saved config object.
 * @param modified - The draft config object with pending changes.
 * @param changedSections - List of top-level section keys that differ.
 * @param onConfirm - Called when the user clicks "Confirm Save".
 * @param onRevertSection - Called with a section key when the user reverts that section.
 * @param saving - When true, disables controls and shows a spinner on the confirm button.
 * @returns The diff preview dialog element.
 */
export function ConfigDiffModal({
  open,
  onOpenChange,
  original,
  modified,
  changedSections,
  onConfirm,
  onRevertSection,
  saving,
}: ConfigDiffModalProps) {
  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col">
        <DialogHeader>
          <DialogTitle>Review Changes Before Saving</DialogTitle>
          <DialogDescription>
            Review your pending changes. Revert individual sections or confirm to save all changes.
          </DialogDescription>
        </DialogHeader>

        {/* Changed sections with per-section revert buttons */}
        {changedSections.length > 0 && (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 p-3"
            aria-label="Changed sections"
          >
            <span className="text-xs text-muted-foreground">Changed sections:</span>
            {changedSections.map((section) => (
              <div key={section} className="flex items-center gap-1">
                <span className="rounded border border-yellow-500/30 bg-yellow-500/20 px-2 py-0.5 text-xs capitalize text-yellow-300">
                  {section}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => onRevertSection(section)}
                  disabled={saving}
                  aria-label={`Revert ${section} changes`}
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Scrollable diff view */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConfigDiff original={original} modified={modified} title="Pending Changes" />
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                Confirm Save
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
