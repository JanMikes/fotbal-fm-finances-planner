import { describe, expect, it } from "vitest";
import { dueInfo } from "@/lib/due";

const now = new Date(2026, 9, 13, 15, 30); // 13. 10. 2026 afternoon

describe("dueInfo", () => {
  it("today / tomorrow / soon / normal / late", () => {
    expect(dueInfo("2026-10-13", false, now)).toMatchObject({ cls: "soon", text: "Dnes", diff: 0 });
    expect(dueInfo("2026-10-14", false, now)).toMatchObject({ cls: "soon", text: "Zítra", diff: 1 });
    expect(dueInfo("2026-10-16", false, now)).toMatchObject({ cls: "soon", text: "16. 10.", diff: 3 });
    expect(dueInfo("2026-10-17", false, now)).toMatchObject({ cls: "", text: "17. 10.", diff: 4 });
    const late = dueInfo("2026-10-12", false, now);
    expect(late).toMatchObject({ cls: "late", text: "12. 10.", diff: -1 });
    expect(late.title).toBe("Termín dokončení: 12. 10. 2026 — po termínu");
  });

  it("muted in the last column, no overdue suffix", () => {
    const d = dueInfo("2026-10-01", true, now);
    expect(d.cls).toBe("done");
    expect(d.title).toBe("Termín dokončení: 1. 10. 2026");
  });

  it("supports a custom tooltip prefix", () => {
    expect(dueInfo("2026-10-20", false, now, "Datum realizace: ").title).toBe("Datum realizace: 20. 10. 2026");
  });
});
