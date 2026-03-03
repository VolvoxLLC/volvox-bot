export interface DiscordGuild {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

export interface BotGuild {
  id: string;
  name: string;
  icon: string | null;
}

/** Dashboard role for the current user in this guild (from Discord permissions or backend). */
export type GuildAccessRole = 'viewer' | 'moderator' | 'admin' | 'owner';

export interface MutualGuild extends DiscordGuild {
  botPresent: boolean;
  /** Current user's dashboard role in this guild. Set when guild list is built. */
  access?: GuildAccessRole;
}

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
