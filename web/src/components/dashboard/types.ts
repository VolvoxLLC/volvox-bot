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

// --- Section validators extracted from validateBotHealth ---

function validateMemory(memory: unknown): string | null {
  if (!isObject(memory)) return 'missing memory';
  if (typeof memory.heapUsed !== 'number' || typeof memory.heapTotal !== 'number')
    return 'invalid memory fields';
  return null;
}

function validateDiscord(discord: unknown): string | null {
  if (!isObject(discord)) return 'missing discord';
  if (typeof discord.ping !== 'number' || typeof discord.guilds !== 'number')
    return 'invalid discord fields';
  return null;
}

function validateErrors(errors: unknown): string | null {
  if (!isObject(errors)) return 'missing errors';
  if (errors.lastHour !== null && typeof errors.lastHour !== 'number')
    return 'invalid errors.lastHour';
  if (errors.lastDay !== null && typeof errors.lastDay !== 'number')
    return 'invalid errors.lastDay';
  return null;
}

function validateSystem(system: unknown): string | null {
  if (!isObject(system)) return 'missing system';
  if (typeof system.nodeVersion !== 'string') return 'invalid system.nodeVersion';
  if (!isObject(system.cpuUsage)) return 'missing system.cpuUsage';
  if (typeof system.cpuUsage.user !== 'number' || typeof system.cpuUsage.system !== 'number')
    return 'invalid system.cpuUsage fields';
  return null;
}

function validateRestartEntry(item: unknown): string | null {
  if (!isObject(item)) return 'invalid restart entry';
  if (typeof item.timestamp !== 'string') return 'invalid restart.timestamp';
  if (typeof item.reason !== 'string') return 'invalid restart.reason';
  if (item.version !== null && typeof item.version !== 'string') return 'invalid restart.version';
  if (item.uptimeBefore !== null && typeof item.uptimeBefore !== 'number')
    return 'invalid restart.uptimeBefore';
  return null;
}

function validateRestarts(restarts: unknown): string | null {
  if (!Array.isArray(restarts)) return 'missing restarts';
  for (const item of restarts) {
    const result = validateRestartEntry(item);
    if (result !== null) return result;
  }
  return null;
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

  return (
    validateMemory(value.memory) ??
    validateDiscord(value.discord) ??
    validateErrors(value.errors) ??
    validateSystem(value.system) ??
    validateRestarts(value.restarts)
  );
}

/**
 * Type guard wrapping {@link validateBotHealth} for boolean checks.
 */
export function isBotHealth(value: unknown): value is BotHealth {
  return validateBotHealth(value) === null;
}
