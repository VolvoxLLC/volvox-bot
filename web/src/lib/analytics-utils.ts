export function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseLocalDateInput(dateInput: string): {
  year: number;
  monthIndex: number;
  day: number;
} | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day)) {
    return null;
  }

  return { year, monthIndex, day };
}

export function startOfDayIso(dateInput: string): string {
  const parsed = parseLocalDateInput(dateInput);
  if (!parsed) return `${dateInput}T00:00:00.000Z`;

  return new Date(
    parsed.year,
    parsed.monthIndex,
    parsed.day,
    0,
    0,
    0,
    0,
  ).toISOString();
}

export function endOfDayIso(dateInput: string): string {
  const parsed = parseLocalDateInput(dateInput);
  if (!parsed) return `${dateInput}T23:59:59.999Z`;

  return new Date(
    parsed.year,
    parsed.monthIndex,
    parsed.day,
    23,
    59,
    59,
    999,
  ).toISOString();
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value < 1 ? 4 : 2,
    maximumFractionDigits: value < 1 ? 4 : 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatLastUpdatedTime(value: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(value);
}
