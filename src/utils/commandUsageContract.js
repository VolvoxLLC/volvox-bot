export const COMMAND_USAGE_TABLE = 'command_usage';
export const COMMAND_USAGE_DEFAULT_LIMIT = 15;
export const COMMAND_USAGE_MAX_LIMIT = 100;

export const COMMAND_USAGE_COLUMNS = Object.freeze({
  guildId: 'guild_id',
  userId: 'user_id',
  commandName: 'command_name',
  channelId: 'channel_id',
  usedAt: 'used_at',
});

export const COMMAND_USAGE_INDEXES = Object.freeze([
  'idx_command_usage_guild_time',
  'idx_command_usage_command',
  'idx_command_usage_user',
  'idx_command_usage_guild_channel_used_at',
]);
