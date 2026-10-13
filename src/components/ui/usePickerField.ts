"use client";
/**
 * Shared text-field logic of DateInput and MonthInput: a typed draft over a committed string value ("" = empty),
 * a popup picker, and the error message.
 *
 * Commit rules (no half-typed value is ever committed):
 *  - while typing, only text that `parseLive` accepts (unambiguous, complete input) is committed; emptying the text
 *    commits "" when `clearable`;
 *  - blur / Enter / Ctrl+Enter commit what `parseCommit` accepts (lenient: 2-digit year, implicit year, „+3" …);
 *  - unparseable text never leaves a different value committed silently. With `onValidityChange` (forms that can
 *    block their save) the text stays, the field is marked invalid and the error stays until the text is fixed;
 *    otherwise the text reverts to the last valid value and the error shows for 4 s;
 *  - Ctrl/Cmd+Enter settles the draft synchronously (`flushSync`) before the modal's submit handler runs, and blocks
 *    that submit (`preventDefault`, see the Escape contract in layers.ts) while the text is invalid.
 */
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { flushSync } from "react-dom";

const ERROR_MS = 4000;

export interface PickerFieldOptions {
  value: string;
  onChange: (v: string) => void;
  /** Display text of a committed value. */
  format: (v: string) => string;
  /** Strict parse used while typing (null = not complete yet). */
  parseLive: (text: string) => string | null;
  /** Lenient parse used on blur / Enter. */
  parseCommit: (text: string) => string | null;
  clearable: boolean;
  disabled: boolean;
  /** „Datum nerozpoznáno" */
  invalidText: string;
  /** Message when a non-clearable field is emptied. */
  requiredText?: string;
  onValidityChange?: (valid: boolean) => void;
  /** The text input (focus returns there when the picker closes). */
  inputRef: RefObject<HTMLInputElement | null>;
}

export function usePickerField(o: PickerFieldOptions) {
  const { value, onChange, format, parseLive, parseCommit, clearable, disabled, invalidText, requiredText, onValidityChange, inputRef } = o;
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  /** `sticky` = invalid text kept in the field (stays until edited); otherwise it disappears after 4 s. */
  const [err, setErr] = useState<{ text: string; sticky: boolean } | null>(null);
  const validRef = useRef(true);
  const keepInvalid = !!onValidityChange;

  useEffect(() => {
    if (!err || err.sticky) return;
    const t = setTimeout(() => setErr(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [err]);

  const setValid = (valid: boolean) => {
    if (validRef.current === valid) return;
    validRef.current = valid;
    onValidityChange?.(valid);
  };

  const commit = (v: string) => {
    if (v !== value) onChange(v);
  };

  // editing hides the message; validity is re-evaluated by settle() (blur / Enter / Ctrl+Enter) before any save
  const onType = (text: string) => {
    setDraft(text);
    setErr(null);
    if (!text.trim()) {
      if (clearable) {
        commit("");
        setValid(true);
      }
      return;
    }
    const v = parseLive(text);
    if (v) {
      commit(v);
      setValid(true);
    }
  };

  /** Commits / rejects the draft. Returns false when the text was not accepted. */
  const settle = (): boolean => {
    if (draft === null) return validRef.current;
    const text = draft.trim();
    if (!text) {
      setDraft(null);
      if (clearable) {
        commit("");
        setErr(null);
        setValid(true);
        return true;
      }
      setErr({ text: requiredText ?? invalidText, sticky: false });
      return false;
    }
    const v = parseCommit(text);
    if (v) {
      commit(v);
      setDraft(null);
      setErr(null);
      setValid(true);
      return true;
    }
    if (keepInvalid) {
      setErr({ text: invalidText, sticky: true });
      setValid(false);
    } else {
      setDraft(null);
      setErr({ text: invalidText, sticky: false });
    }
    return false;
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) inputRef.current?.focus({ preventScroll: true });
  };

  const pick = (v: string) => {
    commit(v);
    setDraft(null);
    setErr(null);
    setValid(true);
    close();
  };

  const openPicker = () => {
    if (disabled) return;
    settle();
    setOpen(true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && e.altKey) {
      e.preventDefault();
      openPicker();
    } else if (e.key === "Enter") {
      if (e.ctrlKey || e.metaKey) {
        // the modal submits from a window listener after this handler: commit first, block on invalid text
        let ok = true;
        flushSync(() => {
          ok = settle();
        });
        if (!ok) e.preventDefault();
      } else {
        settle();
      }
    }
  };

  return {
    open,
    setOpen,
    shown: draft ?? (value ? format(value) : ""),
    error: err?.text ?? null,
    textInvalid: !!err?.sticky,
    onType,
    settle,
    close,
    pick,
    openPicker,
    onKeyDown,
  };
}
