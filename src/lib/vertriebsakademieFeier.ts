// Vertriebsakademie: wann gibt es Konfetti?
//
// Reine Entscheidungslogik ohne React und ohne Speicher, damit sie sich
// einzeln prüfen lässt. Der Speicher (`gefeiert` im Fortschritt) und die
// Anzeige hängen in `KapitelFeier.tsx`.

export type FeierArt = "keine" | "kapitel" | "akademie";

export interface FeierEingabe {
  /** Kapitelstand vor der Änderung, 0 bis 100. */
  vorherPct: number;
  /** Kapitelstand nach der Änderung, 0 bis 100. */
  nachherPct: number;
  /** Lief das Konfetti für dieses Kapitel schon einmal? */
  kapitelGefeiert: boolean;
  /** Stehen mit dieser Änderung alle Kapitel auf 100 Prozent? */
  alleKapitelFertig: boolean;
  /** Lief die große Feier für die ganze Akademie schon einmal? */
  akademieGefeiert: boolean;
}

/**
 * Entscheidet, ob und welche Feier gezeigt wird.
 *
 * Gefeiert wird nur der Sprung von unter 100 auf 100, und je Kapitel nur
 * einmal. Fällt mit diesem Sprung das letzte Kapitel, gibt es statt der
 * Kapitelfeier die große für die ganze Akademie, ebenfalls nur einmal. Ist
 * die Akademie-Feier schon gelaufen (etwa nach Aufmachen und erneutem
 * Abschließen eines Kapitels), bleibt es bei der kleinen Fassung.
 */
export function feierEntscheiden(e: FeierEingabe): FeierArt {
  const sprung = e.vorherPct < 100 && e.nachherPct >= 100;
  if (!sprung || e.kapitelGefeiert) return "keine";
  if (e.alleKapitelFertig && !e.akademieGefeiert) return "akademie";
  return "kapitel";
}

/** Der Text im Einblender. */
export function feierText(art: Exclude<FeierArt, "keine">, kapitelTitel: string): string {
  return art === "akademie"
    ? "Glückwunsch, du hast die Vertriebsakademie erfolgreich durchlaufen."
    : `Kapitel geschafft: ${kapitelTitel}`;
}

/** Wie lange der Einblender steht, bevor er von selbst verschwindet. */
export const EINBLENDER_MS = 3000;

/** Konfetti je Fassung: Menge und Dauer. Höchstens 150 Teilchen, höchstens zwei Sekunden. */
export const KONFETTI = {
  kapitel: { anzahl: 90, dauerMs: 1600 },
  akademie: { anzahl: 150, dauerMs: 2000 },
} as const;
