/**
 * Ordering via numeric `sort_order`: insert at the midpoint between neighbours; renumber the whole sibling
 * group (1..n) when the gap gets smaller than MIN_GAP. Shared by the server (authoritative) and the client
 * (optimistic updates) so both compute identical results.
 */
export const MIN_GAP = 1e-6;

export interface Sortable {
  id: string;
  sortOrder: number;
}

export interface InsertPosition {
  /** Place directly before this sibling. */
  beforeId?: string | null;
  /** Place directly after this sibling (ignored when beforeId is set). */
  afterId?: string | null;
}

export interface InsertPlan {
  /** New sort order of the moved/inserted item. */
  sortOrder: number;
  /** Every row whose sort order must change (always includes the moved item). */
  updates: Sortable[];
  renumbered: boolean;
}

/** Sort order between two neighbours (null = no neighbour on that side). */
export function between(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return 1;
  if (prev === null) return next! - 1;
  if (next === null) return prev + 1;
  return (prev + next) / 2;
}

/**
 * Plan inserting `movedId` into `siblings` (any order; the moved item itself is ignored if present).
 * Unknown before/after ids fall back to appending at the end.
 */
export function planInsert(siblings: readonly Sortable[], movedId: string, pos: InsertPosition = {}): InsertPlan {
  const list = siblings.filter((s) => s.id !== movedId).sort((a, b) => a.sortOrder - b.sortOrder);
  let index = list.length; // append
  if (pos.beforeId) {
    const i = list.findIndex((s) => s.id === pos.beforeId);
    if (i >= 0) index = i;
  } else if (pos.afterId) {
    const i = list.findIndex((s) => s.id === pos.afterId);
    if (i >= 0) index = i + 1;
  }
  const prev = index > 0 ? list[index - 1].sortOrder : null;
  const next = index < list.length ? list[index].sortOrder : null;
  const candidate = between(prev, next);
  const gapOk =
    Number.isFinite(candidate) &&
    (prev === null || candidate - prev >= MIN_GAP) &&
    (next === null || next - candidate >= MIN_GAP);
  if (gapOk) return { sortOrder: candidate, updates: [{ id: movedId, sortOrder: candidate }], renumbered: false };

  const ordered = [...list.slice(0, index).map((s) => s.id), movedId, ...list.slice(index).map((s) => s.id)];
  const updates = ordered.map((id, k) => ({ id, sortOrder: k + 1 }));
  return { sortOrder: index + 1, updates, renumbered: true };
}

/** Sort order for appending after the given siblings. */
export function appendOrder(siblings: readonly Sortable[]): number {
  return siblings.length ? Math.max(...siblings.map((s) => s.sortOrder)) + 1 : 1;
}
