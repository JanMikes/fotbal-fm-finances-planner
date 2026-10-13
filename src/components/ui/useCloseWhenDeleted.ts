"use client";
/** Edit modals: when the edited entity disappears (deleted by someone else), close the modal and say why. */
import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store/react";

export const DELETED_NOTICE = "Položka byla smazána jiným uživatelem.";

export function useCloseWhenDeleted(deleted: boolean, onClose: () => void): void {
  const store = useStore();
  const fired = useRef(false);
  useEffect(() => {
    if (!deleted || fired.current) return;
    fired.current = true;
    store.notify(DELETED_NOTICE);
    onClose();
  }, [deleted, onClose, store]);
}
