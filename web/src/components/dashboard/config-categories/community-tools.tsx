'use client';

import { useConfigContext } from '@/components/dashboard/config-context';
import { CommunitySettingsSection } from '@/components/dashboard/config-sections/CommunitySettingsSection';

/**
 * Community Tools category — renders community command toggles.
 */
export function CommunityToolsCategory() {
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
      activeCategoryId="community-tools"
      visibleFeatureIds={visibleFeatureIds}
      forceOpenAdvancedFeatureId={forceOpenAdvancedFeatureId}
    />
  );
}
