"use client";
/**
 * Whole-number amount field with a unit adornment inside the border.
 *
 *   <MoneyInput id="fPrice" value={price} onChange={setPrice} suffix="Kč" />
 *
 * Markup: `.fm-money > input#id[inputmode=numeric] + span.fm-money__sfx[aria-hidden]`. Mirrors the prop (realtime
 * updates) until the user types; from the first keystroke it keeps its own text (letters are dropped as you type)
 * and reports `parseDigits(text)` (number | null) on every keystroke; on blur the text is reformatted with NBSP
 * thousands („4 500"). Focus / blur without typing never calls `onChange`, so tabbing through a field cannot write
 * a stale value back over someone else's change.
 */
import { useRef, useState } from "react";
import { nf, parseDigits } from "@/lib/format";

export interface MoneyInputProps {
  id: string;
  value: number | null;
  onChange: (n: number | null) => void;
  /** "Kč" | "ks" | … (visual only; put the unit into the label for screen readers if it matters). */
  suffix?: string;
  /** 0 shows as empty with placeholder „0" (budget box). */
  zeroAsEmpty?: boolean;
  placeholder?: string;
  /** 40px control. */
  compact?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

function formatAmount(n: number | null | undefined, zeroAsEmpty: boolean): string {
  if (n === null || n === undefined) return "";
  if (zeroAsEmpty && n === 0) return "";
  return nf(n);
}

/** Keeps digits, spaces and a decimal separator (parseDigits drops a trailing „,50"); everything else is dropped. */
const cleanAmount = (text: string) => text.replace(/[^\d\s\u00a0\u202f.,]/g, "");

export function MoneyInput({
  id,
  value,
  onChange,
  suffix,
  zeroAsEmpty = false,
  placeholder,
  compact = false,
  disabled = false,
  invalid = false,
  onBlur,
  onFocus,
  "aria-label": ariaLabel,
  "aria-describedby": describedBy,
  className,
}: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  /** The user typed since focusing (only then does blur report the value). */
  const dirty = useRef(false);
  const shown = draft ?? formatAmount(value, zeroAsEmpty);

  return (
    <div
      className={
        "fm-money" + (compact ? " fm-money--compact" : "") + (suffix ? " has-sfx" : "") + (className ? " " + className : "")
      }
    >
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        className="fm-money__input"
        value={shown}
        placeholder={placeholder ?? (zeroAsEmpty ? "0" : undefined)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-describedby={describedBy}
        onFocus={() => {
          dirty.current = false;
          onFocus?.();
        }}
        onChange={(e) => {
          const text = cleanAmount(e.target.value);
          dirty.current = true;
          setDraft(text);
          onChange(parseDigits(text));
        }}
        onBlur={() => {
          if (dirty.current && draft !== null) {
            const n = parseDigits(draft);
            if (n !== value) onChange(n);
          }
          dirty.current = false;
          setDraft(null);
          onBlur?.();
        }}
      />
      {suffix ? (
        <span className="fm-money__sfx" aria-hidden="true">
          {suffix}
        </span>
      ) : null}
    </div>
  );
}
