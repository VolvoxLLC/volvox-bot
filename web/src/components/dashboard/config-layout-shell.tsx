'use client';

import { Loader2 } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef } from 'react';
import { useConfigContext } from '@/components/dashboard/config-context';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import { Button } from '@/components/ui/button';
import { ConfigDiffModal } from './config-diff-modal';
import { FloatingSaveIsland } from './floating-save-island';

/**
 * Client-side layout shell for the config editor.
 * Wraps children in ConfigProvider and renders persistent save chrome.
 */
export function ConfigLayoutShell({ children }: { children: ReactNode }) {
  return <ConfigLayoutInner>{children}</ConfigLayoutInner>;
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
    changedSections,
    showDiffModal,
    setShowDiffModal,
    executeSave,
    revertSection,
    searchQuery: _searchQuery,
    searchResults: _searchResults,
    handleSearchChange: _handleSearchChange,
    handleSearchSelect: _handleSearchSelect,
    fetchConfig,
    activeCategoryId,
  } = useConfigContext();

  const _activeCategory = useMemo(
    () =>
      activeCategoryId ? (CONFIG_CATEGORIES.find((c) => c.id === activeCategoryId) ?? null) : null,
    [activeCategoryId],
  );

  // ── Route guard: warn user about unsaved changes ────────────────
  const hasChangesRef = useRef(hasChanges);
  hasChangesRef.current = hasChanges;

  useEffect(() => {
    // Handle browser back/forward/close
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (hasChangesRef.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    }
    function onPopState(e: PopStateEvent) {
      if (hasChangesRef.current) {
        const confirmed = window.confirm(
          'You have unsaved changes. Are you sure you want to leave?',
        );
        if (!confirmed) {
          // Push current state back to cancel navigation
          window.history.pushState(e.state, '', window.location.href);
        }
      }
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, []);

  // Intercept in-app link clicks when there are unsaved changes
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (!hasChangesRef.current) return;

      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('http')) return;

      // Allow navigation within settings subpages
      if (href.startsWith('/dashboard/settings/')) return;

      const confirmed = window.confirm('You have unsaved changes. Are you sure you want to leave?');
      if (!confirmed) {
        e.preventDefault();
        e.stopPropagation();
      }
    }

    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // ── No guild selected ──────────────────────────────────────────
  if (!guildId) {
    return (
      <div className="group relative overflow-hidden rounded-[32px] border border-border bg-card/40 p-8 backdrop-blur-3xl shadow-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
        <div className="relative z-10 text-center py-12">
          <h2 className="text-xl font-black tracking-tight text-foreground">Settings</h2>
          <p className="mt-2 text-sm text-muted-foreground/60">
            Select a server from the sidebar to manage its configuration.
          </p>
        </div>
      </div>
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
      <div
        className="group relative overflow-hidden rounded-[32px] border border-destructive/30 bg-destructive/10 p-8 backdrop-blur-3xl shadow-2xl"
        role="alert"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-destructive/5 to-transparent pointer-events-none" />
        <div className="relative z-10 space-y-4">
          <h2 className="text-lg font-black uppercase tracking-wider text-destructive">
            Failed to Load Config
          </h2>
          <p className="text-sm text-destructive/80">{error}</p>
          <Button variant="outline" onClick={() => fetchConfig(guildId)} className="rounded-xl">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (!draftConfig) return null;

  // ── Editor UI ──────────────────────────────────────────────────
  return (
    <div className="relative px-4 md:px-0">
      {/* Main Feature Content */}
      <div className="space-y-8">{children}</div>

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

      {/* Floating save island */}
      <FloatingSaveIsland />
    </div>
  );
}
