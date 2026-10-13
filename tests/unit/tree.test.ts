import { describe, expect, it } from "vitest";
import { AVC, AVPAL, BUDGET_COLORS, colorName } from "@/lib/constants";
import {
  assignedTaskCount,
  buildTree,
  childrenOf,
  colorOf,
  contrastRatio,
  descendantsOf,
  inkOn,
  isLightColor,
  parentOptions,
  peopleCount,
  personStats,
  personsInOrder,
  rootsOf,
  unitTaskCount,
} from "@/lib/tree";
import { CATS } from "@/lib/constants";
import { person, task, unit } from "./fixtures";

const boss = person({ id: "boss", name: "Petra", sortOrder: 1 });
const u = unit({ id: "u", name: "Mládež", parentId: "boss", sortOrder: 2 });
const a = person({ id: "a", name: "Tomáš", parentId: "boss", sortOrder: 1 });
const b = person({ id: "b", name: "Lucie", parentId: "u", sortOrder: 1 });
const sub = unit({ id: "sub", name: "Grafika", parentId: "u", sortOrder: 2 });
const c = person({ id: "c", name: "Ondřej", parentId: "sub", sortOrder: 1 });
const root2 = person({ id: "r2", name: "Druhý kořen", sortOrder: 2 });
const orphan = person({ id: "o", name: "Sirotek", parentId: "missing", sortOrder: 3 });
const nodes = [boss, u, a, b, sub, c, root2, orphan];

describe("tree", () => {
  it("roots (incl. dangling parents) and children sorted", () => {
    expect(rootsOf(nodes).map((n) => n.id)).toEqual(["boss", "r2", "o"]);
    expect(childrenOf(nodes, "boss").map((n) => n.id)).toEqual(["a", "u"]);
    expect(childrenOf(nodes, null).map((n) => n.id)).toEqual(["boss", "r2", "o"]);
  });

  it("descendants (incl. self)", () => {
    expect([...descendantsOf(nodes, "u")].sort()).toEqual(["b", "c", "sub", "u"]);
  });

  it("people count counts persons only", () => {
    expect(peopleCount(nodes, "u")).toBe(2);
    expect(peopleCount(nodes, "boss")).toBe(3);
    expect(peopleCount(nodes, "c")).toBe(0);
  });

  it("unit task count only when the name matches a category or group", () => {
    const tasks = [
      task({ category: "Dorost U19", columnId: "c1" }),
      task({ category: "Školička", columnId: "c2" }),
      task({ category: "Školička", columnId: "c5" }),
      task({ category: "Muži A", columnId: "c1" }),
    ];
    expect(unitTaskCount("Mládež", tasks, "c5", CATS)).toBe(2);
    expect(unitTaskCount("Muži A", tasks, "c5", CATS)).toBe(1);
    expect(unitTaskCount("Web", tasks, "c5", CATS)).toBe(0);
    expect(unitTaskCount("Grafika", tasks, "c5", CATS)).toBeNull();
  });

  it("person stats exclude the last column; assigned counts all", () => {
    const tasks = [
      task({ ownerId: "a", leadId: "boss", columnId: "c1" }),
      task({ ownerId: "a", leadId: "a", columnId: "c2" }),
      task({ ownerId: "a", columnId: "c5" }),
    ];
    expect(personStats("a", tasks, "c5")).toEqual({ act: 2, lead: 1 });
    expect(personStats("boss", tasks, "c5")).toEqual({ act: 0, lead: 1 });
    expect(assignedTaskCount("a", tasks)).toBe(3);
  });

  it("parent options exclude self and descendants", () => {
    const opts = parentOptions(nodes, "u");
    expect(opts.units.map((n) => n.id)).toEqual([]);
    expect(opts.persons.map((n) => n.id).sort()).toEqual(["a", "boss", "o", "r2"]);
    expect(parentOptions(nodes, null).units.map((n) => n.id).sort()).toEqual(["sub", "u"]);
  });

  it("colors", () => {
    const persons = personsInOrder(nodes);
    expect(colorOf(nodes, persons[0].id)).toBe(AVC[0]);
    expect(colorOf(nodes, persons[2].id)).toBe(AVC[2]);
    expect(colorOf([person({ id: "x", avatarColor: "#1f8a4c" })], "x")).toBe("#1f8a4c");
    expect(isLightColor("#C4C8CE")).toBe(true);
    expect(isLightColor("#4fbde4")).toBe(true); // white text would be 2.2:1
    expect(isLightColor("#D98A00")).toBe(true); // 2.8:1
    expect(isLightColor("#0099cf")).toBe(true); // white 3.25:1, navy 4.74:1
    expect(isLightColor("#00588e")).toBe(false);
    expect(isLightColor(null)).toBe(false);
  });

  it("inkOn: every palette colour gets text with ≥ 4.5:1", () => {
    for (const c of [...AVC, ...AVPAL]) {
      const { background, ink } = inkOn(c);
      const fg = ink === "#fff" ? "#ffffff" : "#1b2341";
      expect(contrastRatio(background, fg), c).toBeGreaterThanOrEqual(4.5);
    }
    // the palette green: neither white (4.38) nor navy (3.5) passes → slightly deeper background, white text
    const g = inkOn("#1f8a4c");
    expect(g.ink).toBe("#fff");
    expect(g.background).not.toBe("#1f8a4c");
    expect(inkOn("#4fbde4")).toEqual({ background: "#4fbde4", ink: "var(--fm-navy)" });
    expect(inkOn("var(--fm-blue)")).toEqual({ background: "var(--fm-blue)", ink: "#fff" });
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });

  it("buildTree nests and survives cycles in data", () => {
    const t = buildTree(nodes);
    expect(t.map((x) => x.node.id)).toEqual(["boss", "r2", "o"]);
    expect(t[0].children.map((x) => x.node.id)).toEqual(["a", "u"]);
    expect(t[0].children[1].children[1].children[0].node.id).toBe("c");
    const cyc = [person({ id: "x", parentId: "y" }), person({ id: "y", parentId: "x" })];
    expect(buildTree(cyc)).toEqual([]);
  });

  it("Czech colour names for every palette colour", () => {
    for (const c of [...AVC, ...AVPAL, ...BUDGET_COLORS.map((b) => b.color)]) expect(colorName(c)).not.toMatch(/^#/);
    expect(colorName("#C62F28")).toBe("Červená");
    expect(colorName("#4fbde4")).toBe("Světle modrá");
    expect(colorName("var(--fm-blue)")).toBe("Modrá");
    expect(colorName("green")).toBe("Zelená");
    expect(colorName("#123456")).toBe("#123456");
    expect(colorName(null)).toBe("");
  });
});
