"use client";
/**
 * Accessible custom select — WAI-ARIA APG „select-only combobox" (+ optional filter field, groups, meta column).
 *
 *   <label htmlFor="fCat">Kategorie</label>
 *   <Select id="fCat" value={v} onChange={setV} options={[{ label: "Muži", options: [{ value: "Muži A", label: "Muži A" }] }]} />
 *
 * Trigger: `button#id.fm-select[role=combobox][data-value]` (the `<label for>` names it and opens it on click).
 * Popup: `ul#{id}-listbox[role=listbox] > li[role=option][data-value][aria-selected]`, groups as
 * `li[role=presentation] > ul[role=group]`. Fine pointer → anchored popover; coarse pointer → bottom sheet.
 * Keys: closed — Enter/Space/↑/↓/Alt+↓ open, Home/End open at first/last, a printable char opens + typeahead.
 * Open — ↑↓ Home End PgUp PgDn move, typeahead (500 ms, diacritics-insensitive, repeated char cycles), Enter
 * (Space when not searching) / Alt+↑ select, Tab selects and moves on, Esc closes only the popup.
 */
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { fold } from "@/lib/dates";
import { focusNextFrom, labelTextFor } from "./layers";
import { Popover } from "./Popover";
import { useCoarsePointer } from "./useCoarsePointer";

export type SelectOption = { value: string; label: string; meta?: string; disabled?: boolean; keywords?: string };
export type SelectGroup = { label: string; options: SelectOption[] };

export interface SelectProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<SelectOption | SelectGroup>;
  /** field: 44px form control · filter: 40px, 600 navy, min-width 180 · onDark: on the navy header */
  variant?: "field" | "filter" | "onDark";
  /** Filter field at the top of the list; "auto" (default) = on when there are ≥ 10 options. */
  searchable?: boolean | "auto";
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  /** Custom trigger content (e.g. avatar + name). */
  renderValue?: (opt: SelectOption | undefined) => ReactNode;
  /** Sheet heading / listbox name; default: aria-label or the `<label for>` text. */
  sheetTitle?: string;
}

interface Item {
  opt: SelectOption;
  /** Stable index in the full flattened list (→ option id). */
  idx: number;
  group: number;
  hay: string;
}

interface Section {
  label: string | null;
  group: number;
  items: Item[];
}

const isGroup = (o: SelectOption | SelectGroup): o is SelectGroup => "options" in o;
const AUTO_SEARCH_MIN = 10;
const TYPEAHEAD_MS = 500;
const PAGE = 10;

export function Select({
  id,
  value,
  onChange,
  options,
  variant = "field",
  searchable = "auto",
  placeholder = "",
  searchPlaceholder = "Hledat…",
  disabled = false,
  invalid = false,
  className,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledby,
  "aria-describedby": ariaDescribedby,
  renderValue,
  sheetTitle,
}: SelectProps) {
  const coarse = useCoarsePointer();
  const uid = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ s: "", t: 0 });
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(-1);
  const [heading, setHeading] = useState("");

  const listId = `${id}-listbox`;
  const optId = (idx: number) => `${id}-opt-${idx}`;

  const sections = useMemo<Section[]>(() => {
    const out: Section[] = [];
    let idx = 0;
    let loose: Section | null = null;
    options.forEach((o, gi) => {
      if (isGroup(o)) {
        loose = null;
        const glabel = o.label;
        out.push({
          label: glabel,
          group: gi,
          items: o.options.map((opt) => ({ opt, idx: idx++, group: gi, hay: fold(`${opt.label} ${opt.keywords ?? ""} ${glabel}`) })),
        });
      } else {
        if (!loose) {
          loose = { label: null, group: gi, items: [] };
          out.push(loose);
        }
        loose.items.push({ opt: o, idx: idx++, group: -1, hay: fold(`${o.label} ${o.keywords ?? ""}`) });
      }
    });
    return out;
  }, [options]);

  const all = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const isSearchable = searchable === "auto" ? all.length >= AUTO_SEARCH_MIN : searchable;
  const selected = all.find((it) => it.opt.value === value);

  const filterBy = (q: string): Section[] => {
    const words = fold(q).trim().split(/\s+/).filter(Boolean);
    if (!words.length) return sections;
    return sections
      .map((s) => ({ ...s, items: s.items.filter((it) => words.every((w) => it.hay.includes(w))) }))
      .filter((s) => s.items.length > 0);
  };
  const visibleSections = useMemo(() => filterBy(query), [sections, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const enabledOf = (secs: Section[]) => secs.flatMap((s) => s.items).filter((it) => !it.opt.disabled);
  const enabled = enabledOf(visibleSections);

  const step = (from: number, delta: number, list: Item[] = enabled): number => {
    if (!list.length) return -1;
    const pos = list.findIndex((it) => it.idx === from);
    if (pos < 0) return delta >= 0 ? list[0].idx : list[list.length - 1].idx;
    return list[Math.max(0, Math.min(list.length - 1, pos + delta))].idx;
  };

  const initialActive = (list: Item[]): number => {
    if (selected && list.some((it) => it.idx === selected.idx)) return selected.idx;
    return list[0]?.idx ?? -1;
  };

  /** Typeahead over `list`; returns the matched idx or -1. */
  const typeahead = (ch: string, list: Item[], from: number, now: number): number => {
    const buf = now - typed.current.t > TYPEAHEAD_MS ? ch : typed.current.s + ch;
    typed.current = { s: buf, t: now };
    const f = fold(buf);
    const same = f.length > 1 && [...f].every((c) => c === f[0]);
    const needle = same ? f[0] : f;
    const startPos = Math.max(0, list.findIndex((it) => it.idx === from));
    const order = needle.length === 1 ? [...list.slice(startPos + 1), ...list.slice(0, startPos + 1)] : [...list.slice(startPos), ...list.slice(0, startPos)];
    return order.find((it) => fold(it.opt.label).startsWith(needle))?.idx ?? -1;
  };

  const openList = (how: "selected" | "first" | "last", q = "") => {
    if (disabled) return;
    const list = enabledOf(filterBy(q));
    setQuery(q);
    setActive(how === "first" ? (list[0]?.idx ?? -1) : how === "last" ? (list[list.length - 1]?.idx ?? -1) : initialActive(list));
    setHeading(sheetTitle ?? ariaLabel ?? (labelTextFor(id) || placeholder));
    setOpen(true);
  };

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery("");
    typed.current = { s: "", t: 0 };
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  };

  const commit = (idx: number, refocus = true) => {
    const it = all.find((x) => x.idx === idx);
    if (it && !it.opt.disabled && it.opt.value !== value) onChange(it.opt.value);
    close(refocus);
  };

  // focus the filter field (fine pointer) once the popover is mounted
  useEffect(() => {
    if (open && isSearchable && !coarse) searchRef.current?.focus({ preventScroll: true });
  }, [open, isSearchable, coarse]);

  // keep the active option in view (centred right after opening, then minimal scrolling)
  const justOpened = useRef(false);
  useEffect(() => {
    justOpened.current = open;
  }, [open]);
  useEffect(() => {
    if (!open || active < 0) return;
    const el = document.getElementById(optId(active));
    el?.scrollIntoView?.({ block: justOpened.current ? "center" : "nearest" });
    justOpened.current = false;
  }, [open, active]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Keys while the list is open. `host`: where focus is (trigger, filter field or the sheet's listbox). */
  const onOpenKey = (e: KeyboardEvent<HTMLElement>, host: "trigger" | "search" | "list") => {
    const searching = host === "search";
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActive(step(active, 1));
        return;
      case "ArrowUp":
        e.preventDefault();
        if (e.altKey) commit(active);
        else setActive(step(active, -1));
        return;
      case "PageDown":
        e.preventDefault();
        setActive(step(active, PAGE));
        return;
      case "PageUp":
        e.preventDefault();
        setActive(step(active, -PAGE));
        return;
      case "Home":
      case "End":
        if (searching && query) return; // caret movement in the filter text
        e.preventDefault();
        setActive(e.key === "Home" ? (enabled[0]?.idx ?? -1) : (enabled[enabled.length - 1]?.idx ?? -1));
        return;
      case "Enter":
        e.preventDefault();
        e.stopPropagation();
        if (active >= 0) commit(active);
        else close(true);
        return;
      case "Escape":
        e.preventDefault();
        e.stopPropagation();
        close(true);
        return;
      case "Tab": {
        const back = e.shiftKey;
        if (active >= 0) {
          const it = all.find((x) => x.idx === active);
          if (it && !it.opt.disabled && it.opt.value !== value) onChange(it.opt.value);
        }
        if (host === "trigger") {
          close(false); // native Tab continues from the trigger
        } else {
          e.preventDefault();
          close(true);
          const t = triggerRef.current;
          if (t) focusNextFrom(t, back);
        }
        return;
      }
      case " ":
        if (searching) return;
        if (e.timeStamp - typed.current.t <= TYPEAHEAD_MS && typed.current.s) break; // part of a typeahead word
        e.preventDefault();
        if (active >= 0) commit(active);
        return;
    }
    if (!searching && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      const hit = typeahead(e.key, enabled, active, e.timeStamp);
      if (hit >= 0) setActive(hit);
    }
  };

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (open) {
      if (isSearchable && !coarse && e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        // focus is momentarily on the trigger: route the char into the filter
        e.preventDefault();
        setQuery((q) => q + e.key);
        searchRef.current?.focus();
        return;
      }
      onOpenKey(e, "trigger");
      return;
    }
    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp":
      case "Enter":
      case " ":
        e.preventDefault();
        openList("selected");
        return;
      case "Home":
        e.preventDefault();
        openList("first");
        return;
      case "End":
        e.preventDefault();
        openList("last");
        return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (isSearchable && !coarse) {
        openList("first", e.key);
        return;
      }
      const list = enabledOf(sections);
      const hit = typeahead(e.key, list, selected?.idx ?? -1, e.timeStamp);
      openList("selected");
      if (hit >= 0) setActive(hit);
    }
  };

  const onSearchChange = (q: string) => {
    setQuery(q);
    const list = enabledOf(filterBy(q));
    setActive(q ? (list[0]?.idx ?? -1) : initialActive(list));
  };

  const activeId = open && active >= 0 ? optId(active) : undefined;
  const sheet = coarse;
  const displayed = renderValue ? (
    renderValue(selected?.opt)
  ) : selected ? (
    <span className="fm-select__value">{selected.opt.label}</span>
  ) : (
    <span className="fm-select__value fm-select__ph">{placeholder}</span>
  );

  const renderOption = (it: Item) => {
    const sel = it.opt.value === value;
    return (
      <li
        key={it.idx}
        id={optId(it.idx)}
        role="option"
        data-value={it.opt.value}
        aria-selected={sel}
        aria-disabled={it.opt.disabled ? true : undefined}
        className={"fm-select__opt" + (it.idx === active ? " is-active" : "") + (sel ? " is-selected" : "")}
        onPointerDown={(e) => e.preventDefault()}
        onPointerMove={() => {
          if (!it.opt.disabled && it.idx !== active) setActive(it.idx);
        }}
        onClick={() => {
          if (!it.opt.disabled) commit(it.idx);
        }}
      >
        <span className="fm-select__check" aria-hidden="true" />
        <span className="fm-select__label">{it.opt.label}</span>
        {it.opt.meta ? <span className="fm-select__meta">{it.opt.meta}</span> : null}
      </li>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={!isSearchable && !sheet ? activeId : undefined}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledby}
        aria-describedby={ariaDescribedby}
        data-value={value}
        title={title}
        disabled={disabled}
        className={`fm-select fm-select--${variant}${className ? " " + className : ""}`}
        onClick={() => (open ? close(true) : openList("selected"))}
        onKeyDown={onTriggerKey}
      >
        {displayed}
        <span className="fm-select__chev" aria-hidden="true" />
      </button>
      <Popover
        anchor={triggerRef}
        open={open}
        onClose={(reason) => close(reason !== "outside")}
        label={heading || placeholder || "Vyberte"}
        sheet={sheet}
        matchWidth
        className={`fm-select-pop${isSearchable ? " has-search" : ""}`}
        sheetInitialFocus={listRef}
      >
        {isSearchable ? (
          <div className="fm-select__search">
            <input
              ref={searchRef}
              type="text"
              className="fm-select__search-input"
              id={`${uid}-search`}
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder.replace(/…$/, "")}
              aria-controls={listId}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              onChange={(e) => onSearchChange(e.target.value)}
              onKeyDown={(e) => onOpenKey(e, "search")}
            />
          </div>
        ) : null}
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={heading || undefined}
          aria-activedescendant={sheet ? activeId : undefined}
          tabIndex={-1}
          className="fm-select__list"
          onKeyDown={(e) => {
            if (e.target === e.currentTarget) onOpenKey(e, "list");
          }}
        >
          {visibleSections.map((s) =>
            s.label === null ? (
              s.items.map(renderOption)
            ) : (
              <li key={`g${s.group}`} role="presentation" className="fm-select__grp">
                <ul role="group" aria-labelledby={`${id}-grp-${s.group}`}>
                  <li role="presentation" id={`${id}-grp-${s.group}`} className="fm-select__kicker">
                    {s.label}
                  </li>
                  {s.items.map(renderOption)}
                </ul>
              </li>
            ),
          )}
        </ul>
        {enabled.length === 0 && visibleSections.length === 0 ? (
          <div className="fm-select__empty" role="status">
            Nic nenalezeno
          </div>
        ) : null}
      </Popover>
    </>
  );
}
