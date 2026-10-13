"use client";
/**
 * „Nothing matches the filters" banner above a board (the per-column „Žádné úkoly" texts stay). The live region is
 * always rendered so screen readers announce the message when it appears.
 */
import { Button } from "@/components/ui/Button";

export function BoardEmpty({ show, text, onReset }: { show: boolean; text: string; onReset: () => void }) {
  return (
    <div className="board-status" role="status">
      {show ? (
        <div className="board-empty">
          <span className="board-empty__t">
            {text}
            <span className="board-empty__s">Zkuste upravit hledání nebo filtry.</span>
          </span>
          <Button variant="outline" size="sm" onClick={onReset}>
            Zrušit filtry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
