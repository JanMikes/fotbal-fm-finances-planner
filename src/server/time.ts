/**
 * Explicit Europe/Prague calendar logic for the server (the club's timezone), independent of the process TZ.
 * (The image also sets TZ=Europe/Prague, but nothing here relies on it.)
 */
export const APP_TIME_ZONE = "Europe/Prague";

const fmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface WallClock {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** Prague wall-clock fields of an instant. */
export function pragueParts(now: Date = new Date()): WallClock {
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

/**
 * A Date whose LOCAL fields (getFullYear/getMonth/getDate/…) equal the Prague wall clock, whatever the process TZ.
 * For handing "now" to shared calendar helpers (src/lib/*) that read local fields.
 */
export function pragueNow(now: Date = new Date()): Date {
  const p = pragueParts(now);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

/** Current month (Europe/Prague) as "YYYY-MM-01". */
export function currentMonthStart(now: Date = new Date()): string {
  const p = pragueParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-01`;
}
