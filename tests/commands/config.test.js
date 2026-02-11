import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock config module
vi.mock('../../src/modules/config.js', () => ({
  getConfig: vi.fn().mockReturnValue({
    ai: { enabled: true, model: 'test-model', maxTokens: 1024 },
    welcome: { enabled: false, channelId: '' },
    moderation: { enabled: false },
  }),
  setConfigValue: vi.fn().mockResolvedValue({ enabled: true, model: 'new-model' }),
  resetConfig: vi.fn().mockResolvedValue({}),
}));

import { autocomplete, data, execute } from '../../src/commands/config.js';
import { getConfig, resetConfig, setConfigValue } from '../../src/modules/config.js';

describe('config command', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should export data with name', () => {
    expect(data.name).toBe('config');
  });

  it('should export adminOnly flag', async () => {
    const mod = await import('../../src/commands/config.js');
    expect(mod.adminOnly).toBe(true);
  });

  describe('autocomplete', () => {
    it('should autocomplete section names', async () => {
      const mockRespond = vi.fn();
      const interaction = {
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'section', value: 'ai' }),
        },
        respond: mockRespond,
      };

      await autocomplete(interaction);
      expect(mockRespond).toHaveBeenCalled();
      const choices = mockRespond.mock.calls[0][0];
      expect(choices.length).toBeGreaterThan(0);
      expect(choices[0].name).toBe('ai');
    });

    it('should autocomplete dot-notation paths', async () => {
      const mockRespond = vi.fn();
      const interaction = {
        options: {
          getFocused: vi.fn().mockReturnValue({ name: 'path', value: 'ai.' }),
        },
        respond: mockRespond,
      };

      await autocomplete(interaction);
      expect(mockRespond).toHaveBeenCalled();
      const choices = mockRespond.mock.calls[0][0];
      expect(choices.some((c) => c.value.startsWith('ai.'))).toBe(true);
    });
  });

  describe('execute', () => {
    describe('view subcommand', () => {
      it('should display all config sections', async () => {
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('view'),
            getString: vi.fn().mockReturnValue(null),
          },
          reply: mockReply,
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({ embeds: expect.any(Array), ephemeral: true }),
        );
      });

      it('should display specific section', async () => {
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('view'),
            getString: vi.fn().mockReturnValue('ai'),
          },
          reply: mockReply,
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({ embeds: expect.any(Array), ephemeral: true }),
        );
      });

      it('should error for unknown section', async () => {
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('view'),
            getString: vi.fn().mockReturnValue('nonexistent'),
          },
          reply: mockReply,
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('not found'),
            ephemeral: true,
          }),
        );
      });

      it('should truncate when config exceeds embed char limit', async () => {
        // Create a config with many large sections that exceed 6000 chars total
        // Each section generates ~1023 chars in the embed (JSON truncated to 1000 + field name)
        // Need 6+ sections to push past the 5800-char truncation threshold
        const largeValue = 'x'.repeat(1500);
        getConfig.mockReturnValueOnce({
          section1: { data: largeValue },
          section2: { data: largeValue },
          section3: { data: largeValue },
          section4: { data: largeValue },
          section5: { data: largeValue },
          section6: { data: largeValue },
          section7: { data: largeValue },
        });
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('view'),
            getString: vi.fn().mockReturnValue(null),
          },
          reply: mockReply,
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({ embeds: expect.any(Array), ephemeral: true }),
        );
        // The embed should contain a truncation notice
        const embed = mockReply.mock.calls[0][0].embeds[0];
        const fields = embed.toJSON().fields;
        const truncatedField = fields.find((f) => f.name === '⚠️ Truncated');
        expect(truncatedField).toBeDefined();
      });

      it('should handle getConfig throwing an error', async () => {
        getConfig.mockImplementationOnce(() => {
          throw new Error('config error');
        });
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('view'),
            getString: vi.fn().mockReturnValue(null),
          },
          reply: mockReply,
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('Failed to load config'),
            ephemeral: true,
          }),
        );
      });
    });

    describe('set subcommand', () => {
      it('should set a config value', async () => {
        const mockEditReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('set'),
            getString: vi.fn().mockImplementation((name) => {
              if (name === 'path') return 'ai.model';
              if (name === 'value') return 'new-model';
              return null;
            }),
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: mockEditReply,
        };

        await execute(interaction);
        expect(setConfigValue).toHaveBeenCalledWith('ai.model', 'new-model');
        expect(mockEditReply).toHaveBeenCalled();
      });

      it('should reject invalid section', async () => {
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('set'),
            getString: vi.fn().mockImplementation((name) => {
              if (name === 'path') return 'invalid.key';
              if (name === 'value') return 'value';
              return null;
            }),
          },
          reply: mockReply,
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('Invalid section'),
            ephemeral: true,
          }),
        );
      });

      it('should handle setConfigValue error', async () => {
        setConfigValue.mockRejectedValueOnce(new Error('DB error'));
        const mockEditReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('set'),
            getString: vi.fn().mockImplementation((name) => {
              if (name === 'path') return 'ai.model';
              if (name === 'value') return 'bad';
              return null;
            }),
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          deferred: true,
          editReply: mockEditReply,
        };

        await execute(interaction);
        expect(mockEditReply).toHaveBeenCalledWith(
          expect.objectContaining({ content: expect.stringContaining('Failed to set config') }),
        );
      });

      // deferReply rejects (simulating a Discord API failure), so the error
      // originates from the defer call — not from setConfigValue. The path
      // 'ai.key' passes section validation because only the top-level
      // section ('ai') is checked, making it reach the defer+set path.
      it('should handle error when not deferred', async () => {
        setConfigValue.mockRejectedValueOnce(new Error('error'));
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('set'),
            getString: vi.fn().mockImplementation((name) => {
              if (name === 'path') return 'ai.key';
              if (name === 'value') return 'val';
              return null;
            }),
          },
          deferReply: vi.fn().mockRejectedValue(new Error('defer failed')),
          deferred: false,
          reply: mockReply,
          editReply: vi.fn(),
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('Failed to set config'),
            ephemeral: true,
          }),
        );
      });
    });

    describe('reset subcommand', () => {
      it('should reset specific section', async () => {
        const mockEditReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('reset'),
            getString: vi.fn().mockReturnValue('ai'),
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: mockEditReply,
        };

        await execute(interaction);
        expect(resetConfig).toHaveBeenCalledWith('ai');
        expect(mockEditReply).toHaveBeenCalled();
      });

      it('should reset all when no section specified', async () => {
        const mockEditReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('reset'),
            getString: vi.fn().mockReturnValue(null),
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          editReply: mockEditReply,
        };

        await execute(interaction);
        expect(resetConfig).toHaveBeenCalledWith(undefined);
      });

      it('should handle reset error with deferred reply', async () => {
        resetConfig.mockRejectedValueOnce(new Error('reset failed'));
        const mockEditReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('reset'),
            getString: vi.fn().mockReturnValue('ai'),
          },
          deferReply: vi.fn().mockResolvedValue(undefined),
          deferred: true,
          editReply: mockEditReply,
        };

        await execute(interaction);
        expect(mockEditReply).toHaveBeenCalledWith(
          expect.objectContaining({ content: expect.stringContaining('Failed to reset config') }),
        );
      });

      it('should handle reset error when not deferred', async () => {
        resetConfig.mockRejectedValueOnce(new Error('reset failed'));
        const mockReply = vi.fn();
        const interaction = {
          options: {
            getSubcommand: vi.fn().mockReturnValue('reset'),
            getString: vi.fn().mockReturnValue('ai'),
          },
          deferReply: vi.fn().mockRejectedValue(new Error('defer failed')),
          deferred: false,
          reply: mockReply,
          editReply: vi.fn(),
        };

        await execute(interaction);
        expect(mockReply).toHaveBeenCalledWith(
          expect.objectContaining({
            content: expect.stringContaining('Failed to reset config'),
            ephemeral: true,
          }),
        );
      });
    });

    it('should reply with error for unknown subcommand', async () => {
      const mockReply = vi.fn();
      const interaction = {
        options: { getSubcommand: vi.fn().mockReturnValue('unknown') },
        reply: mockReply,
      };

      await execute(interaction);
      expect(mockReply).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining('Unknown subcommand'),
          ephemeral: true,
        }),
      );
    });
  });
});
