"use client";
/** Inner content of an income card: payer, title, desc, paid date, amount tag. */
import { formatDate, kcs } from "@/lib/format";
import { PAYER_LABEL } from "@/lib/constants";
import type { PrintIncome } from "@/lib/types";

export function IncomeCard({ income }: { income: PrintIncome }) {
  return (
    <>
      <span className="cat">{PAYER_LABEL[income.payer]}</span>
      <h3>{income.title}</h3>
      {income.description ? <p>{income.description}</p> : null}
      <div className="ft">
        {income.paidDate ? <span className="paid-on">Zaplaceno {formatDate(income.paidDate)}</span> : null}
        {income.amount ? <span className="price income">+{kcs(income.amount)}</span> : <span className="price none">Bez částky</span>}
      </div>
    </>
  );
}
