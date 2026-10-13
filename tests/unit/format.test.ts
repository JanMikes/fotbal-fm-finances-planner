import { describe, expect, it } from "vitest";
import {
  budgetTag,
  cbFmt,
  fmtSize,
  formatDate,
  formatDayMonth,
  ini,
  isoDate,
  kcs,
  monLab,
  monthKey,
  nf,
  normalizeUrl,
  parseDigits,
  parseDigitsOrZero,
  qtyLabel,
  signedKc,
  thousandsLabel,
} from "@/lib/format";

describe("format", () => {
  it("formats Kč with a normal space as thousands separator", () => {
    expect(kcs(25000)).toBe("25 000 Kč");
    expect(kcs(1234567)).toBe("1 234 567 Kč");
    expect(kcs(0)).toBe("0 Kč");
    expect(kcs(null)).toBe("0 Kč");
    expect(nf(4500)).toBe("4 500");
    expect(kcs(25000)).not.toMatch(/[  ]/);
  });

  it("parses digits like the prototype", () => {
    expect(parseDigits("4 500 Kč")).toBe(4500);
    expect(parseDigits("1,5")).toBe(15);
    expect(parseDigits("-300")).toBe(300);
    expect(parseDigits("abc")).toBeNull();
    expect(parseDigits("")).toBeNull();
    expect(parseDigits(null)).toBeNull();
    expect(parseDigits(42)).toBe(42);
    expect(parseDigitsOrZero("")).toBe(0);
  });

  it("budget box helpers", () => {
    expect(cbFmt(0)).toBe("");
    expect(cbFmt(25000)).toBe("25 000");
    expect(signedKc(-7500)).toBe("−7 500 Kč");
    expect(signedKc(0)).toBe("0 Kč");
    expect(signedKc(12000)).toBe("12 000 Kč");
    expect(budgetTag(25000)).toBe("25 000 Kč");
    expect(budgetTag(null)).toBe("");
    expect(budgetTag(0)).toBe("");
  });

  it("file sizes, initials, chart labels, qty", () => {
    expect(fmtSize(500)).toBe("1 kB");
    expect(fmtSize(12 * 1024)).toBe("12 kB");
    expect(fmtSize(1.5 * 1048576)).toBe("1,5 MB");
    expect(ini("Petra Horáková")).toBe("PH");
    expect(ini("  jan  novák  pepa ")).toBe("JN");
    expect(thousandsLabel(4500)).toBe("4,5 tis.");
    expect(thousandsLabel(12000)).toBe("12 tis.");
    expect(qtyLabel(500)).toBe("500 ks");
    expect(qtyLabel(1500)).toBe("1 500 ks");
  });

  it("dates in cs-CZ", () => {
    expect(formatDate("2026-10-13")).toBe("13. 10. 2026");
    expect(formatDayMonth("2026-10-15")).toBe("15. 10.");
    expect(monLab("2026-10")).toBe("Říjen 2026");
    expect(monLab("2027-01")).toBe("Leden 2027");
    expect(monthKey(new Date(2026, 0, 31))).toBe("2026-01");
    expect(isoDate(new Date(2026, 8, 3))).toBe("2026-09-03");
  });

  it("normalizes link URLs", () => {
    expect(normalizeUrl(" www.fotbalfm.cz ")).toBe("https://www.fotbalfm.cz");
    expect(normalizeUrl("http://x.cz")).toBe("http://x.cz");
    expect(normalizeUrl("ftp://x.cz")).toBe("ftp://x.cz");
    expect(normalizeUrl("   ")).toBe("");
  });
});
