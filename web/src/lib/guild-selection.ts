export const SELECTED_GUILD_KEY = "volvox-bot-selected-guild";
export const GUILD_SELECTED_EVENT = "volvox-bot:guild-selected";

/** One-time migration: move value from old key to the current key if present. */
(function migrateSelectedGuildKey() {
  if (typeof window === "undefined") return;
  const OLD_KEY = "bills-bot-selected-guild";
  try {
    const oldValue = window.localStorage.getItem(OLD_KEY);
    if (oldValue && !window.localStorage.getItem(SELECTED_GUILD_KEY)) {
      window.localStorage.setItem(SELECTED_GUILD_KEY, oldValue);
    }
    window.localStorage.removeItem(OLD_KEY);
  } catch {
    // localStorage may be unavailable
  }
})();

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
