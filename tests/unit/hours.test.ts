import { describe, expect, it } from "vitest";
import { sumHours, taskHoursLabel } from "@/lib/filters";
import { hoursLabel, parseHours } from "@/lib/format";
import * as o from "@/lib/store/optimistic";
import { state, task } from "./fixtures";

describe("task hours („Odpracováno hodin\")", () => {
  it("parses integers and decimals with comma or dot; empty = null, invalid = undefined", () => {
    expect(parseHours("3")).toBe(3);
    expect(parseHours("1,5")).toBe(1.5);
    expect(parseHours(" 2.25 h")).toBe(2.25);
    expect(parseHours("0,333")).toBe(0.33);
    expect(parseHours("")).toBeNull();
    expect(parseHours("abc")).toBeUndefined();
    expect(parseHours("-1")).toBeUndefined();
  });

  it("sums without float noise and formats Czech style", () => {
    expect(sumHours([task({ hoursWorked: 0.1 }), task({ hoursWorked: 0.2 }), task({ hoursWorked: null })])).toBe(0.3);
    expect(hoursLabel(12.5)).toBe("12,5 h");
    expect(hoursLabel(1234)).toBe("1 234 h");
    expect(hoursLabel(null)).toBe("0 h");
  });

  it("label follows the month filter", () => {
    expect(taskHoursLabel("all")).toBe("Odpracováno");
    expect(taskHoursLabel("none")).toBe("Odpracováno bez termínu");
    expect(taskHoursLabel("2026-10")).toBe("Odpracováno za Říjen 2026");
  });

  it("duplicate does not copy hours", () => {
    const s = state({ tasks: [task({ id: "a", hoursWorked: 4 })] });
    expect(o.duplicateTask(s, "a", { id: "b" }).tasks.find((t) => t.id === "b")?.hoursWorked).toBeNull();
  });
});
