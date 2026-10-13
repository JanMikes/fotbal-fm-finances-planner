"use client";
/**
 * Transient UI state shared by the shell and the boards: which modal is open (only one at a time, like the
 * prototype's single #modalRoot) and whether the yearly print report is shown.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ModalState =
  | { kind: "task"; id: string | null; columnId?: string; seq: number }
  | { kind: "print"; id: string | null; columnId?: string; seq: number }
  | { kind: "types"; seq: number };

interface UiCtx {
  modal: ModalState | null;
  /** Open the task modal: existing task (`id`) or a new one in `columnId` (default = first column). */
  openTask: (id: string | null, columnId?: string) => void;
  openPrint: (id: string | null, columnId?: string) => void;
  openTypes: () => void;
  closeModal: () => void;
  reportOpen: boolean;
  setReportOpen: (open: boolean) => void;
}

const Ctx = createContext<UiCtx | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const seq = useRef(0);
  const next = useCallback(() => ++seq.current, []);

  const openTask = useCallback((id: string | null, columnId?: string) => setModal({ kind: "task", id, columnId, seq: next() }), [next]);
  const openPrint = useCallback((id: string | null, columnId?: string) => setModal({ kind: "print", id, columnId, seq: next() }), [next]);
  const openTypes = useCallback(() => setModal({ kind: "types", seq: next() }), [next]);
  const closeModal = useCallback(() => setModal(null), []);

  const value = useMemo(
    () => ({ modal, openTask, openPrint, openTypes, closeModal, reportOpen, setReportOpen }),
    [modal, openTask, openPrint, openTypes, closeModal, reportOpen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("UiProvider missing");
  return c;
}
