"use client";
/**
 * Month calendar (WAI-ARIA APG date picker dialog grid): Czech month header with ‹ ›, Monday-first 6×7 grid,
 * roving tabindex. Keys: ←/→ ±1 day, ↑/↓ ±7, Home/End week start/end, PgUp/PgDn ±1 month,
 * Shift+PgUp/PgDn ±1 year, Enter/Space pick. Escape is left to the surrounding layer (Popover).
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  addDays,
  addMonthsToDate,
  CS_WEEKDAYS,
  CS_WEEKDAYS_SHORT,
  formatDateLong,
  formatMonth,
  monthGrid,
  toIsoDate,
  weekStart,
  type IsoDate,
} from "@/lib/dates";

export interface CalendarProps {
  value: IsoDate | "";
  onPick: (iso: IsoDate) => void;
  /** Shows „Vymazat" in the quick picks. */
  onClear?: () => void;
  today: Date;
  min?: IsoDate;
  max?: IsoDate;
  /** Focus the active day on mount (keyboard / dialog open). */
  autoFocus?: boolean;
  /** „Dnes", „Zítra", „Za týden" (+ „Vymazat"). Default true. */
  quickPicks?: boolean;
}

const clamp = (iso: IsoDate, min?: IsoDate, max?: IsoDate) => (min && iso < min ? min : max && iso > max ? max : iso);

export function Calendar({ value, onPick, onClear, today, min, max, autoFocus = false, quickPicks = true }: CalendarProps) {
  const uid = useId();
  const todayIso = toIsoDate(today);
  const [focusIso, setFocusIso] = useState<IsoDate>(() => clamp(value || todayIso, min, max));
  const [prevValue, setPrevValue] = useState(value);
  const gridRef = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(autoFocus);

  // follow external value changes (e.g. typed in the sheet's text field) without stealing DOM focus
  if (value !== prevValue) {
    setPrevValue(value);
    if (value) setFocusIso(clamp(value, min, max));
  }

  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`button[data-iso="${focusIso}"]`)?.focus({ preventScroll: true });
  }, [focusIso]);

  const ym = focusIso.slice(0, 7);
  const weeks = monthGrid(ym);
  const disabledDay = (iso: IsoDate) => (!!min && iso < min) || (!!max && iso > max);

  const go = (iso: IsoDate, focus = true) => {
    moveFocus.current = focus;
    setFocusIso(clamp(iso, min, max));
  };

  const onGridKey = (e: KeyboardEvent<HTMLTableElement>) => {
    let next: IsoDate | null = null;
    switch (e.key) {
      case "ArrowLeft":
        next = addDays(focusIso, -1);
        break;
      case "ArrowRight":
        next = addDays(focusIso, 1);
        break;
      case "ArrowUp":
        next = addDays(focusIso, -7);
        break;
      case "ArrowDown":
        next = addDays(focusIso, 7);
        break;
      case "Home":
        next = weekStart(focusIso);
        break;
      case "End":
        next = addDays(weekStart(focusIso), 6);
        break;
      case "PageUp":
        next = addMonthsToDate(focusIso, e.shiftKey ? -12 : -1);
        break;
      case "PageDown":
        next = addMonthsToDate(focusIso, e.shiftKey ? 12 : 1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        e.stopPropagation();
        if (!disabledDay(focusIso)) onPick(focusIso);
        return;
      default:
        return;
    }
    e.preventDefault();
    go(next);
  };

  const quick = (label: string, iso: IsoDate) => (
    <button type="button" className="fm-chip" disabled={disabledDay(iso)} onClick={() => onPick(iso)}>
      {label}
    </button>
  );

  return (
    <div className="fm-cal">
      <div className="fm-cal__head">
        <button type="button" className="fm-cal__nav fm-cal__nav--prev" aria-label="Předchozí měsíc" onClick={() => go(addMonthsToDate(focusIso, -1), false)} />
        <div className="fm-cal__title" id={`${uid}-t`} aria-live="polite">
          {formatMonth(ym)}
        </div>
        <button type="button" className="fm-cal__nav fm-cal__nav--next" aria-label="Další měsíc" onClick={() => go(addMonthsToDate(focusIso, 1), false)} />
      </div>
      <table ref={gridRef} className="fm-cal__grid" role="grid" aria-labelledby={`${uid}-t`} onKeyDown={onGridKey}>
        <thead>
          <tr>
            {CS_WEEKDAYS_SHORT.map((d, i) => (
              <th key={d} scope="col" abbr={CS_WEEKDAYS[i]}>
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((w) => (
            <tr key={w[0]}>
              {w.map((iso) => {
                const outside = iso.slice(0, 7) !== ym;
                const sel = iso === value;
                const dis = disabledDay(iso);
                return (
                  <td key={iso} aria-selected={sel}>
                    <button
                      type="button"
                      data-iso={iso}
                      tabIndex={iso === focusIso ? 0 : -1}
                      aria-label={formatDateLong(iso)}
                      aria-current={iso === todayIso ? "date" : undefined}
                      aria-disabled={dis || undefined}
                      className={"fm-cal__day" + (outside ? " is-outside" : "") + (sel ? " is-selected" : "") + (iso === todayIso ? " is-today" : "")}
                      onClick={() => {
                        if (dis) return;
                        setFocusIso(iso);
                        onPick(iso);
                      }}
                    >
                      {Number(iso.slice(8, 10))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {quickPicks ? (
        <div className="fm-cal__quick">
          {quick("Dnes", todayIso)}
          {quick("Zítra", addDays(todayIso, 1))}
          {quick("Za týden", addDays(todayIso, 7))}
          {onClear ? (
            <button type="button" className="fm-chip fm-chip--ghost" disabled={!value} onClick={onClear}>
              Vymazat
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
