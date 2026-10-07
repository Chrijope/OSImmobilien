/**
 * Der Waechter ueber der Designschicht.
 *
 * Das ganze Redesign steht auf einer Zusage: Wer den Regler in den
 * Einstellungen zurueckdreht, sieht wieder genau das alte CRM, und wem das
 * neue Design gar nicht gefaellt, der loescht eine Datei und ist es los.
 *
 * Diese Zusage haelt nur, solange in `design-neu.css` jede einzelne Regel
 * unter `[data-design="neu"]` haengt. Eine einzige Regel ohne diesen Vorsatz
 * wirkt sofort im alten Design mit, und niemand wuerde es merken, bis
 * Christian sich wundert, warum das Zurueckschalten nicht mehr sauber ist.
 *
 * Deshalb liest dieser Test die Datei selbst und prueft jeden Selektor.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const DATEI = resolve(__dirname, "design-neu.css");

/**
 * Kommentare heraus, dann alles vor der oeffnenden Klammer einsammeln. Das
 * reicht fuer eine Datei ohne Verschachtelung, und verschachtelt ist sie
 * bewusst nicht.
 */
function selektoren(css: string): string[] {
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const gefunden: string[] = [];
  for (const treffer of ohneKommentare.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const kopf = treffer[1].trim();
    if (!kopf) continue;
    gefunden.push(kopf);
  }
  return gefunden;
}

describe("Designschicht des neuen Designs", () => {
  const css = readFileSync(DATEI, "utf8");

  it("haengt jede Regel unter [data-design=\"neu\"]", () => {
    const ausreisser = selektoren(css).filter((kopf) => {
      // Die Tokenbloecke selbst sind die einzige erlaubte Ausnahme, und auch
      // sie tragen den Vorsatz: :root[data-design="neu"].
      if (kopf.startsWith("@")) return false;
      // Ein Selektor kann mehrere durch Komma getrennte Teile haben. Jeder
      // einzelne muss den Vorsatz tragen, sonst wirkt genau dieser Teil auch
      // im alten Design.
      return kopf
        .split(",")
        .map((teil) => teil.trim())
        .filter(Boolean)
        .some((teil) => !teil.includes('[data-design="neu"]'));
    });
    expect(ausreisser).toEqual([]);
  });

  it("setzt keine Regel mit !important durch", () => {
    // !important waere der bequeme Weg, wenn eine Tailwind-Klasse nicht
    // weichen will. Er ist aber auch der Weg, auf dem das alte Design spaeter
    // nicht mehr zurueckkommt, weil sich die Regel nicht mehr ueberstimmen
    // laesst. Wer sie braucht, soll erst den Selektor genauer machen.
    expect(css).not.toMatch(/!\s*important/);
  });

  it("beschreibt die Kennzahl einmal grundsaetzlich und sonst nur benannte Sonderfaelle", () => {
    // An den Kennzahlhaken haengen mehrere Bausteine: `Kennzahl`, `StatTile`
    // und die kompakten Kacheln auf dem Dashboard. Sonderregeln sind also
    // erlaubt, aber jede muss sagen, fuer welche Anordnung sie gilt.
    //
    // Eine zweite Regel ohne diese Angabe waere eine stille Gegenmeinung zur
    // Grundregel, und welche von beiden gewinnt, haenge dann an der
    // Reihenfolge in der Datei. Genau so laufen zwei Kacheln auseinander,
    // ohne dass es jemand merkt.
    const regeln = selektoren(css).filter((k) => k.includes('data-ui="kennzahl-wert"'));
    const grundregeln = regeln.filter((k) => !k.includes("data-anordnung"));
    expect(grundregeln).toHaveLength(1);
    expect(regeln.length).toBeGreaterThan(1);
  });
});
