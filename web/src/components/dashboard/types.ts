/** Shape of a single restart record from the bot health endpoint. */
export interface RestartRecord {
  timestamp: string;
  reason: string;
  version: string;
  uptimeBefore: number; // seconds
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
    lastHour: number;
    lastDay: number;
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

export function isBotHealth(value: unknown): value is BotHealth {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v.uptime !== "number") return false;

  const mem = v.memory;
  if (typeof mem !== "object" || mem === null) return false;
  const m = mem as Record<string, unknown>;
  if (typeof m.heapUsed !== "number" || typeof m.heapTotal !== "number") return false;

  const discord = v.discord;
  if (typeof discord !== "object" || discord === null) return false;
  const d = discord as Record<string, unknown>;
  if (typeof d.ping !== "number" || typeof d.guilds !== "number") return false;

  const errors = v.errors;
  if (typeof errors !== "object" || errors === null) return false;
  const e = errors as Record<string, unknown>;
  if (typeof e.lastHour !== "number" || typeof e.lastDay !== "number") return false;

  const system = v.system;
  if (typeof system !== "object" || system === null) return false;
  const s = system as Record<string, unknown>;
  if (typeof s.nodeVersion !== "string") return false;
  const cpu = s.cpuUsage;
  if (typeof cpu !== "object" || cpu === null) return false;
  const c = cpu as Record<string, unknown>;
  if (typeof c.user !== "number" || typeof c.system !== "number") return false;

  if (!Array.isArray(v.restarts)) return false;
  for (const item of v.restarts) {
    if (typeof item !== "object" || item === null) return false;
    const r = item as Record<string, unknown>;
    if (typeof r.timestamp !== "string") return false;
    if (typeof r.reason !== "string") return false;
    if (typeof r.version !== "string") return false;
    if (typeof r.uptimeBefore !== "number") return false;
  }

  return true;
}
