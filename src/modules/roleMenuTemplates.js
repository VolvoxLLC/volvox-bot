/**
 * Role Menu Templates Module
 *
 * Manages reusable role menu templates — pre-defined (built-in) and
 * custom guild-created.  Templates can be shared across guilds.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/135
 */

import { getPool } from '../db.js';
import { info, warn } from '../logger.js';

// ── Built-in templates ────────────────────────────────────────────────────────

/**
 * Pre-defined templates shipped with the bot.
 * Options use placeholder label+description; role IDs must be filled in by the
 * guild admin when they apply the template (the bot doesn't know their role IDs).
 *
 * @type {Array<{name: string, description: string, category: string, options: Array<{label: string, description: string}>}>}
 */
export const BUILTIN_TEMPLATES = [
  {
    name: 'color-roles',
    description: 'Self-assignable colour roles (Red, Blue, Green, Yellow, Purple)',
    category: 'colors',
    options: [
      { label: '🔴 Red', description: 'Red colour role' },
      { label: '🔵 Blue', description: 'Blue colour role' },
      { label: '🟢 Green', description: 'Green colour role' },
      { label: '🟡 Yellow', description: 'Yellow colour role' },
      { label: '🟣 Purple', description: 'Purple colour role' },
    ],
  },
  {
    name: 'pronouns',
    description: 'Pronoun roles (he/him, she/her, they/them, any)',
    category: 'pronouns',
    options: [
      { label: 'he/him', description: 'He/Him pronouns' },
      { label: 'she/her', description: 'She/Her pronouns' },
      { label: 'they/them', description: 'They/Them pronouns' },
      { label: 'any pronouns', description: 'Any pronouns' },
      { label: 'ask my pronouns', description: 'Ask me my pronouns' },
    ],
  },
  {
    name: 'notifications',
    description: 'Opt-in notification roles (Announcements, Events, Updates)',
    category: 'notifications',
    options: [
      { label: '📣 Announcements', description: 'Server announcements' },
      { label: '🎉 Events', description: 'Server event pings' },
      { label: '🔔 Updates', description: 'Bot/server update pings' },
      { label: '📦 Releases', description: 'New release notifications' },
    ],
  },
];

// ── Validation ────────────────────────────────────────────────────────────────

const MAX_TEMPLATE_NAME_LEN = 64;
const _MAX_DESCRIPTION_LEN = 256;
const MAX_OPTIONS = 25;
const VALID_NAME_RE = /^[\w\- ]+$/;

/**
 * Validate a template name.
 * @param {string} name
 * @returns {string|null} Error message, or null if valid.
 */
export function validateTemplateName(name) {
  if (typeof name !== 'string' || !name.trim()) return 'Template name is required.';
  if (name.trim().length > MAX_TEMPLATE_NAME_LEN)
    return `Template name must be ≤${MAX_TEMPLATE_NAME_LEN} characters.`;
  if (!VALID_NAME_RE.test(name.trim()))
    return 'Template name may only contain letters, numbers, spaces, hyphens, and underscores.';
  return null;
}

/**
 * Validate template options.
 * @param {unknown} options
 * @returns {string|null} Error message, or null if valid.
 */
export function validateTemplateOptions(options) {
  if (!Array.isArray(options) || options.length === 0) return 'Template must have at least one option.';
  if (options.length > MAX_OPTIONS) return `Templates support at most ${MAX_OPTIONS} options.`;
  for (const [i, opt] of options.entries()) {
    if (!opt || typeof opt !== 'object') return `Option ${i + 1} is not a valid object.`;
    if (typeof opt.label !== 'string' || !opt.label.trim())
      return `Option ${i + 1} must have a non-empty label.`;
    if (opt.label.trim().length > 100)
      return `Option ${i + 1} label must be ≤100 characters.`;
  }
  return null;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/**
 * List templates visible to a guild: built-in rows + guild's own + shared.
 *
 * @param {string} guildId
 * @returns {Promise<Array>}
 */
export async function listTemplates(guildId) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, description, category, created_by_guild_id,
            is_builtin, is_shared, options, created_at
       FROM role_menu_templates
      WHERE is_builtin = TRUE
         OR created_by_guild_id = $1
         OR is_shared = TRUE
      ORDER BY is_builtin DESC, category, name`,
    [guildId],
  );
  return rows;
}

/**
 * Get a single template by name that is visible to the guild.
 *
 * @param {string} guildId
 * @param {string} name
 * @returns {Promise<object|null>}
 */
export async function getTemplateByName(guildId, name) {
  const pool = getPool();
  const { rows } = await pool.query(
    `SELECT id, name, description, category, created_by_guild_id,
            is_builtin, is_shared, options, created_at
       FROM role_menu_templates
      WHERE LOWER(name) = LOWER($1)
        AND (is_builtin = TRUE OR created_by_guild_id = $2 OR is_shared = TRUE)
      LIMIT 1`,
    [name.trim(), guildId],
  );
  return rows[0] ?? null;
}

/**
 * Create a custom template for a guild.
 *
 * @param {object} params
 * @param {string} params.guildId
 * @param {string} params.name
 * @param {string} [params.description]
 * @param {string} [params.category]
 * @param {Array<{label: string, description?: string, roleId?: string}>} params.options
 * @returns {Promise<object>} The created row.
 */
export async function createTemplate({ guildId, name, description = '', category = 'custom', options }) {
  const pool = getPool();
  const { rows } = await pool.query(
    `INSERT INTO role_menu_templates
       (name, description, category, created_by_guild_id, is_builtin, is_shared, options)
     VALUES ($1, $2, $3, $4, FALSE, FALSE, $5::jsonb)
     RETURNING *`,
    [name.trim(), description.trim(), category.trim(), guildId, JSON.stringify(options)],
  );
  info('Role menu template created', { guildId, name: name.trim() });
  return rows[0];
}

/**
 * Delete a guild's own custom template.
 *
 * @param {string} guildId
 * @param {string} name
 * @returns {Promise<boolean>} True if a row was deleted.
 */
export async function deleteTemplate(guildId, name) {
  const pool = getPool();
  const { rowCount } = await pool.query(
    `DELETE FROM role_menu_templates
      WHERE LOWER(name) = LOWER($1)
        AND created_by_guild_id = $2
        AND is_builtin = FALSE`,
    [name.trim(), guildId],
  );
  if (rowCount > 0) {
    info('Role menu template deleted', { guildId, name: name.trim() });
  }
  return rowCount > 0;
}

/**
 * Toggle sharing of a guild's template.
 *
 * @param {string} guildId
 * @param {string} name
 * @param {boolean} shared
 * @returns {Promise<object|null>} Updated row, or null if not found.
 */
export async function setTemplateShared(guildId, name, shared) {
  const pool = getPool();
  const { rows } = await pool.query(
    `UPDATE role_menu_templates
        SET is_shared = $1, updated_at = NOW()
      WHERE LOWER(name) = LOWER($2)
        AND created_by_guild_id = $3
        AND is_builtin = FALSE
      RETURNING *`,
    [shared, name.trim(), guildId],
  );
  if (rows[0]) {
    info('Role menu template sharing updated', { guildId, name: name.trim(), shared });
  } else {
    warn('setTemplateShared: template not found or not owned by guild', { guildId, name: name.trim() });
  }
  return rows[0] ?? null;
}

/**
 * Seed built-in templates into the database (idempotent — skips existing rows).
 *
 * @returns {Promise<void>}
 */
export async function seedBuiltinTemplates() {
  const pool = getPool();
  for (const tpl of BUILTIN_TEMPLATES) {
    await pool.query(
      `INSERT INTO role_menu_templates
         (name, description, category, created_by_guild_id, is_builtin, is_shared, options)
       VALUES ($1, $2, $3, NULL, TRUE, TRUE, $4::jsonb)
       ON CONFLICT (name, COALESCE(created_by_guild_id, '__builtin__')) DO NOTHING`,
      [tpl.name, tpl.description, tpl.category, JSON.stringify(tpl.options)],
    );
  }
  info('Built-in role menu templates seeded', { count: BUILTIN_TEMPLATES.length });
}

/**
 * Apply a template to a guild's welcome.roleMenu config.
 * Returns the merged options array — caller is responsible for saving config.
 *
 * Built-in templates have no roleId; the guild must map them before options
 * are usable in the live role menu.  The returned options include whatever
 * roleId values are already stored (from a previous apply + edit cycle).
 *
 * @param {object} template  A template row from the DB.
 * @param {Array}  [existingOptions]  Current welcome.roleMenu.options (to preserve role IDs).
 * @returns {Array<{label: string, description?: string, roleId: string}>}
 */
export function applyTemplateToOptions(template, existingOptions = []) {
  const existingByLabel = Object.fromEntries(
    existingOptions.map((opt) => [opt.label?.toLowerCase(), opt.roleId]),
  );

  return template.options.map((opt) => {
    const labelKey = opt.label.toLowerCase();
    return {
      label: opt.label,
      ...(opt.description ? { description: opt.description } : {}),
      // Preserve an existing roleId if the label already has one
      roleId: opt.roleId || existingByLabel[labelKey] || '',
    };
  });
}
