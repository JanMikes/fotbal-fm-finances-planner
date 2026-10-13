"use client";
/**
 * Filter bar shell shared by the Úkoly and Tiskoviny boards (prototype `.bar > .sub`):
 *   section.bar.fbar#id[aria-label] > .sub > [search] + button.fbar-toggle „Filtry (n)" + .fbar-panel#{id}-panel > [filters] + [after]
 * ≥ 761 px everything sits on one row (the panel is `display: contents`); ≤ 760 px only the search and the
 * „Filtry" toggle are shown and the toggle reveals the panel (aria-expanded / aria-controls). Actions that are not
 * filters (Typy médií, Roční přehled) go into `after`, so they stay visible on phones.
 */
import { useState, type ReactNode } from "react";

export function FilterBar({
  id,
  label,
  search,
  active,
  children,
  after,
}: {
  id: string;
  /** Accessible name of the bar's region landmark. */
  label: string;
  search: ReactNode;
  active: number;
  children: ReactNode;
  after?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = `${id}-panel`;
  return (
    <section className="bar fbar" id={id} aria-label={label}>
      <div className="sub">
        {search}
        <button
          className={"btn outline fbar-toggle" + (active ? " has-active" : "")}
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
        >
          Filtry{active ? ` (${active})` : ""}
        </button>
        <div className={"fbar-panel" + (open ? " is-open" : "")} id={panelId}>
          {children}
        </div>
        {after}
      </div>
    </section>
  );
}
