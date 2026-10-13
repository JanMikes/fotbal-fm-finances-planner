/** Per-browser UI preferences (prototype §13) persisted in localStorage `fotbalfm.ui.v1`. Search strings are never stored. */
import { ALL, UI_PREFS_KEY } from "./constants";
import { isValidGroupFilter, type MonthFilter } from "./filters";
import { personsInOrder } from "./tree";
import type { OrgNode, PrintType } from "./types";

export type View = "board" | "print" | "org";

export interface UiPrefs {
  /** Identity („Přihlášen") — person id. Not authentication. */
  me: string | null;
  view: View;
  /** Task group filter („Vše" or group name). */
  filter: string;
  month: MonthFilter;
  mine: boolean;
  /** Print type filter: „Vše" or a print type id. */
  prFilter: string;
  prMonth: MonthFilter;
  curBudOpen: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  me: null,
  view: "board",
  filter: ALL,
  month: "all",
  mine: false,
  prFilter: ALL,
  prMonth: "all",
  curBudOpen: false,
};

const isMonth = (v: unknown): v is MonthFilter => typeof v === "string" && (v === "all" || v === "none" || /^\d{4}-\d{2}$/.test(v));

/** Parse + validate stored prefs (unknown/invalid values fall back to defaults). */
export function parsePrefs(raw: string | null): UiPrefs {
  let o: Record<string, unknown> = {};
  try {
    o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    o = {};
  }
  return {
    me: typeof o.me === "string" ? o.me : null,
    view: o.view === "print" || o.view === "org" ? o.view : "board",
    filter: isValidGroupFilter(o.filter) ? o.filter : ALL,
    month: isMonth(o.month) ? o.month : "all",
    mine: o.mine === true,
    prFilter: typeof o.prFilter === "string" ? o.prFilter : ALL,
    prMonth: isMonth(o.prMonth) ? o.prMonth : "all",
    curBudOpen: o.curBudOpen === true,
  };
}

function loadPrefs(): UiPrefs {
  try {
    return parsePrefs(window.localStorage.getItem(UI_PREFS_KEY));
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

function savePrefs(p: UiPrefs): void {
  try {
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode / quota — prefs are a convenience only */
  }
}

/** Effective identity: stored id if it is an existing person, else the first person (prototype §19.22), else null. */
export function resolveMe(me: string | null, nodes: readonly OrgNode[]): string | null {
  const persons = personsInOrder(nodes);
  if (me && persons.some((p) => p.id === me)) return me;
  return persons[0]?.id ?? null;
}

/** Effective print type filter: „Vše" when the stored type no longer exists. */
export function resolvePrFilter(prFilter: string, types: readonly PrintType[]): string {
  return prFilter === ALL || types.some((t) => t.id === prFilter) ? prFilter : ALL;
}

// ---------------------------------------------------------------- external store (useSyncExternalStore)
let cached: UiPrefs | null = null;
const prefListeners = new Set<() => void>();

export const prefsStore = {
  subscribe(l: () => void): () => void {
    prefListeners.add(l);
    return () => prefListeners.delete(l);
  },
  getSnapshot(): UiPrefs {
    return (cached ??= loadPrefs());
  },
  getServerSnapshot(): UiPrefs {
    return DEFAULT_PREFS;
  },
  update(patch: Partial<UiPrefs>): void {
    cached = { ...prefsStore.getSnapshot(), ...patch };
    savePrefs(cached);
    for (const l of prefListeners) l();
  },
};
