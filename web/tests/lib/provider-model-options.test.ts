import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AI_MODEL,
  buildVisibleProviderModelOptions,
  getVisibleProviderModelValue,
  groupProviderModelOptions,
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
  },
};

describe('provider model options', () => {
  it('builds dropdown options only for models with availability.visible not false', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(options.map((option) => option.value)).toEqual([
      'minimax:MiniMax-M2.7',
      'minimax:MiniMax-M2',
      'moonshot:kimi-k2.6',
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
    ]);
  });

  it('canonicalizes supported saved model values case-insensitively', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(getVisibleProviderModelValue('MINIMAX:minimax-m2.7', options)).toBe(
      'minimax:MiniMax-M2.7',
    );
  });

  it('falls back to the explicit default visible model when the saved model is hidden', () => {
    const options = buildVisibleProviderModelOptions(providerCatalog);

    expect(getVisibleProviderModelValue('minimax:MiniMax-M2.7', options)).toBe(
      'minimax:MiniMax-M2.7',
    );
    expect(getVisibleProviderModelValue('minimax:MiniMax-M2.5', options)).toBe(DEFAULT_AI_MODEL);
  });

  it('does not depend on catalog order when falling back to the default model', () => {
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
    expect(getVisibleProviderModelValue('hidden:model', options)).toBe(DEFAULT_AI_MODEL);
  });
});
