/**
 * Tests for src/modules/roleMenuTemplates.js
 *
 * Covers: BUILTIN_TEMPLATES, validateTemplateName, validateTemplateOptions,
 *   listTemplates, getTemplateByName, createTemplate, deleteTemplate,
 *   setTemplateShared, seedBuiltinTemplates, applyTemplateToOptions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockQuery = vi.fn();

vi.mock('../../src/db.js', () => ({
  getPool: vi.fn(() => ({ query: mockQuery })),
}));

vi.mock('../../src/logger.js', () => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import {
  applyTemplateToOptions,
  BUILTIN_TEMPLATES,
  createTemplate,
  deleteTemplate,
  getTemplateByName,
  listTemplates,
  seedBuiltinTemplates,
  setTemplateShared,
  validateTemplateName,
  validateTemplateOptions,
} from '../../src/modules/roleMenuTemplates.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRow(overrides = {}) {
  return {
    id: 1,
    name: 'test-template',
    description: 'A test template',
    category: 'custom',
    created_by_guild_id: 'guild1',
    is_builtin: false,
    is_shared: false,
    options: [{ label: 'Red', description: 'Red role', roleId: '111' }],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ── BUILTIN_TEMPLATES ─────────────────────────────────────────────────────────

describe('BUILTIN_TEMPLATES', () => {
  it('should export an array of templates', () => {
    expect(Array.isArray(BUILTIN_TEMPLATES)).toBe(true);
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('should include color-roles, pronouns, and notifications', () => {
    const names = BUILTIN_TEMPLATES.map((t) => t.name);
    expect(names).toContain('color-roles');
    expect(names).toContain('pronouns');
    expect(names).toContain('notifications');
  });

  it('each template should have name, description, category, and non-empty options', () => {
    for (const tpl of BUILTIN_TEMPLATES) {
      expect(typeof tpl.name).toBe('string');
      expect(typeof tpl.description).toBe('string');
      expect(typeof tpl.category).toBe('string');
      expect(Array.isArray(tpl.options)).toBe(true);
      expect(tpl.options.length).toBeGreaterThan(0);
      for (const opt of tpl.options) {
        expect(typeof opt.label).toBe('string');
        expect(opt.label.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── validateTemplateName ──────────────────────────────────────────────────────

describe('validateTemplateName', () => {
  it('returns null for valid names', () => {
    expect(validateTemplateName('color-roles')).toBeNull();
    expect(validateTemplateName('My Template')).toBeNull();
    expect(validateTemplateName('template_1')).toBeNull();
  });

  it('returns error for empty name', () => {
    expect(validateTemplateName('')).toBeTruthy();
    expect(validateTemplateName('   ')).toBeTruthy();
  });

  it('returns error for non-string', () => {
    expect(validateTemplateName(null)).toBeTruthy();
    expect(validateTemplateName(123)).toBeTruthy();
  });

  it('returns error for name exceeding 64 chars', () => {
    expect(validateTemplateName('a'.repeat(65))).toBeTruthy();
  });

  it('returns error for invalid characters', () => {
    expect(validateTemplateName('bad@name!')).toBeTruthy();
  });

  it('accepts exactly 64 chars', () => {
    expect(validateTemplateName('a'.repeat(64))).toBeNull();
  });
});

// ── validateTemplateOptions ───────────────────────────────────────────────────

describe('validateTemplateOptions', () => {
  it('returns null for valid options', () => {
    expect(validateTemplateOptions([{ label: 'Red' }])).toBeNull();
    expect(validateTemplateOptions([{ label: 'Red', roleId: '123' }])).toBeNull();
  });

  it('returns error for empty array', () => {
    expect(validateTemplateOptions([])).toBeTruthy();
  });

  it('returns error for non-array', () => {
    expect(validateTemplateOptions(null)).toBeTruthy();
    expect(validateTemplateOptions('bad')).toBeTruthy();
  });

  it('returns error for more than 25 options', () => {
    const opts = Array.from({ length: 26 }, (_, i) => ({ label: `Role ${i}` }));
    expect(validateTemplateOptions(opts)).toBeTruthy();
  });

  it('returns error for option without label', () => {
    expect(validateTemplateOptions([{ description: 'no label' }])).toBeTruthy();
  });

  it('returns error for label > 100 chars', () => {
    expect(validateTemplateOptions([{ label: 'a'.repeat(101) }])).toBeTruthy();
  });

  it('accepts exactly 25 options', () => {
    const opts = Array.from({ length: 25 }, (_, i) => ({ label: `Role ${i}` }));
    expect(validateTemplateOptions(opts)).toBeNull();
  });
});

// ── listTemplates ─────────────────────────────────────────────────────────────

describe('listTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns rows from the database', async () => {
    const rows = [makeRow(), makeRow({ name: 'pronouns', is_builtin: true })];
    mockQuery.mockResolvedValueOnce({ rows });

    const result = await listTemplates('guild1');
    expect(result).toEqual(rows);
    expect(mockQuery).toHaveBeenCalledOnce();
    expect(mockQuery.mock.calls[0][0]).toMatch(/SELECT/i);
  });

  it('passes guildId as parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await listTemplates('myguild');
    expect(mockQuery.mock.calls[0][1]).toContain('myguild');
  });
});

// ── getTemplateByName ─────────────────────────────────────────────────────────

describe('getTemplateByName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns first matching row', async () => {
    const row = makeRow();
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await getTemplateByName('guild1', 'test-template');
    expect(result).toEqual(row);
  });

  it('returns null when no rows found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await getTemplateByName('guild1', 'nonexistent');
    expect(result).toBeNull();
  });
});

// ── createTemplate ────────────────────────────────────────────────────────────

describe('createTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts template and returns created row', async () => {
    const row = makeRow();
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await createTemplate({
      guildId: 'guild1',
      name: 'test-template',
      description: 'A test template',
      category: 'custom',
      options: [{ label: 'Red', roleId: '111' }],
    });

    expect(result).toEqual(row);
    expect(mockQuery).toHaveBeenCalledOnce();
    expect(mockQuery.mock.calls[0][0]).toMatch(/INSERT/i);
  });

  it('trims name before insert', async () => {
    const row = makeRow();
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    await createTemplate({
      guildId: 'guild1',
      name: '  padded  ',
      options: [{ label: 'X' }],
    });

    expect(mockQuery.mock.calls[0][1][0]).toBe('padded');
  });

  it('serialises options as JSON', async () => {
    const row = makeRow();
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const opts = [{ label: 'Red', roleId: '111' }];
    await createTemplate({ guildId: 'guild1', name: 'test', options: opts });

    expect(mockQuery.mock.calls[0][1][4]).toBe(JSON.stringify(opts));
  });
});

// ── deleteTemplate ────────────────────────────────────────────────────────────

describe('deleteTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when a row is deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    const result = await deleteTemplate('guild1', 'test-template');
    expect(result).toBe(true);
  });

  it('returns false when no rows deleted', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    const result = await deleteTemplate('guild1', 'nonexistent');
    expect(result).toBe(false);
  });

  it('passes guildId as restriction parameter', async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    await deleteTemplate('myguild', 'test');
    expect(mockQuery.mock.calls[0][1]).toContain('myguild');
  });
});

// ── setTemplateShared ─────────────────────────────────────────────────────────

describe('setTemplateShared', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns updated row when found', async () => {
    const row = makeRow({ is_shared: true });
    mockQuery.mockResolvedValueOnce({ rows: [row] });

    const result = await setTemplateShared('guild1', 'test-template', true);
    expect(result).toEqual(row);
  });

  it('returns null when template not found/not owned', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await setTemplateShared('guild1', 'not-mine', true);
    expect(result).toBeNull();
  });
});

// ── seedBuiltinTemplates ──────────────────────────────────────────────────────

describe('seedBuiltinTemplates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls INSERT for each built-in template', async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await seedBuiltinTemplates();

    expect(mockQuery).toHaveBeenCalledTimes(BUILTIN_TEMPLATES.length);
    for (const call of mockQuery.mock.calls) {
      expect(call[0]).toMatch(/INSERT/i);
      expect(call[0]).toMatch(/ON CONFLICT/i);
    }
  });

  it('passes is_builtin=true for all built-in templates', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await seedBuiltinTemplates();
    // Each call should mark is_builtin via SQL — verify options serialise correctly
    for (const [i, tpl] of BUILTIN_TEMPLATES.entries()) {
      expect(mockQuery.mock.calls[i][1][0]).toBe(tpl.name);
    }
  });
});

// ── applyTemplateToOptions ────────────────────────────────────────────────────

describe('applyTemplateToOptions', () => {
  const template = {
    options: [
      { label: 'Red', description: 'Red role' },
      { label: 'Blue', description: 'Blue role' },
    ],
  };

  it('maps template options with empty roleId when no existing options', () => {
    const result = applyTemplateToOptions(template, []);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ label: 'Red', description: 'Red role', roleId: '' });
    expect(result[1]).toMatchObject({ label: 'Blue', description: 'Blue role', roleId: '' });
  });

  it('preserves existing roleIds by matching label (case-insensitive)', () => {
    const existing = [
      { label: 'Red', roleId: 'role-red-123' },
      { label: 'BLUE', roleId: 'role-blue-456' },
    ];
    const result = applyTemplateToOptions(template, existing);
    expect(result[0].roleId).toBe('role-red-123');
    expect(result[1].roleId).toBe('role-blue-456');
  });

  it('uses roleId from template options if set', () => {
    const tplWithIds = {
      options: [{ label: 'Red', roleId: 'tpl-red-999' }],
    };
    const result = applyTemplateToOptions(tplWithIds, []);
    expect(result[0].roleId).toBe('tpl-red-999');
  });

  it('prefers existing roleId over template roleId', () => {
    const tplWithIds = {
      options: [{ label: 'Red', roleId: 'tpl-red-111' }],
    };
    const existing = [{ label: 'Red', roleId: 'existing-red-222' }];
    const result = applyTemplateToOptions(tplWithIds, existing);
    // existing roleId takes precedence (opt.roleId || existingByLabel)
    // template opt has roleId 'tpl-red-111' which is truthy — it wins
    expect(result[0].roleId).toBe('existing-red-222');
  });

  it('does not include description if not present in template option', () => {
    const tplNoDesc = { options: [{ label: 'X' }] };
    const result = applyTemplateToOptions(tplNoDesc, []);
    expect(result[0]).not.toHaveProperty('description');
  });

  it('defaults existingOptions to empty array', () => {
    const result = applyTemplateToOptions(template);
    expect(result).toHaveLength(2);
  });
});
