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
      for (let value = min; value <= max; value++) arr.push(value);
      result[names[i]] = arr;
    } else if (field.includes(',')) {
      result[names[i]] = field.split(',').map((fieldValue) => {
        const parsedValue = Number.parseInt(fieldValue, 10);
        if (Number.isNaN(parsedValue) || parsedValue < min || parsedValue > max) {
          throw new Error(`Invalid cron value "${fieldValue}" for ${names[i]}`);
        }
        return parsedValue;
      });
    } else if (field.includes('-')) {
      const [start, end] = field.split('-').map((fieldValue) => Number.parseInt(fieldValue, 10));
      if (Number.isNaN(start) || Number.isNaN(end) || start < min || end > max || start > end) {
        throw new Error(`Invalid cron range "${field}" for ${names[i]}`);
      }
      const arr = [];
      for (let value = start; value <= end; value++) arr.push(value);
      result[names[i]] = arr;
    } else if (field.includes('/')) {
      const [base, step] = field.split('/');
      const stepNum = Number.parseInt(step, 10);
      const startNum = base === '*' ? min : Number.parseInt(base, 10);
      if (Number.isNaN(stepNum) || stepNum <= 0 || Number.isNaN(startNum)) {
        throw new Error(`Invalid cron step "${field}" for ${names[i]}`);
      }
      const arr = [];
      for (let value = startNum; value <= max; value += stepNum) arr.push(value);
      result[names[i]] = arr;
    } else {
      const parsedValue = Number.parseInt(field, 10);
      if (Number.isNaN(parsedValue) || parsedValue < min || parsedValue > max) {
        throw new Error(`Invalid cron value "${field}" for ${names[i]}`);
      }
      result[names[i]] = [parsedValue];
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
