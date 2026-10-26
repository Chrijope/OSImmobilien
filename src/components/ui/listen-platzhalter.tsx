import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/*
 * Platzhalter in der Form der Liste statt eines seitenfüllenden Kreisels
 * (A5, 26.10.2026). Man sieht schon, wo gleich was steht, und die Seite
 * springt beim Laden nicht. Kreisel in Knöpfen bleiben, wie sie sind.
 *
 * Feste Breiten statt Zufall: Sonst flackerten die Balken bei jedem Zeichnen.
 */
const BREITEN = ["w-3/5", "w-2/5", "w-1/2", "w-2/3", "w-1/3", "w-3/4"];

export function ListenPlatzhalter({
  form = "zeilen",
  anzahl = 6,
  className,
}: {
  form?: "zeilen" | "kacheln";
  anzahl?: number;
  className?: string;
}) {
  const eintraege = Array.from({ length: anzahl });
  return (
    <div role="status" aria-busy="true" aria-label="Wird geladen" data-ui="listen-platzhalter" className={className}>
      {form === "kacheln" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {eintraege.map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border bg-card">
              <Skeleton className="h-40 w-full rounded-none" />
              <div className="space-y-2 p-4">
                <Skeleton className={cn("h-4", BREITEN[i % BREITEN.length])} />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {eintraege.map((_, i) => (
            <li key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className={cn("h-3.5", BREITEN[i % BREITEN.length])} />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </li>
          ))}
        </ul>
      )}
      <span className="sr-only">Wird geladen</span>
    </div>
  );
}
