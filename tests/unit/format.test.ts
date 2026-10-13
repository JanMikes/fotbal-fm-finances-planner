import { describe, expect, it } from "vitest";
import {
  cbFmt,
  fmtSize,
  formatDate,
  formatDayMonth,
  ini,
  kcs,
  monLab,
  monthKey,
  nf,
  normalizeUrl,
  parseDigits,
  plural,
  pluralize,
  parseDigitsOrZero,
  qtyLabel,
  signedKc,
  thousandsLabel,
} from "@/lib/format";

describe("format", () => {
  it("formats Kč with a non-breaking space (thousands and unit), so amounts never wrap", () => {
    expect(kcs(25000)).toBe("25\u00a0000\u00a0Kč");
    expect(kcs(1234567)).toBe("1\u00a0234\u00a0567\u00a0Kč");
    expect(kcs(0)).toBe("0\u00a0Kč");
    expect(kcs(null)).toBe("0\u00a0Kč");
    expect(nf(4500)).toBe("4\u00a0500");
    expect(kcs(25000)).not.toMatch(/[ \u202f]/); // no breakable or narrow spaces
  });

  it("parses digits like the prototype, ignoring a decimal part", () => {
    expect(parseDigits("4 500 Kč")).toBe(4500);
    expect(parseDigits("4\u00a0500")).toBe(4500);
    expect(parseDigits("4 500,50")).toBe(4500);
    expect(parseDigits("4 500,50 Kč")).toBe(4500);
    expect(parseDigits("4500.5")).toBe(4500);
    expect(parseDigits("1,5")).toBe(1);
    expect(parseDigits("4.500")).toBe(4500); // 3 digits after the dot = thousands separator
    expect(parseDigits("1,234,567")).toBe(1234567);
    expect(parseDigits("-300")).toBe(300);
    expect(parseDigits("abc")).toBeNull();
    expect(parseDigits("")).toBeNull();
    expect(parseDigits(null)).toBeNull();
    expect(parseDigits(42)).toBe(42);
    expect(parseDigitsOrZero("")).toBe(0);
  });

  it("budget box helpers", () => {
    expect(cbFmt(0)).toBe("");
    expect(cbFmt(25000)).toBe("25\u00a0000");
    expect(signedKc(-7500)).toBe("−7\u00a0500\u00a0Kč");
    expect(signedKc(0)).toBe("0\u00a0Kč");
    expect(signedKc(12000)).toBe("12\u00a0000\u00a0Kč");
  });

  it("file sizes, initials, chart labels, qty", () => {
    expect(fmtSize(500)).toBe("1 kB");
    expect(fmtSize(12 * 1024)).toBe("12 kB");
    expect(fmtSize(1.5 * 1048576)).toBe("1,5 MB");
    expect(ini("Petra Horáková")).toBe("PH");
    expect(ini("  jan  novák  pepa ")).toBe("JN");
    expect(thousandsLabel(4500)).toBe("4,5\u00a0tis.");
    expect(thousandsLabel(12000)).toBe("12\u00a0tis.");
    expect(qtyLabel(500)).toBe("500\u00a0ks");
    expect(qtyLabel(1500)).toBe("1\u00a0500\u00a0ks");
  });

  it("dates in cs-CZ", () => {
    expect(formatDate("2026-10-13")).toBe("13.\u00a010.\u00a02026"); // NBSP: dates never wrap
    expect(formatDayMonth("2026-10-15")).toBe("15.\u00a010.");
    expect(monLab("2026-10")).toBe("Říjen 2026");
    expect(monLab("2027-01")).toBe("Leden 2027");
    expect(monthKey(new Date(2026, 0, 31))).toBe("2026-01");
  });

  it("Czech plurals", () => {
    expect(plural(1, "položka", "položky", "položek")).toBe("položka");
    expect(plural(4, "položka", "položky", "položek")).toBe("položky");
    expect(plural(0, "položka", "položky", "položek")).toBe("položek");
    expect(pluralize(1, "položka", "položky", "položek")).toBe("1 položka");
    expect(pluralize(3, "položka", "položky", "položek")).toBe("3 položky");
    expect(pluralize(5, "tiskovina", "tiskoviny", "tiskovin")).toBe("5 tiskovin");
    expect(pluralize(1500, "položka", "položky", "položek")).toBe("1\u00a0500 položek");
  });

  it("normalizes link URLs", () => {
    expect(normalizeUrl(" www.fotbalfm.cz ")).toBe("https://www.fotbalfm.cz");
    expect(normalizeUrl("http://x.cz")).toBe("http://x.cz");
    expect(normalizeUrl("ftp://x.cz")).toBe("ftp://x.cz");
    expect(normalizeUrl("mailto:info@fotbalfm.cz")).toBe("mailto:info@fotbalfm.cz");
    expect(normalizeUrl("MAILTO:a@b.cz")).toBe("MAILTO:a@b.cz");
    expect(normalizeUrl("   ")).toBe("");
  });
});
