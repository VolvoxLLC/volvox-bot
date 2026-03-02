/**
 * Tests for /rolemenu command
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/135
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('../../src/db.js', () => ({ getPool: vi.fn() }));
vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

const mockGetConfig = vi.fn().mockReturnValue({});
const mockSetConfigValue = vi.fn().mockResolvedValue({});
vi.mock('../../src/modules/config.js', () => ({
  getConfig: (...args) => mockGetConfig(...args),
  setConfigValue: (...args) => mockSetConfigValue(...args),
}));

const mockSafeEditReply = vi.fn().mockResolvedValue({});
vi.mock('../../src/utils/safeSend.js', () => ({
  safeEditReply: (...args) => mockSafeEditReply(...args),
}));

const mockIsModerator = vi.fn().mockReturnValue(true);
vi.mock('../../src/utils/permissions.js', () => ({
  isModerator: (...args) => mockIsModerator(...args),
}));

const mockListTemplates = vi.fn();
const mockGetTemplateByName = vi.fn();
const mockCreateTemplate = vi.fn();
const mockDeleteTemplate = vi.fn();
const mockSetTemplateShared = vi.fn();
const mockValidateName = vi.fn().mockReturnValue(null);
const mockValidateOptions = vi.fn().mockReturnValue(null);
const mockApplyTemplate = vi.fn().mockReturnValue([{ label: 'Red', roleId: '' }]);

vi.mock('../../src/modules/roleMenuTemplates.js', () => ({
  listTemplates: (...a) => mockListTemplates(...a),
  getTemplateByName: (...a) => mockGetTemplateByName(...a),
  createTemplate: (...a) => mockCreateTemplate(...a),
  deleteTemplate: (...a) => mockDeleteTemplate(...a),
  setTemplateShared: (...a) => mockSetTemplateShared(...a),
  validateTemplateName: (...a) => mockValidateName(...a),
  validateTemplateOptions: (...a) => mockValidateOptions(...a),
  applyTemplateToOptions: (...a) => mockApplyTemplate(...a),
  BUILTIN_TEMPLATES: [],
}));

vi.mock('discord.js', () => {
  class MockEmbed {
    setTitle() { return this; }
    setColor() { return this; }
    setDescription() { return this; }
    setFooter() { return this; }
    addFields() { return this; }
  }

  function chainable() {
    const proxy = new Proxy(() => proxy, {
      get: () => () => proxy,
      apply: () => proxy,
    });
    return proxy;
  }

  class MockSlashCommandBuilder {
    setName() { return this; }
    setDescription() { return this; }
    addSubcommandGroup(fn) { fn(chainable()); return this; }
  }

  return {
    SlashCommandBuilder: MockSlashCommandBuilder,
    EmbedBuilder: MockEmbed,
    PermissionFlagsBits: { Administrator: BigInt(8) },
  };
});

// ── Test helpers ───────────────────────────────────────────────────────────────

function makeInteraction({
  subcommand = 'list',
  name = null,
  enabled = null,
  merge = null,
  optionsJson = null,
  description = null,
  category = null,
  isAdmin = true,
} = {}) {
  return {
    guildId: 'guild1',
    user: { id: 'user1' },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    member: {
      permissions: {
        has: vi.fn().mockReturnValue(isAdmin),
      },
    },
    options: {
      getSubcommand: vi.fn().mockReturnValue(subcommand),
      getString: vi.fn((key) => {
        if (key === 'name') return name;
        if (key === 'options') return optionsJson;
        if (key === 'description') return description;
        if (key === 'category') return category;
        return null;
      }),
      getBoolean: vi.fn((key) => {
        if (key === 'enabled') return enabled;
        if (key === 'merge') return merge;
        return null;
      }),
    },
  };
}

// ── Import after mocks ────────────────────────────────────────────────────────

const { execute, data, adminOnly } = await import('../../src/commands/rolemenu.js');

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('/rolemenu command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetConfig.mockReturnValue({});
    mockIsModerator.mockReturnValue(true);
  });

  it('exports data and execute', () => {
    expect(data).toBeDefined();
    expect(typeof execute).toBe('function');
    expect(adminOnly).toBe(true);
  });

  describe('permission check', () => {
    it('rejects non-mod/non-admin users', async () => {
      const interaction = makeInteraction({ isAdmin: false });
      mockIsModerator.mockReturnValue(false);

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('permissions') }),
      );
    });
  });

  // ── list ────────────────────────────────────────────────────────────────────

  describe('template list', () => {
    it('replies with empty state when no templates', async () => {
      mockListTemplates.mockResolvedValueOnce([]);
      const interaction = makeInteraction({ subcommand: 'list' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('No templates') }),
      );
    });

    it('replies with embed when templates exist', async () => {
      mockListTemplates.mockResolvedValueOnce([
        {
          id: 1,
          name: 'color-roles',
          description: 'Color roles',
          category: 'colors',
          is_builtin: true,
          is_shared: true,
          options: [],
        },
      ]);
      const interaction = makeInteraction({ subcommand: 'list' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });

  // ── info ────────────────────────────────────────────────────────────────────

  describe('template info', () => {
    it('replies with not found when template missing', async () => {
      mockGetTemplateByName.mockResolvedValueOnce(null);
      const interaction = makeInteraction({ subcommand: 'info', name: 'ghost' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not found') }),
      );
    });

    it('replies with embed when template found', async () => {
      mockGetTemplateByName.mockResolvedValueOnce({
        id: 1,
        name: 'pronouns',
        description: 'Pronoun roles',
        category: 'pronouns',
        is_builtin: true,
        is_shared: true,
        options: [{ label: 'they/them' }],
        created_at: new Date().toISOString(),
      });
      const interaction = makeInteraction({ subcommand: 'info', name: 'pronouns' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ embeds: expect.any(Array) }),
      );
    });
  });

  // ── apply ───────────────────────────────────────────────────────────────────

  describe('template apply', () => {
    it('replies not found when template missing', async () => {
      mockGetTemplateByName.mockResolvedValueOnce(null);
      const interaction = makeInteraction({ subcommand: 'apply', name: 'ghost' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not found') }),
      );
    });

    it('calls setConfigValue when template found', async () => {
      const tpl = {
        name: 'color-roles',
        description: 'Color roles',
        is_builtin: false,
        options: [{ label: 'Red', roleId: '111' }],
      };
      mockGetTemplateByName.mockResolvedValueOnce(tpl);
      mockApplyTemplate.mockReturnValueOnce([{ label: 'Red', roleId: '111' }]);

      const interaction = makeInteraction({ subcommand: 'apply', name: 'color-roles' });
      await execute(interaction);

      expect(mockSetConfigValue).toHaveBeenCalledWith(
        'welcome.roleMenu.enabled',
        true,
        'guild1',
      );
      expect(mockSetConfigValue).toHaveBeenCalledWith(
        'welcome.roleMenu.options',
        expect.any(Array),
        'guild1',
      );
    });

    it('includes warning note for built-in templates', async () => {
      const tpl = {
        name: 'color-roles',
        description: 'Color roles',
        is_builtin: true,
        options: [{ label: 'Red' }],
      };
      mockGetTemplateByName.mockResolvedValueOnce(tpl);
      mockApplyTemplate.mockReturnValueOnce([{ label: 'Red', roleId: '' }]);

      const interaction = makeInteraction({ subcommand: 'apply', name: 'color-roles' });
      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('role IDs') }),
      );
    });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('template create', () => {
    it('rejects invalid template name', async () => {
      mockValidateName.mockReturnValueOnce('Name is invalid.');
      const interaction = makeInteraction({
        subcommand: 'create',
        name: '!!bad!!',
        optionsJson: '[{"label":"X"}]',
      });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('Name is invalid') }),
      );
    });

    it('rejects invalid JSON options', async () => {
      const interaction = makeInteraction({
        subcommand: 'create',
        name: 'my-template',
        optionsJson: 'not json',
      });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('valid JSON') }),
      );
    });

    it('rejects invalid options array', async () => {
      mockValidateOptions.mockReturnValueOnce('At least one option required.');
      const interaction = makeInteraction({
        subcommand: 'create',
        name: 'my-template',
        optionsJson: '[]',
      });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('At least one option') }),
      );
    });

    it('creates template successfully', async () => {
      mockCreateTemplate.mockResolvedValueOnce({ name: 'my-template', id: 99 });
      const interaction = makeInteraction({
        subcommand: 'create',
        name: 'my-template',
        optionsJson: '[{"label":"Red","roleId":"111"}]',
      });

      await execute(interaction);

      expect(mockCreateTemplate).toHaveBeenCalled();
      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('created') }),
      );
    });

    it('handles duplicate name error (23505)', async () => {
      const err = Object.assign(new Error('unique violation'), { code: '23505' });
      mockCreateTemplate.mockRejectedValueOnce(err);
      const interaction = makeInteraction({
        subcommand: 'create',
        name: 'existing',
        optionsJson: '[{"label":"X"}]',
      });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('already exists') }),
      );
    });
  });

  // ── delete ──────────────────────────────────────────────────────────────────

  describe('template delete', () => {
    it('replies not found when delete returns false', async () => {
      mockDeleteTemplate.mockResolvedValueOnce(false);
      const interaction = makeInteraction({ subcommand: 'delete', name: 'ghost' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not found') }),
      );
    });

    it('replies success when delete returns true', async () => {
      mockDeleteTemplate.mockResolvedValueOnce(true);
      const interaction = makeInteraction({ subcommand: 'delete', name: 'my-tpl' });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('deleted') }),
      );
    });
  });

  // ── share ────────────────────────────────────────────────────────────────────

  describe('template share', () => {
    it('replies not found when template not owned by guild', async () => {
      mockSetTemplateShared.mockResolvedValueOnce(null);
      const interaction = makeInteraction({ subcommand: 'share', name: 'ghost', enabled: true });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('not found') }),
      );
    });

    it('replies shared when sharing enabled', async () => {
      mockSetTemplateShared.mockResolvedValueOnce({ name: 'my-tpl', is_shared: true });
      const interaction = makeInteraction({ subcommand: 'share', name: 'my-tpl', enabled: true });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('shared with all guilds') }),
      );
    });

    it('replies private when sharing disabled', async () => {
      mockSetTemplateShared.mockResolvedValueOnce({ name: 'my-tpl', is_shared: false });
      const interaction = makeInteraction({ subcommand: 'share', name: 'my-tpl', enabled: false });

      await execute(interaction);

      expect(mockSafeEditReply).toHaveBeenCalledWith(
        interaction,
        expect.objectContaining({ content: expect.stringContaining('private') }),
      );
    });
  });
});
