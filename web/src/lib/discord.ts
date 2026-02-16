const DISCORD_CDN = "https://cdn.discordapp.com";

/**
 * Minimal permissions the bot needs:
 * - Kick Members (1 << 1)
 * - Ban Members (1 << 2)
 * - View Channels (1 << 10)
 * - Send Messages (1 << 11)
 * - Manage Messages (1 << 13)
 * - Read Message History (1 << 16)
 * - Moderate Members (1 << 40)
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
    // Return a default icon based on guild name initial
    return `${DISCORD_CDN}/embed/avatars/0.png`;
  }
  const ext = iconHash.startsWith("a_") ? "gif" : "webp";
  return `${DISCORD_CDN}/icons/${guildId}/${iconHash}.${ext}?size=${size}`;
}

/**
 * Get the URL for a user's avatar from raw Discord user data.
 *
 * Public utility exported for use in future dashboard pages that display
 * other users' avatars (e.g. member lists, user profiles, mod log entries).
 * The header component uses `session.user.image` from NextAuth directly;
 * this helper is for cases where you have a raw userId + avatarHash.
 */
export function getUserAvatarUrl(
  userId: string,
  avatarHash: string | null,
  discriminator = "0",
  size = 128,
): string {
  if (!avatarHash) {
    let index = 0;
    try {
      index = discriminator === "0" ? Number(BigInt(userId) >> 22n) % 6 : Number(discriminator) % 5;
    } catch {
      // Invalid userId for BigInt conversion — fall back to default avatar
    }
    return `${DISCORD_CDN}/embed/avatars/${index}.png`;
  }
  const ext = avatarHash.startsWith("a_") ? "gif" : "webp";
  return `${DISCORD_CDN}/avatars/${userId}/${avatarHash}.${ext}?size=${size}`;
}
