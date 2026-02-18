export const SELECTED_GUILD_KEY = "bills-bot-selected-guild";
export const GUILD_SELECTED_EVENT = "bills-bot:guild-selected";

/**
 * Broadcast guild selection changes so dashboard views can react immediately.
 */
export function broadcastSelectedGuild(guildId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<string>(GUILD_SELECTED_EVENT, {
      detail: guildId,
    }),
  );
}
