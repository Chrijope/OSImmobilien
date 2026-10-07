/**
 * Die Rechnung des AfA-Rechners, an echten Konstellationen festgehalten.
 *
 * Warum es diese Datei gibt: Die Zahlen, die hier entstehen, traegt ein Kunde
 * in seine Steuererklaerung. Jede erwartete Zahl unten ist von Hand aus den
 * Formeln nachgerechnet worden, die die Anlage 2 ImmoWertV und § 7 Abs. 4 EStG
 * vorgeben. Der Rechenweg steht jeweils im Kommentar ueber der Erwartung.
 *
 * Das Stichjahr ist in jedem Fall fest gesetzt. Ohne das waeren alle Zahlen am
 * 1. Januar stillschweigend falsch, und ein gruener Lauf wuerde das verdecken.
 */
import { describe, expect, it } from "vitest";
import {
  berechneAfa,
  berechneSteuerwirkung,
  bundeslandFromPlz,
  createDefaultModZeitraeume,
  migrateObjektart,
  migrateZeitraeume,
  nebenkostenBetrag,
  nebenkostensatzFuerBundesland,
  type AfaEingaben,
} from "@/lib/afaRechnung";

const STICHJAHR = 2026;

/**
 * Eine Eigentumswohnung fuer 300.000 Euro, 8,5 Prozent Nebenkosten (NRW),
 * 20 Prozent Grundstuecksanteil, keine Modernisierung erfasst.
 */
const objekt = (abweichung: Partial<AfaEingaben> = {}): AfaEingaben => ({
  objektart: "Eigentumswohnung (ETW)",
  kaufpreis: 300000,
  nebenkosten: 25500,
  bodenAnteilPct: 20,
  sanierungskosten: 0,
  baujahr: 1985,
  modZeitraeume: createDefaultModZeitraeume(),
  kernsanierungAktiv: false,
  afaModus: "berechnen",
  stichjahr: STICHJAHR,
  ...abweichung,
});

/** Alle acht Elemente frisch modernisiert, also die vollen 20 Punkte. */
const alleFrischModernisiert = (): Record<string, string> => ({
  dach: "unter5",
  fenster: "unter5",
  leitungen: "unter5",
  heizung: "unter5",
  waermedaemmung: "unter5",
  bad: "unter5",
  innenausbau: "unter5",
  grundriss: "unter5",
});

describe("Kaufpreisaufteilung", () => {
  it("teilt den Kaufpreis nach dem Grundstuecksanteil und rechnet die Nebenkosten anteilig mit", () => {
    const r = berechneAfa(objekt());
    // 300.000 x 20 % = 60.000 Boden, der Rest ist Gebaeude.
    expect(r.bodenwertGesamt).toBe(60000);
    expect(r.gebaeudewert).toBe(240000);
    expect(r.bodenPct).toBe(20);
    expect(r.gebaeudePct).toBe(80);
    // Von 25.500 Euro Nebenkosten entfallen 80 Prozent auf das Gebaeude.
    expect(r.steuerlichNK).toBe(20400);
    expect(r.afaBemessungsgrundlage).toBe(260400);
  });

  it("haelt einen hoeheren Grundstuecksanteil sauber durch", () => {
    const r = berechneAfa(objekt({ bodenAnteilPct: 35 }));
    expect(r.bodenwertGesamt).toBe(105000);
    expect(r.gebaeudewert).toBe(195000);
    expect(r.gebaeudePct).toBeCloseTo(65, 10);
    // 25.500 x 65 % = 16.575
    expect(r.steuerlichNK).toBeCloseTo(16575, 6);
    expect(r.afaBemessungsgrundlage).toBeCloseTo(211575, 6);
  });

  it("stuerzt bei Kaufpreis null nicht ab und weist nichts aus", () => {
    const r = berechneAfa(objekt({ kaufpreis: 0, nebenkosten: 0 }));
    expect(r.gebaeudewert).toBe(0);
    expect(r.gebaeudePct).toBe(0);
    expect(r.afaBemessungsgrundlage).toBe(0);
    expect(r.afaBetragPa).toBe(0);
  });
});

describe("Bestandsimmobilie", () => {
  it("rechnet unterhalb der Schwelle schlicht Gesamtnutzungsdauer minus Alter", () => {
    const r = berechneAfa(objekt());
    // Baujahr 1985, Stichjahr 2026, also 41 Jahre alt bei 80 Jahren GND.
    expect(r.alter).toBe(41);
    expect(r.gnd).toBe(80);
    // Ohne erfasste Modernisierung 0 Punkte, dort beginnt die Formel erst bei
    // 60 Prozent relativem Alter. 41/80 = 51,25 Prozent liegt darunter.
    expect(r.modPunkte).toBe(0);
    expect(r.rndErgebnis.relativesAlter).toBeCloseTo(51.25, 6);
    expect(r.rndErgebnis.unterSchwelle).toBe(true);
    // 80 - 41 = 39, der Deckel von 70 Prozent (56 Jahre) greift nicht.
    expect(r.rnd).toBe(39);
    // 100 / 39 = 2,5641 Prozent, ueber dem gesetzlichen Satz von 2 Prozent.
    expect(r.afaSatzRoh).toBeCloseTo(2.5641025641, 8);
    expect(r.afaSatz).toBeCloseTo(2.5641025641, 8);
    expect(r.untergrenze.gesetzlich.satz).toBe(2);
    expect(r.untergrenze.untergrenzeGreift).toBe(false);
    // Ueber dem gesetzlichen Satz geht es nur mit Nachweis.
    expect(r.untergrenze.nachweisNoetig).toBe(true);
    // 260.400 x 2,5641 % = 6.676,92
    expect(r.afaBetragPa).toBeCloseTo(6676.923076923, 6);
  });

  it("rechnet oberhalb der Schwelle mit der Formel der Anlage 2", () => {
    const r = berechneAfa(objekt({ baujahr: 1910 }));
    expect(r.alter).toBe(116);
    expect(r.rndErgebnis.unterSchwelle).toBe(false);
    // a x (Alter^2 / GND) - b x Alter + c x GND, mit 0 Punkten:
    // 1,25 x (116^2 / 80) - 2,625 x 116 + 1,525 x 80
    // = 210,25 - 304,5 + 122 = 27,75
    expect(r.rndErgebnis.rndFormel).toBeCloseTo(27.75, 8);
    expect(r.rnd).toBe(28);
    // Fertigstellung vor 1925 gibt gesetzlich 2,5 Prozent her.
    expect(r.untergrenze.gesetzlich.satz).toBe(2.5);
    // 100 / 28 = 3,5714 liegt darueber.
    expect(r.afaSatz).toBeCloseTo(3.5714285714, 8);
    expect(r.afaBetragPa).toBeCloseTo(9300, 6);
  });

  it("deckelt die Restnutzungsdauer bei 70 Prozent der Gesamtnutzungsdauer", () => {
    // 1960 gebaut, alle acht Elemente in den letzten fuenf Jahren erneuert.
    const r = berechneAfa(objekt({ baujahr: 1960, modZeitraeume: alleFrischModernisiert() }));
    expect(r.modPunkte).toBe(20);
    expect(r.alter).toBe(66);
    // Mit 20 Punkten gilt die Formel ab 10 Prozent, 66/80 = 82,5 Prozent.
    expect(r.rndErgebnis.unterSchwelle).toBe(false);
    // 0,2 x (66^2 / 80) - 0,44 x 66 + 0,942 x 80 = 10,89 - 29,04 + 75,36 = 57,21
    expect(r.rndErgebnis.rndFormel).toBeCloseTo(57.21, 8);
    // Gedeckelt auf 0,7 x 80 = 56 Jahre.
    expect(r.rndErgebnis.gedeckelt).toBe(true);
    expect(r.rndErgebnis.deckel).toBe(56);
    expect(r.rnd).toBe(56);
    // 100 / 56 = 1,7857 Prozent liegt UNTER dem gesetzlichen Satz von 2 Prozent,
    // deshalb gilt der gesetzliche.
    expect(r.afaSatzRoh).toBeCloseTo(1.7857142857, 8);
    expect(r.untergrenze.untergrenzeGreift).toBe(true);
    expect(r.afaSatz).toBe(2);
    expect(r.afaBetragPa).toBeCloseTo(5208, 6);
  });

  it("weist ohne Baujahr gar nichts aus, statt eine Zahl zu erfinden", () => {
    const r = berechneAfa(objekt({ baujahr: 0 }));
    expect(r.baujahrBekannt).toBe(false);
    expect(r.alter).toBe(0);
    expect(r.rnd).toBe(0);
    expect(r.afaSatz).toBe(0);
    expect(r.afaBetragPa).toBe(0);
    // Die Bemessungsgrundlage steht trotzdem, sie haengt nicht am Baujahr.
    expect(r.afaBemessungsgrundlage).toBe(260400);
  });

  it("behandelt ein Baujahr in der Zukunft als unbekannt", () => {
    const r = berechneAfa(objekt({ baujahr: STICHJAHR + 1 }));
    expect(r.baujahrBekannt).toBe(false);
    expect(r.rnd).toBe(0);
  });
});

describe("Neubau", () => {
  it("setzt den gesetzlichen Satz von drei Prozent ab Fertigstellung 2023 an", () => {
    const r = berechneAfa(objekt({ baujahr: 2024, kaufpreis: 400000, nebenkosten: 22000 }));
    expect(r.alter).toBe(2);
    // 80 - 2 = 78, gedeckelt auf 56.
    expect(r.rnd).toBe(56);
    expect(r.afaSatzRoh).toBeCloseTo(1.7857142857, 8);
    expect(r.untergrenze.gesetzlich.satz).toBe(3);
    expect(r.untergrenze.gesetzlich.paragraf).toBe("§ 7 Abs. 4 Satz 1 Nr. 2 a EStG");
    expect(r.untergrenze.untergrenzeGreift).toBe(true);
    expect(r.afaSatz).toBe(3);
    // 400.000 x 80 % = 320.000 plus 22.000 x 80 % = 17.600 sind 337.600.
    expect(r.afaBemessungsgrundlage).toBe(337600);
    expect(r.afaBetragPa).toBeCloseTo(10128, 6);
  });

  it("bleibt zwischen 1925 und 2022 bei zwei Prozent", () => {
    const r = berechneAfa(objekt({ baujahr: 2015, modZeitraeume: alleFrischModernisiert() }));
    expect(r.untergrenze.gesetzlich.satz).toBe(2);
    expect(r.afaSatz).toBe(2);
  });
});

describe("Kernsanierung", () => {
  it("setzt das Sanierungsjahr als fiktives Baujahr und deckelt bei 90 Prozent", () => {
    const r = berechneAfa(objekt({ baujahr: 1960, kernsanierungAktiv: true, kernsanierungJahr: 2022 }));
    expect(r.kernsaniert).toBe(true);
    expect(r.effektivesBaujahr).toBe(2022);
    // Alter aus dem Sanierungsjahr, nicht aus 1960.
    expect(r.alter).toBe(4);
    // Sanierung liegt unter fuenf Jahre zurueck, also volle 20 Punkte.
    expect(r.modPunkte).toBe(20);
    // 80 - 4 = 76, kernsaniert gedeckelt auf 0,9 x 80 = 72.
    expect(r.rndErgebnis.deckel).toBe(72);
    expect(r.rnd).toBe(72);
    // Der gesetzliche Satz richtet sich weiter nach dem echten Baujahr 1960.
    expect(r.untergrenze.gesetzlich.satz).toBe(2);
    expect(r.afaSatz).toBe(2);
    expect(r.afaBetragPa).toBeCloseTo(5208, 6);
  });

  it("wertet eine laenger zurueckliegende Kernsanierung ab", () => {
    // 12 Jahre her, Faktor 0,6: aus 4/2/2/2/4/2/2/2 werden 2/1/1/1/2/1/1/1 = 10.
    const r = berechneAfa(objekt({ baujahr: 1960, kernsanierungAktiv: true, kernsanierungJahr: 2014 }));
    expect(r.modPunkte).toBe(10);
    expect(r.alter).toBe(12);
    // 80 - 12 = 68, Deckel 72 greift nicht.
    expect(r.rnd).toBe(68);
  });

  it("laesst den Schalter ohne Jahresangabe wirkungslos", () => {
    const r = berechneAfa(objekt({ baujahr: 1985, kernsanierungAktiv: true, kernsanierungJahr: undefined }));
    expect(r.kernsaniert).toBe(false);
    expect(r.effektivesBaujahr).toBe(1985);
    expect(r.rnd).toBe(39);
  });
});

describe("Gutachten zur Restnutzungsdauer", () => {
  it("uebernimmt die Restnutzungsdauer und leitet den Satz daraus ab", () => {
    const r = berechneAfa(objekt({ afaModus: "gutachten", rndManuell: 17 }));
    expect(r.rnd).toBe(17);
    // 100 / 17 = 5,8824 Prozent
    expect(r.afaSatz).toBeCloseTo(5.8823529412, 8);
    expect(r.untergrenze.nachweisNoetig).toBe(true);
    expect(r.afaBetragPa).toBeCloseTo(15317.647058824, 6);
  });

  it("leitet umgekehrt aus dem Satz die Restnutzungsdauer ab", () => {
    const r = berechneAfa(objekt({ afaModus: "gutachten", afaSatzManuell: 5.88 }));
    // 100 / 5,88 = 17,006, gerundet 17
    expect(r.rnd).toBe(17);
    expect(r.afaSatz).toBeCloseTo(5.88, 8);
  });

  it("gibt der Restnutzungsdauer den Vorrang vor dem Satz", () => {
    const r = berechneAfa(objekt({ afaModus: "gutachten", rndManuell: 20, afaSatzManuell: 5.88 }));
    expect(r.rnd).toBe(20);
    expect(r.afaSatz).toBe(5);
  });

  it("weist ohne beide Angaben nichts aus", () => {
    const r = berechneAfa(objekt({ afaModus: "gutachten" }));
    expect(r.rnd).toBe(0);
    expect(r.afaSatz).toBe(0);
    expect(r.afaBetragPa).toBe(0);
  });

  it("hebt einen zu niedrigen Gutachtenwert auf den gesetzlichen Satz", () => {
    // 100 Jahre Restnutzungsdauer waeren ein Prozent. Das Gesetz gibt zwei her,
    // und niemand schreibt freiwillig langsamer ab.
    const r = berechneAfa(objekt({ afaModus: "gutachten", rndManuell: 100 }));
    expect(r.afaSatzRoh).toBe(1);
    expect(r.untergrenze.untergrenzeGreift).toBe(true);
    expect(r.afaSatz).toBe(2);
  });
});

describe("Erhaltungsaufwand und die 15-Prozent-Grenze", () => {
  it("laesst den Aufwand unterhalb der Grenze aus der Bemessungsgrundlage heraus", () => {
    const r = berechneAfa(objekt({ sanierungskosten: 30000 }));
    // 15 Prozent von 260.400 sind 39.060.
    expect(r.anschaffungsnah.grenze).toBeCloseTo(39060, 6);
    expect(r.anschaffungsnah.ueberschritten).toBe(false);
    expect(r.anschaffungsnah.auslastung).toBeCloseTo(0.768049155, 8);
    expect(r.afaBemessungsgrundlage).toBe(260400);
  });

  it("zieht den Aufwand oberhalb der Grenze in die Bemessungsgrundlage", () => {
    const r = berechneAfa(objekt({ sanierungskosten: 60000 }));
    expect(r.anschaffungsnah.ueberschritten).toBe(true);
    // 260.400 + 60.000
    expect(r.afaBemessungsgrundlage).toBe(320400);
    expect(r.afaBetragPa).toBeCloseTo(8215.384615385, 6);
  });
});

describe("Steuerwirkung, ueberschlaegig", () => {
  it("verteilt den Erhaltungsaufwand nach § 82b EStDV auf mehrere Jahre", () => {
    const r = berechneAfa(objekt({ sanierungskosten: 30000 }));
    const w = berechneSteuerwirkung(r, 30000, 3, 42);
    expect(w.erhaltungsaufwandProJahr).toBe(10000);
    // 6.676,92 AfA plus 10.000 Erhaltungsaufwand
    expect(w.absetzbarErstesJahr).toBeCloseTo(16676.923076923, 6);
    expect(w.ersparnisErstesJahr).toBeCloseTo(7004.307692308, 6);
    expect(w.ersparnisAfaProJahr).toBeCloseTo(2804.307692308, 6);
  });

  it("zaehlt den Aufwand nicht doppelt, wenn er schon in der Bemessungsgrundlage steckt", () => {
    const r = berechneAfa(objekt({ sanierungskosten: 60000 }));
    const w = berechneSteuerwirkung(r, 60000, 3, 42);
    expect(w.erhaltungsaufwandProJahr).toBe(0);
    expect(w.absetzbarErstesJahr).toBeCloseTo(r.afaBetragPa, 8);
  });

  it("begrenzt die Verteilung auf ein bis fuenf Jahre", () => {
    const r = berechneAfa(objekt({ sanierungskosten: 30000 }));
    expect(berechneSteuerwirkung(r, 30000, 0, 42).erhaltungsaufwandProJahr).toBe(30000);
    expect(berechneSteuerwirkung(r, 30000, 9, 42).erhaltungsaufwandProJahr).toBe(6000);
  });
});

describe("Gesamtnutzungsdauer nach Objektart", () => {
  it("nimmt fuer ein Gewerbeobjekt 60 Jahre statt 80", () => {
    const r = berechneAfa(objekt({ objektart: "Gewerbeobjekt", baujahr: 2000 }));
    expect(r.gnd).toBe(60);
    // 60 - 26 = 34, Deckel 0,7 x 60 = 42 greift nicht.
    expect(r.rnd).toBe(34);
  });
});

describe("Nebenkosten und Bundesland", () => {
  it("kennt die hinterlegten Gesamtsaetze", () => {
    expect(nebenkostensatzFuerBundesland("nrw")).toBe(8.5);
    expect(nebenkostensatzFuerBundesland("bayern")).toBe(5.5);
    expect(nebenkostensatzFuerBundesland("andere")).toBe(0);
    expect(nebenkostensatzFuerBundesland("gibtesnicht")).toBe(0);
  });

  it("rechnet den Betrag auf den Cent", () => {
    expect(nebenkostenBetrag(300000, 8.5)).toBe(25500);
    expect(nebenkostenBetrag(333333, 7.5)).toBe(24999.98);
    expect(nebenkostenBetrag(0, 8.5)).toBe(0);
    expect(nebenkostenBetrag(300000, 0)).toBe(0);
  });

  it("leitet das Bundesland nur aus eindeutigen Postleitzahlen ab", () => {
    expect(bundeslandFromPlz("50667")).toBe("nrw");
    expect(bundeslandFromPlz("80331")).toBe("bayern");
    expect(bundeslandFromPlz("20095")).toBe("hamburg");
    // 21 und 89 sind uneindeutig, dort soll der Nutzer selbst waehlen.
    expect(bundeslandFromPlz("21073")).toBeNull();
    expect(bundeslandFromPlz("89073")).toBeNull();
    expect(bundeslandFromPlz("")).toBeNull();
    expect(bundeslandFromPlz("abc")).toBeNull();
  });
});

describe("Altbestand aus gespeicherten Entwuerfen", () => {
  it("uebersetzt alte Objektart-Bezeichnungen", () => {
    expect(migrateObjektart("Mietwohngrundstück")).toBe("Mehrfamilienhaus");
    expect(migrateObjektart("Eigentumswohnung (ETW)")).toBe("Eigentumswohnung (ETW)");
    expect(migrateObjektart("Quatsch")).toBe("Eigentumswohnung (ETW)");
  });

  it("uebersetzt die alte dreistufige Zeitraumskala", () => {
    expect(migrateZeitraeume({ dach: "unter10", fenster: "10bis20", bad: "unter5" })).toEqual({
      dach: "5bis10",
      fenster: "10bis15",
      bad: "unter5",
    });
  });

  it("startet mit allen Elementen auf ueber 20 Jahre, das ergibt null Punkte", () => {
    const r = berechneAfa(objekt({ modZeitraeume: createDefaultModZeitraeume() }));
    expect(r.modPunkte).toBe(0);
  });
});
