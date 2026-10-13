/** Domain constants ported 1:1 from the prototype (docs/analysis/prototype.md §4). */

export const ALL = "Vše" as const;

/** Task category groups (prototype `GROUPS`). „Celý klub" belongs to no group. */
export const GROUPS: Readonly<Record<string, readonly string[]>> = {
  Muži: ["Muži A", "Muži B"],
  Mládež: [
    "Dorost U16",
    "Dorost U17",
    "Dorost U18",
    "Dorost U19",
    "Žáci U12",
    "Žáci U13",
    "Žáci U14",
    "Žáci U15",
    "Přípravka U8",
    "Přípravka U9",
    "Přípravka U10",
    "Přípravka U11",
    "Školička",
    "Žákyně Mladší",
    "Žákyně Starší",
    "Žákyně Přípravka",
  ],
  Merch: ["Merch"],
  Aplikace: ["Aplikace"],
  Web: ["Web"],
  Ticketing: ["Ticketing"],
  Eventy: ["Eventy"],
  Foto: ["Foto"],
};

const GROUP_NAMES: readonly string[] = Object.keys(GROUPS);

/** Group filter options in display order: Vše + groups. */
export const GROUP_FILTERS: readonly string[] = [ALL, ...GROUP_NAMES];

const OTHER: readonly string[] = ["Celý klub"];

/** All task categories; CATS[0] === "Celý klub". */
export const CATS: readonly string[] = [...OTHER, ...Object.values(GROUPS).flat()];

/** Task form category <select> optgroups (prototype `catOptions`). */
export const CATEGORY_OPTGROUPS: ReadonlyArray<{ label: string; options: readonly string[] }> = [
  { label: "Muži", options: GROUPS["Muži"] },
  { label: "Mládež", options: GROUPS["Mládež"] },
  { label: "Klub a služby", options: ["Celý klub", "Merch", "Aplikace", "Web", "Ticketing", "Eventy", "Foto"] },
];

/** Member „Oblasti" (prototype `AREAS`). */
export const AREAS: readonly string[] = ["Celý klub", ...GROUP_NAMES];

/** Unit name suggestions (datalist `#uSug`). */
export const UNIT_NAME_SUGGESTIONS: readonly string[] = [
  ...new Set([...AREAS, "Sociální sítě", "Grafika", "Video", "Partneři"]),
];

/** Automatic avatar fallback colours (prototype `AVC`). */
export const AVC: readonly string[] = ["#0099cf", "#00588e", "#1b2341", "#0079ab", "#093f6b", "#4fbde4", "#63666b", "#12304f"];

/** 11 picker swatches for profile + unit colour (prototype `AVPAL`). */
export const AVPAL: readonly string[] = [
  "#0099cf",
  "#4fbde4",
  "#00588e",
  "#093f6b",
  "#1b2341",
  "#63666b",
  "#1f8a4c",
  "#c62f28",
  "#d98a00",
  "#6b4fa8",
  "#c4c8ce",
];

/** Swatches that need dark (navy) text: white on them is below 4.5:1 (#4fbde4 2.2:1, #d98a00 2.8:1). */
export const LIGHT: ReadonlySet<string> = new Set(["#c4c8ce", "#4fbde4", "#d98a00"]);

/** Czech names of the palette colours (AVC, AVPAL, budget, unit) — accessible names for swatch radios. */
const COLOR_NAMES: Readonly<Record<string, string>> = {
  "#0099cf": "Modrá",
  "#4fbde4": "Světle modrá",
  "#0079ab": "Středně modrá",
  "#00588e": "Ocelová",
  "#093f6b": "Tmavě modrá",
  "#12304f": "Noční modrá",
  "#1b2341": "Námořnická modrá",
  "#63666b": "Šedá",
  "#1f8a4c": "Zelená",
  "#c62f28": "Červená",
  "#d98a00": "Oranžová",
  "#6b4fa8": "Fialová",
  "#c4c8ce": "Světle šedá",
  "var(--fm-blue)": "Modrá",
  red: "Červená",
  green: "Zelená",
  blue: "Modrá",
};

/** `colorName("#c62f28")` → „Červená"; unknown values fall back to the input (upper-cased hex). */
export function colorName(color: string | null | undefined): string {
  if (!color) return "";
  const key = color.trim().toLowerCase();
  return COLOR_NAMES[key] ?? (key.startsWith("#") ? key.toUpperCase() : color);
}

export const DEFAULT_UNIT_COLOR = "#00588e";

export const MNAMES: readonly string[] = [
  "Leden",
  "Únor",
  "Březen",
  "Duben",
  "Květen",
  "Červen",
  "Červenec",
  "Srpen",
  "Září",
  "Říjen",
  "Listopad",
  "Prosinec",
];

/** Unique 3-letter month abbreviations for the yearly chart (DECISIONS #7: Čvn / Čvc). */
export const MONTH_ABBR: readonly string[] = ["Led", "Úno", "Bře", "Dub", "Kvě", "Čvn", "Čvc", "Srp", "Zář", "Říj", "Lis", "Pro"];

export type BudgetColorValue = "red" | "green" | "blue";

/** Budget colour states; order = radio order in the form and legend order. */
export const BUDGET_COLORS: ReadonlyArray<{ value: BudgetColorValue; label: string; color: string }> = [
  { value: "red", label: "Na dluh", color: "#c62f28" },
  { value: "green", label: "V budgetu", color: "#1f8a4c" },
  { value: "blue", label: "Budoucnost", color: "var(--fm-blue)" },
];

/** Max attachment size (25 MB, keeps uploads under the Traefik 60 s read timeout). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** localStorage key for per-browser UI preferences. */
export const UI_PREFS_KEY = "fotbalfm.ui.v1";
