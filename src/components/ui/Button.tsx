/**
 * Button on the shared `.btn` classes (prototype + ui.css variants).
 *
 *   <Button variant="primary" busy={saving} onClick={save}>Uložit</Button>
 *
 * Defaults to `type="button"`. `busy` disables the button and sets `aria-busy` (CSS spinner, label unchanged).
 * Variants: primary · secondary (navy) · outline · ghost · danger · onDark; size sm (32px) | md; `icon` = square
 * icon button (give it an aria-label); `block` = full width.
 */
import type { ComponentPropsWithRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "onDark";

export type ButtonProps = ComponentPropsWithRef<"button"> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  busy?: boolean;
  icon?: boolean;
  block?: boolean;
};

export function buttonClass({ variant = "outline", size = "md", icon = false, block = false }: Pick<ButtonProps, "variant" | "size" | "icon" | "block"> = {}): string {
  return "btn " + variant + (size === "sm" ? " sm" : "") + (icon ? " icon" : "") + (block ? " block" : "");
}

export function Button({
  variant = "outline",
  size = "md",
  busy = false,
  icon = false,
  block = false,
  className,
  type = "button",
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, icon, block }) + (className ? " " + className : "")}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {children}
    </button>
  );
}
