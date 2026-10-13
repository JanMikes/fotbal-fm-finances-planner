/**
 * LOCAL DEV ONLY — loads the prototype demo data (prototype.md §3.7) into $DATABASE_URL.
 *   npm run seed:demo            (refuses if the org tree is not empty; --force to add anyway)
 * Never run against production.
 */
import { asc, eq } from "drizzle-orm";
import { closeDb, getDb } from "../src/server/db/client";
import { boardColumns, orgNodes, printTypes } from "../src/server/db/schema";
import { createNode } from "../src/server/services/orgNodes";
import { createPrintItem, createTask } from "../src/server/services/boards";
import { addLink } from "../src/server/services/attachments";
import { updateBudget } from "../src/server/services/budget";

const ctx = { clientId: "seed-demo" };

function dd(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("seed:demo must never run in production");
  const db = getDb();
  const existing = await db.select({ id: orgNodes.id }).from(orgNodes).limit(1);
  if (existing.length && !process.argv.includes("--force")) {
    console.log("[seed:demo] org tree is not empty — skipping (use --force to add demo data anyway)");
    return;
  }
  const petra = await createNode({ kind: "person", name: "Petra Horáková", role: "Vedoucí marketingu", budget: 25000, budgetColor: "green", areas: ["Celý klub"] }, ctx);
  const tomas = await createNode({ kind: "person", name: "Tomáš Kubala", role: "Sociální sítě", parentId: petra.id, areas: ["Muži", "Mládež"], info: "Instagram, TikTok, Facebook." }, ctx);
  const lucie = await createNode({ kind: "person", name: "Lucie Mrázková", role: "Grafika", parentId: petra.id, budget: 12000, budgetColor: "red" }, ctx);
  const ondrej = await createNode({ kind: "person", name: "Ondřej Sýkora", role: "Foto / video", parentId: petra.id, areas: ["Foto"] }, ctx);
  const mladez = await createNode({ kind: "unit", name: "Mládež", color: "#4fbde4", parentId: tomas.id }, ctx);
  void mladez;

  const cols = await db.select().from(boardColumns).where(eq(boardColumns.boardId, "tasks")).orderBy(asc(boardColumns.sortOrder));
  const [c1, c2, c3, c4, c5] = cols.map((c) => c.id);
  const tasks: Array<[string | undefined, string, string, string, string, string, string | null]> = [
    [c1, "Celý klub", "Série „Valcíři zblízka“", "Krátké portréty hráčů A-týmu, 1× týdně na Instagram a TikTok.", petra.id, ondrej.id, dd(21)],
    [c2, "Muži A", "Plakát na domácí zápas", "A3 plakát + verze pro sociální sítě 1080×1350.", petra.id, lucie.id, dd(2)],
    [c2, "Přípravka U9", "Fotky z turnaje", "Výběr 20 fotek, popisky se jmény se souhlasem rodičů.", tomas.id, ondrej.id, dd(-1)],
    [c3, "Dorost U19", "Pozvánka na nábor", "Text a grafika pro web a Facebook.", petra.id, tomas.id, dd(6)],
    [c4, "Muži A", "Představení soupisky", "Carousel s fotkami hráčů.", tomas.id, lucie.id, null],
    [c5, "Merch", "Nový merch v e-shopu", "Produktové fotky a popisy.", petra.id, lucie.id, null],
  ];
  for (const [columnId, category, title, description, leadId, ownerId, dueDate] of tasks) {
    const t = await createTask({ columnId: columnId ?? c1!, category, title, description, leadId, ownerId, dueDate, createdBy: petra.id }, ctx);
    if (title === "Pozvánka na nábor") await addLink({ kind: "link", parentKind: "task", parentId: t.id, url: "https://www.fotbalfm.cz", name: "Web klubu" }, ctx);
  }

  const pcols = await db.select().from(boardColumns).where(eq(boardColumns.boardId, "print")).orderBy(asc(boardColumns.sortOrder));
  const types = await db.select().from(printTypes).orderBy(asc(printTypes.sortOrder));
  const y = new Date().getFullYear();
  await createPrintItem({ columnId: pcols[0].id, typeId: types[0].id, title: "Letáky na nábor, 500 ks", quantity: 500, price: 4500, paidByClub: false, realizationDate: dd(10), createdBy: petra.id }, ctx);
  await createPrintItem({ columnId: pcols[1].id, typeId: types[1].id, title: "Vizitky vedení", quantity: 200, price: 1800, paidByClub: true, realizationDate: dd(-20), createdBy: lucie.id }, ctx);
  await createPrintItem({ columnId: pcols[2].id, typeId: types[3].id, title: "Banner na tribunu", quantity: 1, price: 12000, paidByClub: true, realizationDate: `${y}-03-15`, createdBy: petra.id }, ctx);
  await createPrintItem({ columnId: pcols[0].id, typeId: types[2].id, title: "Plakáty A2", description: "Bez ceny zatím", createdBy: petra.id }, ctx);

  await updateBudget({ spolek: 150000, asAmount: 50000 }, ctx);
  console.log("[seed:demo] demo data loaded");
}

main()
  .then(() => closeDb())
  .catch(async (err) => {
    console.error("[seed:demo] failed:", err);
    await closeDb();
    process.exit(1);
  });
