import { describe, it, expect } from "vitest";
import {
  estimateGrenzsteuersatz,
  berechneEinkommensteuer,
  berechneSteuerersparnis,
  getBruttoFromSA,
  getVerheiratetFromSA,
  reverseSteuersatzZuZvE,
  suggestSteuersatz,
  bruttoZuZvE,
  zvEFuerRechnungAusSA,
} from "@/lib/steuerHelper";
import {
  aktuellesSteuerjahr,
  grundfreibetrag,
  tariflicheEst,
  grenzsteuersatzProzent,
} from "@/lib/einkommensteuer";

describe("berechneEinkommensteuer", () => {
  it("liefert exakt den Tarif aus einkommensteuer.ts, kein Duplikat mehr", () => {
    for (const zvE of [15000, 30000, 60000, 90000, 300000]) {
      expect(berechneEinkommensteuer(zvE, false, 2026)).toBe(tariflicheEst(zvE, 2026, "grund"));
      expect(berechneEinkommensteuer(zvE, true, 2026)).toBe(tariflicheEst(zvE, 2026, "splitting"));
    }
  });

  it("nutzt ohne Jahresangabe das aktuelle Steuerjahr", () => {
    const jahr = aktuellesSteuerjahr();
    expect(berechneEinkommensteuer(50000)).toBe(tariflicheEst(50000, jahr, "grund"));
  });

  it("kennt den aktuellen Grundfreibetrag statt des veralteten 11.604", () => {
    // Der alte steuerHelper besteuerte ab 11.605 Euro. Mit dem Tarif 2026
    // beginnt die Steuer erst oberhalb von 12.348 Euro.
    expect(berechneEinkommensteuer(12348, false, 2026)).toBe(0);
    expect(berechneEinkommensteuer(12000, false, 2026)).toBe(0);
    expect(berechneEinkommensteuer(grundfreibetrag(2026) + 100, false, 2026)).toBeGreaterThan(0);
  });
});

describe("estimateGrenzsteuersatz", () => {
  it("ist 0 unter dem Grundfreibetrag und 42/45 in den Proportionalzonen", () => {
    expect(estimateGrenzsteuersatz(10000, false, 2026)).toBe(0);
    expect(estimateGrenzsteuersatz(100000, false, 2026)).toBe(42);
    expect(estimateGrenzsteuersatz(300000, false, 2026)).toBe(45);
  });

  it("beginnt knapp ueber dem Grundfreibetrag beim Eingangssatz 14 %", () => {
    expect(estimateGrenzsteuersatz(grundfreibetrag(2026) + 10, false, 2026)).toBeCloseTo(14, 0);
  });

  it("liegt im Splitting nicht ueber dem Satz der Grundtabelle", () => {
    for (const zvE of [30000, 60000, 100000]) {
      expect(estimateGrenzsteuersatz(zvE, true, 2026)).toBeLessThanOrEqual(
        estimateGrenzsteuersatz(zvE, false, 2026),
      );
    }
    // Splitting-Grenzsatz = Grundtarif-Grenzsatz beim halben zvE
    expect(estimateGrenzsteuersatz(80000, true, 2026)).toBe(estimateGrenzsteuersatz(40000, false, 2026));
  });
});

describe("berechneSteuerersparnis", () => {
  it("entspricht der Differenz der Tarifwerte", () => {
    const { ersparnis } = berechneSteuerersparnis(60000, 10000, false, 2026);
    expect(ersparnis).toBe(
      tariflicheEst(60000, 2026, "grund") - tariflicheEst(50000, 2026, "grund"),
    );
    expect(ersparnis).toBeGreaterThan(0);
  });

  it("liefert bei Gewinn (negative Minderung) eine Mehrsteuer", () => {
    const { ersparnis } = berechneSteuerersparnis(60000, -5000, false, 2026);
    expect(ersparnis).toBeLessThan(0);
  });
});

describe("getBruttoFromSA, das Jahresbrutto aus der Selbstauskunft", () => {
  it("liest das Feld, das das Formular tatsächlich schreibt", () => {
    // Das Formular speichert Beträge als Text in deutscher Schreibweise.
    expect(getBruttoFromSA({ bruttoJahr: "90.000,00" })).toBe(90000);
    expect(getBruttoFromSA({ bruttoJahr: "72.500" })).toBe(72500);
    expect(getBruttoFromSA({ bruttoJahr: 90000 })).toBe(90000);
  });

  it("zählt die zweite Person dazu", () => {
    const sa = { bruttoJahr: "60.000", person2: true, person2Data: { bruttoJahr: "30.000" } };
    expect(getBruttoFromSA(sa)).toBe(90000);
  });

  it("zählt person2Data nicht, solange die Selbstauskunft keine zweite Person führt", () => {
    const sa = { bruttoJahr: "60.000", person2: false, person2Data: { bruttoJahr: "30.000" } };
    expect(getBruttoFromSA(sa)).toBe(60000);
  });

  it("versteht weiterhin die alten Schlüssel aus Altbeständen", () => {
    expect(getBruttoFromSA({ person1: { einkommenBruttoJahr: 100000 } })).toBe(100000);
    expect(getBruttoFromSA({ einkommenBruttoJahr: 80000 })).toBe(80000);
    expect(
      getBruttoFromSA({
        person1: { einkommenBruttoJahr: 60000 },
        person2: { einkommenBruttoJahr: 40000 },
      }),
    ).toBe(100000);
  });

  it("liefert 0 ohne Angabe, bei Unsinn und bei negativen Werten", () => {
    expect(getBruttoFromSA(null)).toBe(0);
    expect(getBruttoFromSA({})).toBe(0);
    expect(getBruttoFromSA({ bruttoJahr: "" })).toBe(0);
    expect(getBruttoFromSA({ bruttoJahr: "keine Angabe" })).toBe(0);
    expect(getBruttoFromSA({ bruttoJahr: "-5.000" })).toBe(0);
  });

  it("ergibt damit einen Steuersatz-Vorschlag statt des Rückfallwerts", () => {
    // Der eigentliche Fehler: ohne diesen Schlüssel lieferte die Funktion 0
    // und suggestSteuersatz gab immer die pauschalen 42 % zurück.
    const sa = { bruttoJahr: "90.000", familienstand: "ledig" };
    expect(suggestSteuersatz(sa, 42)).toBe(estimateGrenzsteuersatz(bruttoZuZvE(90000), false));
  });
});

describe("getVerheiratetFromSA, Splitting nur bei Ehe", () => {
  it("erkennt den Familienstand verheiratet", () => {
    expect(getVerheiratetFromSA({ person1: { familienstand: "Verheiratet" } })).toBe(true);
    expect(getVerheiratetFromSA({ familienstand: "verheiratet" })).toBe(true);
    expect(getVerheiratetFromSA({ person1: { familienstand: "Eingetragene Lebenspartnerschaft" } })).toBe(true);
  });

  it("unterstellt Splitting NICHT mehr allein wegen einer zweiten Person", () => {
    // Vorher: !!saData.person2 reichte, ein unverheiratetes Paar bekam Splitting.
    expect(
      getVerheiratetFromSA({
        person1: { familienstand: "ledig", einkommenBruttoJahr: 60000 },
        person2: { familienstand: "ledig", einkommenBruttoJahr: 40000 },
      }),
    ).toBe(false);
    expect(getVerheiratetFromSA(null)).toBe(false);
  });

  it("wirkt entsprechend auf den Steuersatz-Vorschlag", () => {
    const ledigesPaar = {
      person1: { familienstand: "ledig", einkommenBruttoJahr: 60000 },
      person2: { familienstand: "ledig", einkommenBruttoJahr: 60000 },
    };
    const ehepaar = {
      person1: { familienstand: "verheiratet", einkommenBruttoJahr: 60000 },
      person2: { familienstand: "verheiratet", einkommenBruttoJahr: 60000 },
    };
    const zvE = bruttoZuZvE(120000);
    expect(suggestSteuersatz(ledigesPaar)).toBe(estimateGrenzsteuersatz(zvE, false));
    expect(suggestSteuersatz(ehepaar)).toBe(estimateGrenzsteuersatz(zvE, true));
  });
});

describe("reverseSteuersatzZuZvE", () => {
  it("invertiert den Tarif in den Progressionszonen", () => {
    for (const satz of [20, 30, 38]) {
      const zvE = reverseSteuersatzZuZvE(satz, false, 2026);
      expect(grenzsteuersatzProzent(zvE, 2026, "grund")).toBeCloseTo(satz, 1);
    }
  });

  it("liefert fuer 42/45 % die Zonenuntergrenze statt erfundener Pauschalen", () => {
    // Vorher: fest 90.000 bzw. 300.000 Euro.
    const zvE42 = reverseSteuersatzZuZvE(42, false, 2026);
    expect(zvE42).toBe(69879); // Untergrenze der 42-Prozent-Zone 2026
    expect(estimateGrenzsteuersatz(zvE42, false, 2026)).toBe(42);
    const zvE45 = reverseSteuersatzZuZvE(45, false, 2026);
    expect(zvE45).toBe(277826);
    expect(estimateGrenzsteuersatz(zvE45, false, 2026)).toBe(45);
  });

  it("verdoppelt das zvE im Splitting", () => {
    expect(reverseSteuersatzZuZvE(30, true, 2026)).toBe(2 * reverseSteuersatzZuZvE(30, false, 2026));
  });
});

describe("zvEFuerRechnungAusSA, die eine Regel für alle Steuerrechnungen", () => {
  it("nimmt das angegebene zvE vor der Schätzung aus dem Brutto", () => {
    expect(zvEFuerRechnungAusSA({ bruttoJahr: "90.000,00", zvEJahr: "71.500,00" })).toEqual({ zvE: 71_500, angegeben: true });
  });

  it("schätzt ohne Angabe wie bisher aus dem Brutto, leer zählt nicht als Angabe", () => {
    expect(zvEFuerRechnungAusSA({ bruttoJahr: "90.000,00", zvEJahr: "" })).toEqual({ zvE: 63_000, angegeben: false });
  });

  it("eine eingetragene 0 ist eine Angabe", () => {
    expect(zvEFuerRechnungAusSA({ bruttoJahr: "90.000,00", zvEJahr: "0" })).toEqual({ zvE: 0, angegeben: true });
    expect(suggestSteuersatz({ bruttoJahr: "90.000,00", zvEJahr: "0" }, 42)).toBe(0);
  });

  it("ohne zvE und Brutto gibt es nichts, der Vorgabesatz bleibt", () => {
    expect(zvEFuerRechnungAusSA({})).toBeNull();
    expect(suggestSteuersatz({}, 42)).toBe(42);
  });

  it("bei Zusammenveranlagung zählt das gemeinsame zvE von Person 1 mit Splitting", () => {
    const sa = { familienstand: "Verheiratet", person2: true, zvEJahr: "120.000", person2Data: { zvEJahr: "50.000" } };
    expect(zvEFuerRechnungAusSA(sa)).toEqual({ zvE: 120_000, angegeben: true });
    expect(suggestSteuersatz(sa)).toBe(estimateGrenzsteuersatz(120_000, true));
  });
});

describe("Steuerwirkung bei einem zvE von 0 (Tarifdifferenz)", () => {
  it("besteuert einen Überschuss von 20.000 Euro nach Grundtarif 2026, statt 0 Euro", () => {
    const { ersparnis } = berechneSteuerersparnis(0, -20_000, false, 2026);
    expect(ersparnis).toBe(-tariflicheEst(20_000, 2026, "grund"));
    // Rund 1.570 Euro Mehrsteuer, wie in der Prüfung nachgerechnet.
    expect(Math.abs(ersparnis)).toBeGreaterThan(1_500);
    expect(Math.abs(ersparnis)).toBeLessThan(1_650);
  });

  it("nimmt bei Splitting den Splittingtarif", () => {
    const { ersparnis } = berechneSteuerersparnis(0, -40_000, true, 2026);
    expect(ersparnis).toBe(-tariflicheEst(40_000, 2026, "splitting"));
    expect(ersparnis).toBeLessThan(0);
  });

  it("ein Verlust spart bei zvE 0 nichts, die Steuer fällt nicht unter 0", () => {
    expect(berechneSteuerersparnis(0, 8_000, false, 2026).ersparnis).toBe(0);
  });
});
