import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";
import type { Richtung } from "@/lib/sortierung";
import { cn } from "@/lib/utils";

/** Spaltenüberschrift mit Sortierknopf. Ohne `schluessel` eine gewöhnliche Überschrift. */
export function SortKopf({ titel, schluessel, sort, rechts, hinweis, className }: {
  titel: string;
  schluessel?: string;
  sort: { spalte: string | null; richtung: Richtung; klick: (s: string) => void };
  rechts?: boolean;
  hinweis?: string;
  className?: string;
}) {
  if (!schluessel) return <TableHead className={cn(rechts && "text-right", "whitespace-nowrap", className)} title={hinweis}>{titel}</TableHead>;
  const aktiv = sort.spalte === schluessel;
  const Symbol = !aktiv ? ArrowUpDown : sort.richtung === "auf" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={cn(rechts && "text-right", "whitespace-nowrap", className)} title={hinweis}
      aria-sort={aktiv ? (sort.richtung === "auf" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => sort.klick(schluessel)}
        className={cn("inline-flex items-center gap-1 hover:text-foreground", rechts && "flex-row-reverse", aktiv && "text-foreground")}>
        {titel}<Symbol className={cn("h-3 w-3", !aktiv && "opacity-40")} />
      </button>
    </TableHead>
  );
}
