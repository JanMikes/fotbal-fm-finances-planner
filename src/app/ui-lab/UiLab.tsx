"use client";
/** /ui-lab — live catalogue of the UI primitives with every state; also the fixture for ui-primitives.spec.ts. */
import { useState } from "react";
import { Avatar, Button, DateInput, Field, fieldA11y, Modal, MoneyInput, MonthInput, Select, useToday, type SelectGroup, type SelectOption } from "@/components/ui";
import { AREAS, AVPAL, BUDGET_COLORS, CATEGORY_OPTGROUPS, colorName } from "@/lib/constants";
import { addDays, formatMonth, toIsoDate } from "@/lib/dates";
import { dueInfo } from "@/lib/due";
import { kcs } from "@/lib/format";
import type { OrgNode } from "@/lib/types";
import "./ui-lab.css";

const CATEGORY_GROUPS: SelectGroup[] = CATEGORY_OPTGROUPS.map((g) => ({ label: g.label, options: g.options.map((o) => ({ value: o, label: o })) }));

const COLUMNS: SelectOption[] = [
  { value: "c1", label: "Nápady" },
  { value: "c2", label: "K řešení" },
  { value: "c3", label: "Rozpracováno" },
  { value: "c4", label: "Ke schválení" },
  { value: "c5", label: "Hotovo" },
];

const PEOPLE: SelectOption[] = [
  { value: "", label: "— nevybráno —" },
  { value: "p1", label: "Petra Horáková", meta: "vedení" },
  { value: "p2", label: "Ondřej Sýkora", meta: "grafika" },
  { value: "p3", label: "Lucie Malá", meta: "sociální sítě" },
  { value: "p4", label: "Tomáš Černý", meta: "video", disabled: true },
  { value: "p5", label: "Šárka Řeháková", meta: "web" },
];

const person = (id: string, name: string, avatarColor: string | null, sortOrder: number): OrgNode => ({
  id,
  kind: "person",
  name,
  role: null,
  info: null,
  budget: null,
  budgetColor: "blue",
  avatarColor,
  areas: [],
  color: null,
  parentId: null,
  sortOrder,
  createdAt: "2026-01-01T00:00:00.000Z",
});
const NODES: OrgNode[] = [
  person("a1", "Petra Horáková", "#0099cf", 1),
  person("a2", "Ondřej Sýkora", "#4fbde4", 2),
  person("a3", "Lucie Malá", "#d98a00", 3),
  person("a4", "Tomáš Černý", "#c4c8ce", 4),
  person("a5", "Šárka Řeháková", "#1b2341", 5),
];

function monthOptions(today: Date): SelectOption[] {
  const ym = toIsoDate(today).slice(0, 7);
  const [y, m] = ym.split("-").map(Number);
  const out: SelectOption[] = [{ value: "all", label: "Všechny měsíce" }];
  for (let i = -1; i < 12; i++) {
    const t = y * 12 + m - 1 + i;
    const v = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
    out.push({ value: v, label: formatMonth(v), meta: i % 3 === 0 ? kcs(4500 * (i + 2)) : undefined });
  }
  out.push({ value: "none", label: "Bez termínu" });
  return out;
}

export function UiLab() {
  const today = useToday();
  const [cat, setCat] = useState("Celý klub");
  const [col, setCol] = useState("c2");
  const [mon, setMon] = useState("all");
  const [who, setWho] = useState("");
  const [me, setMe] = useState("p1");
  const [flip, setFlip] = useState("c1");
  const [due, setDue] = useState("2026-11-03");
  const [due2, setDue2] = useState("");
  const [from, setFrom] = useState("2026-10");
  const [price, setPrice] = useState<number | null>(4500);
  const [qty, setQty] = useState<number | null>(null);
  const [bud, setBud] = useState<number | null>(0);
  const [title, setTitle] = useState("");
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [budc, setBudc] = useState("blue");
  const [areas, setAreas] = useState<string[]>(["Mládež"]);
  const [swatch, setSwatch] = useState(AVPAL[0]);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState(false);
  const [mSel, setMSel] = useState("Merch");
  const [mDue, setMDue] = useState("");
  const [mTitle, setMTitle] = useState("");
  const [log, setLog] = useState("");

  const months = monthOptions(today);
  const todayIso = toIsoDate(today);

  return (
    <main className="uilab">
      <header className="uilab-h">
        <div className="kick">Interní · neindexováno</div>
        <h1>UI primitiva</h1>
        <p>Přehled sdílených ovládacích prvků (Select, datum, měsíc, částka, pole formuláře, tlačítka, modal). Stránka slouží vývoji a e2e testům.</p>
      </header>

      <section className="uilab-s" aria-labelledby="s-btn">
        <h2 id="s-btn">Tlačítka</h2>
        <div className="uilab-row">
          <Button variant="primary">Uložit</Button>
          <Button variant="secondary">Sekundární</Button>
          <Button variant="outline">Zrušit</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Smazat</Button>
          <Button variant="primary" busy={busy} onClick={() => setBusy(true)} id="labBusy">
            Uložit (busy)
          </Button>
          <Button variant="outline" onClick={() => setBusy(false)}>
            Reset busy
          </Button>
          <Button variant="primary" disabled>
            Zakázané
          </Button>
        </div>
        <div className="uilab-row">
          <Button variant="primary" size="sm">
            Malé
          </Button>
          <Button variant="outline" size="sm">
            Duplikovat
          </Button>
          <Button variant="outline" icon aria-label="Přidat">
            +
          </Button>
          <Button variant="outline" size="sm" icon aria-label="Zavřít">
            ×
          </Button>
        </div>
        <div className="uilab-row uilab-dark">
          <Button variant="onDark">Na tmavé</Button>
          <Button variant="primary">+ Nový úkol</Button>
          <Select id="labDark" variant="onDark" aria-label="Přihlášen" value={me} onChange={setMe} options={PEOPLE.slice(1)} />
        </div>
      </section>

      <section className="uilab-s" aria-labelledby="s-sel">
        <h2 id="s-sel">Select</h2>
        <div className="uilab-grid mb">
          <Field label="Kategorie" htmlFor="labCat" hint="Skupiny + vyhledávání (24 položek)">
            <Select id="labCat" value={cat} onChange={setCat} options={CATEGORY_GROUPS} {...fieldA11y("labCat", { hint: true })} />
          </Field>
          <Field label="Stav" htmlFor="labCol">
            <Select id="labCol" value={col} onChange={setCol} options={COLUMNS} />
          </Field>
          <Field label="Zodpovědný za úkol" htmlFor="labWho">
            <Select id="labWho" value={who} onChange={setWho} options={PEOPLE} placeholder="— nevybráno —" />
          </Field>
          <Field label="Zakázaný" htmlFor="labDis">
            <Select id="labDis" value="c1" onChange={() => {}} options={COLUMNS} disabled />
          </Field>
        </div>
        <div className="uilab-row bar-like">
          <Select id="labMon" variant="filter" aria-label="Filtr měsíce" value={mon} onChange={setMon} options={months} />
          <input className="search" type="search" placeholder="Hledat v úkolech…" aria-label="Hledat v úkolech" />
          <label className="tog">
            <input type="checkbox" /> Jen moje úkoly
          </label>
        </div>
        <p className="uilab-out">
          Hodnoty: <output id="out-labCat">{cat}</output> · <output id="out-labCol">{col}</output> · <output id="out-labWho">{who || "∅"}</output> ·{" "}
          <output id="out-labMon">{mon}</output>
        </p>
      </section>

      <section className="uilab-s" aria-labelledby="s-date">
        <h2 id="s-date">Datum a měsíc</h2>
        <div className="uilab-grid mb">
          <Field label="Předpokládaný termín dokončení" htmlFor="labDate">
            <DateInput id="labDate" value={due} onChange={setDue} />
          </Field>
          <Field label="Datum realizace (od dneška)" htmlFor="labDate2" hint="Minimum = dnes">
            <DateInput id="labDate2" value={due2} onChange={setDue2} min={todayIso} {...fieldA11y("labDate2", { hint: true })} />
          </Field>
          <Field label="Splátka od" htmlFor="labMonth">
            <MonthInput id="labMonth" value={from} onChange={setFrom} placeholder="od měsíce…" />
          </Field>
          <div className="f">
            <span className="lbl">Kompaktní měsíc</span>
            <MonthInput id="labMonth2" value={from} onChange={setFrom} compact aria-label="Kompaktní měsíc" />
          </div>
        </div>
        <p className="uilab-out">
          Hodnoty: <output id="out-labDate">{due || "∅"}</output> · <output id="out-labDate2">{due2 || "∅"}</output> · <output id="out-labMonth">{from || "∅"}</output>
        </p>
      </section>

      <section className="uilab-s" aria-labelledby="s-money">
        <h2 id="s-money">Částky</h2>
        <div className="uilab-grid mb">
          <Field label="Cena" htmlFor="labPrice">
            <MoneyInput id="labPrice" value={price} onChange={setPrice} suffix="Kč" />
          </Field>
          <Field label="Počet kusů" htmlFor="labQty">
            <MoneyInput id="labQty" value={qty} onChange={setQty} suffix="ks" />
          </Field>
          <Field label="Spolek (0 = prázdné)" htmlFor="labBud">
            <MoneyInput id="labBud" value={bud} onChange={setBud} suffix="Kč" zeroAsEmpty compact />
          </Field>
        </div>
        <p className="uilab-out">
          Hodnoty: <output id="out-labPrice">{price ?? "∅"}</output> · <output id="out-labQty">{qty ?? "∅"}</output> · <output id="out-labBud">{bud ?? "∅"}</output>
        </p>
      </section>

      <section className="uilab-s" aria-labelledby="s-field">
        <h2 id="s-field">Pole formuláře</h2>
        <div className="uilab-grid mb">
          <Field label="Název úkolu" htmlFor="labTitle" required error={titleErr}>
            <input
              id="labTitle"
              value={title}
              placeholder="Např. Plakát na domácí zápas"
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) setTitleErr(null);
              }}
              {...fieldA11y("labTitle", { error: titleErr, required: true })}
            />
          </Field>
          <div className="f uilab-end">
            <Button variant="outline" id="labValidate" onClick={() => setTitleErr(title.trim() ? null : "Vyplňte název úkolu")}>
              Ověřit
            </Button>
          </div>
          <Field label="Stav rozpočtu" group>
            <div className="budc">
              {BUDGET_COLORS.map((b) => (
                <label key={b.value}>
                  <input type="radio" name="labBudc" value={b.value} checked={budc === b.value} onChange={() => setBudc(b.value)} />
                  <i style={{ background: b.color }} />
                  {b.label}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Barva profilu" group>
            <div className="avpick">
              {AVPAL.map((c) => (
                <label key={c} title={c}>
                  <input type="radio" name="labAvc" value={c} checked={swatch === c} onChange={() => setSwatch(c)} aria-label={colorName(c)} />
                  <i style={{ background: c }} />
                </label>
              ))}
            </div>
          </Field>
          <Field label="Oblasti" group wide>
            <div className="chkgrid">
              {AREAS.map((a) => (
                <label key={a}>
                  <input
                    type="checkbox"
                    checked={areas.includes(a)}
                    onChange={(e) => setAreas((xs) => (e.target.checked ? [...xs, a] : xs.filter((x) => x !== a)))}
                  />
                  {a}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </section>

      <section className="uilab-s" aria-labelledby="s-misc">
        <h2 id="s-misc">Termíny a avatary</h2>
        <div className="uilab-row">
          {[-3, -1, 0, 1, 3, 5, 12, 120].map((n) => {
            const d = dueInfo(addDays(todayIso, n), false, today);
            return (
              <span key={n} className={"due " + d.cls} title={d.title}>
                {d.text}
                <span className="sr-only"> ({d.srText})</span>
              </span>
            );
          })}
          <span className={"due " + dueInfo(addDays(todayIso, -2), true, today).cls}>{dueInfo(addDays(todayIso, -2), true, today).text}</span>
        </div>
        <div className="uilab-row ppl">
          {NODES.map((n, i) => (
            <Avatar key={n.id} nodes={NODES} id={n.id} lead={i === 0} />
          ))}
          <Avatar nodes={NODES} id={null} />
        </div>
      </section>

      <section className="uilab-s" aria-labelledby="s-modal">
        <h2 id="s-modal">Modal</h2>
        <div className="uilab-row">
          <Button variant="primary" id="labOpenModal" onClick={() => setModal(true)}>
            Otevřít modal
          </Button>
          <output id="out-modal">{log}</output>
        </div>
        <div className="uilab-grid mb uilab-flip">
          <Field label="Select u spodního okraje" htmlFor="labFlip">
            <Select id="labFlip" value={flip} onChange={setFlip} options={COLUMNS} />
          </Field>
        </div>
      </section>
      <div className="uilab-spacer" aria-hidden="true" />

      {modal ? (
        <Modal
          title="Ukázkový formulář"
          testId="lab-modal"
          onClose={() => {
            setModal(false);
            setLog("zavřeno");
          }}
          onSubmit={() => {
            setLog("odesláno");
            setModal(false);
          }}
          initialFocus="#mTitle"
          meta={`Založil(a) Petra Horáková · 13. 10. 2026`}
          footStart={
            <>
              <Button variant="danger" onClick={() => setLog("smazat")}>
                Smazat
              </Button>
              <Button variant="outline" onClick={() => setLog("duplikovat")}>
                Duplikovat
              </Button>
            </>
          }
          foot={
            <>
              <Button variant="outline" onClick={() => setModal(false)}>
                Zrušit
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setLog("uloženo");
                  setModal(false);
                }}
              >
                Uložit
              </Button>
            </>
          }
        >
          <div className="mb">
            <Field label="Kategorie" htmlFor="mSel">
              <Select id="mSel" value={mSel} onChange={setMSel} options={CATEGORY_GROUPS} />
            </Field>
            <Field label="Stav" htmlFor="mCol">
              <Select id="mCol" value={col} onChange={setCol} options={COLUMNS} />
            </Field>
            <Field label="Název" htmlFor="mTitle" required>
              <input id="mTitle" value={mTitle} onChange={(e) => setMTitle(e.target.value)} {...fieldA11y("mTitle", { required: true })} />
            </Field>
            <Field label="Termín" htmlFor="mDue">
              <DateInput id="mDue" value={mDue} onChange={setMDue} />
            </Field>
            <Field label="Popis" htmlFor="mDesc" wide>
              <textarea id="mDesc" rows={12} defaultValue={"Dlouhý obsah, aby bylo vidět posouvání těla modalu.\n\n".repeat(6)} />
            </Field>
            <Field label="Cena" htmlFor="mPrice">
              <MoneyInput id="mPrice" value={price} onChange={setPrice} suffix="Kč" />
            </Field>
            <Field label="Zodpovědný" htmlFor="mWho">
              <Select id="mWho" value={who} onChange={setWho} options={PEOPLE} />
            </Field>
            <Field label="Poznámka" htmlFor="mNote" wide>
              <textarea id="mNote" defaultValue="" />
            </Field>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}
