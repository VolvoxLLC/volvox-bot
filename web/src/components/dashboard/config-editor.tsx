'use client';

import { Save } from 'lucide-react';
import { ConfigProvider, useConfigContext } from '@/components/dashboard/config-context';
import { Button } from '@/components/ui/button';
import { DiscardChangesButton } from './reset-defaults-button';
import { SystemPromptEditor } from './system-prompt-editor';

export function ConfigEditor() {
  return (
    <ConfigProvider>
      <ConfigEditorContent />
    </ConfigProvider>
  );
}

function ConfigEditorContent() {
  const {
    guildId,
    draftConfig,
    loading,
    error,
    saving,
    hasChanges,
    hasValidationErrors,
    openDiffModal,
    discardChanges,
    fetchConfig,
    updateDraftConfig,
  } = useConfigContext();

  if (!guildId) {
    return <div className="p-6">Select a server to manage its configuration.</div>;
  }

  if (loading) {
    return <div className="p-6">Loading configuration...</div>;
  }

  if (error) {
    return (
      <div className="space-y-4 p-6">
        <p>{error}</p>
        <Button variant="outline" onClick={() => fetchConfig(guildId)}>
          Retry
        </Button>
      </div>
    );
  }

  if (!draftConfig) {
    return null;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bot Configuration</h1>
          <p className="text-sm text-muted-foreground">Manage core bot settings in one place.</p>
        </div>
        <div className="flex items-center gap-2">
          <DiscardChangesButton onReset={discardChanges} disabled={saving || !hasChanges} />
          <Button onClick={openDiffModal} disabled={saving || !hasChanges || hasValidationErrors}>
            <Save className="mr-2 h-4 w-4" />
            Save Changes
          </Button>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">AI Chat</h2>
        <SystemPromptEditor
          value={draftConfig.ai?.systemPrompt ?? ''}
          onChange={(value) =>
            updateDraftConfig((prev) => ({
              ...prev,
              ai: { ...prev.ai, systemPrompt: value },
            }))
          }
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Welcome Messages</h2>
        <p className="text-sm text-muted-foreground">
          Configure welcome message templates for new server members.
        </p>
      </section>
    </div>
  );
}
