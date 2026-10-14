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
import { StoreGate, StoreProvider, usePrefs } from "@/lib/store/react";
import { Header } from "./Header";
import { StatusLayer } from "./StatusLayer";
import { UiProvider, useUi } from "./UiContext";

export function AppShell() {
  return (
    <StoreProvider>
      <UiProvider>
        <div className="app">
          <Header />
          <StoreGate>
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
