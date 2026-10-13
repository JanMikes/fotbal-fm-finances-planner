"use client";
/** „/" focuses the board search field (unless the user is typing somewhere, or a modal / popover / report is open). */
import { useEffect } from "react";

const EDITABLE = "input,textarea,select,[contenteditable],[role=combobox],[role=textbox],[data-fm-layer]";

export function useSlashFocus(inputId: string): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest(EDITABLE)) return;
      if (document.querySelector(".ov,.report-host,[data-fm-layer]")) return;
      const el = document.getElementById(inputId);
      if (!(el instanceof HTMLInputElement) || !el.getClientRects().length) return;
      e.preventDefault();
      el.focus();
      el.select();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [inputId]);
}
