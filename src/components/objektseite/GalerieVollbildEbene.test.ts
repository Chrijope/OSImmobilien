import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Die Vollbildansicht der Objektbilder muss über der Kopfleiste liegen.
 *
 * Christian am 22.09.2026: Beim Vergrößern eines Bildes schob sich die
 * Kopfleiste über den oberen Rand der Ansicht. Damit war das Kreuz zum
 * Schließen nicht mehr erreichbar, und man kam nur noch über die Escape-Taste
 * heraus, die dort niemand vermutet.
 *
 * Die Ursache ist eine Ebene, keine Größe: Die Kopfleiste liegt auf `z-[60]`,
 * ein Dialog bringt von Haus aus nur `z-50` mit. Dieselbe Falle gab es schon
 * beim Menü der Kopfleiste, das deshalb auf `z-[70]` gehoben wurde.
 *
 * Geprüft wird am Quelltext und nicht am Aussehen: Ob ein Kreuz sichtbar ist,
 * hängt an zwei Zahlen in zwei verschiedenen Dateien. Genau deren Verhältnis
 * hält dieser Test fest.
 */

const lies = (pfad: string) => readFileSync(resolve(process.cwd(), pfad), "utf8");

/** Die höchste `z-[...]`-Angabe einer Datei, als Zahl. */
function hoechsteEbene(quelle: string): number {
  const treffer = [...quelle.matchAll(/z-\[(\d+)\]/g)].map((m) => Number(m[1]));
  return treffer.length ? Math.max(...treffer) : 0;
}

describe("Die Vollbildansicht liegt über der Kopfleiste", () => {
  const vollbild = lies("src/components/objektseite/GalerieVollbild.tsx");
  const kopfleiste = lies("src/components/HeaderBar.tsx");

  it("bringt eine eigene Ebene mit, statt sich auf die des Dialogs zu verlassen", () => {
    expect(vollbild).toMatch(/className="z-\[\d+\]/);
  });

  it("liegt höher als die Kopfleiste", () => {
    const ansicht = Number(vollbild.match(/className="z-\[(\d+)\]/)![1]);
    expect(ansicht).toBeGreaterThan(hoechsteEbene(kopfleiste));
  });

  it("lässt oben und unten einen Streifen frei", () => {
    // Randlos sah die Ansicht aus wie eine eigene Seite, nicht wie ein Fenster
    // davor. Mehr als 90vh sind zu nah an der Kopfleiste.
    const hoehe = Number(vollbild.match(/h-\[(\d+)vh\]/)![1]);
    expect(hoehe).toBeLessThanOrEqual(90);
    expect(hoehe).toBeGreaterThanOrEqual(80);
  });
});
