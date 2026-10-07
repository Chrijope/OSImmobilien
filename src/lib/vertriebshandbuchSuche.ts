import { VERTRIEBSHANDBUCH, type HandbuchAbschnitt, type HandbuchBlock } from "@/lib/vertriebshandbuch";
import { bewerte, normalisiere, textAusschnittAus, zerlegeFrage } from "@/lib/sucheKern";

/**
 * Die Suche im Vertriebshandbuch.
 *
 * Sie muss mit ganzen Fragen umgehen können, nicht nur mit Stichwörtern.
 * Christian will eintippen können "wann bekomme ich eine glocke" oder "was
 * bedeutet der punkt hinter dem namen" und die richtige Stelle sehen.
 *
 * Die Regel selbst steht seit dem 11.09.2026 in `src/lib/sucheKern.ts`, weil
 * die Vertriebsakademie dieselbe Suche braucht. Hier bleibt nur, was am
 * Handbuch hängt: welches Feld eines Blocks welche Rolle spielt.
 */

export { zerlegeFrage };

export interface HandbuchTreffer {
  abschnitt: HandbuchAbschnitt;
  block: HandbuchBlock;
  /** Je höher, desto besser passend. */
  punkte: number;
  /** Die Wörter aus der Frage, die wirklich getroffen haben. */
  getroffen: string[];
}

/** Der ganze Text eines Blocks, einmal zusammengezogen. */
function blockText(block: HandbuchBlock): string {
  const teile = [
    block.titel,
    ...block.absaetze,
    ...(block.liste || []),
    block.achtung || "",
    ...(block.tabelle ? [...block.tabelle.kopf, ...block.tabelle.zeilen.flat()] : []),
  ];
  return normalisiere(teile.join(" "));
}

/**
 * Sucht im ganzen Handbuch. Leere Eingabe gibt nichts zurück, nicht alles:
 * Eine Trefferliste mit allem darin ist keine Antwort.
 */
export function sucheImHandbuch(frage: string, quelle = VERTRIEBSHANDBUCH): HandbuchTreffer[] {
  const woerter = zerlegeFrage(frage);
  if (woerter.length === 0) return [];

  const treffer: HandbuchTreffer[] = [];

  for (const abschnitt of quelle) {
    for (const block of abschnitt.bloecke) {
      const wertung = bewerte(woerter, {
        frage: normalisiere(block.frage || ""),
        titel: normalisiere(block.titel),
        schlagworte: normalisiere((block.schlagworte || []).join(" ")),
        bereich: normalisiere(abschnitt.titel + " " + abschnitt.kurz),
        text: blockText(block),
      });
      if (!wertung) continue;
      treffer.push({ abschnitt, block, punkte: wertung.punkte, getroffen: wertung.getroffen });
    }
  }

  return treffer.sort((a, b) => b.punkte - a.punkte);
}

/** Ein kurzer Ausschnitt um das erste getroffene Wort, für die Trefferliste. */
export function textAusschnitt(block: HandbuchBlock, wort: string, laenge = 160): string {
  const roh = [...block.absaetze, ...(block.liste || []), block.achtung || ""].join(" ");
  return textAusschnittAus(roh, wort, laenge);
}
