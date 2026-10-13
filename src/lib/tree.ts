/** Org tree helpers (prototype §10.4–10.11). Pure functions over the flat `OrgNode[]` list. */
import { AVC, GROUPS } from "./constants";
import { inGroup } from "./filters";
import type { OrgNode, Task } from "./types";

const bySort = (a: OrgNode, b: OrgNode) => a.sortOrder - b.sortOrder;

/** Persons in identity-select order (creation order, then id). */
export function personsInOrder(nodes: readonly OrgNode[]): OrgNode[] {
  return nodes
    .filter((n) => n.kind === "person")
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
}

/** Top-level nodes (no parent or a dangling parent), sorted. */
export function rootsOf(nodes: readonly OrgNode[]): OrgNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  return nodes.filter((n) => !n.parentId || !ids.has(n.parentId)).sort(bySort);
}

/** Direct children of `parentId` (null = top level, including dangling parents), sorted. */
export function childrenOf(nodes: readonly OrgNode[], parentId: string | null): OrgNode[] {
  if (parentId === null) return rootsOf(nodes);
  return nodes.filter((n) => n.parentId === parentId && n.id !== parentId).sort(bySort);
}

/** Self + all descendants (prototype `descOf`). */
export function descendantsOf(nodes: readonly OrgNode[], id: string): Set<string> {
  const s = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      if (n.parentId && s.has(n.parentId) && !s.has(n.id)) {
        s.add(n.id);
        grew = true;
      }
    }
  }
  return s;
}

/** Number of PERSONS in the subtree below `id` (DECISIONS #3: people, not units). */
export function peopleCount(nodes: readonly OrgNode[], id: string): number {
  const desc = descendantsOf(nodes, id);
  desc.delete(id);
  return nodes.filter((n) => desc.has(n.id) && n.kind === "person").length;
}

/** True when a unit name matches a task category or a category group. */
function unitMatchesCategory(name: string, categories: readonly string[]): boolean {
  return name in GROUPS || categories.includes(name);
}

/**
 * Open (not in the last column) tasks matching a unit name (exact category or group), or null when the name
 * does not match any category/group (DECISIONS #3: the count is only shown on a match).
 */
export function unitTaskCount(name: string, tasks: readonly Task[], lastColumnId: string | null, categories: readonly string[]): number | null {
  if (!unitMatchesCategory(name, categories)) return null;
  return tasks.filter((t) => (t.category === name || (name in GROUPS && inGroup(t.category, name))) && t.columnId !== lastColumnId).length;
}

/** Person card stats: „řeší N" (owner) and „vede N" (lead), excluding the last task column. */
export function personStats(id: string, tasks: readonly Task[], lastColumnId: string | null): { act: number; lead: number } {
  let act = 0;
  let lead = 0;
  for (const t of tasks) {
    if (t.columnId === lastColumnId) continue;
    if (t.ownerId === id) act++;
    if (t.leadId === id) lead++;
  }
  return { act, lead };
}

/** Member form footer: `{n} přiřazených úkolů` (all columns). */
export function assignedTaskCount(id: string, tasks: readonly Task[]): number {
  return tasks.filter((t) => t.leadId === id || t.ownerId === id).length;
}

/** Nadřízený / Zařazení select options: everything except `editingId` and its descendants. */
export function parentOptions(nodes: readonly OrgNode[], editingId: string | null): { units: OrgNode[]; persons: OrgNode[] } {
  const bad = editingId ? descendantsOf(nodes, editingId) : new Set<string>();
  const ok = nodes.filter((n) => !bad.has(n.id));
  return {
    units: ok.filter((n) => n.kind === "unit").sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    persons: personsInOrder(ok),
  };
}

/** Avatar colour: explicit colour or AVC fallback by person order (prototype `colorOf`). */
export function colorOf(nodes: readonly OrgNode[], id: string | null | undefined): string {
  const persons = personsInOrder(nodes);
  const node = persons.find((p) => p.id === id);
  if (node?.avatarColor) return node.avatarColor;
  const idx = Math.max(0, persons.findIndex((p) => p.id === id));
  return AVC[idx % AVC.length];
}

const NAVY = "#1b2341";
const AA = 4.5;

function rgbOf(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two hex colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const x = rgbOf(a);
  const y = rgbOf(b);
  if (!x || !y) return 1;
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text colour for a filled colour (avatars, swatch ✓): white when it reaches 4.5:1, else navy when navy does, else
 * white on a slightly deepened background (`background` differs from the input only then — e.g. the palette green
 * #1f8a4c, where white is 4.38:1 and navy 3.5:1). Unknown values (CSS variables) keep white.
 */
export function inkOn(color: string | null | undefined): { background: string; ink: string } {
  const bg = color ?? "";
  const rgb = rgbOf(bg);
  if (!rgb || contrastRatio(bg, "#ffffff") >= AA) return { background: bg, ink: "#fff" };
  if (contrastRatio(bg, NAVY) >= AA) return { background: bg, ink: "var(--fm-navy)" };
  let [r, g, b] = rgb;
  let deep = bg;
  for (let i = 0; i < 20 && contrastRatio(deep, "#ffffff") < AA; i++) {
    [r, g, b] = [r, g, b].map((v) => Math.round(v * 0.96)) as [number, number, number];
    deep = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  }
  return { background: deep, ink: "#fff" };
}

/** Colour needs dark (navy) text (white would be below 4.5:1 and navy reaches it). */
export function isLightColor(color: string | null | undefined): boolean {
  return inkOn(color).ink !== "#fff";
}

/** Nested tree for rendering. */
export interface TreeNode {
  node: OrgNode;
  children: TreeNode[];
}

export function buildTree(nodes: readonly OrgNode[]): TreeNode[] {
  const build = (n: OrgNode, seen: Set<string>): TreeNode => {
    seen.add(n.id);
    return { node: n, children: childrenOf(nodes, n.id).filter((c) => !seen.has(c.id)).map((c) => build(c, seen)) };
  };
  const seen = new Set<string>();
  return rootsOf(nodes).map((r) => build(r, seen));
}
