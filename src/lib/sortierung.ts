import { useState } from "react";

/*
 * Sortieren per Klick auf die Spaltenüberschrift, für alle Listen der
 * Objektdaten (Christian, 17.10.2026). Erster Klick aufsteigend, zweiter
 * absteigend, dritter zurück zur Ausgangsreihenfolge. Leere Werte stehen
 * immer unten, damit sie das Ergebnis nicht verdecken. Die Überschrift dazu
 * ist `SortKopf` in `components/objektdaten/sortierung.tsx`.
 */

export type SortWert = string | number | null | undefined;
export type Richtung = "auf" | "ab";

/** WE-Nummern und Texte mit Zahlen natürlich sortieren: „WE 2“ vor „WE 10“. */
const vergleich = new Intl.Collator("de", { numeric: true, sensitivity: "base" });

export function sortiere<T>(zeilen: T[], wert: ((z: T) => SortWert) | null, richtung: Richtung): T[] {
  if (!wert) return zeilen;
  const leer = (v: SortWert) => v === null || v === undefined || v === "";
  return [...zeilen].sort((a, b) => {
    const x = wert(a), y = wert(b);
    if (leer(x) || leer(y)) return leer(x) === leer(y) ? 0 : leer(x) ? 1 : -1;
    const r = typeof x === "number" && typeof y === "number" ? x - y : vergleich.compare(String(x), String(y));
    return richtung === "auf" ? r : -r;
  });
}

export function useSortierung<T>(werte: Record<string, (z: T) => SortWert>) {
  const [spalte, setSpalte] = useState<string | null>(null);
  const [richtung, setRichtung] = useState<Richtung>("auf");
  const klick = (s: string) => {
    if (spalte !== s) { setSpalte(s); setRichtung("auf"); }
    else if (richtung === "auf") setRichtung("ab");
    else setSpalte(null);
  };
  return {
    spalte, richtung, klick,
    sortiert: (zeilen: T[]) => sortiere(zeilen, spalte ? werte[spalte] ?? null : null, richtung),
  };
}
