/**
 * Natural Language Time Parser
 * Zero-dependency parser for relative time expressions.
 *
 * Supported formats:
 * - "in 5 minutes", "in 2 hours", "in 1 day", "in 3 weeks"
 * - "tomorrow", "tomorrow at 3pm"
 * - "next monday", "next friday at 9am"
 * - Shorthand: "5m", "2h", "1d", "30s"
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/137
 */

/** Millisecond multipliers for time units */
const UNIT_MS = {
  second: 1_000,
  seconds: 1_000,
  sec: 1_000,
  secs: 1_000,
  s: 1_000,
  minute: 60_000,
  minutes: 60_000,
  min: 60_000,
  mins: 60_000,
  m: 60_000,
  hour: 3_600_000,
  hours: 3_600_000,
  hr: 3_600_000,
  hrs: 3_600_000,
  h: 3_600_000,
  day: 86_400_000,
  days: 86_400_000,
  d: 86_400_000,
  week: 604_800_000,
  weeks: 604_800_000,
  w: 604_800_000,
};

/** Day name → JS getDay() index */
const DAY_NAMES = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

/**
 * Parse an "at <time>" suffix into hours/minutes.
 * Supports: "3pm", "3:30pm", "15:00", "9am", "9:45 am"
 *
 * @param {string} timeStr - Time portion (e.g. "3pm", "15:00", "9:30am")
 * @returns {{ hours: number, minutes: number } | null}
 */
function parseTimeOfDay(timeStr) {
  if (!timeStr) return null;
  const cleaned = timeStr.trim().toLowerCase();

  // 12-hour: "3pm", "3:30pm", "3:30 pm", "12am"
  const match12 = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (match12) {
    let hours = Number.parseInt(match12[1], 10);
    const minutes = match12[2] ? Number.parseInt(match12[2], 10) : 0;
    const period = match12[3];

    if (hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;

    if (period === 'am' && hours === 12) hours = 0;
    else if (period === 'pm' && hours !== 12) hours += 12;

    return { hours, minutes };
  }

  // 24-hour: "15:00", "09:30"
  const match24 = cleaned.match(/^(\d{1,2}):(\d{2})$/);
  if (match24) {
    const hours = Number.parseInt(match24[1], 10);
    const minutes = Number.parseInt(match24[2], 10);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
    return { hours, minutes };
  }

  return null;
}

/**
 * Set the time-of-day on a Date, or default to 9:00 AM if no time specified.
 *
 * @param {Date} date - Target date (mutated in place)
 * @param {{ hours: number, minutes: number } | null} time - Parsed time, or null for 9am default
 * @returns {Date} The mutated date
 */
function applyTimeOfDay(date, time) {
  if (time) {
    date.setHours(time.hours, time.minutes, 0, 0);
  } else {
    date.setHours(9, 0, 0, 0);
  }
  return date;
}

/**
 * Try to parse a shorthand time expression like "5m", "2h", "1d".
 * @param {string} trimmed - Lowercased trimmed input
 * @param {Date} ref - Reference date
 * @returns {{ date: Date, consumed: string } | null}
 */
function tryParseShorthand(trimmed, ref) {
  const match = trimmed.match(/^(\d+)\s*([smhdw])(?:\s|$)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  if (value <= 0) return null;
  const ms = value * UNIT_MS[match[2]];
  if (!Number.isFinite(ms)) return null;
  return { date: new Date(ref.getTime() + ms), consumed: match[0].trim() };
}

/**
 * Try to parse "in <N> <unit>" expressions like "in 5 minutes".
 * @param {string} trimmed - Lowercased trimmed input
 * @param {Date} ref - Reference date
 * @returns {{ date: Date, consumed: string } | null}
 */
function tryParseInDuration(trimmed, ref) {
  const match = trimmed.match(/^in\s+(\d+)\s+([a-z]+)(?:\s|$)/);
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  const ms = UNIT_MS[match[2]];
  if (!ms || value <= 0) return null;
  return { date: new Date(ref.getTime() + value * ms), consumed: match[0].trim() };
}

/**
 * Try to parse "tomorrow" or "tomorrow at <time>".
 * @param {string} trimmed - Lowercased trimmed input
 * @param {Date} ref - Reference date
 * @returns {{ date: Date, consumed: string } | null}
 */
function tryParseTomorrow(trimmed, ref) {
  const match = trimmed.match(/^tomorrow(?:\s+at\s+(.+?(?:\s+[ap]m)?))?(?:\s|$)/);
  if (!match) return null;
  const tomorrow = new Date(ref.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  applyTimeOfDay(tomorrow, match[1] ? parseTimeOfDay(match[1]) : null);
  return { date: tomorrow, consumed: match[0].trim() };
}

/**
 * Try to parse "next <day>" or "next <day> at <time>".
 * @param {string} trimmed - Lowercased trimmed input
 * @param {Date} ref - Reference date
 * @returns {{ date: Date, consumed: string } | null}
 */
function tryParseNextDay(trimmed, ref) {
  const match = trimmed.match(/^next\s+([a-z]+)(?:\s+at\s+(.+?(?:\s+[ap]m)?))?(?:\s|$)/);
  if (!match) return null;
  const targetDay = DAY_NAMES[match[1]];
  if (targetDay === undefined) return null;
  const result = new Date(ref.getTime());
  let daysAhead = targetDay - result.getDay();
  if (daysAhead <= 0) daysAhead += 7;
  result.setDate(result.getDate() + daysAhead);
  applyTimeOfDay(result, match[2] ? parseTimeOfDay(match[2]) : null);
  return { date: result, consumed: match[0].trim() };
}

/**
 * Parse a natural language time string into a Date.
 *
 * @param {string} input - Natural language time expression
 * @param {Date} [now] - Reference time (defaults to current time)
 * @returns {{ date: Date, consumed: string } | null} Parsed date and matched portion, or null
 */
export function parseTime(input, now) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  const ref = now ? new Date(now.getTime()) : new Date();

  return (
    tryParseShorthand(trimmed, ref) ??
    tryParseInDuration(trimmed, ref) ??
    tryParseTomorrow(trimmed, ref) ??
    tryParseNextDay(trimmed, ref) ??
    null
  );
}

/**
 * Parse a time expression from the beginning of a string and return both
 * the parsed date and the remaining message text.
 *
 * @param {string} input - Full input string (time expression + message)
 * @param {Date} [now] - Reference time
 * @returns {{ date: Date, message: string } | null}
 */
export function parseTimeAndMessage(input, now) {
  if (!input || typeof input !== 'string') return null;

  const trimmed = input.trim();
  const result = parseTime(trimmed, now);
  if (!result) return null;

  const message = trimmed.slice(result.consumed.length).trim();
  return { date: result.date, message };
}
