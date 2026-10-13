/**
 * Shared plumbing for layered UI (popovers, sheets, modals).
 *
 * Escape contract: a layer that handles Escape calls `e.preventDefault()` + `e.stopPropagation()`. Modal (and any
 * other window-level Esc listener) ignores events with `defaultPrevented`, so one Esc closes only the topmost layer.
 */

/** Native pointerdown events that already dismissed a popover — the modal overlay must not also close on them. */
const dismissed = new WeakSet<Event>();

export function markLayerDismiss(e: Event): void {
  dismissed.add(e);
}

export function isLayerDismiss(e: Event): boolean {
  return dismissed.has(e);
}

/** Selector of everything that can receive keyboard focus. */
const TABBABLE =
  'a[href],area[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),iframe,[tabindex],[contenteditable="true"],[contenteditable=""]';

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (typeof el.checkVisibility === "function") return el.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions);
  return el.getClientRects().length > 0;
}

/** Tabbable elements inside `root`, in DOM order (tabindex ≥ 0, visible, not inert). */
export function tabbables(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest("[inert]") && isVisible(el),
  );
}

/**
 * Moves focus to the tabbable element after (or before) `from` within `scope` (default: the open modal or the
 * document). Used when a popover portalled to <body> consumed Tab and focus must continue from its trigger.
 */
export function focusNextFrom(from: HTMLElement, backwards: boolean): void {
  const scope = (from.closest<HTMLElement>('[role="dialog"][aria-modal="true"]') ?? document.body) as HTMLElement;
  const list = tabbables(scope);
  const i = list.indexOf(from);
  if (i < 0) return;
  const next = list[i + (backwards ? -1 : 1)];
  (next ?? from).focus();
}

/** Text of the `<label for=id>` (without the required star), used as the default sheet title. */
export function labelTextFor(id: string): string {
  if (typeof document === "undefined") return "";
  const l = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`);
  if (!l) return "";
  const clone = l.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[aria-hidden='true'],.req").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}
