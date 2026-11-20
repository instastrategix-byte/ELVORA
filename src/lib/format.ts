const ZERO_DECIMAL = new Set(["JPY", "KRW", "VND", "CLP", "ISK"]);

export function formatMoney(amountMinor: number, currency: string): string {
  const divisor = ZERO_DECIMAL.has(currency) ? 1 : 100;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: divisor === 1 ? 0 : 2,
    minimumFractionDigits: 0,
  }).format(amountMinor / divisor);
}

export function toMinorUnits(amount: number, currency: string): number {
  return Math.round(amount * (ZERO_DECIMAL.has(currency) ? 1 : 100));
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * "20 Nov 2026". Calendar dates ("2026-11-20") are timezone-free and always shown as written —
 * formatting them as local midnight UTC would show the previous day west of Greenwich.
 * Timestamps use `timeZone` (default: the runtime's zone — use <LocalTime> in UI so the server
 * and browser agree).
 */
export function formatDate(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric", timeZone: DATE_ONLY.test(iso) ? "UTC" : timeZone }).format(
    new Date(DATE_ONLY.test(iso) ? `${iso}T00:00:00Z` : iso),
  );
}

export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat("en", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(iso));
}

/** "YYYY-MM-DD" for the calendar date of `d` in the runtime's own time zone. */
export function localDateIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function isDateOnly(value: string): boolean {
  return DATE_ONLY.test(value);
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000],
  ["month", 2_592_000],
  ["week", 604_800],
  ["day", 86_400],
  ["hour", 3_600],
  ["minute", 60],
];

export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function titleCase(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
