"use client";
/**
 * Czech month field („Říjen 2026"), value "YYYY-MM" | "" — same pattern as DateInput (shared usePickerField).
 *
 *   <MonthInput id="cbFrom" value={ym} onChange={setYm} compact placeholder="od měsíce…" aria-label="Splátka od" />
 *
 * Typing commits only a full match with a 4-digit year („2026-10", „10/2026", „10.2026", „říjen 2026"), so a
 * half-typed month („2026-1") is never saved; blur/Enter also accept a bare month name (current year). Unparseable
 * text reverts with „Měsíc nerozpoznán" (`#{id}-msg`). The popup has a year header ‹ › and a 3×4 month grid
 * (←/→ ±1, ↑/↓ ±3, Home/End row, PgUp/PgDn ±1 year, Enter/Space pick) plus „Tento měsíc" / „Vymazat".
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { addMonths, capitalize, CS_MONTHS, formatMonth, parseCzMonth, toIsoDate, type IsoMonth } from "@/lib/dates";
import { Popover } from "./Popover";
import { useCoarsePointer } from "./useCoarsePointer";
import { usePickerField } from "./usePickerField";
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
  const f = usePickerField({
    inputRef,
    value,
    onChange,
    format: formatMonth,
    parseLive: (t) => parseCzMonth(t, today, { requireYear: true }),
    parseCommit: (t) => parseCzMonth(t, today),
    clearable,
    disabled,
    invalidText: "Měsíc nerozpoznán",
    requiredText: "Vyberte měsíc",
  });

  const msgId = `${id}-msg`;
  const describedby = [describedBy, f.error ? msgId : null].filter(Boolean).join(" ") || undefined;

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
          value={f.shown}
          data-value={value}
          readOnly={coarse}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-describedby={describedby}
          onChange={(e) => f.onType(e.target.value)}
          onBlur={() => f.settle()}
          onClick={() => {
            if (coarse) f.openPicker();
          }}
          onKeyDown={f.onKeyDown}
        />
        <button
          type="button"
          className="fm-date__btn"
          aria-label="Vybrat měsíc"
          aria-haspopup="dialog"
          aria-expanded={f.open}
          disabled={disabled}
          tabIndex={coarse ? -1 : 0}
          onClick={() => (f.open ? f.close() : f.openPicker())}
        />
      </div>
      <div id={msgId} className="fm-date__hint is-error" role="status">
        {f.error ?? ""}
      </div>
      <Popover
        anchor={boxRef}
        open={f.open}
        onClose={(reason) => f.close(reason !== "outside")}
        label="Vybrat měsíc"
        role="dialog"
        trapFocus
        className="fm-date-pop"
        maxHeight={420}
      >
        <MonthGrid value={value} current={toIsoDate(today).slice(0, 7)} autoFocus={!coarse} onPick={f.pick} onClear={clearable ? () => f.pick("") : undefined} />
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
