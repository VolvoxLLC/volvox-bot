/**
 * Pure string utilities for the `provider:model` format used by the AI
 * client. Kept in its own module (no SDK or network dependencies) so callers
 * that only need to inspect model identifiers — debug footers, cost tables,
 * analytics — don't transitively import the Vercel AI SDK, and don't need
 * special handling when `aiClient.js` is mocked in tests.
 */

/**
 * Split a model string into its provider/model parts.
 *
 * Accepts either a bare model name (defaults to 'anthropic') or a
 * `provider:model` form.
 *
 * @param {string} modelString
 * @returns {{ providerName: string, modelId: string }}
 */
export function parseProviderModel(modelString) {
  if (!modelString || typeof modelString !== 'string') {
    return { providerName: 'anthropic', modelId: modelString ?? '' };
  }
  const colonIdx = modelString.indexOf(':');
  if (colonIdx <= 0) return { providerName: 'anthropic', modelId: modelString };
  return {
    providerName: modelString.slice(0, colonIdx),
    modelId: modelString.slice(colonIdx + 1),
  };
}
