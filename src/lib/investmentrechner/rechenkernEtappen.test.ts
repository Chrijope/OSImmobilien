import { describe, expect, it } from "vitest";
import golden from "./rechenkern.golden.json";
import {
  banktilgungsplan,
  berechneInvestment,
  sondertilgungenJeJahr,
  type InvestmentEingabe,
} from "./rechenkern";
import { bankuebersicht, zinsrisiko } from "./bankgespraech";
import { AMPEL_SCHWELLEN, ampel, ampelfarbe } from "./ampel";
import { bankunterlagenAusSa, haushaltsrechnung, vermoegensaufstellung } from "./bankunterlagen";
import { eingabeAusJson } from "@/lib/investmentBerechnungenStore";

/*
 * Die drei Etappen vom 11.10.2026: Anschlussfinanzierung, Sondertilgungen,
 * zweites Bankdarlehen, Ampel und Unterlagen fürs Bankgespräch. Ohne neue
 * Eingaben bleibt jede Zahl wie in rechenkern.golden.json (rechenkern.test.ts).
 */

const standard = (golden as unknown as { standard: { input: InvestmentEingabe } }).standard.input;
const mit = (aenderung: Partial<InvestmentEingabe>) => berechneInvestment({ ...standard, ...aenderung });

describe("Anschlusszins des Bankdarlehens", () => {
  it("ohne Anschlusszins ändert eine Zinsbindung nichts", () => {
    const ohne = berechneInvestment(standard);
    const kurz = mit({ seniorFixedRateYears: 3 });
    expect(kurz.years.map((j) => j.remainingDebt)).toEqual(ohne.years.map((j) => j.remainingDebt));
  });

  it("gilt ab dem Jahr nach der Zinsbindung, mit neuer Rate auf die Restschuld", () => {
    const basis = berechneInvestment(standard);
    const r = mit({ seniorFixedRateYears: 5, seniorFollowUpRate: 6 });
    // Bis zur Zinsbindung gleich.
    for (let i = 0; i < 5; i += 1) expect(r.years[i].interest).toBeCloseTo(basis.years[i].interest, 6);
    const rest5 = r.years[4].darlehen.bank.closingBalance;
    expect(r.bankRestschuldZinsbindung).toBeCloseTo(rest5, 6);
    expect(r.years[5].darlehen.bank.zinssatz).toBeCloseTo(0.06, 9);
    expect(r.years[4].darlehen.bank.zinssatz).toBeCloseTo(0.04, 9);
    // Seit dem 22.10.2026 monatlich: Der Jahreszins liegt etwas unter 6 % der Restschuld zu Jahresbeginn.
    expect(r.years[5].darlehen.bank.interest).toBeLessThan(rest5 * 0.06);
    expect(r.years[5].darlehen.bank.interest).toBeGreaterThan(rest5 * 0.059);
    // Neue Rate: Restschuld mal (6 % + anfängliche 1,5 %), je Monat durch 12.
    expect(r.years[5].darlehen.bank.payment).toBeCloseTo(rest5 * 0.075, 6);
    // Mehr Zins senkt den Cashflow, die Steuer gibt einen Teil zurück.
    expect(r.years[5].cashflowBeforeTax).toBeLessThan(basis.years[5].cashflowBeforeTax);
    expect(r.years[5].taxEffect).toBeGreaterThan(basis.years[5].taxEffect);
  });

  it("neue Tilgung ohne Anschlusszins: heutiger Zins, Rate mit der neuen Tilgung", () => {
    const r = mit({ seniorFixedRateYears: 5, seniorFollowUpRepaymentRate: 3 });
    const rest5 = r.years[4].darlehen.bank.closingBalance;
    expect(r.years[5].darlehen.bank.payment).toBeCloseTo(rest5 * 0.07, 6);
  });

  it("Zinsänderungsrisiko im letzten Jahr rechnet mit dem Anschlusszins", () => {
    const eingabe = { ...standard, seniorFixedRateYears: 5, seniorFollowUpRate: 6 };
    const r = berechneInvestment(eingabe);
    const risiko = zinsrisiko(eingabe, r, r.years.length - 1);
    // Monatlich getilgt liegt der Jahreszins knapp unter 6 % der Restschuld zu Jahresbeginn.
    expect(risiko?.zinsHeute).toBeCloseTo(0.0594, 3);
  });
});

describe("Sondertilgungen", () => {
  it("mindern die Restschuld am Jahresende und stecken in Tilgung und Cashflow", () => {
    const basis = berechneInvestment(standard);
    const r = mit({ specialRepayments: [{ jahr: 2028, betrag: 10000 }] });
    const i = 2;
    expect(r.years[i].sondertilgung).toBe(10000);
    expect(r.years[i].darlehen.bank.closingBalance).toBeCloseTo(basis.years[i].darlehen.bank.closingBalance - 10000, 6);
    expect(r.years[i].principal).toBeCloseTo(basis.years[i].principal + 10000, 6);
    expect(r.years[i].cashflowBeforeTax).toBeCloseTo(basis.years[i].cashflowBeforeTax - 10000, 6);
    // Steuerlich keine Werbungskosten.
    expect(r.years[i].taxableResult).toBeCloseTo(basis.years[i].taxableResult, 6);
    // Danach weniger Zinsen bei gleicher Rate.
    expect(r.years[i + 1].interest).toBeLessThan(basis.years[i + 1].interest);
    expect(r.sondertilgungenGesamt).toBe(10000);
  });

  it("mehrere im selben Jahr zählen zusammen, außerhalb der Prognose gar nicht", () => {
    expect(sondertilgungenJeJahr([{ jahr: 2027, betrag: 1000 }, { jahr: 2027, betrag: 500 }, { jahr: 2050, betrag: 9 }], 2026, 3)).toEqual([0, 1500, 0]);
  });

  it("die Restschuld wird nie negativ", () => {
    const r = mit({ specialRepayments: [{ jahr: 2027, betrag: 10_000_000 }] });
    expect(r.years[1].darlehen.bank.closingBalance).toBe(0);
    // Gezahlt wird nur, was nach der Rate noch offen war.
    expect(r.years[1].sondertilgung).toBeLessThan(r.years[0].darlehen.bank.closingBalance);
    r.years.slice(2).forEach((j) => expect(j.darlehen.bank.closingBalance).toBe(0));
  });

  it("verkürzen die Volltilgung im Bankgespräch", () => {
    const eingabe = { ...standard, specialRepayments: [{ jahr: 2027, betrag: 50000 }] };
    const ohne = bankuebersicht(standard, berechneInvestment(standard));
    const mitSt = bankuebersicht(eingabe, berechneInvestment(eingabe));
    expect(mitSt.volltilgungBank!).toBeLessThan(ohne.volltilgungBank!);
  });
});

describe("Zweites Bankdarlehen", () => {
  it("ersetzt einen Teil des Bankdarlehens, die Summe bleibt", () => {
    const basis = berechneInvestment(standard);
    const r = mit({ secondLoanAmount: 50000, secondInterestRate: 3, secondRepaymentRate: 2 });
    expect(r.secondLoanAmount).toBe(50000);
    expect(r.seniorLoanAmount).toBeCloseTo(basis.seniorLoanAmount - 50000, 6);
    expect(r.totalDebt).toBeCloseTo(basis.totalDebt, 6);
    // Monatlich: 50.000 × 5 % ÷ 12 Rate, Zins etwas unter 1.500 €.
    expect(r.years[0].darlehen.bank2.interest).toBeLessThan(1500);
    expect(r.years[0].darlehen.bank2.interest).toBeGreaterThan(1480);
    expect(r.years[0].darlehen.bank2.payment).toBeCloseTo(2500, 6);
    expect(r.monthlyDebtService).toBeLessThan(basis.monthlyDebtService);
  });

  it("wird auf den offenen Finanzierungsbedarf gedeckelt", () => {
    const r = mit({ secondLoanAmount: 10_000_000 });
    expect(r.secondLoanAmount).toBeCloseTo(r.finanzierungsbedarf, 6);
    expect(r.seniorLoanAmount).toBe(0);
  });

  it("bekommt seinen Anschlusszins nach der eigenen Zinsbindung", () => {
    const r = mit({ secondLoanAmount: 50000, secondFixedRateYears: 2, secondFollowUpRate: 7 });
    expect(r.years[2].darlehen.bank2.zinssatz).toBeCloseTo(0.07, 9);
  });
});

describe("Anschlusszins KfW", () => {
  it("gilt nach der KfW-Zinsbindung, davor bleibt alles gleich", () => {
    const kfw = { kfwEnabled: true, kfwLoanAmount: 100000, kfwInterestRate: 2, kfwFixedRateYears: 3, kfwTermYears: 20 };
    const ohne = mit(kfw);
    const r = mit({ ...kfw, kfwFollowUpRate: 5 });
    expect(r.years[2].darlehen.kfw.interest).toBeCloseTo(ohne.years[2].darlehen.kfw.interest, 6);
    expect(r.years[3].darlehen.kfw.interest).toBeGreaterThan(ohne.years[3].darlehen.kfw.interest);
    expect(r.years[3].darlehen.kfw.zinssatz).toBeCloseTo(0.05, 9);
  });
});

describe("banktilgungsplan", () => {
  it("rechnet monatlich mit fester Monatsrate (seit dem 22.10.2026)", () => {
    const plan = banktilgungsplan({ betrag: 100000, zinsProzent: 4, tilgungProzent: 2, zinsbindungJahre: 10, anschlusszinsProzent: 0, neueTilgungProzent: 0, jahre: 2 });
    // Monatsrate 500 €, Tilgung im ersten Monat 166,67 €, danach wachsend um den Faktor 1 + 0,04 ÷ 12.
    const q = 1 + 0.04 / 12;
    const tilgung1 = ((100000 * 0.02) / 12) * ((q ** 12 - 1) / (q - 1));
    expect(plan[0].payment).toBeCloseTo(6000, 6);
    expect(plan[0].principal).toBeCloseTo(tilgung1, 6);
    expect(plan[0].interest).toBeCloseTo(6000 - tilgung1, 6);
    expect(plan[1].closingBalance).toBeCloseTo(100000 - tilgung1 * (1 + q ** 12), 6);
  });
});

describe("Ampel", () => {
  it("Grün, Gelb und Rot an den Schwellen", () => {
    const s = AMPEL_SCHWELLEN.bruttorendite;
    expect(ampelfarbe(0.045, s)).toBe("gruen");
    expect(ampelfarbe(0.0449, s)).toBe("gelb");
    expect(ampelfarbe(0.035, s)).toBe("gelb");
    expect(ampelfarbe(0.0349, s)).toBe("rot");
    expect(ampelfarbe(null, s)).toBeNull();
    expect(ampelfarbe(-100, AMPEL_SCHWELLEN.cashflowOperativ)).toBe("gelb");
    expect(ampelfarbe(-150.01, AMPEL_SCHWELLEN.cashflowNachSteuern)).toBe("rot");
  });

  it("liefert alle fünf Kennzahlen aus dem Ergebnis", () => {
    const r = berechneInvestment(standard);
    const zeilen = ampel(standard, r);
    expect(zeilen.map((z) => z.kennzahl)).toEqual([
      "bruttorendite",
      "nettorendite",
      "eigenkapitalrendite",
      "cashflowOperativ",
      "cashflowNachSteuern",
    ]);
    expect(zeilen[0].wert).toBeCloseTo(r.grossYield, 9);
    expect(zeilen[3].wert).toBeCloseTo(r.years[0].cashflowBeforeTax / 12, 9);
    expect(zeilen[4].wert).toBeCloseTo(r.years[0].cashflowAfterTax / 12, 9);
  });
});

describe("Haushaltsrechnung und Vermögensaufstellung", () => {
  it("Überschuss vor und nach dem Investment", () => {
    const r = berechneInvestment(standard);
    const h = haushaltsrechnung(
      { einkuenfte: [{ bezeichnung: "Netto", betrag: 4000 }], ausgaben: [{ bezeichnung: "Leben", betrag: 2500 }] },
      r,
    );
    expect(h.ueberschussVorMonat).toBe(1500);
    const erstes = r.years[0];
    expect(h.rateMonat).toBeCloseTo(r.monthlyDebtService, 9);
    expect(h.ueberschussNachMonat).toBeCloseTo(
      1500 + erstes.effectiveRent / 12 - r.monthlyDebtService - (erstes.operatingCosts + erstes.reserveContribution) / 12,
      9,
    );
    expect(h.ueberschussNachMitSteuerMonat).toBeCloseTo(h.ueberschussNachMonat + erstes.taxEffect / 12, 9);
  });

  it("Vermögen mit verpfändeten Werten und dem neuen Kauf", () => {
    const v = vermoegensaufstellung(
      {
        werte: [{ bezeichnung: "Depot", betrag: 30000, verpfaendet: true }, { bezeichnung: "Konto", betrag: 10000 }],
        verbindlichkeiten: [{ bezeichnung: "Auto", betrag: 5000 }],
      },
      { kaufpreisGesamt: 300000, totalDebt: 280000 },
    );
    expect(v).toMatchObject({ werte: 40000, davonVerpfaendet: 30000, verbindlichkeiten: 5000, differenz: 35000, differenzNachKauf: 55000 });
  });

  it("übernimmt Einkommen, Ausgaben, Vermögen und Kredite aus der Selbstauskunft", () => {
    const sa = {
      person2: true,
      einkommen: { netto: "3.200,50", kindergeld: "250" },
      mieteWarm: "900",
      lebenshaltungskosten: "1200",
      versBU: "80",
      kredite: [{ art: "Ratenkredit", bank: "Hausbank", rate: "150", restschuld: "4.000" }],
      vermoegenswerte: [{ art: "Bank- & Sparguthaben", institut: "Sparkasse", betrag: "25000" }],
      person2Data: { einkommen: { netto: "2100", kindergeld: "0" } },
    };
    const u = bankunterlagenAusSa(sa, "Aus der Selbstauskunft vom 01.10.2026")!;
    expect(u.haushalt.einkuenfte).toEqual([
      { bezeichnung: "Nettoeinkommen Person 1", betrag: 3200.5, herkunft: "Aus der Selbstauskunft vom 01.10.2026" },
      { bezeichnung: "Nettoeinkommen Person 2", betrag: 2100, herkunft: "Aus der Selbstauskunft vom 01.10.2026" },
      { bezeichnung: "Kindergeld", betrag: 250, herkunft: "Aus der Selbstauskunft vom 01.10.2026" },
    ]);
    expect(u.haushalt.ausgaben.map((p) => [p.bezeichnung, p.betrag])).toEqual([
      ["Kaltmiete eigene Wohnung", 900],
      ["Lebenshaltung", 1200],
      ["Versicherungen und Vorsorge", 80],
      ["Bestehende Kreditraten", 150],
    ]);
    expect(u.vermoegen.werte[0]).toMatchObject({ bezeichnung: "Bank- & Sparguthaben, Sparkasse", betrag: 25000 });
    expect(u.vermoegen.verbindlichkeiten[0]).toMatchObject({ bezeichnung: "Ratenkredit, Hausbank", betrag: 4000 });
    expect(bankunterlagenAusSa(null)).toBeNull();
    expect(bankunterlagenAusSa({ einkommen: { netto: "" } })).toBeNull();
  });
});

describe("Gespeicherte Berechnung", () => {
  it("Listen kommen sauber aus dem JSON, Unsinn fällt weg", () => {
    const e = eingabeAusJson({
      specialRepayments: [{ jahr: 2030, betrag: 5000 }, { jahr: "x", betrag: 1 }, null],
      haushalt: { einkuenfte: [{ bezeichnung: "Netto", betrag: 3000, herkunft: "Aus der Selbstauskunft" }], ausgaben: "kaputt" },
      vermoegen: { werte: [{ bezeichnung: "Depot", betrag: 1, verpfaendet: true }] },
      seniorFollowUpRate: 5.5,
    });
    expect(e.specialRepayments).toEqual([{ jahr: 2030, betrag: 5000 }]);
    expect(e.haushalt).toEqual({ einkuenfte: [{ bezeichnung: "Netto", betrag: 3000, herkunft: "Aus der Selbstauskunft" }], ausgaben: [] });
    expect(e.vermoegen).toEqual({ werte: [{ bezeichnung: "Depot", betrag: 1, verpfaendet: true }], verbindlichkeiten: [] });
    expect(e.seniorFollowUpRate).toBe(5.5);
    // Ein alter Stand ohne die Felder bekommt die Standardwerte, also nichts Neues.
    expect(eingabeAusJson({}).specialRepayments).toEqual([]);
  });
});

describe("Ampel-Schwellen aus der Admin-Konfiguration (11.10.2026)", () => {
  it("nur admin und inhaber dürfen bearbeiten", async () => {
    const { darfAmpelSchwellenBearbeiten } = await import("./ampel");
    expect(darfAmpelSchwellenBearbeiten("admin")).toBe(true);
    expect(darfAmpelSchwellenBearbeiten("inhaber")).toBe(true);
    for (const rolle of ["vertriebsleiter", "vertriebspartner", "objektpartner", "finanzierungspartner", "kunde", "", null, undefined]) {
      expect(darfAmpelSchwellenBearbeiten(rolle)).toBe(false);
    }
  });

  it("gespeicherte Werte gelten, fehlende und unpassende fallen auf den Standard", async () => {
    const { schwellenAusConfig, schwellenFuerConfig, pruefeSchwellen } = await import("./ampel");
    expect(schwellenAusConfig(null)).toEqual(AMPEL_SCHWELLEN);
    const s = schwellenAusConfig({ bruttorendite: { gruenAb: 0.05, gelbAb: 0.04 }, nettorendite: { gruenAb: 0.01, gelbAb: 0.03 }, cashflowOperativ: { gruenAb: "x" } });
    expect(s.bruttorendite).toMatchObject({ gruenAb: 0.05, gelbAb: 0.04, label: "Bruttomietrendite" });
    expect(s.nettorendite).toEqual(AMPEL_SCHWELLEN.nettorendite);
    expect(s.cashflowOperativ).toEqual(AMPEL_SCHWELLEN.cashflowOperativ);
    expect(schwellenFuerConfig(s).bruttorendite).toEqual({ gruenAb: 0.05, gelbAb: 0.04 });
    expect(pruefeSchwellen(AMPEL_SCHWELLEN)).toEqual([]);
    expect(pruefeSchwellen({ ...AMPEL_SCHWELLEN, cashflowOperativ: { ...AMPEL_SCHWELLEN.cashflowOperativ, gruenAb: -200 } })).toHaveLength(1);
    expect(ampel(standard, berechneInvestment(standard), s)[0].farbe).toBe(ampelfarbe(berechneInvestment(standard).grossYield, s.bruttorendite));
  });
});

describe("Bankunterlagen zusammenführen (11.10.2026)", () => {
  it("Handwerte bleiben ohne Überschreiben, mit Überschreiben ersetzt die Selbstauskunft alles", async () => {
    const { bankunterlagenZusammenfuehren, hatManuelleBankunterlagen } = await import("./bankunterlagen");
    const bisher = {
      haushalt: {
        einkuenfte: [
          { bezeichnung: "Nettoeinkommen Person 1", betrag: 4100 },
          { bezeichnung: "Kindergeld", betrag: 250, herkunft: "Aus der Selbstauskunft" },
          { bezeichnung: "Nebenjob", betrag: 300 },
        ],
        ausgaben: [{ bezeichnung: "Leer", betrag: 0 }],
      },
      vermoegen: { werte: [], verbindlichkeiten: [] },
    };
    const neu = {
      haushalt: { einkuenfte: [{ bezeichnung: "Nettoeinkommen Person 1", betrag: 4500, herkunft: "SA" }, { bezeichnung: "Kindergeld", betrag: 255, herkunft: "SA" }], ausgaben: [] },
      vermoegen: { werte: [], verbindlichkeiten: [] },
    };
    expect(hatManuelleBankunterlagen(bisher)).toBe(true);
    expect(hatManuelleBankunterlagen(neu)).toBe(false);
    const geschuetzt = bankunterlagenZusammenfuehren(bisher, neu, false);
    expect(geschuetzt.haushalt.einkuenfte.map((p) => [p.bezeichnung, p.betrag])).toEqual([
      ["Nettoeinkommen Person 1", 4100],
      ["Kindergeld", 255],
      ["Nebenjob", 300],
    ]);
    expect(bankunterlagenZusammenfuehren(bisher, neu, true)).toBe(neu);
  });
});
