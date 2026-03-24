'use client';

import { useConfigContext } from '@/components/dashboard/config-context';
import { CommunitySettingsSection } from '@/components/dashboard/config-sections/CommunitySettingsSection';

/**
 * Support & Integrations category — renders Github feed, Tickets, and other
 * integration feature cards.
 */
export function SupportIntegrationsCategory() {
  const {
    draftConfig,
    saving,
    guildId,
    visibleFeatureIds,
    forceOpenAdvancedFeatureId,
    updateDraftConfig,
  } = useConfigContext();

  if (!draftConfig) return null;

  return (
    <CommunitySettingsSection
      draftConfig={draftConfig}
      saving={saving}
      guildId={guildId}
      updateDraftConfig={updateDraftConfig}
      activeCategoryId="support-integrations"
      visibleFeatureIds={visibleFeatureIds}
      forceOpenAdvancedFeatureId={forceOpenAdvancedFeatureId}
    />
  );
}
