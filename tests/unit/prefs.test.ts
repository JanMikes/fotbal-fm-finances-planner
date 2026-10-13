import { describe, expect, it } from "vitest";
import { DEFAULT_PREFS, parsePrefs, resolveMe, resolvePrFilter } from "@/lib/prefs";
import { person } from "./fixtures";

describe("prefs", () => {
  it("parses and validates stored prefs", () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs("{broken")).toEqual(DEFAULT_PREFS);
    const p = parsePrefs(JSON.stringify({ me: "x", view: "org", filter: "Mládež", month: "2026-10", mine: true, prFilter: "t", prMonth: "none", curBudOpen: true, q: "ignored" }));
    expect(p).toEqual({ me: "x", view: "org", filter: "Mládež", month: "2026-10", mine: true, prFilter: "t", prMonth: "none", curBudOpen: true });
    expect(parsePrefs(JSON.stringify({ filter: "Ženy A", view: "nope", month: "bad" }))).toMatchObject({ filter: "Vše", view: "board", month: "all" });
  });

  it("resolves identity and print filter", () => {
    const nodes = [person({ id: "a" }), person({ id: "b" })];
    expect(resolveMe("b", nodes)).toBe("b");
    expect(resolveMe("deleted", nodes)).toBe("a");
    expect(resolveMe(null, [])).toBeNull();
    expect(resolvePrFilter("gone", [{ id: "t", name: "x", sortOrder: 1 }])).toBe("Vše");
    expect(resolvePrFilter("t", [{ id: "t", name: "x", sortOrder: 1 }])).toBe("t");
  });
});
