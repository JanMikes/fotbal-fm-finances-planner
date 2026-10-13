import { describe, expect, it } from "vitest";
import {
  addDays,
  addMonths,
  addMonthsToDate,
  capitalize,
  CS_WEEKDAYS_SHORT,
  diffDays,
  formatDate,
  formatDateInput,
  formatDateLong,
  formatDateShort,
  formatDateWithRelative,
  formatDayMonth,
  formatMonth,
  formatRelativeDay,
  isValidIsoDate,
  monthGrid,
  parseCzDate,
  parseCzMonth,
  parseIsoDate,
  plural,
  toIsoDate,
  weekStart,
} from "@/lib/dates";

const NB = " ";
const now = new Date(2026, 9, 13, 15, 30); // út 13. 10. 2026 afternoon (TZ Europe/Prague in vitest)

describe("parseCzDate", () => {
  it.each([
    ["1.2.2026", "2026-02-01"],
    ["1. 2. 2026", "2026-02-01"],
    ["01.02.2026", "2026-02-01"],
    ["1/2/2026", "2026-02-01"],
    ["1.2.26", "2026-02-01"],
    ["3 11 2026", "2026-11-03"],
    ["2026-11-20", "2026-11-20"],
    ["út 3. 11. 2026", "2026-11-03"],
    ["úterý, 3. 11. 2026", "2026-11-03"],
    ["3. listopadu 2026", "2026-11-03"],
    ["3. listopad", "2026-11-03"],
    ["3. listopadu", "2026-11-03"],
    ["29. 2. 2028", "2028-02-29"],
    ["  20. 11.  ", "2026-11-20"],
    ["20/11", "2026-11-20"],
  ])("%s → %s", (text, iso) => {
    expect(parseCzDate(text, now)).toBe(iso);
  });

  it("keywords and relative offsets", () => {
    expect(parseCzDate("dnes", now)).toBe("2026-10-13");
    expect(parseCzDate("Zítra", now)).toBe("2026-10-14");
    expect(parseCzDate("zitra", now)).toBe("2026-10-14");
    expect(parseCzDate("pozítří", now)).toBe("2026-10-15");
    expect(parseCzDate("včera", now)).toBe("2026-10-12");
    expect(parseCzDate("+3", now)).toBe("2026-10-16");
    expect(parseCzDate("-2", now)).toBe("2026-10-11");
    expect(parseCzDate("+30", now)).toBe("2026-11-12");
  });

  it("implicit year: this year, next year when the date is more than 60 days past", () => {
    expect(parseCzDate("1. 9.", now)).toBe("2026-09-01"); // 42 days ago → still this year
    expect(parseCzDate("1. 8.", now)).toBe("2027-08-01"); // 73 days ago → next year
    expect(parseCzDate("15. 1.", now)).toBe("2027-01-15");
    expect(parseCzDate("24. 12.", now)).toBe("2026-12-24");
  });

  it("rejects impossible and garbage input", () => {
    for (const bad of ["31. 2. 2026", "29. 2. 2026", "32.1.2026", "0.1.2026", "1.13.2026", "", "   ", "abc", "1.", "1.2.202", "2026-02-30", "pondělí", "3. foo 2026", "1.2.2026x"]) {
      expect(parseCzDate(bad, now), bad).toBeNull();
    }
  });

  it("round-trips its own display formats", () => {
    for (const iso of ["2026-01-05", "2026-11-03", "2027-12-31"]) {
      expect(parseCzDate(formatDateInput(iso, { weekday: true }), now)).toBe(iso);
      expect(parseCzDate(formatDateInput(iso), now)).toBe(iso);
      expect(parseCzDate(formatDate(iso), now)).toBe(iso);
      expect(parseCzDate(formatDateLong(iso), now)).toBe(iso);
    }
  });
});

describe("parseCzMonth", () => {
  it.each([
    ["2026-10", "2026-10"],
    ["2026-3", "2026-03"],
    ["10/2026", "2026-10"],
    ["10.2026", "2026-10"],
    ["10. 2026", "2026-10"],
    ["říjen 2026", "2026-10"],
    ["Říjen 2026", "2026-10"],
    ["rijen 2026", "2026-10"],
    ["října 2026", "2026-10"],
    ["led 2027", "2027-01"],
    ["červenec 2026", "2026-07"],
    ["červen 2026", "2026-06"],
  ])("%s → %s", (text, ym) => {
    expect(parseCzMonth(text, now)).toBe(ym);
    expect(parseCzMonth(text, now, { requireYear: true })).toBe(ym);
  });

  it("bare month name = current year, but not while typing (requireYear)", () => {
    expect(parseCzMonth("březen", now)).toBe("2026-03");
    expect(parseCzMonth("brezen", now)).toBe("2026-03");
    expect(parseCzMonth("březen", now, { requireYear: true })).toBeNull();
  });

  it("rejects partial / ambiguous / invalid input", () => {
    for (const bad of ["", "2026-13", "13/2026", "10/26", "10/202", "říjen 202", "čer 2026", "xyz 2026", "2026"]) {
      expect(parseCzMonth(bad, now, { requireYear: true }), bad).toBeNull();
    }
    expect(parseCzMonth("čer", now)).toBeNull(); // červen / červenec
  });
});

describe("formatting", () => {
  it("absolute dates are NBSP-joined and locale independent", () => {
    expect(formatDate("2026-10-13")).toBe(`13.${NB}10.${NB}2026`);
    expect(formatDate(new Date(2026, 0, 5))).toBe(`5.${NB}1.${NB}2026`);
    expect(formatDate(new Date(2026, 0, 5).getTime())).toBe(`5.${NB}1.${NB}2026`);
    expect(formatDayMonth("2026-10-15")).toBe(`15.${NB}10.`);
    expect(formatDateShort("2026-10-15", now)).toBe(`15.${NB}10.`);
    expect(formatDateShort("2027-01-15", now)).toBe(`15.${NB}1.${NB}2027`);
    expect(formatDateShort("2025-12-31", now)).toBe(`31.${NB}12.${NB}2025`);
  });

  it("ISO instants format in local time", () => {
    // 22:30 UTC on 31 Dec = 23:30 in Prague → still the 31st
    expect(formatDate("2025-12-31T22:30:00.000Z")).toBe(`31.${NB}12.${NB}2025`);
    // 23:30 UTC on 31 Dec = 00:30 on 1 Jan in Prague
    expect(formatDate("2025-12-31T23:30:00.000Z")).toBe(`1.${NB}1.${NB}2026`);
  });

  it("input and long formats", () => {
    expect(formatDateInput("2026-11-03")).toBe("3. 11. 2026");
    expect(formatDateInput("2026-11-03", { weekday: true })).toBe("út 3. 11. 2026");
    expect(formatDateInput("")).toBe("");
    expect(formatDateLong("2026-11-03")).toBe("úterý 3. listopadu 2026");
    expect(formatDateLong("2026-02-01")).toBe("neděle 1. února 2026");
    expect(formatMonth("2026-10")).toBe("Říjen 2026");
    expect(formatMonth("2027-01")).toBe("Leden 2027");
    expect(capitalize("čtvrtek")).toBe("Čtvrtek");
    expect(capitalize("")).toBe("");
    expect(CS_WEEKDAYS_SHORT[0]).toBe("po");
  });

  it("relative days incl. Czech plural forms", () => {
    const rel = (n: number) => formatRelativeDay(addDays("2026-10-13", n), now);
    expect(rel(0)).toBe("dnes");
    expect(rel(1)).toBe("zítra");
    expect(rel(-1)).toBe("včera");
    expect(rel(2)).toBe("za 2 dny");
    expect(rel(3)).toBe("za 3 dny");
    expect(rel(4)).toBe("za 4 dny");
    expect(rel(5)).toBe("za 5 dní");
    expect(rel(21)).toBe("za 21 dní");
    expect(rel(-2)).toBe("před 2 dny");
    expect(rel(-5)).toBe("před 5 dny");
    expect(formatRelativeDay(new Date(2026, 9, 14, 23, 59), now)).toBe("zítra");
  });

  it("date with relative suffix only within ±6 days", () => {
    expect(formatDateWithRelative("2026-10-13", now)).toBe(`13.${NB}10.${NB}2026 (dnes)`);
    expect(formatDateWithRelative("2026-10-19", now)).toBe(`19.${NB}10.${NB}2026 (za 6 dní)`);
    expect(formatDateWithRelative("2026-10-07", now)).toBe(`7.${NB}10.${NB}2026 (před 6 dny)`);
    expect(formatDateWithRelative("2026-10-20", now)).toBe(`20.${NB}10.${NB}2026`);
    expect(formatDateWithRelative("2026-10-13T08:00:00.000Z", now)).toBe(`13.${NB}10.${NB}2026 (dnes)`);
  });

  it("plural()", () => {
    const p = (n: number) => plural(n, "položka", "položky", "položek");
    expect([0, 1, 2, 3, 4, 5, 11, 22, 100].map(p)).toEqual(["položek", "položka", "položky", "položky", "položky", "položek", "položek", "položek", "položek"]);
    expect(p(-1)).toBe("položka");
    expect(p(1.5)).toBe("položek");
  });
});

describe("calendar math", () => {
  it("parse / serialise local dates", () => {
    expect(toIsoDate(parseIsoDate("2026-03-29"))).toBe("2026-03-29");
    expect(isValidIsoDate("2026-02-28")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("2026-2-28")).toBe(false);
  });

  it("is DST safe (Europe/Prague: 29. 3. 2026 and 25. 10. 2026)", () => {
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(addDays("2026-10-25", -1)).toBe("2026-10-24");
    expect(diffDays("2026-03-30", new Date(2026, 2, 28, 23, 30))).toBe(2);
    expect(diffDays("2026-10-26", new Date(2026, 9, 25, 0, 30))).toBe(1);
    expect(diffDays("2026-10-01", new Date(2026, 2, 1, 12))).toBe(214);
    expect(formatRelativeDay("2026-03-30", new Date(2026, 2, 29, 1, 0))).toBe("zítra");
  });

  it("month arithmetic", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-01", -13)).toBe("2024-12");
    expect(addMonthsToDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsToDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToDate("2026-03-31", -12)).toBe("2025-03-31");
    expect(weekStart("2026-10-18")).toBe("2026-10-12"); // Sunday → Monday
    expect(weekStart("2026-10-12")).toBe("2026-10-12");
  });

  it("monthGrid: 6×7, Monday first, covers the month", () => {
    const g = monthGrid("2026-10");
    expect(g).toHaveLength(6);
    g.forEach((w) => expect(w).toHaveLength(7));
    expect(g[0][0]).toBe("2026-09-28"); // 1. 10. 2026 is a Thursday
    expect(g[0][3]).toBe("2026-10-01");
    expect(g[5][6]).toBe("2026-11-08");
    // consecutive days across the DST change
    const flat = g.flat();
    for (let i = 1; i < flat.length; i++) expect(flat[i]).toBe(addDays(flat[i - 1], 1));
    expect(monthGrid("2026-06")[0][0]).toBe("2026-06-01"); // month starting on Monday
    expect(monthGrid("2026-03")[0][0]).toBe("2026-02-23"); // starts on Sunday
  });
});
