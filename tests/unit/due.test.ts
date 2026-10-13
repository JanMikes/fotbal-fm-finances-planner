import { describe, expect, it } from "vitest";
import { dueInfo } from "@/lib/due";

const now = new Date(2026, 9, 13, 15, 30); // 13. 10. 2026 afternoon
const NB = "\u00a0";

describe("dueInfo", () => {
  it("always shows the date; a state before it when near or past; classes unchanged", () => {
    const S = `${NB}· `;
    expect(dueInfo("2026-10-13", false, now)).toMatchObject({ cls: "soon", state: "Dnes", text: `Dnes${S}13.${NB}10.`, diff: 0 });
    expect(dueInfo("2026-10-14", false, now)).toMatchObject({ cls: "soon", text: `Zítra${S}14.${NB}10.`, diff: 1 });
    expect(dueInfo("2026-10-16", false, now)).toMatchObject({ cls: "soon", text: `Za 3 dny${S}16.${NB}10.`, diff: 3 });
    expect(dueInfo("2026-10-17", false, now)).toMatchObject({ cls: "", text: `Za 4 dny${S}17.${NB}10.`, diff: 4 });
    expect(dueInfo("2026-10-19", false, now)).toMatchObject({ cls: "", text: `Za 6 dní${S}19.${NB}10.`, diff: 6 });
    expect(dueInfo("2026-10-20", false, now)).toMatchObject({ cls: "", state: "", date: `20.${NB}10.`, text: `20.${NB}10.`, diff: 7 });
    expect(dueInfo("2027-01-15", false, now)).toMatchObject({ cls: "", text: `15.${NB}1.${NB}2027` });
    const late = dueInfo("2026-10-12", false, now);
    expect(late).toMatchObject({ cls: "late", state: "Po termínu", text: `Po termínu${S}12.${NB}10.`, diff: -1 });
    expect(late.title).toBe(`Termín dokončení: 12.${NB}10.${NB}2026 — po termínu (včera)`);
    expect(late.srText).toBe(late.title);
    expect(dueInfo("2026-10-08", false, now)).toMatchObject({ cls: "late", text: `Po termínu${S}8.${NB}10.` });
    expect(dueInfo("2026-09-23", false, now)).toMatchObject({ cls: "late", text: `Po termínu${S}23.${NB}9.` });
    expect(dueInfo("2025-12-01", false, now).text).toBe(`Po termínu${S}1.${NB}12.${NB}2025`);
  });

  it("title / srText carry the relative day for upcoming dates", () => {
    expect(dueInfo("2026-10-16", false, now).title).toBe(`Termín dokončení: 16.${NB}10.${NB}2026 — za 3 dny`);
    expect(dueInfo("2026-11-20", false, now).srText).toBe(`Termín dokončení: 20.${NB}11.${NB}2026 — za 38 dní`);
  });

  it("muted in the last column: absolute short date, no state suffix", () => {
    const d = dueInfo("2026-10-01", true, now);
    expect(d.cls).toBe("done");
    expect(d.text).toBe(`1.${NB}10.`);
    expect(d.title).toBe(`Termín dokončení: 1.${NB}10.${NB}2026`);
    expect(dueInfo("2026-10-13", true, now).text).toBe(`13.${NB}10.`);
  });

  it("supports a custom tooltip prefix", () => {
    expect(dueInfo("2026-10-20", false, now, "Datum realizace: ").title).toBe(`Datum realizace: 20.${NB}10.${NB}2026 — za 7 dní`);
  });

  it("is DST safe", () => {
    expect(dueInfo("2026-10-26", false, new Date(2026, 9, 25, 0, 30)).diff).toBe(1);
    expect(dueInfo("2026-03-30", false, new Date(2026, 2, 28, 23, 0)).state).toBe("Za 2 dny");
  });
});
