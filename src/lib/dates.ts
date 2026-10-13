/**
 * Czech date helpers: parsing typed dates/months, formatting (absolute, relative, long), calendar grids.
 * Pure and locale-independent (no Intl / toLocale* — output is identical in an English browser); all calendar
 * math works on local calendar components, so DST transitions never shift a day.
 */

/** "YYYY-MM-DD" */
export type IsoDate = string;
/** "YYYY-MM" */
export type IsoMonth = string;

/** Non-breaking space: joins date parts and the thousands groups / units of amounts (`format.ts` re-exports it). */
export const NBSP = "\u00a0";

/** Nominative month names, lowercase ("leden" … "prosinec"). */
export const CS_MONTHS: readonly string[] = [
  "leden",
  "únor",
  "březen",
  "duben",
  "květen",
  "červen",
  "červenec",
  "srpen",
  "září",
  "říjen",
  "listopad",
  "prosinec",
];

/** Genitive month names ("3. listopadu"). */
export const CS_MONTHS_GENITIVE: readonly string[] = [
  "ledna",
  "února",
  "března",
  "dubna",
  "května",
  "června",
  "července",
  "srpna",
  "září",
  "října",
  "listopadu",
  "prosince",
];

/** Weekday names, Monday first. */
export const CS_WEEKDAYS: readonly string[] = ["pondělí", "úterý", "středa", "čtvrtek", "pátek", "sobota", "neděle"];

/** Short weekday names, Monday first. */
export const CS_WEEKDAYS_SHORT: readonly string[] = ["po", "út", "st", "čt", "pá", "so", "ne"];

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Monday-first weekday index 0–6 of a Date. */
const weekdayIdx = (d: Date) => (d.getDay() + 6) % 7;

/** Lowercase without diacritics (typeahead, search). */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Lowercase without diacritics, single spaces, trimmed (parsing). */
function foldText(s: string): string {
  return fold(s)
    .replace(/[\s  ]+/g, " ")
    .trim();
}

export function capitalize(s: string): string {
  return s ? s[0].toLocaleUpperCase("cs") + s.slice(1) : s;
}

/** Parse "YYYY-MM-DD" as a LOCAL date (midnight); other strings (ISO instants) go through `new Date`. */
export function parseIsoDate(iso: string): Date {
  return new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
}

/** Local calendar date → "YYYY-MM-DD". */
export function toIsoDate(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function toDate(d: string | number | Date): Date {
  return typeof d === "string" ? parseIsoDate(d) : new Date(d);
}

function daysInMonth(y: number, m1: number): number {
  return new Date(y, m1, 0).getDate();
}

/** Builds an ISO date from parts; null when the date does not exist (31. 2.). */
function makeIso(y: number, m1: number, d: number): IsoDate | null {
  if (!Number.isInteger(y) || !Number.isInteger(m1) || !Number.isInteger(d)) return null;
  if (y < 1900 || y > 2200 || m1 < 1 || m1 > 12 || d < 1 || d > daysInMonth(y, m1)) return null;
  return `${y}-${pad2(m1)}-${pad2(d)}`;
}

export function isValidIsoDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && makeIso(+m[1], +m[2], +m[3]) === s;
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const d = parseIsoDate(iso);
  return toIsoDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function addMonths(ym: IsoMonth, n: number): IsoMonth {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad2((((t % 12) + 12) % 12) + 1)}`;
}

/** Adds months to a date, clamping the day (31. 1. + 1 month → 28./29. 2.). */
export function addMonthsToDate(iso: IsoDate, n: number): IsoDate {
  const ym = addMonths(iso.slice(0, 7), n);
  const [y, m] = ym.split("-").map(Number);
  return makeIso(y, m, Math.min(Number(iso.slice(8, 10)), daysInMonth(y, m)))!;
}

/** Whole calendar days from `now` to `d` (negative = past). DST-safe (compares calendar dates, not ms). */
export function diffDays(d: IsoDate | Date, now: Date = new Date()): number {
  const a = typeof d === "string" ? parseIsoDate(d) : d;
  return Math.round(
    (Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5,
  );
}

/** `13. 10. 2026` (NBSP-joined, never wraps) — accepts "YYYY-MM-DD", an ISO instant, a Date or epoch ms. */
export function formatDate(d: string | number | Date): string {
  const x = toDate(d);
  return `${x.getDate()}.${NBSP}${x.getMonth() + 1}.${NBSP}${x.getFullYear()}`;
}

/** `13. 10.` (NBSP-joined) */
export function formatDayMonth(d: string | Date): string {
  const x = toDate(d);
  return `${x.getDate()}.${NBSP}${x.getMonth() + 1}.`;
}

/** `13. 10.` in the current year, `15. 1. 2027` otherwise. */
export function formatDateShort(d: string | Date, now: Date = new Date()): string {
  const x = toDate(d);
  return x.getFullYear() === now.getFullYear() ? formatDayMonth(x) : formatDate(x);
}

/** Text shown inside a date field: `3. 11. 2026`, with `weekday` `út 3. 11. 2026` (plain spaces). */
export function formatDateInput(iso: IsoDate, o: { weekday?: boolean } = {}): string {
  if (!iso) return "";
  const x = parseIsoDate(iso);
  const s = `${x.getDate()}. ${x.getMonth() + 1}. ${x.getFullYear()}`;
  return o.weekday ? `${CS_WEEKDAYS_SHORT[weekdayIdx(x)]} ${s}` : s;
}

/** `úterý 3. listopadu 2026` */
export function formatDateLong(iso: IsoDate): string {
  const x = parseIsoDate(iso);
  return `${CS_WEEKDAYS[weekdayIdx(x)]} ${x.getDate()}. ${CS_MONTHS_GENITIVE[x.getMonth()]} ${x.getFullYear()}`;
}

/** Czech plural: 1 → one, 2–4 → few, otherwise (0, 5+, fractions) → many. */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (Number.isInteger(a) && a >= 2 && a <= 4) return few;
  return many;
}

/** dnes | zítra | včera | za 3 dny | za 5 dní | před 2 dny | před 5 dny */
export function formatRelativeDay(d: string | Date, now: Date = new Date()): string {
  const n = diffDays(typeof d === "string" ? toIsoDate(toDate(d)) : d, now);
  if (n === 0) return "dnes";
  if (n === 1) return "zítra";
  if (n === -1) return "včera";
  if (n > 0) return `za ${n} ${plural(n, "den", "dny", "dní")}`;
  return `před ${-n} dny`;
}

/** `13. 10. 2026 (dnes)`; the relative suffix only within ±6 days. */
export function formatDateWithRelative(d: string | Date, now: Date = new Date()): string {
  const x = toDate(d);
  const n = diffDays(x, now);
  return formatDate(x) + (Math.abs(n) <= 6 ? ` (${formatRelativeDay(x, now)})` : "");
}

/** `Říjen 2026` from "2026-10". */
export function formatMonth(ym: IsoMonth): string {
  const [y, m] = ym.split("-");
  return capitalize(CS_MONTHS[Number(m) - 1] ?? "") + " " + y;
}

/** 6 weeks × 7 days (Monday first) covering the month, incl. leading/trailing days of the adjacent months. */
export function monthGrid(ym: IsoMonth): IsoDate[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const start = new Date(y, m - 1, 1 - weekdayIdx(first));
  const weeks: IsoDate[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: IsoDate[] = [];
    for (let i = 0; i < 7; i++) row.push(toIsoDate(new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + i)));
    weeks.push(row);
  }
  return weeks;
}

/** Monday of the week containing `iso`. */
export function weekStart(iso: IsoDate): IsoDate {
  return addDays(iso, -weekdayIdx(parseIsoDate(iso)));
}

const FOLDED_MONTHS = CS_MONTHS.map(foldText);
const FOLDED_MONTHS_GEN = CS_MONTHS_GENITIVE.map(foldText);
const FOLDED_WEEKDAYS = [...CS_WEEKDAYS, ...CS_WEEKDAYS_SHORT].map(foldText);

/** Month index 0–11 for a (folded) Czech month word: nominative, genitive or a unique prefix of ≥ 3 letters. */
function monthFromWord(w: string): number | null {
  const word = w.replace(/\.$/, "");
  let i = FOLDED_MONTHS.indexOf(word);
  if (i < 0) i = FOLDED_MONTHS_GEN.indexOf(word);
  if (i >= 0) return i;
  if (word.length < 3) return null;
  const hits = new Set<number>();
  FOLDED_MONTHS.forEach((m, idx) => m.startsWith(word) && hits.add(idx));
  FOLDED_MONTHS_GEN.forEach((m, idx) => m.startsWith(word) && hits.add(idx));
  return hits.size === 1 ? [...hits][0] : null;
}

function fullYear(y: string | undefined): number | null {
  if (!y) return null;
  return y.length === 2 ? 2000 + Number(y) : Number(y);
}

/** Without a year: this year, or next year when that date lies more than 60 days in the past. */
function withImplicitYear(m1: number, d: number, now: Date): IsoDate | null {
  const y = now.getFullYear();
  const iso = makeIso(y, m1, d) ?? (m1 === 2 && d === 29 ? makeIso(y + 1, 2, 29) : null);
  if (!iso) return null;
  if (diffDays(iso, now) < -60) return makeIso(y + 1, m1, d) ?? iso;
  return iso;
}

/**
 * Parse a typed Czech date. Accepts `1.2.2026`, `1. 2. 2026`, `1/2/2026`, `1.2.26`, `1. 2.` / `1/2` (implicit year),
 * `1. února 2026`, ISO `2026-02-01`, `dnes`, `zítra`, `pozítří`, `včera`, `+3`, `-2`; a leading weekday is ignored
 * („út 3. 11. 2026"). Returns null for anything else, incl. impossible dates (31. 2.).
 * With `requireYear` only input that cannot grow into another date counts: a 4-digit year (`1.2.2026`,
 * `1. února 2026`), full ISO (`2026-02-01`) or a keyword (`dnes`, `zítra` …) — used while typing, so a half-typed
 * date („1.2.20" on the way to 2026, „+3" on the way to „+30") is never committed.
 */
export function parseCzDate(text: string, now: Date = new Date(), o: { requireYear?: boolean } = {}): IsoDate | null {
  let s = foldText(text);
  if (!s) return null;
  const today = toIsoDate(now);
  const kw: Record<string, number> = { dnes: 0, zitra: 1, pozitri: 2, vcera: -1, predevcirem: -2 };
  if (s in kw) return addDays(today, kw[s]);
  const rel = /^([+-])\s*(\d{1,3})$/.exec(s);
  if (rel) return o.requireYear ? null : addDays(today, (rel[1] === "-" ? -1 : 1) * Number(rel[2]));

  // leading weekday: „út 3. 11. 2026", „úterý, 3. 11."
  const wd = /^([a-z]+)\.?,?\s+(?=\d)/.exec(s);
  if (wd && FOLDED_WEEKDAYS.includes(wd[1])) s = s.slice(wd[0].length);

  let m = (o.requireYear ? /^(\d{4})-(\d{2})-(\d{2})$/ : /^(\d{4})-(\d{1,2})-(\d{1,2})$/).exec(s);
  if (m) return makeIso(+m[1], +m[2], +m[3]);

  // numeric: d.m.yyyy, d. m. yy, d/m/yyyy, d. m., d/m, d m yyyy
  m = /^(\d{1,2})\s*[./]\s*(\d{1,2})\s*(?:[./]\s*(\d{4}|\d{2})?)?$/.exec(s) ?? /^(\d{1,2})\s+(\d{1,2})\s+(\d{4})$/.exec(s);
  if (m) {
    if (o.requireYear && m[3]?.length !== 4) return null;
    const y = fullYear(m[3]);
    return y === null ? withImplicitYear(+m[2], +m[1], now) : makeIso(y, +m[2], +m[1]);
  }

  // d. měsíce [yyyy]
  m = /^(\d{1,2})\.?\s*([a-z]+\.?)\s*(\d{4})?$/.exec(s);
  if (m) {
    const mi = monthFromWord(m[2]);
    if (mi === null || (o.requireYear && !m[3])) return null;
    const y = fullYear(m[3]);
    return y === null ? withImplicitYear(mi + 1, +m[1], now) : makeIso(y, mi + 1, +m[1]);
  }
  return null;
}

/**
 * Parse a typed month: `2026-10`, `10/2026`, `10.2026`, `10. 2026`, `říjen 2026`, `rijen 2026`, `října 2026`.
 * Without `requireYear` a bare month name („říjen") means the current year. With `requireYear` only a full match
 * with a 4-digit year and a 2-digit ISO month counts (used while typing, so a half-typed month — „2026-1" on the way
 * to „2026-10" — is never committed).
 */
export function parseCzMonth(text: string, now: Date = new Date(), o: { requireYear?: boolean } = {}): IsoMonth | null {
  const s = foldText(text);
  if (!s) return null;
  const ok = (y: number, m1: number) => (y >= 1900 && y <= 2200 && m1 >= 1 && m1 <= 12 ? `${y}-${pad2(m1)}` : null);
  let m = (o.requireYear ? /^(\d{4})-(\d{2})$/ : /^(\d{4})-(\d{1,2})$/).exec(s);
  if (m) return ok(+m[1], +m[2]);
  m = /^(\d{1,2})\s*[./]\s*(\d{4})$/.exec(s);
  if (m) return ok(+m[2], +m[1]);
  m = /^([a-z]+\.?)\s*(\d{4})?$/.exec(s);
  if (m) {
    const mi = monthFromWord(m[1]);
    if (mi === null) return null;
    if (m[2]) return ok(+m[2], mi + 1);
    return o.requireYear ? null : ok(now.getFullYear(), mi + 1);
  }
  return null;
}
