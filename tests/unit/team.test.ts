import { describe, expect, it } from "vitest";
import { applyDraft, budgetPatch, budgetView, monthInputValue } from "@/features/team/budgetModel";
import { adoptCandidates, adoptConfirmText, dropToMove, dropTooltip, resolveDropPos } from "@/features/team/dropZone";
import type { Budget } from "@/lib/types";
import { person, unit } from "./fixtures";

describe("resolveDropPos (thirds)", () => {
  const p = person();
  it("left/top third = before, right/bottom third = after, centre = child", () => {
    expect(resolveDropPos(0.1, p, "person")).toBe("before");
    expect(resolveDropPos(0.33, p, "person")).toBe("before");
    expect(resolveDropPos(0.34, p, "person")).toBe("child");
    expect(resolveDropPos(0.5, p, "person")).toBe("child");
    expect(resolveDropPos(0.66, p, "person")).toBe("child");
    expect(resolveDropPos(0.9, p, "person")).toBe("after");
  });
  it("a person dropped on a top-level unit always goes inside it", () => {
    const top = unit({ parentId: null });
    expect(resolveDropPos(0.05, top, "person")).toBe("child");
    expect(resolveDropPos(0.95, top, "person")).toBe("child");
  });
  it("on a nested unit the thirds apply for persons; units always use thirds", () => {
    const nested = unit({ parentId: "x" });
    expect(resolveDropPos(0.05, nested, "person")).toBe("before");
    expect(resolveDropPos(0.95, nested, "person")).toBe("after");
    expect(resolveDropPos(0.05, unit({ parentId: null }), "unit")).toBe("before");
  });
});

describe("dropTooltip", () => {
  const p = person({ name: "Tomáš Kula" });
  const u = unit({ name: "Infoservis" });
  it("desktop wording", () => {
    expect(dropTooltip("child", p, false)).toBe("Pod Tomáš Kula");
    expect(dropTooltip("child", u, false)).toBe("Do kategorie Infoservis");
    expect(dropTooltip("before", p, false)).toBe("Vlevo vedle Tomáš Kula");
    expect(dropTooltip("after", p, false)).toBe("Vpravo vedle Tomáš Kula");
  });
  it("mobile wording (DECISIONS #8)", () => {
    expect(dropTooltip("before", p, true)).toBe("Před Tomáš Kula");
    expect(dropTooltip("after", p, true)).toBe("Za Tomáš Kula");
    expect(dropTooltip("child", p, true)).toBe("Pod Tomáš Kula");
  });
});

describe("dropToMove", () => {
  const root = person({ id: "r" });
  const a = person({ id: "a", parentId: "r" });
  const b = person({ id: "b", parentId: "r" });
  const orphan = person({ id: "o", parentId: "missing" });
  const nodes = [root, a, b, orphan];
  it("maps child / before / after / root zone", () => {
    expect(dropToMove("b", { kind: "node", id: "a", pos: "child" }, nodes)).toEqual({ id: "b", parentId: "a" });
    expect(dropToMove("b", { kind: "node", id: "a", pos: "before" }, nodes)).toEqual({ id: "b", parentId: "r", beforeId: "a" });
    expect(dropToMove("a", { kind: "node", id: "b", pos: "after" }, nodes)).toEqual({ id: "a", parentId: "r", afterId: "b" });
    expect(dropToMove("a", { kind: "root" }, nodes)).toEqual({ id: "a", parentId: null });
  });
  it("sibling of a top-level / dangling node goes to the top level", () => {
    expect(dropToMove("a", { kind: "node", id: "r", pos: "after" }, nodes)).toEqual({ id: "a", parentId: null, afterId: "r" });
    expect(dropToMove("a", { kind: "node", id: "o", pos: "before" }, nodes)).toEqual({ id: "a", parentId: null, beforeId: "o" });
  });
  it("ignores unknown targets and self", () => {
    expect(dropToMove("a", { kind: "node", id: "zzz", pos: "child" }, nodes)).toBeNull();
    expect(dropToMove("a", { kind: "node", id: "a", pos: "child" }, nodes)).toBeNull();
  });
});

describe("adoptCandidates (category inserted between)", () => {
  const boss = person({ id: "boss", name: "Lukáš" });
  const k1 = person({ id: "k1", parentId: "boss", name: "Karin", sortOrder: 2 });
  const k2 = person({ id: "k2", parentId: "boss", name: "Jan", sortOrder: 1 });
  const sub = unit({ id: "sub", parentId: "boss" });
  const u = unit({ id: "u", name: "Web" });
  const nodes = [boss, k1, k2, sub, u];
  it("returns the person children (sorted) for a unit dropped on a node centre", () => {
    expect(adoptCandidates(nodes, "u", { kind: "node", id: "boss", pos: "child" }).map((n) => n.id)).toEqual(["k2", "k1"]);
  });
  it("never for persons, sibling drops or the root zone (prototype crash fixed)", () => {
    expect(adoptCandidates(nodes, "k1", { kind: "node", id: "boss", pos: "child" })).toEqual([]);
    expect(adoptCandidates(nodes, "u", { kind: "node", id: "boss", pos: "after" })).toEqual([]);
    expect(adoptCandidates(nodes, "u", { kind: "root" })).toEqual([]);
  });
  it("confirm text is verbatim", () => {
    expect(adoptConfirmText("Web", "Lukáš", [k2, k1])).toBe(
      "Vložit kategorii „Web“ mezi Lukáš a jeho podřízené?\n\nOK = Jan, Karin se přesunou pod kategorii.\nZrušit = kategorie se jen přidá vedle nich.",
    );
  });
});

describe("budget box model", () => {
  const now = new Date(2026, 9, 13);
  const budget: Budget = { spolek: 150000, asAmount: 50000, monthlyInstallment: 7500, installmentFrom: "2026-08-01" };
  const nodes = [
    person({ budget: 25000, budgetColor: "green" }),
    person({ budget: 12000, budgetColor: "red" }),
    person({ budget: 5000, budgetColor: "blue" }),
    unit({ budget: 99999, budgetColor: "green" }),
  ];
  it("formats Celkem, V budgetu, Zbývá (installment × months incl. current)", () => {
    const v = budgetView(budget, nodes, now);
    expect(v.sum).toBe("200\u00a0000\u00a0Kč");
    expect(v.green).toBe("−\u00a025\u00a0000\u00a0Kč");
    expect(v.months).toBe(3);
    expect(v.left).toBe("152\u00a0500\u00a0Kč");
    expect(v.negative).toBe(false);
  });
  it("overspent → red with U+2212 minus", () => {
    const v = budgetView({ ...budget, spolek: 0, asAmount: 10000 }, nodes, now);
    expect(v.left).toBe("−37\u00a0500\u00a0Kč");
    expect(v.negative).toBe(true);
  });
  it("draft texts override stored numbers, digits only", () => {
    expect(applyDraft(budget, { spolek: "1\u00a0000\u00a0Kč", asAmount: "" })).toMatchObject({ spolek: 1000, asAmount: 0, monthlyInstallment: 7500 });
  });
  it("budgetPatch stores digits only and sets installmentFrom on the first non-zero installment", () => {
    expect(budgetPatch("spolek", "25 000,-", budget, now)).toEqual({ spolek: 25000 });
    expect(budgetPatch("monthlyInstallment", "8 000", budget, now)).toEqual({ monthlyInstallment: 8000 });
    expect(budgetPatch("monthlyInstallment", "8 000", { ...budget, installmentFrom: null }, now)).toEqual({ monthlyInstallment: 8000, installmentFrom: "2026-10" });
    expect(budgetPatch("monthlyInstallment", "abc", { ...budget, installmentFrom: null }, now)).toEqual({ monthlyInstallment: 0 });
  });
  it("month input value", () => {
    expect(monthInputValue("2026-08-01")).toBe("2026-08");
    expect(monthInputValue(null)).toBe("");
  });
});
