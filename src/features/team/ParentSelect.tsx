"use client";
/**
 * Nadřízený / Zařazení select (prototype `bossOpts`): the empty option first, then the groups „Kategorie" and
 * „Členové" (omitted when empty). The caller passes `parentOptions()`, which already excludes the edited node and
 * its descendants. Persons show their role as the right-hand meta and are searchable by it.
 */
import { Select } from "@/components/ui";
import type { OrgNode } from "@/lib/types";
import { parentSelectOptions } from "./orgText";

export function ParentSelect({
  id,
  value,
  onChange,
  emptyLabel,
  options,
  "aria-describedby": describedBy,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  emptyLabel: string;
  options: { units: OrgNode[]; persons: OrgNode[] };
  "aria-describedby"?: string;
}) {
  return <Select id={id} value={value} onChange={onChange} options={parentSelectOptions(emptyLabel, options)} aria-describedby={describedBy} />;
}
