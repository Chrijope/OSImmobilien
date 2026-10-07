import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * Der Rechner auf dem Handy, Reiter „Investmentkalkulation" der Einheitsseite.
 *
 * Gemeldet von Christian am 24.09.2026: Bei 375 Bildpunkten ragte der Rechner
 * rechts aus dem Bild, Eingabefelder und der Reiter „Objekt & Kaufpreis"
 * waren abgeschnitten. Ursache war `grid-template-columns: 1fr` für die
 * einspaltige Arbeitsfläche. `1fr` heißt `minmax(auto, 1fr)`, die Spalte wuchs
 * also auf die Mindestbreite der Bereichsleiste (sieben Reiter zu je 145
 * Bildpunkten, über 1000 zusammen). Nachgemessen mit der echten CSS bei 375
 * Bildpunkten: Eingabespalte vorher 1061, nachher 341 Bildpunkte breit.
 *
 * jsdom rechnet kein Layout. Geprüft wird deshalb die Regel im Stylesheet:
 * Unter 880 Bildpunkten dürfen die Spalten schrumpfen, und die Bereichsleiste
 * scrollt in sich statt die Seite zu verbreitern.
 */

// Ohne Kommentare, sonst hinge ein Kommentar vor einer Regel an ihrem Selektor.
const CSS = readFileSync(resolve(process.cwd(), "src/styles/investmentrechner.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** Der Inhalt aller Medienabfragen `@media (max-width: …px)`, aneinandergehängt. */
function medienabfrage(breite: number): string {
  const kopf = `@media (max-width: ${breite}px) {`;
  const teile: string[] = [];
  let start = CSS.indexOf(kopf);
  while (start > -1) {
    let tiefe = 0;
    let ende = -1;
    for (let i = start + kopf.length - 1; i < CSS.length; i++) {
      if (CSS[i] === "{") tiefe++;
      if (CSS[i] === "}") tiefe--;
      if (tiefe === 0) { ende = i; break; }
    }
    if (ende < 0) throw new Error("Medienabfrage nicht geschlossen");
    teile.push(CSS.slice(start + kopf.length, ende));
    start = CSS.indexOf(kopf, ende);
  }
  expect(teile.length, `Keine Medienabfrage bis ${breite}px`).toBeGreaterThan(0);
  return teile.join("\n}\n");
}

/** Die Deklarationen einer Regel innerhalb eines Stücks CSS. */
function regel(css: string, auswahl: string): string {
  const treffer = css.split("}").find((teil) => teil.split("{")[0].split(",").some((s) => s.trim() === auswahl));
  expect(treffer, `Keine Regel für ${auswahl}`).toBeTruthy();
  return treffer!.split("{")[1];
}

describe("Investmentrechner auf dem Handy", () => {
  const handy = medienabfrage(880);
  const schmal = medienabfrage(650);

  it("lässt die einspaltige Arbeitsfläche schrumpfen, statt sie am Inhalt zu bemessen", () => {
    expect(regel(handy, ".investmentrechner .workspace")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(regel(handy, ".investmentrechner .input-panel")).toMatch(/min-width:\s*0;/);
    expect(regel(handy, ".investmentrechner .input-section")).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  });

  it("scrollt die Bereichsleiste in sich", () => {
    expect(regel(handy, ".investmentrechner .section-nav")).toMatch(/overflow-x:\s*auto;/);
  });

  it("teilt die Eingabefelder auch unter 650 Bildpunkten in schrumpfbare Spalten", () => {
    expect(regel(schmal, ".investmentrechner .field-grid")).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
    expect(regel(schmal, ".investmentrechner .metrics-grid")).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/);
  });

  it("lässt den Desktop, wie er ist: zwei Spalten, die linke 330 bis 390 Bildpunkte", () => {
    const ausserhalb = CSS.slice(0, CSS.indexOf("@media (max-width: 880px) {"));
    expect(regel(ausserhalb, ".investmentrechner .workspace")).toMatch(
      /grid-template-columns:\s*minmax\(330px,\s*390px\)\s+minmax\(0,\s*1fr\);/,
    );
  });
});
