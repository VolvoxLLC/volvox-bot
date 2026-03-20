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
      <Card className="rounded-2xl">
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">Loading configuration...</span>
      </output>
    );
  }

  // ── Error state ────────────────────────────────────────────────
  if (error) {
    return (
      <Card className="rounded-2xl border-destructive/50" role="alert">
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
      {/* Top bar with title, search, and save controls */}
      <div className="dashboard-panel flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold tracking-tight">
            <span className="text-gradient-vibrant">Settings</span>
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Manage settings by category. Changes are tracked in real-time.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Undo last save — visible only after a successful save with no new changes */}
          {prevSavedConfig && !hasChanges && (
            <Button
              variant="outline"
              size="sm"
              onClick={undoLastSave}
              disabled={saving}
              aria-label="Undo last save"
              className="rounded-lg"
            >
              <RotateCcw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Undo
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
              className="rounded-lg"
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
                className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-yellow-400 ring-2 ring-background shadow-[0_0_6px_rgba(250,204,21,0.5)]"
                aria-hidden="true"
                title={`Unsaved changes in ${changedSections.length} section${changedSections.length === 1 ? '' : 's'}: ${changedSections.join(', ')}`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Status banners */}
      {hasChanges && (
        <output
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-yellow-500/20 bg-yellow-500/8 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-yellow-500/15">
            <Save className="h-3 w-3" />
          </span>
          <span>
            Unsaved changes in {changedCategoryCount}{' '}
            {changedCategoryCount === 1 ? 'category' : 'categories'}.{' '}
            <kbd className="rounded border border-yellow-500/20 bg-yellow-500/10 px-1.5 py-0.5 font-mono text-xs">
              Ctrl/⌘+S
            </kbd>{' '}
            to save.
          </span>
        </output>
      )}

      {hasValidationErrors && (
        <output
          aria-live="polite"
          className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive"
        >
          Fix validation errors before changes can be saved.
        </output>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <CategoryNavigation dirtyCounts={dirtyCategoryCounts} />

        <div className="space-y-4">
          {/* Category header with label, description, and search — only on category pages */}
          {activeCategory && (
            <div className="space-y-3 rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5">
              <Link
                href="/dashboard/settings"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                All categories
              </Link>
              <h2 className="text-base font-semibold tracking-tight">{activeCategory.label}</h2>
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
