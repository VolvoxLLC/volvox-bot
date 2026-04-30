import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MODEL,
  VISIBLE_PROVIDER_MODEL_OPTIONS,
  buildVisibleProviderModelOptions,
  getVisibleProviderModelValue,
  groupProviderModelOptions,
  isProviderModelId,
} from '@/lib/provider-model-options';

const providerCatalog = {
  providers: {
    minimax: {
      displayName: 'MiniMax',
      models: {
        'MiniMax-M2.7': {
          displayName: 'MiniMax M2.7',
          availability: { visible: true, tier: 'free' },
        },
        'MiniMax-M2.5': {
          displayName: 'MiniMax M2.5',
          availability: { visible: false, tier: 'free' },
        },
        'MiniMax-M2': {
          displayName: 'MiniMax M2',
        },
      },
    },
    moonshot: {
      displayName: 'Moonshot',
      models: {
        'kimi-k2.6': {
          displayName: 'Kimi K2.6',
          availability: { visible: true, tier: 'free' },
        },
      },
    },
    openrouter: {
      displayName: 'OpenRouter',
      models: {
        'minimax/minimax-m2.5:free': {
          displayName: 'MiniMax M2.5 Free',
          availability: { visible: true, tier: 'free' },
        },
      },
    },
  },
};

describe('provider model options', () => {
  it('builds dropdown options only for models with availability.visible not false', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(options.map((option) => option.value)).toEqual([
      'minimax:MiniMax-M2.7',
      'minimax:MiniMax-M2',
      'moonshot:kimi-k2.6',
      'openrouter:minimax/minimax-m2.5:free',
    ]);
    expect(options.map((option) => option.value)).not.toContain('minimax:MiniMax-M2.5');
  });

  it('groups visible model options by provider for select optgroups', () => {
    const groups = groupProviderModelOptions(buildVisibleProviderModelOptions(providerCatalog));

    expect(groups).toEqual([
      {
        providerName: 'minimax',
        providerDisplayName: 'MiniMax',
        options: [
          expect.objectContaining({ value: 'minimax:MiniMax-M2.7' }),
          expect.objectContaining({ value: 'minimax:MiniMax-M2' }),
        ],
      },
      {
        providerName: 'moonshot',
        providerDisplayName: 'Moonshot',
        options: [expect.objectContaining({ value: 'moonshot:kimi-k2.6' })],
      },
      {
        providerName: 'openrouter',
        providerDisplayName: 'OpenRouter',
        options: [expect.objectContaining({ value: 'openrouter:minimax/minimax-m2.5:free' })],
      },
    ]);
  });

  it('canonicalizes supported saved model values case-insensitively', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(getVisibleProviderModelValue('MINIMAX:minimax-m2.7', options)).toBe(
      'minimax:MiniMax-M2.7',
    );
  });

  it('derives the default model from the first synced visible catalog entry', () => {
    expect(DEFAULT_AI_MODEL).toBe(VISIBLE_PROVIDER_MODEL_OPTIONS[0]?.value);
  });

  it('preserves hidden and unknown valid provider:model IDs', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(getVisibleProviderModelValue('minimax:MiniMax-M2.7', options)).toBe(
      'minimax:MiniMax-M2.7',
    );
    expect(getVisibleProviderModelValue('minimax:MiniMax-M2.5', options)).toBe(
      'minimax:MiniMax-M2.5',
    );
    expect(getVisibleProviderModelValue('anthropic:claude-3-5-haiku', options)).toBe(
      'anthropic:claude-3-5-haiku',
    );
  });

  it('preserves provider model IDs with colons in the model segment', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(isProviderModelId('openrouter:minimax/minimax-m2.5:free')).toBe(true);
    expect(getVisibleProviderModelValue('OPENROUTER:minimax/minimax-m2.5:free', options)).toBe(
      'openrouter:minimax/minimax-m2.5:free',
    );
    expect(getVisibleProviderModelValue('provider:model:extra', options)).toBe(
      'provider:model:extra',
    );
  });

  it('rejects malformed provider model IDs and falls back to the default option', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    for (const value of [
      '',
      ':orphan-model',
      'provider:',
      'provider::free',
      'bare-model',
      'provider:has whitespace',
      ' provider:model',
      'provider:model ',
    ]) {
      expect(isProviderModelId(value)).toBe(false);
      expect(getVisibleProviderModelValue(value, options)).toBe(options[0]?.value);
    }
  });

  it('uses catalog order when falling back to the default model', () => {
    const options = buildVisibleProviderModelOptions({
      providers: {
        moonshot: {
          displayName: 'Moonshot',
          models: {
            'kimi-k2.6': {
              displayName: 'Kimi K2.6',
              availability: { visible: true },
            },
          },
        },
        minimax: {
          displayName: 'MiniMax',
          models: {
            'MiniMax-M2.7': {
              displayName: 'MiniMax M2.7',
              availability: { visible: true },
            },
          },
        },
      },
    });

    expect(options[0]?.value).toBe('moonshot:kimi-k2.6');
    expect(getVisibleProviderModelValue('not a provider model', options)).toBe(options[0]?.value);
  });
});
