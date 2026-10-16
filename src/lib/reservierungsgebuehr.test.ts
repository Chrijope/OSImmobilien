/**
 * Das Schulungsmaterial und die Reservierungsvereinbarung müssen dasselbe
 * sagen.
 *
 * Vom 14.09. bis zum 16.10.2026 kannte die Vereinbarung eine
 * Reservierungsgebühr, und die Akademie lehrte an einigen Stellen die Gebühr,
 * an anderen „keine Gebühr". Seit dem 16.10.2026 ist die Reservierung
 * kostenfrei, und das Material sagt nur noch das.
 *
 * Das ist die gefährlichste Art von Widerspruch, die ein Haus haben kann: Ein
 * Partner lernt einen Satz auswendig, sagt ihn beim Kunden, und liest dem
 * dann ein Formular vor, in dem etwas anderes steht. Deshalb dieser Wächter.
 *
 * Er prüft nicht den Wortlaut, sondern nur, dass die Gebührenaussagen
 * nirgends mehr stehen und die geltende Aussage da ist.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const inhalt = readFileSync(resolve(__dirname, "vertriebsakademieContent.ts"), "utf8");

/** Sätze aus der Zeit mit Gebühr, die der heutigen Regelung widersprechen. */
const ALTE_AUSSAGEN = [
  "erheben wir eine Reservierungsgebühr",
  "fällt eine Reservierungsgebühr an",
  "1.000 Euro Reservierungsgebühr",
  "Reservierungsgebühr vollständig zurück",
  "Unsere Gebühr",
  "unserer Gebühr",
  "Unsere Rückzahlungsregel",
  "zahlbar innerhalb von sieben Tagen",
];

describe("Die Akademie lehrt die geltende Regelung: die Reservierung ist kostenfrei", () => {
  for (const satz of ALTE_AUSSAGEN) {
    it(`sagt nicht mehr „${satz}"`, () => {
      expect(
        inhalt,
        `Ein Partner lernt hier einen Satz, den das Reservierungsformular widerlegt`,
      ).not.toContain(satz);
    });
  }

  it("nennt keinen Betrag für eine Reservierungsgebühr", () => {
    expect(inhalt).not.toMatch(/Reservierungsgebühr[^"\n]{0,80}\d\.\d{3}(,\d{2})? (Euro|€|EUR)/);
    expect(inhalt).not.toMatch(/\d\.\d{3}(,\d{2})? (Euro|€|EUR)[^"\n]{0,40}Reservierungsgebühr/);
  });

  it("sagt, dass die Reservierung kostenfrei ist", () => {
    expect(inhalt).toContain("Die Reservierung ist kostenfrei");
  });
});

describe("Das BGH-Urteil bleibt erklärt", () => {
  it("steht weiterhin im Material", () => {
    /*
     * Es zu streichen wäre der bequeme Weg und der falsche: Kunden kennen
     * Reservierungsgebühren von anderswo, und ein Partner, der das Urteil
     * nicht kennt, steht bei der Nachfrage ohne Antwort da.
     */
    expect(inhalt).toContain("I ZR 113/22");
  });

  it("erklärt, woran die Gebühr dort scheiterte", () => {
    expect(inhalt).toContain("Rückzahlung ausnahmslos ausgeschlossen");
  });
});
