"use client";
/**
 * Czech date field: a text input that understands typed Czech dates (`parseCzDate`) plus a calendar button.
 *
 *   <label htmlFor="fDue">Termín</label>
 *   <DateInput id="fDue" value={iso} onChange={setIso} />
 *
 * Markup: `.fm-date > .fm-date__box > input#id[data-value] + button.fm-date__btn`, then a muted relative hint
 * („za 5 dní") linked via aria-describedby. Every change that parses commits immediately (`onChange(iso)`), empty
 * commits "". On blur the text is normalised („út 3. 11. 2026"); unparseable text reverts and says
 * „Datum nerozpoznáno" for 4 s. Alt+↓ opens the calendar. Coarse pointer: read-only input, a tap opens a bottom
 * sheet with a „Napsat datum" field, the calendar and quick picks.
 */
import { useEffect, useId, useRef, useState } from "react";
import { diffDays, formatDateInput, formatRelativeDay, parseCzDate, type IsoDate } from "@/lib/dates";
import { Calendar } from "./Calendar";
import { Popover } from "./Popover";
import { useCoarsePointer } from "./useCoarsePointer";
import { useToday } from "./useToday";

export interface DateInputProps {
  id: string;
  /** "YYYY-MM-DD" | "" */
  value: string;
  onChange: (iso: string) => void;
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

const ERROR_MS = 4000;
const REL_MAX_DAYS = 90;

export function DateInput({
  id,
  value,
  onChange,
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
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sheetFieldRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [sheetDraft, setSheetDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!err) return;
    const t = setTimeout(() => setErr(null), ERROR_MS);
    return () => clearTimeout(t);
  }, [err]);

  const inRange = (iso: IsoDate) => (!min || iso >= min) && (!max || iso <= max);
  const parse = (text: string): IsoDate | null => {
    const iso = parseCzDate(text, today);
    return iso && inRange(iso) ? iso : null;
  };

  const shown = draft ?? (value ? formatDateInput(value, { weekday: true }) : "");

  const onType = (text: string) => {
    setDraft(text);
    setErr(null);
    if (!text.trim()) {
      if (value) onChange("");
      return;
    }
    const iso = parse(text);
    if (iso && iso !== value) onChange(iso);
  };

  const settle = () => {
    if (draft === null) return;
    if (draft.trim() && !parse(draft)) setErr("Datum nerozpoznáno");
    setDraft(null);
  };

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) inputRef.current?.focus({ preventScroll: true });
  };

  const pick = (iso: string) => {
    if (iso !== value) onChange(iso);
    setDraft(null);
    setErr(null);
    close();
  };

  const openCalendar = () => {
    if (disabled) return;
    settle();
    setSheetDraft("");
    setOpen(true);
  };

  const diff = value ? diffDays(value, today) : 0;
  const rel = showRelative && value && Math.abs(diff) <= REL_MAX_DAYS ? formatRelativeDay(value, today) : "";
  const hintId = `${id}-rel`;
  const describedby = [describedBy, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={"fm-date" + (className ? " " + className : "")}>
      <div ref={boxRef} className={"fm-date__box" + (invalid ? " is-invalid" : "")}>
        <input
          ref={inputRef}
          id={id}
          type="text"
          className="fm-date__input"
          autoComplete="off"
          spellCheck={false}
          inputMode={coarse ? "none" : "text"}
          placeholder={placeholder}
          value={shown}
          data-value={value}
          readOnly={coarse}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={describedby}
          onChange={(e) => onType(e.target.value)}
          onBlur={settle}
          onClick={() => {
            if (coarse) openCalendar();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown" && e.altKey) {
              e.preventDefault();
              openCalendar();
            } else if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
              settle();
            }
          }}
        />
        <button
          type="button"
          className="fm-date__btn"
          aria-label="Vybrat datum"
          aria-haspopup="dialog"
          aria-expanded={open}
          disabled={disabled}
          tabIndex={coarse ? -1 : 0}
          onClick={() => (open ? close() : openCalendar())}
        />
      </div>
      <div id={hintId} className={"fm-date__hint" + (err ? " is-error" : "")} aria-live="polite">
        {err ?? rel}
      </div>
      <Popover
        anchor={boxRef}
        open={open}
        onClose={(reason) => close(reason !== "outside")}
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
              ref={sheetFieldRef}
              id={`${uid}-type`}
              type="text"
              autoComplete="off"
              placeholder={placeholder}
              value={sheetDraft}
              onChange={(e) => {
                setSheetDraft(e.target.value);
                const iso = parse(e.target.value);
                if (iso && iso !== value) onChange(iso);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  close();
                }
              }}
            />
          </div>
        ) : null}
        <Calendar
          value={value}
          today={today}
          min={min}
          max={max}
          autoFocus={!coarse}
          onPick={pick}
          onClear={() => {
            if (value) onChange("");
            setDraft(null);
            close();
          }}
        />
      </Popover>
    </div>
  );
}
