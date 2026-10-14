"use client";
/** Nadřízený / Zařazení select (prototype `bossOpts`): empty option, then optgroups Kategorie and Členové (omitted when empty). */
import type { OrgNode } from "@/lib/types";

export function ParentSelect({
  id,
  value,
  onChange,
  emptyLabel,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  emptyLabel: string;
  options: { units: OrgNode[]; persons: OrgNode[] };
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{emptyLabel}</option>
      {options.units.length > 0 && (
        <optgroup label="Kategorie">
          {options.units.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </optgroup>
      )}
      {options.persons.length > 0 && (
        <optgroup label="Členové">
          {options.persons.map((n) => (
            <option key={n.id} value={n.id}>
              {n.name}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
