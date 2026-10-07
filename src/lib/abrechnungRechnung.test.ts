/**
 * Die Rechnung hinter der Abrechnung.
 *
 * Hier geht es um Geld, das echte Menschen in Rechnung stellen. Ein Fehler
 * bedeutet entweder, dass jemand zu viel fordert, oder dass er auf sein Geld
 * wartet, ohne zu wissen warum. Deshalb steht jede Bedingung einzeln.
 */
import { describe, expect, it } from "vitest";

import {
  abrechnungsHistorie,
  abrechnungsSummen,
  istAbrechenbar,
  istKaufpreisFaellig,
  postenProvision,
  rechnungsHinweis,
  type AbrechnungsPosten,
} from "./abrechnungRechnung";

const HEUTE = new Date(2026, 8, 14); // 14. September 2026

function posten(teil: Partial<AbrechnungsPosten> = {}): AbrechnungsPosten {
  return {
    kaufpreis: 300000,
    stufe: "faelligkeit",
    satz: 4,
    kaufpreisfaelligAm: "2026-09-01",
    ...teil,
  };
}

describe("Die Provision eines Geschaefts", () => {
  it("rechnet Christians Beispiel", () => {
    // 300.000 Euro, Vertriebspartner mit 4 Prozent.
    expect(postenProvision(posten())).toBe(12000);
  });

  it("rechnet die uebrigen Karrierestufen", () => {
    expect(postenProvision(posten({ satz: 3 }))).toBe(9000); // Vertriebspartner (Alt)
    expect(postenProvision(posten({ satz: 4.5 }))).toBe(13500); // Team Lead
    expect(postenProvision(posten({ satz: 5 }))).toBe(15000); // Lizenzpartner
  });

  it("gibt Null zurueck, wo eine Angabe fehlt", () => {
    // Lieber nichts anzeigen als eine Zahl, die auf einer Null beruht.
    expect(postenProvision(posten({ kaufpreis: 0 }))).toBe(0);
    expect(postenProvision(posten({ satz: 0 }))).toBe(0);
    expect(postenProvision(posten({ kaufpreis: -5 }))).toBe(0);
  });
});

describe("Wann die Kaufpreisfaelligkeit erreicht ist", () => {
  it("zaehlt den Tag selbst mit", () => {
    // Wer die Faelligkeit auf heute setzt, soll heute abrechnen koennen.
    expect(istKaufpreisFaellig("2026-09-14", HEUTE)).toBe(true);
  });

  it("erkennt einen vergangenen Tag", () => {
    expect(istKaufpreisFaellig("2026-08-30", HEUTE)).toBe(true);
  });

  it("sperrt einen kuenftigen Tag", () => {
    expect(istKaufpreisFaellig("2026-09-15", HEUTE)).toBe(false);
  });

  it("sperrt ohne Datum", () => {
    /*
     * Der wichtigste Fall. Solange niemand die Faelligkeit eingetragen hat,
     * darf nichts abgerechnet werden, auch wenn der Notartermin lange her
     * ist. Der Eintrag IST die Bestaetigung, dass gezahlt wurde.
     */
    expect(istKaufpreisFaellig("", HEUTE)).toBe(false);
    expect(istKaufpreisFaellig(null, HEUTE)).toBe(false);
    expect(istKaufpreisFaellig(undefined, HEUTE)).toBe(false);
  });

  it("sperrt bei unlesbarem Datum", () => {
    expect(istKaufpreisFaellig("demnaechst", HEUTE)).toBe(false);
  });

  it("laesst die Uhrzeit nicht ueber den Tag entscheiden", () => {
    // Ein Datum mit Zeitanteil darf nicht am selben Tag scheitern.
    expect(istKaufpreisFaellig("2026-09-14T23:30:00", HEUTE)).toBe(true);
  });
});

describe("Wann ein Geschaeft abrechenbar ist", () => {
  it("verlangt beides: Notar durchlaufen UND Faelligkeit erreicht", () => {
    expect(istAbrechenbar(posten(), HEUTE)).toBe(true);
  });

  it("sperrt, solange der Notartermin bevorsteht", () => {
    /*
     * Stufe "notar" heisst: Termin ist angesetzt, nicht gewesen. Selbst mit
     * eingetragener Faelligkeit waere das ein Tippfehler und keine Zahlung.
     */
    expect(istAbrechenbar(posten({ stufe: "notar" }), HEUTE)).toBe(false);
  });

  it("sperrt bei Reservierung und Finanzierung", () => {
    for (const stufe of ["reservierung", "finanzierung"]) {
      expect(istAbrechenbar(posten({ stufe }), HEUTE), stufe).toBe(false);
    }
  });

  it("laesst Faelligkeit, Abrechnung und Abgeschlossen zu", () => {
    for (const stufe of ["faelligkeit", "abrechnung", "abgeschlossen"]) {
      expect(istAbrechenbar(posten({ stufe }), HEUTE), stufe).toBe(true);
    }
  });

  it("sperrt ohne eingetragene Faelligkeit, auch nach dem Notartermin", () => {
    expect(istAbrechenbar(posten({ kaufpreisfaelligAm: "" }), HEUTE)).toBe(false);
  });
});

describe("Die drei Summen eines Partners", () => {
  const liste: AbrechnungsPosten[] = [
    // abrechenbar
    posten({ kaufpreis: 300000, satz: 4, stufe: "faelligkeit", kaufpreisfaelligAm: "2026-09-01" }),
    // Notar durchlaufen, aber Faelligkeit noch nicht eingetragen
    posten({ kaufpreis: 200000, satz: 4, stufe: "abrechnung", kaufpreisfaelligAm: "" }),
    // erst reserviert
    posten({ kaufpreis: 400000, satz: 4, stufe: "reservierung", kaufpreisfaelligAm: "" }),
    // noch in der Beratung, gehoert in keine Summe
    posten({ kaufpreis: 500000, satz: 4, stufe: "objektauswahl", kaufpreisfaelligAm: "" }),
  ];

  it("trennt Erwartung von Faelligem", () => {
    const s = abrechnungsSummen(liste, HEUTE);
    // 300k + 200k + 400k zu je 4 Prozent
    expect(s.erwartet).toBe(36000);
    // nur die 300k
    expect(s.faellig).toBe(12000);
  });

  it("zaehlt als Abschluss nur den durchlaufenen Notartermin", () => {
    // Zwei Stueck: Faelligkeit und Abrechnung. Reservierung und
    // Objektauswahl zaehlen nicht.
    expect(abrechnungsSummen(liste, HEUTE).abschluesse).toBe(2);
  });

  it("laesst Stufen vor der Reservierung aus der Erwartung heraus", () => {
    // Die 500k aus der Objektauswahl tauchen nirgends auf.
    const s = abrechnungsSummen(liste, HEUTE);
    expect(s.erwartet).toBeLessThan(36000 + 20000);
  });

  it("meldet bei leerer Liste drei Nullen", () => {
    expect(abrechnungsSummen([], HEUTE)).toEqual({ erwartet: 0, faellig: 0, abschluesse: 0 });
  });
});

describe("Der Hinweis unter dem Betrag", () => {
  it("erklaert eine Null, statt sie nackt stehen zu lassen", () => {
    /*
     * Der Grund fuer diese Funktion: Vorher stand ueber der Summe "Diesen
     * Betrag kannst du diesen Monat in Rechnung stellen", auch wenn dort
     * null stand. Eine Null ohne Erklaerung liest sich wie ein Fehler.
     */
    const text = rechnungsHinweis({ erwartet: 12000, faellig: 0, abschluesse: 1 }, 12000);
    expect(text).toContain("Kaufpreisfälligkeit");
    expect(text).toContain("Noch nichts abrechenbar");
  });

  it("sagt bei gar keinem Abschluss etwas anderes", () => {
    const text = rechnungsHinweis({ erwartet: 0, faellig: 0, abschluesse: 0 }, 0);
    expect(text).toContain("Noch keine Abschlüsse");
  });

  it("bestaetigt, wenn etwas abrechenbar ist", () => {
    const text = rechnungsHinweis({ erwartet: 12000, faellig: 12000, abschluesse: 1 }, 0);
    expect(text).toContain("kann in Rechnung gestellt werden");
  });
});

describe("Die Abrechnungshistorie", () => {
  const liste: AbrechnungsPosten[] = [
    posten({ kaufpreis: 300000, satz: 4, stufe: "faelligkeit", kaufpreisfaelligAm: "2026-09-01" }),
    posten({ kaufpreis: 200000, satz: 4, stufe: "abrechnung", kaufpreisfaelligAm: "2026-09-20" }),
    posten({ kaufpreis: 250000, satz: 4, stufe: "abgeschlossen", kaufpreisfaelligAm: "2026-07-15" }),
    // Ohne Faelligkeit: gehoert in keinen Monat.
    posten({ kaufpreis: 400000, satz: 4, stufe: "faelligkeit", kaufpreisfaelligAm: "" }),
    // Noch nicht beim Notar durch.
    posten({ kaufpreis: 500000, satz: 4, stufe: "reservierung", kaufpreisfaelligAm: "2026-09-05" }),
  ];

  it("fasst je Monat zusammen", () => {
    const h = abrechnungsHistorie(liste);
    expect(h).toHaveLength(2);
    expect(h[0].monat).toBe("September 2026");
    expect(h[0].abschluesse).toBe(2);
    // 300k + 200k zu je 4 Prozent
    expect(h[0].provision).toBe(20000);
  });

  it("sortiert die neuesten nach oben", () => {
    const h = abrechnungsHistorie(liste);
    expect(h.map((z) => z.monatKey)).toEqual(["2026-09", "2026-07"]);
  });

  it("laesst Geschaefte ohne Faelligkeit ganz weg", () => {
    /*
     * Sie haben keinen Monat, in den sie gehoeren. Eine Zeile "unbekannt"
     * waere in einer Abrechnungshistorie schlimmer als keine.
     */
    const summe = abrechnungsHistorie(liste).reduce((s, z) => s + z.abschluesse, 0);
    expect(summe).toBe(3);
  });

  it("nimmt nur durchlaufene Notartermine auf", () => {
    // Die Reservierung mit Faelligkeitsdatum taucht nicht auf.
    const h = abrechnungsHistorie(liste);
    expect(h.find((z) => z.provision === 20000 + 20000)).toBeUndefined();
  });

  it("kommt mit einer leeren Liste zurecht", () => {
    expect(abrechnungsHistorie([])).toEqual([]);
  });

  it("verwirft ein unlesbares Datum", () => {
    const h = abrechnungsHistorie([posten({ kaufpreisfaelligAm: "irgendwann" })]);
    expect(h).toEqual([]);
  });
});
