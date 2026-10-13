"use client";
/**
 * Non-prototype, deliberately subtle status UI:
 *  - error toast for `snapshot.error` (failed mutation / load; the store already rolled back), auto-hides after 6 s;
 *  - „Offline" pill when the realtime connection has been down for > 4 s (the store refetches on reconnect);
 *  - silent refetch when the tab becomes visible again (laptop sleep, background tab).
 */
import { useEffect, useState } from "react";
import { useStore, useStoreSnapshot } from "@/lib/store/react";

export function StatusLayer() {
  const store = useStore();
  const snap = useStoreSnapshot();
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    if (!snap.error) return;
    const t = setTimeout(() => store.clearError(), 6000);
    return () => clearTimeout(t);
  }, [snap.error, store]);

  const loaded = !!snap.state;
  useEffect(() => {
    if (snap.online || !loaded) {
      const t = setTimeout(() => setOffline(false), 0);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => setOffline(true), 4000);
    return () => clearTimeout(t);
  }, [snap.online, loaded]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") store.scheduleRefetch(0);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [store]);

  return (
    <>
      {snap.error && snap.state && (
        <div className="app-toast" role="alert" onClick={() => store.clearError()}>
          {snap.error}
        </div>
      )}
      {offline && (
        <div className="app-offline" role="status" title="Spojení se serverem bylo přerušeno — změny ostatních se načtou po obnovení.">
          Offline
        </div>
      )}
    </>
  );
}
