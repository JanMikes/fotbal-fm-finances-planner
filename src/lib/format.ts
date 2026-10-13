/** Formatting / parsing helpers ported from the prototype (prototype.md §5). Pure, locale cs-CZ. */
import { MNAMES } from "./constants";

/** cs-CZ number with thousands separated by a normal space (prototype replaces NBSP; newer ICU may emit U+202F). */
export function nf(n: number): string {
  return n.toLocaleString("cs-CZ").replace(/[  ]/g, " ");
}

/** `25 000 Kč`, `0 Kč` (prototype `kcs`). */
export function kcs(n: number | null | undefined): string {
  return nf(n || 0) + " Kč";
}

/** Strip every non-digit and parse (prototype `replace(/\D/g,'')`). Returns null when there are no digits. */
export function parseDigits(v: string | number | null | undefined): number | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** Like parseDigits but 0 for empty (prototype `cbNum`). */
export function parseDigitsOrZero(v: string | number | null | undefined): number {
  return parseDigits(v) ?? 0;
}

/** Budget-box input display: 0 → "" (placeholder "0" shows), else `25 000` (prototype `cbFmt`). */
export function cbFmt(n: number | null | undefined): string {
  return n ? nf(n) : "";
}

/** Signed Kč used in the budget box: U+2212 minus for negatives (prototype `k`). */
export function signedKc(n: number): string {
  return (n < 0 ? "−" : "") + (Math.abs(n) ? cbFmt(Math.abs(n)) : "0") + " Kč";
}

/** Member budget tag text; empty string when there is no budget. */
export function budgetTag(budget: number | null | undefined): string {
  return budget ? kcs(budget) : "";
}

/** File size label: `1,5 MB` / `12 kB` (prototype `fmtSize`). */
export function fmtSize(b: number | null | undefined): string {
  const bytes = b ?? 0;
  return bytes > 1048576
    ? (bytes / 1048576).toFixed(1).replace(".", ",") + " MB"
    : Math.max(1, Math.round(bytes / 1024)) + " kB";
}

/** Initials: "Petra Horáková" → "PH" (prototype `ini`). */
export function ini(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Chart value label: 4500 → `4,5 tis.`, 12000 → `12 tis.` */
export function thousandsLabel(s: number): string {
  return nf(Math.round(s / 100) / 10).replace(",0", "") + " tis.";
}

/** Quantity chip: `500 ks`. */
export function qtyLabel(q: number | null | undefined): string {
  return nf(q || 0) + " ks";
}

/** Parse "YYYY-MM-DD" as a LOCAL date (midnight). */
export function parseIsoDate(iso: string): Date {
  return new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
}

/** `13. 10. 2026` — accepts "YYYY-MM-DD", an ISO timestamp, a Date or epoch ms. */
export function formatDate(d: string | number | Date): string {
  const date = typeof d === "string" ? parseIsoDate(d) : new Date(d);
  return date.toLocaleDateString("cs-CZ");
}

/** `13. 10.` */
export function formatDayMonth(d: string | Date): string {
  const date = typeof d === "string" ? parseIsoDate(d) : d;
  return date.toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "YYYY-MM" of a local date. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/** "YYYY-MM-DD" of a local date. */
export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `Říjen 2026` from "2026-10" (prototype `monLab`). */
export function monLab(m: string): string {
  const [y, mo] = m.split("-");
  return MNAMES[Number(mo) - 1] + " " + y;
}

/** Link URL normalisation: trim, prepend https:// when there is no scheme (prototype `addLink`). */
export function normalizeUrl(raw: string): string {
  const u = raw.trim();
  if (!u) return "";
  return /^[a-z]+:\/\//i.test(u) ? u : "https://" + u;
}
