/**
 * Cron expression parsing utilities.
 * Extracted from scheduler.js to break the circular dependency between
 * scheduler.js and reminderHandler.js.
 *
 * @see https://github.com/VolvoxLLC/volvox-bot/issues/137
 */

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
    const field = fields[i];
    const { min, max } = ranges[i];

    if (field === '*') {
      const arr = [];
      for (let v = min; v <= max; v++) arr.push(v);
      result[names[i]] = arr;
    } else if (field.includes(',')) {
      result[names[i]] = field.split(',').map((v) => {
        const n = Number.parseInt(v, 10);
        if (Number.isNaN(n) || n < min || n > max) {
          throw new Error(`Invalid cron value "${v}" for ${names[i]}`);
        }
        return n;
      });
    } else if (field.includes('-')) {
      const [start, end] = field.split('-').map((v) => Number.parseInt(v, 10));
      if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max || start > end) {
        throw new Error(`Invalid cron range "${field}" for ${names[i]}`);
      }
      const arr = [];
      for (let v = start; v <= end; v++) arr.push(v);
      result[names[i]] = arr;
    } else if (field.includes('/')) {
      const [base, step] = field.split('/');
      const stepNum = Number.parseInt(step, 10);
      const startNum = base === '*' ? min : Number.parseInt(base, 10);
      if (Number.isNaN(stepNum) || stepNum <= 0 || Number.isNaN(startNum)) {
        throw new Error(`Invalid cron step "${field}" for ${names[i]}`);
      }
      const arr = [];
      for (let v = startNum; v <= max; v += stepNum) arr.push(v);
      result[names[i]] = arr;
    } else {
      const n = Number.parseInt(field, 10);
      if (Number.isNaN(n) || n < min || n > max) {
        throw new Error(`Invalid cron value "${field}" for ${names[i]}`);
      }
      result[names[i]] = [n];
    }
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
  const d = new Date(fromDate.getTime());
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);

  // Safety: limit search to 2 years to prevent infinite loops
  const limit = new Date(fromDate.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);

  while (d < limit) {
    if (
      cron.month.includes(d.getMonth() + 1) &&
      cron.day.includes(d.getDate()) &&
      cron.weekday.includes(d.getDay()) &&
      cron.hour.includes(d.getHours()) &&
      cron.minute.includes(d.getMinutes())
    ) {
      return d;
    }

    // Advance by 1 minute
    d.setMinutes(d.getMinutes() + 1);
  }

  throw new Error(`No matching cron time found within 2 years for: ${cronExpr}`);
}
