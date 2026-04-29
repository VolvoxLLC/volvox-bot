import { describe, expect, it } from 'vitest';

import { DEFAULT_CONFIG_CATEGORY, getCategoryById } from '@/components/dashboard/config-workspace/config-categories';

describe('config workspace category coverage inventory', () => {
  it('keeps legacy coverage pointed at the focused category helper suite', () => {
    expect(getCategoryById(DEFAULT_CONFIG_CATEGORY).id).toBe(DEFAULT_CONFIG_CATEGORY);
  });
});
