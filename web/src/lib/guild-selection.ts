export const SELECTED_GUILD_KEY = "bills-bot-selected-guild";
export const GUILD_SELECTED_EVENT = "bills-bot:guild-selected";

/**
 * Persist and broadcast guild selection changes so dashboard views can react immediately.
 *
 * This helper writes to localStorage before dispatching the in-tab custom event.
 */
export function broadcastSelectedGuild(guildId: string): void {
  if (typeof window === "undefined") return;

  const normalizedGuildId = guildId.trim();
  if (!normalizedGuildId) return;

  try {
    window.localStorage.setItem(SELECTED_GUILD_KEY, normalizedGuildId);
  } catch {
    // localStorage may be unavailable in strict browser contexts
  }

  window.dispatchEvent(
    new CustomEvent<string>(GUILD_SELECTED_EVENT, {
      detail: normalizedGuildId,
    }),
  );
}
