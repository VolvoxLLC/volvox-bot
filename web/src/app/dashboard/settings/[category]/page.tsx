import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AiAutomationCategory } from '@/components/dashboard/config-categories/ai-automation';
import { CommunityToolsCategory } from '@/components/dashboard/config-categories/community-tools';
import { ModerationSafetyCategory } from '@/components/dashboard/config-categories/moderation-safety';
import { OnboardingGrowthCategory } from '@/components/dashboard/config-categories/onboarding-growth';
import { SupportIntegrationsCategory } from '@/components/dashboard/config-categories/support-integrations';
import { CONFIG_CATEGORIES } from '@/components/dashboard/config-workspace/config-categories';
import type { ConfigCategoryId } from '@/components/dashboard/config-workspace/types';
import { createPageMetadata } from '@/lib/page-titles';

const CATEGORY_COMPONENTS: Record<ConfigCategoryId, React.ComponentType> = {
  'ai-automation': AiAutomationCategory,
  'onboarding-growth': OnboardingGrowthCategory,
  'moderation-safety': ModerationSafetyCategory,
  'community-tools': CommunityToolsCategory,
  'support-integrations': SupportIntegrationsCategory,
};

interface CategoryPageProps {
  params: Promise<{ category: string }>;
}

/**
 * Generate metadata for the category page based on the slug.
 */
export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { category } = await params;
  const meta = CONFIG_CATEGORIES.find((c) => c.id === category);
  if (!meta) return createPageMetadata('Settings');
  return createPageMetadata(`Settings - ${meta.label}`, meta.description);
}

/**
 * Dynamic config category page.
 * Validates the slug against known categories, renders the matching component, or 404s.
 */
export default async function CategoryPage({ params }: CategoryPageProps) {
  const { category } = await params;

  const isValid = CONFIG_CATEGORIES.some((c) => c.id === category);
  if (!isValid) {
    notFound();
  }

  const Component = CATEGORY_COMPONENTS[category as ConfigCategoryId];
  return <Component />;
}
