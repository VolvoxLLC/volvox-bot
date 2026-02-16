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

export interface MutualGuild extends DiscordGuild {
  botPresent: true;
}
