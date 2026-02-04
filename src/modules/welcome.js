/**
 * Welcome Module
 * Handles welcome messages for new members
 */

/**
 * Render welcome message with placeholder replacements
 * @param {string} messageTemplate - Welcome message template
 * @param {Object} member - Member object with id and optional username
 * @param {Object} guild - Guild object with name and memberCount
 * @returns {string} Rendered welcome message
 */
export function renderWelcomeMessage(messageTemplate, member, guild) {
  return messageTemplate
    .replace(/{user}/g, `<@${member.id}>`)
    .replace(/{username}/g, member.username || 'Unknown')
    .replace(/{server}/g, guild.name)
    .replace(/{memberCount}/g, guild.memberCount.toString());
}

/**
 * Send welcome message to new member
 * @param {Object} member - Discord guild member
 * @param {Object} client - Discord client
 * @param {Object} config - Bot configuration
 */
export async function sendWelcomeMessage(member, client, config) {
  if (!config.welcome?.enabled || !config.welcome?.channelId) return;

  try {
    const channel = await client.channels.fetch(config.welcome.channelId);
    if (!channel) return;

    const messageTemplate = config.welcome.message || 'Welcome, {user}!';
    const message = renderWelcomeMessage(
      messageTemplate,
      { id: member.id, username: member.user.username },
      { name: member.guild.name, memberCount: member.guild.memberCount }
    );

    await channel.send(message);
    console.log(`[WELCOME] ${member.user.tag} joined ${member.guild.name}`);
  } catch (err) {
    console.error('Welcome error:', err.message);
  }
}
