import { ChevronLeft, ChevronRight, Star, X } from "lucide-react";

/**
 * Reihenfolge und Titelbild der Bilder im Objektformular (16.10.2026).
 *
 * Vorher galt allein die Upload-Reihenfolge, und das Titelbild war immer das
 * zuerst hochgeladene. Wer ein anderes wollte, musste alle Bilder löschen und
 * neu hochladen. Das erste Bild der Liste ist das Titelbild; gespeichert wird
 * die Reihenfolge so, wie sie hier steht.
 */
export function verschiebeBild<T extends { id: string }>(liste: T[], id: string, ziel: -1 | 1 | "anfang"): T[] {
  const von = liste.findIndex((b) => b.id === id);
  if (von < 0) return liste;
  const nach = ziel === "anfang" ? 0 : von + ziel;
  if (nach < 0 || nach >= liste.length || nach === von) return liste;
  const neu = [...liste];
  const [bild] = neu.splice(von, 1);
  neu.splice(nach, 0, bild);
  return neu;
}

const KNOPF = "rounded-full bg-background/90 p-1 text-foreground shadow-sm hover:bg-background disabled:opacity-30";

/** Die Knöpfe über einem Vorschaubild. Auf dem Handy immer sichtbar, sonst beim Darüberfahren. */
export function BildSteuerung({ index, anzahl, onVerschieben, onEntfernen, titelLabel = "Als Titelbild verwenden" }: {
  index: number;
  anzahl: number;
  onVerschieben: (ziel: -1 | 1 | "anfang") => void;
  onEntfernen: () => void;
  titelLabel?: string;
}) {
  return (
    <>
      <button type="button" aria-label="Bild entfernen" className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-destructive-foreground sm:opacity-0 sm:group-hover:opacity-100" onClick={(e) => { e.stopPropagation(); onEntfernen(); }}>
        <X className="h-3 w-3" />
      </button>
      {anzahl > 1 && (
        <div className="absolute bottom-1 right-1 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100">
          {index > 0 && (
            <button type="button" aria-label={titelLabel} title={titelLabel} className={KNOPF} onClick={(e) => { e.stopPropagation(); onVerschieben("anfang"); }}>
              <Star className="h-3 w-3" />
            </button>
          )}
          <button type="button" aria-label="Nach vorne" className={KNOPF} disabled={index === 0} onClick={(e) => { e.stopPropagation(); onVerschieben(-1); }}>
            <ChevronLeft className="h-3 w-3" />
          </button>
          <button type="button" aria-label="Nach hinten" className={KNOPF} disabled={index === anzahl - 1} onClick={(e) => { e.stopPropagation(); onVerschieben(1); }}>
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}
    </>
  );
}
