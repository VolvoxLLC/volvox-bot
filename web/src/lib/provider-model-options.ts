import providersCatalog from '../data/providers.json';

export interface ProviderModelOption {
  value: string;
  label: string;
  providerName: string;
  providerDisplayName: string;
  modelName: string;
  modelDisplayName: string;
}

export interface ProviderModelOptionGroup {
  providerName: string;
  providerDisplayName: string;
  options: ProviderModelOption[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDisplayName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

/**
 * Build dashboard model dropdown options from the provider catalog.
 *
 * @param catalog - Provider catalog payload with a `providers` object.
 * @returns Selectable provider:model options where `availability.visible` is not `false`.
 */
export function buildVisibleProviderModelOptions(catalog: unknown = providersCatalog) {
  if (!isRecord(catalog) || !isRecord(catalog.providers)) return [];

  const options: ProviderModelOption[] = [];
  for (const [providerName, providerConfig] of Object.entries(catalog.providers)) {
    if (!isRecord(providerConfig) || !isRecord(providerConfig.models)) continue;

    const providerDisplayName = readDisplayName(providerConfig.displayName, providerName);
    for (const [modelName, modelConfig] of Object.entries(providerConfig.models)) {
      if (!isRecord(modelConfig)) continue;

      const availability = isRecord(modelConfig.availability) ? modelConfig.availability : {};
      if (availability.visible === false) continue;

      const modelDisplayName = readDisplayName(modelConfig.displayName, modelName);
      options.push({
        value: `${providerName}:${modelName}`,
        label: modelDisplayName,
        providerName,
        providerDisplayName,
        modelName,
        modelDisplayName,
      });
    }
  }

  return options;
}

/**
 * Group model options by provider while preserving catalog order.
 *
 * @param options - Flat provider model options.
 * @returns Options grouped for select optgroups.
 */
export function groupProviderModelOptions(options: ProviderModelOption[]) {
  const groups: ProviderModelOptionGroup[] = [];
  const groupIndexes = new Map<string, number>();

  for (const option of options) {
    const existingIndex = groupIndexes.get(option.providerName);
    if (existingIndex !== undefined) {
      groups[existingIndex].options.push(option);
      continue;
    }

    groupIndexes.set(option.providerName, groups.length);
    groups.push({
      providerName: option.providerName,
      providerDisplayName: option.providerDisplayName,
      options: [option],
    });
  }

  return groups;
}

export const VISIBLE_PROVIDER_MODEL_OPTIONS = buildVisibleProviderModelOptions();
export const VISIBLE_PROVIDER_MODEL_OPTION_GROUPS = groupProviderModelOptions(
  VISIBLE_PROVIDER_MODEL_OPTIONS,
);

/**
 * Return the canonical visible model value, falling back to the first visible option.
 *
 * @param modelValue - Saved provider:model value from config.
 * @param options - Visible model options to resolve against.
 * @returns A canonical visible provider:model value, or an empty string when none exist.
 */
export function getVisibleProviderModelValue(
  modelValue: string | null | undefined,
  options: ProviderModelOption[] = VISIBLE_PROVIDER_MODEL_OPTIONS,
) {
  if (typeof modelValue === 'string' && modelValue) {
    const match = options.find((option) => option.value.toLowerCase() === modelValue.toLowerCase());
    if (match) return match.value;
  }

  return options[0]?.value ?? '';
}
