import { describe, expect, it } from 'vitest';
import { buildLevelUpDmConfig } from '@/components/dashboard/config-sections/CommunitySettingsSection';

describe('buildLevelUpDmConfig', () => {
  it('defaults enabled to false when missing from a partial config', () => {
    expect(
      buildLevelUpDmConfig(
        {
          sendOnEveryLevel: true,
          defaultMessage: 'Level {{level}}',
          messages: [],
        },
        {},
      ),
    ).toEqual({
      enabled: false,
      sendOnEveryLevel: true,
      defaultMessage: 'Level {{level}}',
      messages: [],
    });
  });
});
