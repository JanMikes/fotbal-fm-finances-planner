"use client";
/**
 * Person avatar circle (prototype `av(id, lead)`, §7.4). Unassigned / deleted person → grey „–".
 * Exposed as `role="img"` named by its title („Vedoucí: Petra Horáková"); the visible initials stay the only text
 * inside `.av` (tests read them). The initials are white or navy, whichever reaches 4.5:1 on the colour (`inkOn`;
 * a colour where neither does is deepened slightly).
 * `label` overrides the accessible name / tooltip; `label={false}` makes it decorative (`aria-hidden`, tooltip kept) —
 * e.g. on org cards where the name is printed right next to it.
 */
import { ini } from "@/lib/format";
import { colorOf, inkOn } from "@/lib/tree";
import type { OrgNode } from "@/lib/types";

export function Avatar({
  nodes,
  id,
  lead = false,
  label,
}: {
  nodes: readonly OrgNode[];
  id: string | null;
  lead?: boolean;
  /** Accessible name + tooltip (default „Vedoucí/Zodpovědný: {name}"); `false` = decorative. */
  label?: string | false;
}) {
  const role = lead ? "Vedoucí" : "Zodpovědný";
  const person = id ? nodes.find((n) => n.id === id && n.kind === "person") : undefined;
  const name = label || `${role}: ${person ? person.name : "nepřiřazeno"}`;
  const a11y = label === false ? ({ "aria-hidden": true } as const) : ({ role: "img", "aria-label": name } as const);
  if (!person) {
    return (
      <span className={`av empty${lead ? " lead" : ""}`} title={name} {...a11y}>
        –
      </span>
    );
  }
  const { background, ink } = inkOn(colorOf(nodes, person.id));
  return (
    <span
      className={`av${lead ? " lead" : ""}`}
      style={{ background, color: ink }}
      title={name}
      {...a11y}
    >
      {ini(person.name)}
    </span>
  );
}
