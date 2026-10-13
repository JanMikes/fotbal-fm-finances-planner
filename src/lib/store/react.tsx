"use client";
/**
 * React bindings: <StoreProvider> loads /api/state, connects realtime and exposes:
 *   useStoreSnapshot()  { state, status, error, online, pending }
 *   useAppState()       AppState (throws if used before load — render inside <StoreGate>)
 *   useActions()        mutations (see actions.ts)
 *   usePrefs()          [prefs, updatePrefs] — per-browser UI prefs incl. effective identity `me`
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { prefsStore, resolveMe, resolvePrFilter, type UiPrefs } from "../prefs";
import type { AppState } from "../types";
import { createActions, type Actions } from "./actions";
import { connectRealtime } from "./realtime";
import { AppStore, type StoreSnapshot } from "./store";

interface Ctx {
  store: AppStore;
  actions: Actions;
  prefs: UiPrefs;
  updatePrefs: (patch: Partial<UiPrefs>) => void;
}

const StoreContext = createContext<Ctx | null>(null);

export function StoreProvider({ children, store: injected, realtime = true }: { children: ReactNode; store?: AppStore; realtime?: boolean }) {
  const [store] = useState(() => injected ?? new AppStore());
  const actions = useMemo(() => createActions(store), [store]);
  // per-browser prefs from localStorage; the server render uses defaults
  const prefs = useSyncExternalStore(prefsStore.subscribe, prefsStore.getSnapshot, prefsStore.getServerSnapshot);

  useEffect(() => {
    void store.load();
    if (!realtime) return;
    return connectRealtime(store);
  }, [store, realtime]);

  const updatePrefs = useCallback((patch: Partial<UiPrefs>) => prefsStore.update(patch), []);

  const value = useMemo(() => ({ store, actions, prefs, updatePrefs }), [store, actions, prefs, updatePrefs]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useCtx(): Ctx {
  const c = useContext(StoreContext);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export function useStoreSnapshot(): StoreSnapshot {
  const { store } = useCtx();
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function useAppState(): AppState {
  const { state } = useStoreSnapshot();
  if (!state) throw new Error("useAppState() used before the state was loaded — wrap the UI in <StoreGate>.");
  return state;
}

export function useActions(): Actions {
  return useCtx().actions;
}

export function useStore(): AppStore {
  return useCtx().store;
}

/** Prefs with the effective identity / print filter resolved against the current state. */
export function usePrefs(): [UiPrefs, (patch: Partial<UiPrefs>) => void] {
  const { prefs, updatePrefs } = useCtx();
  const { state } = useStoreSnapshot();
  const effective = useMemo(
    () =>
      state
        ? { ...prefs, me: resolveMe(prefs.me, state.nodes), prFilter: resolvePrFilter(prefs.prFilter, state.printTypes) }
        : prefs,
    [prefs, state],
  );
  return [effective, updatePrefs];
}

/** Renders children only once the state is loaded; shows simple loading / error placeholders otherwise. */
export function StoreGate({ children, loading, error }: { children: ReactNode; loading?: ReactNode; error?: (msg: string) => ReactNode }) {
  const snap = useStoreSnapshot();
  if (snap.state) return <>{children}</>;
  if (snap.status === "error") return <>{error ? error(snap.error ?? "") : <div className="app-msg">Nepodařilo se načíst data. {snap.error}</div>}</>;
  return <>{loading ?? <div className="app-msg">Načítám…</div>}</>;
}
