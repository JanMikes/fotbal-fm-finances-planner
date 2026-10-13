/**
 * Form field wrapper in the prototype look (`.f` / `.f.w`, uppercase grey label) with hint, error and required
 * star, wired for assistive tech:
 *
 *   <Field label="Název úkolu" htmlFor="fTitle" required error={err}>
 *     <input id="fTitle" … {...fieldA11y("fTitle", { error: err, required: true })} />
 *   </Field>
 *
 * Renders `.f[.w]` > label (+ `span.req[aria-hidden]` „*") → children → `p.f-hint#{id}-hint` →
 * `p.f-err#{id}-err[role=alert]`. `group` renders `<fieldset class="f"><legend class="lbl">` for radio/checkbox sets.
 */
import type { ReactNode } from "react";

export interface FieldProps {
  label: ReactNode;
  /** id of the control (label `for`, and the base of the hint/error ids). */
  htmlFor?: string;
  required?: boolean;
  hint?: ReactNode;
  error?: string | null;
  /** Spans both columns of the modal grid. */
  wide?: boolean;
  /** fieldset + legend for radio / checkbox groups. */
  group?: boolean;
  className?: string;
  children: ReactNode;
}

/** ARIA attributes for the control inside a Field (ids match the ones Field renders). */
export function fieldA11y(
  id: string,
  o: { hint?: boolean; error?: string | null; required?: boolean } = {},
): { "aria-describedby"?: string; "aria-invalid"?: true; "aria-required"?: true } {
  const ids = [o.hint ? `${id}-hint` : null, o.error ? `${id}-err` : null].filter(Boolean).join(" ");
  return {
    ...(ids ? { "aria-describedby": ids } : {}),
    ...(o.error ? { "aria-invalid": true as const } : {}),
    ...(o.required ? { "aria-required": true as const } : {}),
  };
}

export function Field({ label, htmlFor, required = false, hint, error, wide = false, group = false, className, children }: FieldProps) {
  const cls = "f" + (wide ? " w" : "") + (group ? " f-group" : "") + (error ? " has-error" : "") + (className ? " " + className : "");
  const star = required ? (
    <span className="req" aria-hidden="true">
      {" "}*
    </span>
  ) : null;
  const base = htmlFor ?? "";
  const tail = (
    <>
      {hint ? (
        <p className="f-hint" id={base ? `${base}-hint` : undefined}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="f-err" id={base ? `${base}-err` : undefined} role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
  if (group) {
    return (
      <fieldset className={cls} aria-describedby={[hint && base ? `${base}-hint` : "", error && base ? `${base}-err` : ""].filter(Boolean).join(" ") || undefined}>
        <legend className="lbl">
          {label}
          {star}
        </legend>
        {children}
        {tail}
      </fieldset>
    );
  }
  return (
    <div className={cls}>
      <label htmlFor={htmlFor}>
        {label}
        {star}
      </label>
      {children}
      {tail}
    </div>
  );
}
