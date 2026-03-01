/**
 * Zustand store for caching Discord entities (channels and roles) per guild.
 * Reduces redundant API calls when reopening selectors and shares data across instances.
 */
import { create } from 'zustand';

export interface DiscordChannel {
  id: string;
  name: string;
  type: number;
}

export interface DiscordRole {
  id: string;
  name: string;
  color: number;
}

interface DiscordEntitiesState {
  // Channels cache: guildId -> channels
  channelsByGuild: Record<string, DiscordChannel[]>;
  // Roles cache: guildId -> roles
  rolesByGuild: Record<string, DiscordRole[]>;

  // Get cached channels for a guild
  getChannels: (guildId: string) => DiscordChannel[] | undefined;
  // Set channels for a guild
  setChannels: (guildId: string, channels: DiscordChannel[]) => void;
  // Clear channels for a guild (optional invalidation)
  clearChannels: (guildId: string) => void;

  // Get cached roles for a guild
  getRoles: (guildId: string) => DiscordRole[] | undefined;
  // Set roles for a guild
  setRoles: (guildId: string, roles: DiscordRole[]) => void;
  // Clear roles for a guild (optional invalidation)
  clearRoles: (guildId: string) => void;
}

export const useDiscordEntitiesStore = create<DiscordEntitiesState>((set, get) => ({
  channelsByGuild: {},
  rolesByGuild: {},

  getChannels: (guildId: string) => get().channelsByGuild[guildId],

  setChannels: (guildId: string, channels: DiscordChannel[]) =>
    set((state) => ({
      channelsByGuild: { ...state.channelsByGuild, [guildId]: channels },
    })),

  clearChannels: (guildId: string) =>
    set((state) => {
      const { [guildId]: _, ...rest } = state.channelsByGuild;
      return { channelsByGuild: rest };
    }),

  getRoles: (guildId: string) => get().rolesByGuild[guildId],

  setRoles: (guildId: string, roles: DiscordRole[]) =>
    set((state) => ({
      rolesByGuild: { ...state.rolesByGuild, [guildId]: roles },
    })),

  clearRoles: (guildId: string) =>
    set((state) => {
      const { [guildId]: _, ...rest } = state.rolesByGuild;
      return { rolesByGuild: rest };
    }),
}));
