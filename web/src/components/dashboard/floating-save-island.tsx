'use client';
import { useState, useEffect } from 'react';
import { Loader2, RotateCcw, Save, X } from 'lucide-react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { cn } from '@/lib/utils';
import { DiscardChangesButton } from './reset-defaults-button';

/**
 * Render a bottom "save island" UI that appears when there are unsaved configuration changes or immediately after a save.
 *
 * Shows a status indicator plus action buttons for Save, Discard, and Undo. The control reflects validation and saving state (disables Save when validation errors exist or while saving, and shows a saving indicator). The island can be dismissed; once dismissed it remains hidden until new changes are made.
 */
export function FloatingSaveIsland() {
  const {
    hasChanges,
    hasValidationErrors,
    saving,
    changedCategoryCount,
    prevSavedConfig,
    openDiffModal,
    discardChanges,
    undoLastSave,
  } = useConfigContext();

  const [dismissed, setDismissed] = useState(false);

  // Auto-reset dismissal when new changes are made
  useEffect(() => {
    if (hasChanges) {
      setDismissed(false);
    }
  }, [hasChanges]);

  const showIsland = (hasChanges || (prevSavedConfig && !hasChanges)) && !dismissed;

  if (!showIsland) return null;

  return (
    <div className="fixed bottom-4 sm:bottom-6 left-1/2 z-50 -translate-x-1/2 animate-in slide-in-from-bottom-8 fade-in duration-300 w-[calc(100%-2rem)] sm:w-auto">
      <div
        className={cn(
          'flex items-center justify-between sm:justify-start gap-2 sm:gap-3 rounded-[24px] border border-white/10 bg-card/80 px-3 sm:px-5 py-2 sm:py-3 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.08)] backdrop-blur-3xl transition-all',
          hasValidationErrors && 'ring-1 ring-inset ring-destructive/40',
        )}
      >
        {/* Status indicator */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div
            className={cn(
              'h-2 w-2 rounded-full shadow-lg shrink-0',
              hasChanges
                ? 'bg-yellow-500 shadow-yellow-500/40 animate-pulse'
                : 'bg-emerald-500 shadow-emerald-500/40',
            )}
          />
          <span className="text-[10px] sm:text-[11px] font-bold text-muted-foreground/80 whitespace-nowrap">
            {hasChanges ? (
              <>
                <span className="text-yellow-500">{changedCategoryCount}</span>{' '}
                <span className="hidden sm:inline">
                  {changedCategoryCount === 1 ? 'category' : 'categories'} modified
                </span>
                <span className="sm:hidden">modified</span>
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Just saved — undo?</span>
                <span className="sm:hidden">Saved</span>
              </>
            )}
          </span>
        </div>

        <div className="h-5 w-[1px] bg-white/10 mx-0.5 sm:mx-1 shrink-0" />

        {/* Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* Undo (only after save with no new changes) */}
          {prevSavedConfig && !hasChanges && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={undoLastSave}
                disabled={saving}
                className="flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-background/40 px-3 text-[10px] font-black uppercase tracking-wider text-muted-foreground/80 transition-all hover:bg-white/[0.06] hover:text-foreground active:scale-95 backdrop-blur-xl"
              >
                <RotateCcw className="h-3 w-3 opacity-60" />
                Undo
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-background/40 text-muted-foreground/60 transition-all hover:bg-white/[0.06] hover:text-foreground active:scale-95 backdrop-blur-xl"
                title="Dismiss"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Discard */}
          {hasChanges && (
            <DiscardChangesButton
              onReset={discardChanges}
              disabled={saving}
              sectionLabel="all unsaved changes"
            />
          )}

          {/* Save */}
          {hasChanges && (
            <button
              type="button"
              onClick={openDiffModal}
              disabled={saving || hasValidationErrors}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-xl px-3 sm:px-4 text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 shadow-lg shrink-0 whitespace-nowrap',
                hasValidationErrors
                  ? 'bg-muted text-muted-foreground cursor-not-allowed'
                  : 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-primary/30',
              )}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saving ? (
                'Saving'
              ) : (
                <>
                  <span className="hidden sm:inline">Save Changes</span>
                  <span className="sm:hidden">Save</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Keyboard hint */}
        {hasChanges && !saving && (
          <>
            <div className="h-5 w-[1px] bg-white/10 mx-1 hidden sm:block" />
            <kbd className="hidden sm:inline-flex h-5 items-center rounded-md border border-white/10 bg-white/5 px-1.5 text-[9px] font-bold text-muted-foreground/40">
              ⌘S
            </kbd>
          </>
        )}
      </div>
    </div>
  );
}
