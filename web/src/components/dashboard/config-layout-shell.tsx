'use client';

import { ArrowLeft, Loader2, RotateCcw, Save } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useMemo } from 'react';
import { ConfigProvider, useConfigContext } from '@/components/dashboard/config-context';
import { CategoryNavigation } from '@/components/dashboard/config-workspace/category-navigation';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import { ConfigSearch } from '@/components/dashboard/config-workspace/config-search';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfigDiff } from './config-diff';
import { ConfigDiffModal } from './config-diff-modal';
import { DiscardChangesButton } from './reset-defaults-button';

/**
 * Client-side layout shell for the config editor.
 * Wraps children in ConfigProvider and renders persistent navigation and save chrome.
 */
export function ConfigLayoutShell({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider>
      <ConfigLayoutInner>{children}</ConfigLayoutInner>
    </ConfigProvider>
  );
}

/** Inner layout that consumes the config context. */
function ConfigLayoutInner({ children }: { children: ReactNode }) {
  const {
    guildId,
    draftConfig,
    savedConfig,
    loading,
    saving,
    error,
    hasChanges,
    hasValidationErrors,
    changedSections,
    showDiffModal,
    setShowDiffModal,
    prevSavedConfig,
    openDiffModal,
    discardChanges,
    undoLastSave,
    executeSave,
    revertSection,
    dirtyCategoryCounts,
    changedCategoryCount,
    searchQuery,
    searchResults,
    handleSearchChange,
    handleSearchSelect,
    fetchConfig,
    activeCategoryId,
  } = useConfigContext();

  const activeCategory = useMemo(
    () =>
      activeCategoryId ? (CONFIG_CATEGORIES.find((c) => c.id === activeCategoryId) ?? null) : null,
    [activeCategoryId],
  );

  // ── No guild selected ──────────────────────────────────────────
  if (!guildId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Settings</CardTitle>
          <CardDescription>
            Select a server from the sidebar to manage its configuration.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // ── Loading state ──────────────────────────────────────────────
  if (loading) {
    return (
      <output className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading configuration...</span>
      </output>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="border-destructive/50" role="alert">
        <CardHeader>
          <CardTitle className="text-destructive">Failed to Load Config</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => fetchConfig(guildId)}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!draftConfig) return null;

  // ── Editor UI ──────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Manage settings by category for faster edits and fewer misses.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Undo last save — visible only after a successful save with no new changes */}
          {prevSavedConfig && !hasChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={undoLastSave}
              disabled={saving}
              aria-label="Undo last save"
            >
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Undo Last Save
            </Button>
          )}
          <DiscardChangesButton
            onReset={discardChanges}
            disabled={saving || !hasChanges}
            sectionLabel="all unsaved changes"
          />
          {/* Save button with unsaved-changes indicator dot */}
          <div className="relative">
            <Button
              onClick={openDiffModal}
              disabled={saving || !hasChanges || hasValidationErrors}
              aria-keyshortcuts="Control+S Meta+S"
            >
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
            {hasChanges && !saving && (
              <span
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-background"
                aria-hidden="true"
                title={`Unsaved changes in ${changedSections.length} section${changedSections.length === 1 ? '' : 's'}: ${changedSections.join(', ')}`}
              />
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        {/* Unsaved changes banner — spans both columns */}
        {hasChanges && (
          <output
            aria-live="polite"
            className="col-span-full rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200"
          >
            You have unsaved changes in {changedCategoryCount}{' '}
            {changedCategoryCount === 1 ? 'category' : 'categories'}.{' '}
            <kbd className="rounded border border-yellow-500/30 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs">
              Ctrl/⌘+S
            </kbd>{' '}
            to save.
          </output>
        )}

        {hasValidationErrors && (
          <output
            aria-live="polite"
            className="col-span-full rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            Fix validation errors before changes can be saved.
          </output>
        )}

        <CategoryNavigation dirtyCounts={dirtyCategoryCounts} />

        <div className="space-y-4">
          {/* Category header with label, description, and search — only on category pages */}
          {activeCategory && (
            <div className="space-y-3 rounded-lg border bg-card p-4">
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                Back to overview
              </Link>
              <p className="text-sm font-medium">{activeCategory.label}</p>
              <p className="text-xs text-muted-foreground">{activeCategory.description}</p>
              <ConfigSearch
                value={searchQuery}
                onChange={handleSearchChange}
                results={searchResults}
                onSelect={handleSearchSelect}
              />
            </div>
          )}

          {/* Route content */}
          {children}
        </div>
      </div>

      {hasChanges && savedConfig && (
        <ConfigDiff
          original={savedConfig}
          modified={draftConfig}
          changedSections={changedSections}
          onRevertSection={revertSection}
        />
      )}

      {savedConfig && (
        <ConfigDiffModal
          open={showDiffModal}
          onOpenChange={setShowDiffModal}
          original={savedConfig}
          modified={draftConfig}
          changedSections={changedSections}
          onConfirm={executeSave}
          onRevertSection={revertSection}
          saving={saving}
        />
      )}
    </div>
  );
}
