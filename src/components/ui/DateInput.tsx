"use client";
/**
 * Czech date field: a text input that understands typed Czech dates (`parseCzDate`) plus a calendar button.
 *
 *   <label htmlFor="fDue">Termín</label>
 *   <DateInput id="fDue" value={iso} onChange={setIso} onValidityChange={(ok) => setDueBad(!ok)} />
 *
 * Markup: `.fm-date > .fm-date__box > input#id[data-value] + button.fm-date__btn`, then a muted hint
 * („za 5 dní", „v minulosti") linked via aria-describedby that also carries the error. Typing commits only
 * complete dates (4-digit year, ISO, „dnes"/„zítra"…; `fill("2026-11-20")` works); blur / Enter also accept „1. 2.",
 * „1.2.26", „+3" and normalise the text („út 3. 11. 2026"). Unparseable text says „Datum nerozpoznáno": with
 * `onValidityChange` the text stays and the form must block its save; without it the text reverts (see
 * usePickerField). Alt+↓ opens the calendar. Coarse pointer: read-only input, a tap opens a bottom sheet with a
 * „Napsat datum" field, the calendar and quick picks.
 */
import { useId, useRef, useState } from "react";
import { diffDays, formatDateInput, formatRelativeDay, parseCzDate, type IsoDate } from "@/lib/dates";
import { Calendar } from "./Calendar";
import { Popover } from "./Popover";
import { useCoarsePointer } from "./useCoarsePointer";
import { usePickerField } from "./usePickerField";
import { useToday } from "./useToday";

export interface DateInputProps {
  id: string;
  /** "YYYY-MM-DD" | "" */
  value: string;
  onChange: (iso: string) => void;
  /** Called when the typed text becomes invalid / valid again; the caller blocks its save while invalid. */
  onValidityChange?: (valid: boolean) => void;
  placeholder?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  invalid?: boolean;
  /** Muted relative day („za 5 dní") under the field. Default true. */
  showRelative?: boolean;
  "aria-describedby"?: string;
  className?: string;
}

const REL_MAX_DAYS = 90;
const INVALID = "Datum nerozpoznáno";

export function DateInput({
  id,
  value,
  onChange,
  onValidityChange,
  placeholder = "d. m. rrrr",
  min,
  max,
  disabled = false,
  invalid = false,
  showRelative = true,
  "aria-describedby": describedBy,
  className,
}: DateInputProps) {
  const today = useToday();
  const coarse = useCoarsePointer();
  const uid = useId();
  const [sheetDraft, setSheetDraft] = useState("");
  const [sheetErr, setSheetErr] = useState(false);

  const inRange = (iso: IsoDate | null) => (iso && (!min || iso >= min) && (!max || iso <= max) ? iso : null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const f = usePickerField({
    inputRef,
    value,
    onChange,
    format: (v) => formatDateInput(v, { weekday: true }),
    parseLive: (t) => inRange(parseCzDate(t, today, { requireYear: true })),
    parseCommit: (t) => inRange(parseCzDate(t, today)),
    clearable: true,
    disabled,
    invalidText: INVALID,
    onValidityChange,
  });

  const openCalendar = () => {
    setSheetDraft("");
    setSheetErr(false);
    f.openPicker();
  };

  const diff = value ? diffDays(value, today) : 0;
  const rel = !showRelative || !value ? "" : Math.abs(diff) <= REL_MAX_DAYS ? formatRelativeDay(value, today) : diff < 0 ? "v minulosti" : "";
  const hintId = `${id}-rel`;
  const describedby = [describedBy, hintId].filter(Boolean).join(" ") || undefined;
  const isInvalid = invalid || f.textInvalid;

  return (
    <div className={"fm-date" + (className ? " " + className : "")}>
      <div ref={boxRef} className="fm-date__box">
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="fm-date__input"
          autoComplete="off"
          spellCheck={false}
          inputMode={coarse ? "none" : "text"}
          placeholder={placeholder}
          value={f.shown}
          data-value={value}
          readOnly={coarse}
          disabled={disabled}
          aria-invalid={isInvalid || undefined}
          aria-describedby={describedby}
          onChange={(e) => f.onType(e.target.value)}
          onBlur={() => f.settle()}
          onClick={() => {
            if (coarse) openCalendar();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && e.altKey) {
              e.preventDefault();
              openCalendar();
            } else f.onKeyDown(e);
          }}
        />
        <button
          type="button"
          className="fm-date__btn"
          aria-label="Vybrat datum"
          aria-haspopup="dialog"
          aria-expanded={f.open}
          disabled={disabled}
          tabIndex={coarse ? -1 : 0}
          onClick={() => (f.open ? f.close() : openCalendar())}
        />
      </div>
      <div id={hintId} className={"fm-date__hint" + (f.error ? " is-error" : "")} aria-live="polite">
        {f.error ?? rel}
      </div>
      <Popover
        anchor={boxRef}
        open={f.open}
        onClose={(reason) => f.close(reason !== "outside")}
        label="Vybrat datum"
        role="dialog"
        trapFocus
        className="fm-date-pop"
        maxHeight={520}
      >
        {coarse ? (
          <div className="fm-sheet-field">
            <label htmlFor={`${uid}-type`}>Napsat datum</label>
            <input
              id={`${uid}-type`}
              type="text"
              autoComplete="off"
              placeholder={placeholder}
              value={sheetDraft}
              aria-invalid={sheetErr || undefined}
              aria-describedby={sheetErr ? `${uid}-err` : undefined}
              onChange={(e) => {
                setSheetDraft(e.target.value);
                setSheetErr(false);
                const iso = inRange(parseCzDate(e.target.value, today, { requireYear: true }));
                if (iso && iso !== value) onChange(iso);
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                if (!sheetDraft.trim()) return f.close();
                const iso = inRange(parseCzDate(sheetDraft, today));
                if (iso) f.pick(iso);
                else setSheetErr(true);
              }}
            />
            {sheetErr ? (
              <span id={`${uid}-err`} className="fm-date__hint is-error">
                {INVALID}
              </span>
            ) : null}
          </div>
        ) : null}
        <Calendar
          value={value}
          today={today}
          min={min}
          max={max}
          autoFocus={!coarse}
          onPick={f.pick}
          onClear={() => f.pick("")}
        />
      </Popover>
    </div>
  );
}
