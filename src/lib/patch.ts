/**
 * Partial-update helper for the edit forms: PATCH only the fields the user changed since the form opened, so a
 * concurrent edit of other fields (or a card move) by someone else is not reverted by a stale form.
 */
export function changedFields<T extends Record<string, unknown>>(next: T, initial: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(next) as Array<keyof T>) {
    if (!sameValue(next[k], initial[k])) out[k] = next[k];
  }
  return out;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}

export const isEmptyPatch = (p: object): boolean => Object.keys(p).length === 0;
