/**
 * Template categories with icons and labels
 */

export const TEMPLATE_CATEGORIES = {
  bug: { label: 'Bug', icon: '🐛' },
  feature: { label: 'Feature', icon: '✨' },
  sprint: { label: 'Sprint', icon: '🔄' },
  content: { label: 'Content', icon: '📝' },
  research: { label: 'Research', icon: '🔬' },
  automation: { label: 'Automation', icon: '⚙️' },
  custom: { label: 'Custom', icon: '📦' },
} as const;

export type TemplateCategory = keyof typeof TEMPLATE_CATEGORIES;

export function getCategoryLabel(category: string | undefined): string {
  if (!category) return TEMPLATE_CATEGORIES.custom.label;
  return TEMPLATE_CATEGORIES[category as TemplateCategory]?.label || TEMPLATE_CATEGORIES.custom.label;
}

export function getCategoryIcon(category: string | undefined): string {
  if (!category) return TEMPLATE_CATEGORIES.custom.icon;
  return TEMPLATE_CATEGORIES[category as TemplateCategory]?.icon || TEMPLATE_CATEGORIES.custom.icon;
}
