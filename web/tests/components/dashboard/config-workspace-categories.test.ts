import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import {
  DEFAULT_CONFIG_CATEGORY,
  getCategoryByFeature,
  getCategoryById,
  getMatchedFeatureIds,
  getMatchingSearchItems,
} from '@/components/dashboard/config-workspace/config-categories';
import { logger } from '@/lib/logger';

describe('config workspace category helpers', () => {
  it('finds categories by id and falls back to the default category for unknown ids', () => {
    expect(getCategoryById('moderation-safety').label).toMatch(/Moderation/i);

    const fallback = getCategoryById('missing-category' as Parameters<typeof getCategoryById>[0]);

    expect(fallback.id).toBe(DEFAULT_CONFIG_CATEGORY);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('missing-category'));
  });

  it('finds the category that owns a feature id', () => {
    expect(getCategoryByFeature('welcome').id).toBe('onboarding-growth');
    expect(getCategoryByFeature('unknown-feature' as Parameters<typeof getCategoryByFeature>[0]).id).toBe(
      DEFAULT_CONFIG_CATEGORY,
    );
  });

  it('matches search items by label, description, and keywords', () => {
    expect(getMatchingSearchItems('  role menu  ').map((item) => item.id)).toContain('welcome-role-menu');
    expect(getMatchingSearchItems('AUTO-PURGE').map((item) => item.id)).toContain('audit-log-retention');
    expect(getMatchingSearchItems('')).toEqual([]);
  });

  it('collects matched feature ids from search results', () => {
    expect(getMatchedFeatureIds('github').has('github-feed')).toBe(true);
    expect(getMatchedFeatureIds('zzzz-no-match').size).toBe(0);
  });
});
