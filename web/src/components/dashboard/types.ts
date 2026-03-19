/** Shape of a single restart record from the bot health endpoint. */
export interface RestartRecord {
  timestamp: string;
  reason: string;
  version: string | null;
  uptimeBefore: number | null; // seconds
}

/** Shape of the bot health payload from GET /api/v1/health. */
export interface BotHealth {
  uptime: number; // seconds
  memory: {
    heapUsed: number; // bytes
    heapTotal: number; // bytes
    rss?: number; // bytes
  };
  discord: {
    ping: number; // ms
    guilds: number;
  };
  errors: {
    lastHour: number | null;
    lastDay: number | null;
  };
  system: {
    cpuUsage: {
      user: number; // microseconds
      system: number; // microseconds
    };
    nodeVersion: string;
  };
  restarts: RestartRecord[];
}

/** Type-guard helper: checks whether a value is a non-null object. */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validate that `value` conforms to the {@link BotHealth} shape.
 *
 * Returns `null` when valid, or a diagnostic string describing the first
 * field that failed validation so the caller can surface it in the UI.
 *
 * The bot API returns a minimal payload when the request is unauthenticated
 * (only `status` + `uptime`), which will fail here with a clear reason.
 */
export function validateBotHealth(value: unknown): string | null {
  if (!isObject(value)) return 'payload is not an object';

  if (typeof value.uptime !== 'number') return 'missing uptime';

  if (!isObject(value.memory)) return 'missing memory';
  if (typeof value.memory.heapUsed !== 'number' || typeof value.memory.heapTotal !== 'number')
    return 'invalid memory fields';

  if (!isObject(value.discord)) return 'missing discord';
  if (typeof value.discord.ping !== 'number' || typeof value.discord.guilds !== 'number')
    return 'invalid discord fields';

  if (!isObject(value.errors)) return 'missing errors';
  if (value.errors.lastHour !== null && typeof value.errors.lastHour !== 'number')
    return 'invalid errors.lastHour';
  if (value.errors.lastDay !== null && typeof value.errors.lastDay !== 'number')
    return 'invalid errors.lastDay';

  if (!isObject(value.system)) return 'missing system';
  if (typeof value.system.nodeVersion !== 'string') return 'invalid system.nodeVersion';
  if (!isObject(value.system.cpuUsage)) return 'missing system.cpuUsage';
  if (typeof value.system.cpuUsage.user !== 'number' || typeof value.system.cpuUsage.system !== 'number')
    return 'invalid system.cpuUsage fields';

  if (!Array.isArray(value.restarts)) return 'missing restarts';
  for (const item of value.restarts) {
    if (!isObject(item)) return 'invalid restart entry';
    if (typeof item.timestamp !== 'string') return 'invalid restart.timestamp';
    if (typeof item.reason !== 'string') return 'invalid restart.reason';
    if (item.version !== null && typeof item.version !== 'string') return 'invalid restart.version';
    if (item.uptimeBefore !== null && typeof item.uptimeBefore !== 'number')
      return 'invalid restart.uptimeBefore';
  }

  return null;
}

/**
 * Type guard wrapping {@link validateBotHealth} for boolean checks.
 */
export function isBotHealth(value: unknown): value is BotHealth {
  return validateBotHealth(value) === null;
}
