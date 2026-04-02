'use client';

import { AiAutomationCategory } from '@/components/dashboard/config-categories/ai-automation';
import { OnboardingGrowthCategory } from '@/components/dashboard/config-categories/onboarding-growth';
import { ConfigLayoutShell } from '@/components/dashboard/config-layout-shell';

/**
 * Backward-compatible config editor entry point used by older tests.
 * Renders the settings shell with representative category content.
 */
export function ConfigEditor() {
  return (
    <ConfigLayoutShell>
      <AiAutomationCategory />
      <OnboardingGrowthCategory />
    </ConfigLayoutShell>
  );
}
