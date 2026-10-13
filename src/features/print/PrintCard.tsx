"use client";
/**
 * Inner content of a print card (prototype §9.4): type, title, desc, „N ks", date, attachments, price tag. No people.
 * The paid / owed state of the price tag is colour + tooltip; screen readers get it from a sibling `.sr-only`.
 */
import { DueChip } from "@/features/board/DueChip";
import { kcs, qtyLabel } from "@/lib/format";
import type { PrintItem } from "@/lib/types";

export function PrintCard({ item, typeName, inLastColumn, attachments }: { item: PrintItem; typeName: string; inLastColumn: boolean; attachments: number }) {
  const price = item.price || 0;
  return (
    <>
      <span className="cat">{typeName}</span>
      <h3>{item.title}</h3>
      {item.description ? <p>{item.description}</p> : null}
      <div className="ft">
        {item.quantity != null ? <span className="qty">{qtyLabel(item.quantity)}</span> : null}
        {item.realizationDate ? <DueChip date={item.realizationDate} inLastColumn={inLastColumn} prefix="Datum realizace: " /> : null}
        {attachments > 0 ? <span className="att">Přílohy {attachments}</span> : null}
        {price ? (
          <>
            <span className={`price ${item.paidByClub ? "paid" : "owed"}`} title={item.paidByClub ? "Zaplatil FK FM" : "Dluží FK FM"}>
              {kcs(price)}
            </span>
            <span className="sr-only">{item.paidByClub ? "zaplatil FK FM" : "dluží FK FM"}</span>
          </>
        ) : (
          <span className="price none">Bez ceny</span>
        )}
      </div>
    </>
  );
}
