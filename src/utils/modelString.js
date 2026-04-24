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
 * Requires the explicit `provider:model` form (e.g. `'minimax:MiniMax-M2.7'`).
 * Bare model names are **not** supported — every callsite must declare which
 * provider a model belongs to. See issue #553 decision D1.
 *
 * @param {string} modelString
 * @returns {{ providerName: string, modelId: string }}
 * @throws {Error} when `modelString` is empty, non-string, or lacks a `:` separator.
 */
export function parseProviderModel(modelString) {
  if (typeof modelString !== 'string' || !modelString) {
    throw new Error(
      `Model string must be in 'provider:model' format (got: ${JSON.stringify(modelString)}). Bare model names are not supported.`,
    );
  }
  const colonIdx = modelString.indexOf(':');
  if (colonIdx <= 0 || colonIdx === modelString.length - 1) {
    throw new Error(
      `Model string must be in 'provider:model' format (got: '${modelString}'). Bare model names are not supported.`,
    );
  }
  return {
    providerName: modelString.slice(0, colonIdx),
    modelId: modelString.slice(colonIdx + 1),
  };
}
