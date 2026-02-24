import { create } from "zustand";
import type { DiscordChannel, DiscordRole } from "@/types/discord";

interface GuildEntities {
  channels: DiscordChannel[];
  roles: DiscordRole[];
}

interface DiscordEntityState {
  /** Per-guild cached entity data. */
  guilds: Record<string, GuildEntities>;
  /** Guild IDs currently being fetched (channels). */
  loadingChannels: Record<string, boolean>;
  /** Guild IDs currently being fetched (roles). */
  loadingRoles: Record<string, boolean>;

  fetchChannels: (guildId: string) => Promise<void>;
  fetchRoles: (guildId: string) => Promise<void>;
}

export const useDiscordEntityStore = create<DiscordEntityState>((set, get) => ({
  guilds: {},
  loadingChannels: {},
  loadingRoles: {},

  fetchChannels: async (guildId: string) => {
    const state = get();
    // Skip if already loaded or currently loading
    if (state.guilds[guildId]?.channels.length || state.loadingChannels[guildId]) {
      return;
    }

    set((s) => ({ loadingChannels: { ...s.loadingChannels, [guildId]: true } }));

    try {
      const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/channels`);
      if (!res.ok) return;
      const channels: DiscordChannel[] = await res.json();

      set((s) => ({
        guilds: {
          ...s.guilds,
          [guildId]: { ...s.guilds[guildId], channels, roles: s.guilds[guildId]?.roles ?? [] },
        },
      }));
    } finally {
      set((s) => ({ loadingChannels: { ...s.loadingChannels, [guildId]: false } }));
    }
  },

  fetchRoles: async (guildId: string) => {
    const state = get();
    if (state.guilds[guildId]?.roles.length || state.loadingRoles[guildId]) {
      return;
    }

    set((s) => ({ loadingRoles: { ...s.loadingRoles, [guildId]: true } }));

    try {
      const res = await fetch(`/api/guilds/${encodeURIComponent(guildId)}/roles`);
      if (!res.ok) return;
      const roles: DiscordRole[] = await res.json();

      set((s) => ({
        guilds: {
          ...s.guilds,
          [guildId]: { ...s.guilds[guildId], roles, channels: s.guilds[guildId]?.channels ?? [] },
        },
      }));
    } finally {
      set((s) => ({ loadingRoles: { ...s.loadingRoles, [guildId]: false } }));
    }
  },
}));
