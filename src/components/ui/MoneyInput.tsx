"use client";
/**
 * Whole-number amount field with a unit adornment inside the border.
 *
 *   <MoneyInput id="fPrice" value={price} onChange={setPrice} suffix="Kč" />
 *
 * Markup: `.fm-money > input#id[inputmode=numeric] + span.fm-money__sfx[aria-hidden]`. Keeps its own text while
 * focused and reports `parseDigits(text)` (number | null) on every keystroke; on blur the text is reformatted
 * with NBSP thousands („4 500"). While not focused it always mirrors the prop (realtime updates).
 */
import { useState, type FocusEvent } from "react";
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

export function formatAmount(n: number | null | undefined, zeroAsEmpty = false): string {
  if (n === null || n === undefined) return "";
  if (zeroAsEmpty && n === 0) return "";
  return nf(n);
}

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
  const shown = draft ?? formatAmount(value, zeroAsEmpty);

  return (
    <div
      className={
        "fm-money" + (compact ? " fm-money--compact" : "") + (suffix ? " has-sfx" : "") + (invalid ? " is-invalid" : "") + (className ? " " + className : "")
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
        onFocus={(e: FocusEvent<HTMLInputElement>) => {
          setDraft(e.currentTarget.value);
          onFocus?.();
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(parseDigits(e.target.value));
        }}
        onBlur={(e) => {
          const n = parseDigits(e.currentTarget.value);
          if (n !== value) onChange(n);
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
