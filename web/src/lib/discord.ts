const DISCORD_CDN = "https://cdn.discordapp.com";

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
const BOT_PERMISSIONS = "1099511704582";

/**
 * Build the bot OAuth2 invite URL, or return null when
 * NEXT_PUBLIC_DISCORD_CLIENT_ID is not configured.
 */
export function getBotInviteUrl(): string | null {
  const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
  if (!clientId) return null;
  return `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&scope=bot%20applications.commands`;
}

/**
 * Get the URL for a guild's icon.
 */
export function getGuildIconUrl(
  guildId: string,
  iconHash: string | null,
  size = 128,
): string {
  if (!iconHash) {
    // Return a default avatar derived from the guild ID for visual distinction.
    // Discord has 5 default avatar indices (0–4).
    let index = 0;
    try {
      index = Number(BigInt(guildId) % 5n);
    } catch {
      // Invalid guildId — fall back to default avatar 0
    }
    return `${DISCORD_CDN}/embed/avatars/${index}.png`;
  }
  const ext = iconHash.startsWith("a_") ? "gif" : "webp";
  return `${DISCORD_CDN}/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}
