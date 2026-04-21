const DISCORD_CDN = 'https://cdn.discordapp.com';

/**
 * Minimal permissions the bot needs:
 * - Kick Members      (1 << 1)  =            2
 * - Ban Members       (1 << 2)  =            4
 * - View Channels     (1 << 10) =        1,024
 * - Send Messages     (1 << 11) =        2,048
 * - Manage Messages   (1 << 13) =        8,192
 * - Read Msg History  (1 << 16) =       65,536
 * - Moderate Members  (1 << 40) = 1,099,511,627,776
 *                          Total = 1,099,511,704,582
 *
 * Verified: (1n<<1n)|(1n<<2n)|(1n<<10n)|(1n<<11n)|(1n<<13n)|(1n<<16n)|(1n<<40n) === 1099511704582n
 */
const BOT_PERMISSIONS = '1099511704582';

/**
 * Build the bot OAuth2 invite URL, optionally pre-selecting a guild,
 * or return null when NEXT_PUBLIC_DISCORD_CLIENT_ID is not configured.
 */
export function getBotInviteUrl(guildId?: string): string | null {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  if (!clientId) return null;

  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('permissions', BOT_PERMISSIONS);
  url.searchParams.set('scope', 'bot applications.commands');

  if (guildId) {
    url.searchParams.set('guild_id', guildId);
    url.searchParams.set('disable_guild_select', 'true');
  }

  return url.toString();
}

/**
 * Get the URL for a guild's icon, or null if the guild has no custom icon.
 * Discord doesn't provide default guild icons via CDN — callers should
 * show the guild's initials or a placeholder icon when this returns null.
 */
export function getGuildIconUrl(
  guildId: string,
  iconHash: string | null,
  size = 128,
): string | null {
  if (!iconHash) return null;
  const ext = iconHash.startsWith('a_') ? 'gif' : 'webp';
  return `${DISCORD_CDN}/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}
