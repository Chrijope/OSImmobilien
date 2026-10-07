/**
 * Das Schulungsmaterial und die Reservierungsvereinbarung müssen dasselbe
 * sagen.
 *
 * Bis zum 14.09.2026 erhob OS Immobilien keine Reservierungsgebühr, und die
 * Vertriebsakademie lehrte das an neunzehn Stellen: in Kapiteltexten, in zwei
 * wörtlichen Einwandskripten, in drei Prüfungsfragen und in einer
 * Entscheidungsübung. Mit der neuen Vereinbarung gilt das Gegenteil.
 *
 * Das ist die gefährlichste Art von Widerspruch, die ein Haus haben kann: Ein
 * Partner lernt einen Satz auswendig, sagt ihn beim Kunden, und liest dem
 * dann ein Formular vor, in dem etwas anderes steht. Deshalb dieser Wächter.
 *
 * Er prüft nicht den Wortlaut, sondern nur, dass die alte Aussage nirgends
 * mehr steht und die neuen Eckdaten überall dieselben sind.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const inhalt = readFileSync(resolve(__dirname, "vertriebsakademieContent.ts"), "utf8");

/** Sätze, die das Gegenteil der heutigen Regelung behaupten. */
const ALTE_AUSSAGEN = [
  "erheben keine Reservierungsgebühr",
  "nehmen keine Reservierungsgebühr",
  "zahlen Sie ja nichts",
  "Reservierung kostet dich nichts",
  "Bei uns kostet sie nichts",
];

describe("Die Akademie lehrt die geltende Regelung", () => {
  for (const satz of ALTE_AUSSAGEN) {
    it(`sagt nicht mehr „${satz}"`, () => {
      expect(
        inhalt,
        `Ein Partner lernt hier einen Satz, den das Reservierungsformular widerlegt`,
      ).not.toContain(satz);
    });
  }

  it("nennt beide Beträge der Staffel", () => {
    expect(inhalt).toContain("1.000 Euro");
    expect(inhalt).toContain("1.500 Euro");
  });

  it("nennt die Grenze von 300.000 Euro", () => {
    expect(inhalt).toMatch(/300\.000 Euro/);
  });

  it("spricht die Rückzahlung immer mit", () => {
    /*
     * Der Kern der Schulung: Die Zahl allein beschreibt etwas anderes als
     * das, was in der Vereinbarung steht. Wer nur den Betrag nennt, lässt
     * den Kunden mit einer Hürde zurück statt mit einer Formalie.
     */
    expect(inhalt).toContain("vollständig zurück");
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
    // Der Unterschied zur eigenen Regelung liegt genau in diesem Punkt.
    expect(inhalt).toContain("Rückzahlung ausnahmslos ausgeschlossen");
  });
});
