// The web app imports a generated snapshot because the Railway/Docker web build
// context cannot read the backend src/ tree. `pnpm providers:check` enforces
// web/src/data/providers.json stays synced with the backend provider catalog;
// this helper consumes that web JSON snapshot.
import providersCatalog from '@/data/providers.json';

const FALLBACK_AI_MODEL = 'minimax:MiniMax-M2.7';

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
export const DEFAULT_AI_MODEL = VISIBLE_PROVIDER_MODEL_OPTIONS[0]?.value ?? FALLBACK_AI_MODEL;
export const VISIBLE_PROVIDER_MODEL_OPTION_GROUPS = groupProviderModelOptions(
  VISIBLE_PROVIDER_MODEL_OPTIONS,
);

function findProviderModelOptionByValue(
  modelValue: string,
  options: ProviderModelOption[],
): ProviderModelOption | undefined {
  return options.find((option) => option.value.toLowerCase() === modelValue.toLowerCase());
}

export function isProviderModelId(value: unknown): value is string {
<<<<<<< HEAD
  if (typeof value !== 'string' || value !== value.trim() || /\s/.test(value)) return false;

  const separatorIndex = value.indexOf(':');
  if (separatorIndex <= 0 || separatorIndex === value.length - 1) return false;

  return /^[a-z0-9][a-z0-9._-]*$/i.test(value.slice(0, separatorIndex));
=======
  return (
    typeof value === 'string' &&
    /^[a-z0-9][a-z0-9._-]*:[^\s:]+$/i.test(value) &&
    value === value.trim()
  );
>>>>>>> 3ae5e9a5 (fix: preserve saved dashboard model selections)
}

/**
 * Return the canonical display model value while preserving valid provider:model IDs.
 *
 * Supported visible values are canonicalized case-insensitively. Unknown or hidden values that
 * still look like provider:model IDs are preserved so opening a dashboard tab does not silently
 * rewrite saved config to the default. Empty or malformed values fall back to the default visible
 * model for display.
 *
 * @param modelValue - Saved provider:model value from config.
 * @param options - Visible model options to resolve against.
 * @returns A canonical visible provider:model value, the preserved saved provider:model ID, or an
 * empty string when none exist.
 */
export function getVisibleProviderModelValue(
  modelValue: string | null | undefined,
  options: ProviderModelOption[] = VISIBLE_PROVIDER_MODEL_OPTIONS,
) {
  if (typeof modelValue === 'string' && modelValue) {
    const match = findProviderModelOptionByValue(modelValue, options);
    if (match) return match.value;
    if (isProviderModelId(modelValue)) return modelValue;
  }

  return options[0]?.value ?? '';
}
