import { describe, expect, it } from "vitest";
import { changedFields, isEmptyPatch } from "@/lib/patch";

describe("changedFields", () => {
  it("returns nothing for an unchanged form", () => {
    const v = { title: "Plakát", dueDate: null, budget: 0, areas: ["Web", "Video"] };
    expect(changedFields({ ...v, areas: [...v.areas] }, v)).toEqual({});
    expect(isEmptyPatch(changedFields(v, v))).toBe(true);
  });

  it("returns only the fields that differ", () => {
    expect(changedFields({ title: "B", leadId: "p1", dueDate: "2026-11-20" }, { title: "A", leadId: "p1", dueDate: "2026-11-20" })).toEqual({ title: "B" });
  });

  it("treats null, 0 and empty string as different values", () => {
    expect(changedFields({ budget: 0 }, { budget: null as number | null })).toEqual({ budget: 0 });
    expect(changedFields({ budget: null as number | null }, { budget: 0 as number | null })).toEqual({ budget: null });
    expect(changedFields({ role: "" as string | null }, { role: null as string | null })).toEqual({ role: "" });
    expect(changedFields({ dueDate: null as string | null }, { dueDate: "2026-11-20" as string | null })).toEqual({ dueDate: null });
  });

  it("compares arrays by content and order", () => {
    expect(changedFields({ areas: ["Web"] }, { areas: ["Web"] })).toEqual({});
    expect(changedFields({ areas: ["Web", "Video"] }, { areas: ["Video", "Web"] })).toEqual({ areas: ["Web", "Video"] });
    expect(changedFields({ areas: [] as string[] }, { areas: ["Web"] })).toEqual({ areas: [] });
  });

  it("isEmptyPatch", () => {
    expect(isEmptyPatch({})).toBe(true);
    expect(isEmptyPatch({ title: undefined })).toBe(false);
  });
});
