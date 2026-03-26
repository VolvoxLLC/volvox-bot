/**
 * Cron expression parsing utilities.
 * Extracted from scheduler.js to break the circular dependency between
 * scheduler.js and reminderHandler.js.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/137
 */

/**
 * Generate an inclusive integer range.
 * @param {number} min
 * @param {number} max
 * @returns {number[]}
 */
function rangeArray(min, max) {
  const arr = [];
  for (let value = min; value <= max; value++) arr.push(value);
  return arr;
}

/**
 * Parse a wildcard field (*) into all values in [min, max].
 */
function parseWildcard(min, max) {
  return rangeArray(min, max);
}

/**
 * Parse a comma-separated list of values (e.g. "1,5,10").
 */
function parseCommaList(field, name, min, max) {
  return field.split(',').map((fieldValue) => {
    const parsedValue = Number.parseInt(fieldValue, 10);
    if (Number.isNaN(parsedValue) || parsedValue < min || parsedValue > max) {
      throw new Error(`Invalid cron value "${fieldValue}" for ${name}`);
    }
    return parsedValue;
  });
}

/**
 * Parse a range field (e.g. "1-5").
 */
function parseRange(field, name, min, max) {
  const [start, end] = field.split('-').map((fieldValue) => Number.parseInt(fieldValue, 10));
  if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max || start > end) {
    throw new Error(`Invalid cron range "${field}" for ${name}`);
  }
  return rangeArray(start, end);
}

/**
 * Parse a step field like "2/3" or a wildcard step.
 */
function parseStep(field, name, min, max) {
  const [base, step] = field.split('/');
  const stepNum = Number.parseInt(step, 10);
  const startNum = base === '*' ? min : Number.parseInt(base, 10);
  if (Number.isNaN(stepNum) || stepNum <= 0 || Number.isNaN(startNum)) {
    throw new Error(`Invalid cron step "${field}" for ${name}`);
  }
  const arr = [];
  for (let value = startNum; value <= max; value += stepNum) arr.push(value);
  return arr;
}

/**
 * Parse a single numeric value (e.g. "5").
 */
function parseSingleValue(field, name, min, max) {
  const parsedValue = Number.parseInt(field, 10);
  if (Number.isNaN(parsedValue) || parsedValue < min || parsedValue > max) {
    throw new Error(`Invalid cron value "${field}" for ${name}`);
  }
  return [parsedValue];
}

/**
 * Parse a single cron field into an array of matching integer values.
 *
 * @param {string} field - Raw cron field string
 * @param {string} name - Human-readable field name for error messages
 * @param {number} min - Minimum valid value
 * @param {number} max - Maximum valid value
 * @returns {number[]}
 */
function parseCronField(field, name, min, max) {
  if (field === '*') return parseWildcard(min, max);
  if (field.includes(',')) return parseCommaList(field, name, min, max);
  if (field.includes('-')) return parseRange(field, name, min, max);
  if (field.includes('/')) return parseStep(field, name, min, max);
  return parseSingleValue(field, name, min, max);
}

/**
 * Parse a 5-field cron expression into its component arrays.
 * Supports: numbers, wildcards (*), and single values.
 *
 * @param {string} cronExpr - 5-field cron expression (minute hour day month weekday)
 * @returns {{ minute: number[], hour: number[], day: number[], month: number[], weekday: number[] }}
 */
export function parseCron(cronExpr) {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  const ranges = [
    { min: 0, max: 59 }, // minute
    { min: 0, max: 23 }, // hour
    { min: 1, max: 31 }, // day of month
    { min: 1, max: 12 }, // month
    { min: 0, max: 6 }, // day of week (0 = Sunday)
  ];

  const names = ['minute', 'hour', 'day', 'month', 'weekday'];
  const result = {};

  for (let i = 0; i < 5; i++) {
    result[names[i]] = parseCronField(fields[i], names[i], ranges[i].min, ranges[i].max);
  }

  return result;
}

/**
 * Compute the next run time from a cron expression after a given date.
 *
 * @param {string} cronExpr - 5-field cron expression
 * @param {Date} fromDate - Starting date to search from
 * @returns {Date} Next matching date/time
 */
export function getNextCronRun(cronExpr, fromDate) {
  const cron = parseCron(cronExpr);

  // Start from the next minute after fromDate
  const candidateDate = new Date(fromDate.getTime());
  candidateDate.setSeconds(0, 0);
  candidateDate.setMinutes(candidateDate.getMinutes() + 1);

  // Safety: limit search to 2 years to prevent infinite loops
  const limit = new Date(fromDate.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

  while (candidateDate < limit) {
    if (
      cron.month.includes(candidateDate.getMonth() + 1) &&
      cron.day.includes(candidateDate.getDate()) &&
      cron.weekday.includes(candidateDate.getDay()) &&
      cron.hour.includes(candidateDate.getHours()) &&
      cron.minute.includes(candidateDate.getMinutes())
    ) {
      return candidateDate;
    }

    // Advance by 1 minute
    candidateDate.setMinutes(candidateDate.getMinutes() + 1);
  }

  throw new Error(`No matching cron time found within 2 years for: ${cronExpr}`);
}
