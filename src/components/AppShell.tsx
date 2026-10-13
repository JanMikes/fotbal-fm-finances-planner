"use client";
/**
 * App shell (prototype §2): `.app` (header + active tab) and its sibling `#modalRoot` (modals + yearly report, kept
 * outside `.app` so the print stylesheet `body>.app{display:none}` prints only the report).
 */
import { PrintModal } from "@/features/print/PrintModal";
import { PrintTab } from "@/features/print/PrintTab";
import { PrintTypesModal } from "@/features/print/PrintTypesModal";
import { PrintReport } from "@/features/print-report/PrintReport";
import { TaskModal } from "@/features/tasks/TaskModal";
import { TasksTab } from "@/features/tasks/TasksTab";
import { TeamTab } from "@/features/team/TeamTab";
import { useState } from "react";
import { StoreGate, StoreProvider, usePrefs, useStore } from "@/lib/store/react";
import { Header } from "./Header";
import { Button } from "./ui";
import { StatusLayer } from "./StatusLayer";
import { UiProvider, useUi } from "./UiContext";

export function AppShell() {
  return (
    <StoreProvider>
      <UiProvider>
        <div className="app">
          <Header />
          <StoreGate loading={<LoadingSkeleton />} error={(msg) => <LoadErrorCard message={msg} />}>
            <MainView />
          </StoreGate>
        </div>
        <div id="modalRoot">
          <StoreGate loading={null} error={() => null}>
            <ReportHost />
            <ModalHost />
          </StoreGate>
        </div>
        <StatusLayer />
      </UiProvider>
    </StoreProvider>
  );
}

function MainView() {
  const [prefs] = usePrefs();
  const { reportOpen } = useUi();
  if (prefs.view === "org") return <TeamTab />;
  if (prefs.view === "print") return reportOpen ? null : <PrintTab />;
  return <TasksTab />;
}

function ReportHost() {
  const [prefs] = usePrefs();
  const { reportOpen, setReportOpen } = useUi();
  if (!reportOpen || prefs.view !== "print") return null;
  return (
    <div className="report-host">
      <PrintReport onBack={() => setReportOpen(false)} />
    </div>
  );
}

function ModalHost() {
  const { modal, closeModal, openTask, openPrint } = useUi();
  if (!modal) return null;
  const key = `${modal.kind}:${modal.seq}`;
  switch (modal.kind) {
    case "task":
      return <TaskModal key={key} id={modal.id} columnId={modal.columnId} onClose={closeModal} onOpenTask={(id) => openTask(id)} />;
    case "print":
      return <PrintModal key={key} id={modal.id} columnId={modal.columnId} onClose={closeModal} onOpenItem={(id) => openPrint(id)} />;
    case "types":
      return <PrintTypesModal key={key} onClose={closeModal} />;
  }
}

/** First load: a skeleton of the active view (filter bar + columns, or the org chart). */
function LoadingSkeleton() {
  const [prefs] = usePrefs();
  const org = prefs.view === "org";
  return (
    <div className={`app-skel${org ? " app-skel--org" : ""}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Načítám data…</span>
      {org ? (
        <div className="app-skel__org" aria-hidden="true">
          <i className="app-skel__node app-skel__node--root" />
          <div className="app-skel__row">
            <i className="app-skel__node" />
            <i className="app-skel__node" />
            <i className="app-skel__node" />
          </div>
        </div>
      ) : (
        <>
          <div className="app-skel__bar" aria-hidden="true">
            <i className="app-skel__ctl app-skel__ctl--search" />
            <i className="app-skel__ctl" />
            <i className="app-skel__ctl app-skel__ctl--2" />
          </div>
          <div className="app-skel__board" aria-hidden="true">
            {[3, 2, 1, 2].map((n, c) => (
              <div className="app-skel__col" key={c}>
                <i className="app-skel__head" />
                {Array.from({ length: n }, (_, k) => (
                  <i className="app-skel__card" key={k} />
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Failed first load: a centred card with the reason and „Zkusit znovu" (the store also retries with backoff). */
function LoadErrorCard({ message }: { message: string }) {
  const store = useStore();
  const [busy, setBusy] = useState(false);
  const retry = () => {
    if (busy) return;
    setBusy(true);
    void store.load().finally(() => setBusy(false));
  };
  return (
    <div className="app-err">
      <div className="app-err__card" role="alert">
        <span className="app-err__ic" aria-hidden="true" />
        <h2 className="app-err__t">Nepodařilo se načíst data.</h2>
        {message ? <p className="app-err__msg">{message}</p> : null}
        <p className="app-err__hint">Zkoušíme to automaticky znovu. Pokud potíže trvají, zkontrolujte připojení k internetu.</p>
        {/* aria-busy only (not disabled), so keyboard focus stays on the button while retrying */}
        <Button variant="primary" aria-busy={busy || undefined} onClick={retry}>
          Zkusit znovu
        </Button>
      </div>
    </div>
  );
}
