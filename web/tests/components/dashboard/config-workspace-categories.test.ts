import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  CONFIG_CATEGORIES,
  DEFAULT_CONFIG_CATEGORY,
  getCategoryById,
} from '@/components/dashboard/config-workspace/config-categories';
import { logger } from '@/lib/logger';

describe('config workspace category fallback behavior', () => {
  it('keeps the legacy coverage bridge pointed at the default category helper', () => {
    expect(getCategoryById(DEFAULT_CONFIG_CATEGORY).id).toBe(DEFAULT_CONFIG_CATEGORY);
  });

  it('falls back unknown category ids to the default first category', () => {
    const fallback = getCategoryById('unknown-category' as Parameters<typeof getCategoryById>[0]);

    expect(CONFIG_CATEGORIES[0]?.id).toBe(DEFAULT_CONFIG_CATEGORY);
    expect(fallback.id).toBe(DEFAULT_CONFIG_CATEGORY);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown-category'));
  });
});
