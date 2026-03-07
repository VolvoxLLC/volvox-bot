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

/** Dashboard role for this guild (viewer, moderator, admin, owner). Set by GET /api/guilds. */
export type GuildAccessRole = 'viewer' | 'moderator' | 'admin' | 'owner';

export interface MutualGuild extends DiscordGuild {
  botPresent: boolean;
  /** User's dashboard role in this guild; present when loaded from GET /api/guilds */
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
