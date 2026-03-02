/**
 * Role Menu Command
 *
 * Manage reusable role menu templates.
 *
 * Subcommands (all under /rolemenu template):
 *   list                       — list available templates
 *   info   <name>              — show template details
 *   apply  <name> [merge]      — apply template to this guild's role menu config
 *   create <name> <options>    — create a custom template (JSON options array)
 *   delete <name>              — delete a custom template
 *   share  <name> <enabled>    — toggle sharing of a custom template with other guilds
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/135
 */

import { EmbedBuilder, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { info } from '../logger.js';
import { getConfig, setConfigValue } from '../modules/config.js';
import {
  applyTemplateToOptions,
  createTemplate,
  deleteTemplate,
  getTemplateByName,
  listTemplates,
  setTemplateShared,
  validateTemplateName,
  validateTemplateOptions,
} from '../modules/roleMenuTemplates.js';
import { isModerator } from '../utils/permissions.js';
import { safeEditReply } from '../utils/safeSend.js';

export const adminOnly = true;

export const data = new SlashCommandBuilder()
  .setName('rolemenu')
  .setDescription('Manage role menu templates')
  .addSubcommandGroup((group) =>
    group
      .setName('template')
      .setDescription('Role menu template operations')
      .addSubcommand((sub) =>
        sub.setName('list').setDescription('List available role menu templates'),
      )
      .addSubcommand((sub) =>
        sub
          .setName('info')
          .setDescription('Show details for a template')
          .addStringOption((opt) =>
            opt.setName('name').setDescription('Template name').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('apply')
          .setDescription("Apply a template to this guild's role menu config")
          .addStringOption((opt) =>
            opt.setName('name').setDescription('Template name').setRequired(true),
          )
          .addBooleanOption((opt) =>
            opt
              .setName('merge')
              .setDescription(
                'Merge with existing role menu options instead of replacing (default: replace)',
              )
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('create')
          .setDescription('Create a custom role menu template for this guild')
          .addStringOption((opt) =>
            opt.setName('name').setDescription('Template name').setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName('options')
              .setDescription(
                'JSON array: [{"label":"Red","description":"Red role","roleId":"123"}]',
              )
              .setRequired(true),
          )
          .addStringOption((opt) =>
            opt
              .setName('description')
              .setDescription('Short description of this template')
              .setRequired(false),
          )
          .addStringOption((opt) =>
            opt
              .setName('category')
              .setDescription('Category (e.g. colors, pronouns, notifications, custom)')
              .setRequired(false),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('delete')
          .setDescription('Delete a custom template owned by this guild')
          .addStringOption((opt) =>
            opt.setName('name').setDescription('Template name').setRequired(true),
          ),
      )
      .addSubcommand((sub) =>
        sub
          .setName('share')
          .setDescription('Toggle sharing of a guild-owned template with other guilds')
          .addStringOption((opt) =>
            opt.setName('name').setDescription('Template name').setRequired(true),
          )
          .addBooleanOption((opt) =>
            opt.setName('enabled').setDescription('Share this template?').setRequired(true),
          ),
      ),
  );

// ── Permission guard ──────────────────────────────────────────────────────────

function hasModeratorPerms(interaction, guildConfig) {
  return (
    interaction.member.permissions.has(PermissionFlagsBits.Administrator) ||
    isModerator(interaction.member, guildConfig)
  );
}

// ── Subcommand handlers ───────────────────────────────────────────────────────

async function handleList(interaction) {
  const templates = await listTemplates(interaction.guildId);
  if (templates.length === 0) {
    await safeEditReply(interaction, {
      content: '📋 No templates available. Use `/rolemenu template create` to make one.',
    });
    return;
  }

  const byCategory = {};
  for (const tpl of templates) {
    const cat = tpl.category || 'custom';
    (byCategory[cat] ??= []).push(tpl);
  }

  const embed = new EmbedBuilder()
    .setTitle('📋 Role Menu Templates')
    .setColor(0x5865f2)
    .setFooter({ text: `${templates.length} template(s) available` });

  for (const [cat, items] of Object.entries(byCategory)) {
    const lines = items.map((t) => {
      const badges = [t.is_builtin ? '🔧 built-in' : '🏠 custom', t.is_shared ? '🌐 shared' : null]
        .filter(Boolean)
        .join(' · ');
      return `**${t.name}** — ${t.description || 'no description'} *(${badges})*`;
    });
    embed.addFields({ name: `📂 ${cat}`, value: lines.join('\n'), inline: false });
  }

  await safeEditReply(interaction, { embeds: [embed] });
}

async function handleInfo(interaction) {
  const name = interaction.options.getString('name');
  const tpl = await getTemplateByName(interaction.guildId, name);
  if (!tpl) {
    await safeEditReply(interaction, { content: `❌ Template \`${name}\` not found.` });
    return;
  }

  const options = Array.isArray(tpl.options) ? tpl.options : [];
  const optLines =
    options
      .map(
        (opt, i) =>
          `${i + 1}. **${opt.label}**${opt.description ? ` — ${opt.description}` : ''}${opt.roleId ? ` <@&${opt.roleId}>` : ''}`,
      )
      .join('\n') || '_No options_';

  const embed = new EmbedBuilder()
    .setTitle(`🎭 Template: ${tpl.name}`)
    .setColor(0x57f287)
    .setDescription(tpl.description || '_No description_')
    .addFields(
      { name: 'Category', value: tpl.category || 'custom', inline: true },
      { name: 'Type', value: tpl.is_builtin ? '🔧 Built-in' : '🏠 Custom', inline: true },
      { name: 'Shared', value: tpl.is_shared ? '✅ Yes' : '❌ No', inline: true },
      { name: `Options (${options.length})`, value: optLines.slice(0, 1024), inline: false },
    )
    .setFooter({
      text: `Created: ${tpl.created_at ? new Date(tpl.created_at).toDateString() : 'N/A'}`,
    });

  await safeEditReply(interaction, { embeds: [embed] });
}

async function handleApply(interaction) {
  const name = interaction.options.getString('name');
  const merge = interaction.options.getBoolean('merge') ?? false;

  const tpl = await getTemplateByName(interaction.guildId, name);
  if (!tpl) {
    await safeEditReply(interaction, { content: `❌ Template \`${name}\` not found.` });
    return;
  }

  const guildConfig = getConfig(interaction.guildId);
  const existingOptions = merge ? (guildConfig?.welcome?.roleMenu?.options ?? []) : [];
  const newOptions = applyTemplateToOptions(tpl, existingOptions);

  await setConfigValue('welcome.roleMenu.enabled', true, interaction.guildId);
  await setConfigValue('welcome.roleMenu.options', newOptions, interaction.guildId);

  info('Role menu template applied', {
    guildId: interaction.guildId,
    template: tpl.name,
    optionCount: newOptions.length,
    merge,
    userId: interaction.user.id,
  });

  const builtinNote = tpl.is_builtin
    ? '\n\n> ⚠️ Built-in templates have no role IDs. Use the config editor to assign a **roleId** to each option before posting the role menu.'
    : '';

  await safeEditReply(interaction, {
    content: `✅ Applied template **${tpl.name}** to role menu config (${newOptions.length} option${newOptions.length !== 1 ? 's' : ''}).${merge ? ' Merged with existing options.' : ''}${builtinNote}\n\nRun \`/welcome setup\` to post the updated role menu.`,
  });
}

async function handleCreate(interaction) {
  const name = interaction.options.getString('name');
  const optionsRaw = interaction.options.getString('options');
  const description = interaction.options.getString('description') ?? '';
  const category = interaction.options.getString('category') ?? 'custom';

  const nameErr = validateTemplateName(name);
  if (nameErr) {
    await safeEditReply(interaction, { content: `❌ ${nameErr}` });
    return;
  }

  let parsedOptions;
  try {
    parsedOptions = JSON.parse(optionsRaw);
  } catch {
    await safeEditReply(interaction, {
      content:
        '❌ Options must be valid JSON. Example:\n```json\n[{"label":"Red","description":"Red role","roleId":"123456789"}]\n```',
    });
    return;
  }

  const optErr = validateTemplateOptions(parsedOptions);
  if (optErr) {
    await safeEditReply(interaction, { content: `❌ ${optErr}` });
    return;
  }

  try {
    const tpl = await createTemplate({
      guildId: interaction.guildId,
      name,
      description,
      category,
      options: parsedOptions,
    });
    await safeEditReply(interaction, {
      content: `✅ Template **${tpl.name}** created with ${parsedOptions.length} option(s). Use \`/rolemenu template apply ${tpl.name}\` to apply it.`,
    });
  } catch (err) {
    if (err.code === '23505') {
      await safeEditReply(interaction, {
        content: `❌ A template named **${name}** already exists for this guild.`,
      });
    } else {
      throw err;
    }
  }
}

async function handleDelete(interaction) {
  const name = interaction.options.getString('name');
  const deleted = await deleteTemplate(interaction.guildId, name);
  if (!deleted) {
    await safeEditReply(interaction, {
      content: `❌ Template \`${name}\` not found or is a built-in (built-ins cannot be deleted).`,
    });
    return;
  }
  await safeEditReply(interaction, { content: `✅ Template **${name}** deleted.` });
}

async function handleShare(interaction) {
  const name = interaction.options.getString('name');
  const enabled = interaction.options.getBoolean('enabled');
  const updated = await setTemplateShared(interaction.guildId, name, enabled);
  if (!updated) {
    await safeEditReply(interaction, {
      content: `❌ Template \`${name}\` not found or not owned by this guild.`,
    });
    return;
  }
  await safeEditReply(interaction, {
    content: `✅ Template **${name}** is now ${enabled ? '🌐 shared with all guilds' : '🔒 private to this guild'}.`,
  });
}

// ── Main execute ──────────────────────────────────────────────────────────────

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildConfig = getConfig(interaction.guildId);
  if (!hasModeratorPerms(interaction, guildConfig)) {
    await safeEditReply(interaction, {
      content: '❌ You need moderator or administrator permissions to use this command.',
    });
    return;
  }

  const sub = interaction.options.getSubcommand();

  switch (sub) {
    case 'list':
      await handleList(interaction);
      break;
    case 'info':
      await handleInfo(interaction);
      break;
    case 'apply':
      await handleApply(interaction);
      break;
    case 'create':
      await handleCreate(interaction);
      break;
    case 'delete':
      await handleDelete(interaction);
      break;
    case 'share':
      await handleShare(interaction);
      break;
    default:
      await safeEditReply(interaction, { content: '❓ Unknown subcommand.' });
  }
}
