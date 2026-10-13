"use client";
/**
 * Person avatar circle (prototype `av(id, lead)`, §7.4). Unassigned / deleted person → grey „–".
 * Exposed as `role="img"` named by its title („Vedoucí: Petra Horáková"); the visible initials stay the only text
 * inside `.av` (tests read them). Light colours (`LIGHT`) get navy initials.
 */
import { ini } from "@/lib/format";
import { colorOf, isLightColor } from "@/lib/tree";
import type { OrgNode } from "@/lib/types";

export function Avatar({ nodes, id, lead = false }: { nodes: readonly OrgNode[]; id: string | null; lead?: boolean }) {
  const role = lead ? "Vedoucí" : "Zodpovědný";
  const person = id ? nodes.find((n) => n.id === id && n.kind === "person") : undefined;
  if (!person) {
    return (
      <span className={`av empty${lead ? " lead" : ""}`} title={`${role}: nepřiřazeno`} role="img" aria-label={`${role}: nepřiřazeno`}>
        –
      </span>
    );
  }
  const bg = colorOf(nodes, person.id);
  return (
    <span
      className={`av${lead ? " lead" : ""}`}
      style={{ background: bg, color: isLightColor(bg) ? "var(--fm-navy)" : "#fff" }}
      title={`${role}: ${person.name}`}
      role="img"
      aria-label={`${role}: ${person.name}`}
    >
      {ini(person.name)}
    </span>
  );
}
