"use client";
/**
 * Czech month field („Říjen 2026"), value "YYYY-MM" | "" — same pattern as DateInput.
 *
 *   <MonthInput id="cbFrom" value={ym} onChange={setYm} compact placeholder="od měsíce…" aria-label="Splátka od" />
 *
 * Typing commits only a full match with a 4-digit year („2026-10", „10/2026", „10.2026", „říjen 2026"), so a
 * half-typed month is never saved; blur/Enter also accept a bare month name (current year). Unparseable text
 * reverts with „Měsíc nerozpoznán". The popup has a year header ‹ › and a 3×4 month grid
 * (←/→ ±1, ↑/↓ ±3, Home/End row, PgUp/PgDn ±1 year, Enter/Space pick) plus „Tento měsíc" / „Vymazat".
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addMonths, capitalize, CS_MONTHS, formatMonth, parseCzMonth, toIsoDate, type IsoMonth } from "@/lib/dates";
import { Popover } from "./Popover";
import { useCoarsePointer } from "./useCoarsePointer";
import { useToday } from "./useToday";

export interface MonthInputProps {
  id: string;
  /** "YYYY-MM" | "" */
  value: string;
  onChange: (ym: string) => void;
  placeholder?: string;
  /** 40px control (filter bars, budget box). */
  compact?: boolean;
  /** Allows "" („Vymazat", emptying the text). Default true. */
  clearable?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

const ERROR_MS = 4000;

export function MonthInput({
  id,
  value,
  onChange,
  placeholder = "Vyberte měsíc",
  compact = false,
  clearable = true,
  disabled = false,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  className,
}: MonthInputProps) {
  const today = useToday();
  const coarse = useCoarsePointer();
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [err]);

  const shown = draft ?? (value ? formatMonth(value) : "");

  const onType = (text: string) => {
    setDraft(text);
    setErr(null);
    if (!text.trim()) {
      if (clearable && value) onChange("");
      return;
    }
    const ym = parseCzMonth(text, today, { requireYear: true });
    if (ym && ym !== value) onChange(ym);
  };

  const settle = () => {
    if (draft === null) return;
    if (draft.trim()) {
      const ym = parseCzMonth(draft, today);
      if (ym) {
        if (ym !== value) onChange(ym);
      } else setErr("Měsíc nerozpoznán");
    } else if (!clearable) {
      setErr("Vyberte měsíc");
    }
    setDraft(null);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) inputRef.current?.focus({ preventScroll: true });
  };

  const pick = (ym: string) => {
    if (ym !== value) onChange(ym);
    setDraft(null);
    setErr(null);
    close();
  };

  const openPicker = () => {
    if (disabled) return;
    settle();
    setOpen(true);
  };

  const errId = `${id}-err`;
  const describedby = [describedBy, err ? errId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className={"fm-month" + (compact ? " fm-month--compact" : "") + (className ? " " + className : "")}>
      <div ref={boxRef} className="fm-date__box">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="fm-date__input"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={shown}
          data-value={value}
          readOnly={coarse}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={describedby}
          onChange={(e) => onType(e.target.value)}
          onBlur={settle}
          onClick={() => {
            if (coarse) openPicker();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && e.altKey) {
              e.preventDefault();
              openPicker();
            } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              settle();
            }
          }}
        />
        <button
          type="button"
          className="fm-date__btn fm-date__btn--month"
          aria-label="Vybrat měsíc"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          tabIndex={coarse ? -1 : 0}
          onClick={() => (open ? close() : openPicker())}
        />
      </div>
      <div id={errId} className="fm-date__hint is-error" role="status">
        {err ?? ""}
      </div>
      <Popover
        anchor={boxRef}
        open={open}
        onClose={(reason) => close(reason !== "outside")}
        label="Vybrat měsíc"
        role="dialog"
        trapFocus
        className="fm-date-pop"
        maxHeight={420}
      >
        <MonthGrid
          value={value}
          current={toIsoDate(today).slice(0, 7)}
          autoFocus={!coarse}
          onPick={pick}
          onClear={
            clearable
              ? () => {
                  if (value) onChange("");
                  setDraft(null);
                  close();
                }
              : undefined
          }
        />
      </Popover>
    </div>
  );
}

function MonthGrid({
  value,
  current,
  autoFocus,
  onPick,
  onClear,
}: {
  value: string;
  current: IsoMonth;
  autoFocus: boolean;
  onPick: (ym: IsoMonth) => void;
  onClear?: () => void;
}) {
  const uid = useId();
  const [focusYm, setFocusYm] = useState<IsoMonth>(value || current);
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(autoFocus);
  const year = focusYm.slice(0, 4);

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-ym="${focusYm}"]`)?.focus({ preventScroll: true });
  }, [focusYm]);

  const go = (ym: IsoMonth, focus = true) => {
    moveFocus.current = focus;
    setFocusYm(ym);
  };

  const onKey = (e: KeyboardEvent<HTMLTableElement>) => {
    const m = Number(focusYm.slice(5)) - 1;
    const map: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -3,
      ArrowDown: 3,
      Home: -(m % 3),
      End: 2 - (m % 3),
      PageUp: -12,
      PageDown: 12,
    };
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onPick(focusYm);
      return;
    }
    if (!(e.key in map)) return;
    e.preventDefault();
    go(addMonths(focusYm, map[e.key]));
  };

  const rows = [0, 1, 2, 3].map((r) => [0, 1, 2].map((c) => `${year}-${String(r * 3 + c + 1).padStart(2, "0")}`));

  return (
    <div className="fm-cal fm-cal--months">
      <div className="fm-cal__head">
        <button type="button" className="fm-cal__nav fm-cal__nav--prev" aria-label="Předchozí rok" onClick={() => go(addMonths(focusYm, -12), false)} />
        <div className="fm-cal__title" id={`${uid}-t`} aria-live="polite">
          {year}
        </div>
        <button type="button" className="fm-cal__nav fm-cal__nav--next" aria-label="Další rok" onClick={() => go(addMonths(focusYm, 12), false)} />
      </div>
      <table ref={gridRef} className="fm-cal__grid fm-cal__grid--months" role="grid" aria-labelledby={`${uid}-t`} onKeyDown={onKey}>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((ym) => {
                const sel = ym === value;
                return (
                  <td key={ym} aria-selected={sel}>
                    <button
                      type="button"
                      data-ym={ym}
                      tabIndex={ym === focusYm ? 0 : -1}
                      aria-label={formatMonth(ym)}
                      aria-current={ym === current ? "date" : undefined}
                      className={"fm-cal__month" + (sel ? " is-selected" : "") + (ym === current ? " is-today" : "")}
                      onClick={() => onPick(ym)}
                    >
                      {capitalize(CS_MONTHS[Number(ym.slice(5)) - 1])}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="fm-cal__quick">
        <button type="button" className="fm-chip" onClick={() => onPick(current)}>
          Tento měsíc
        </button>
        {onClear ? (
          <button type="button" className="fm-chip fm-chip--ghost" disabled={!value} onClick={onClear}>
            Vymazat
          </button>
        ) : null}
      </div>
    </div>
  );
}
