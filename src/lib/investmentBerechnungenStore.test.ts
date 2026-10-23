import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Die gespeicherten Berechnungen: Verhalten ohne Migration, Anlegen, Ändern,
 * Löschen, mehrere je Investment und das Prüfen eines fremden JSON-Stands.
 */

const db = vi.hoisted(() => ({
  antwort: { data: null as unknown, error: null as null | { code?: string; message?: string } },
  aufrufe: [] as Array<{ tabelle: string; methode: string; args: unknown[] }>,
}));

vi.mock("@/integrations/supabase/client", () => {
  const kette = (tabelle: string) => {
    const k: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "insert", "update", "delete", "maybeSingle", "single"]) {
      k[m] = (...args: unknown[]) => { db.aufrufe.push({ tabelle, methode: m, args }); return k; };
    }
    k.then = (res: (v: unknown) => unknown) => Promise.resolve(res(db.antwort));
    return k;
  };
  return { supabase: { from: (t: string) => kette(t) } };
});

const {
  ladeBerechnungen, ladeBerechnung, speichereBerechnung, aktualisiereBerechnung, loescheBerechnung,
  eingabeAusJson, kennzahlenAus, berechnungsnameVorschlag, BERECHNUNGEN_MIGRATION_HINWEIS, unterlagenAusJson,
} = await import("@/lib/investmentBerechnungenStore");
const { standardEingabe, berechneInvestment, EINGABE_VERSION, mitEigenkapital } = await import("@/lib/investmentrechner/rechenkern");
const { standardKaufnebenkostenauswahl } = await import("@/lib/investmentrechner/kaufnebenkostenAuswahl");

const kennzahlen = { kaufpreis: 250_000, eigenkapital: 25_000, cashflowMonatNachSteuern: -120, bruttorendite: 0.0412, irr: 0.081 };

function zeile(over: Record<string, unknown> = {}) {
  return {
    id: "b1",
    investment_id: "inv1",
    kontakt_id: "k1",
    wohnung_id: null,
    name: "Musterstraße 12, WE 7",
    eingabe: { purchasePrice: 250_000, clientName: "Anna Muster" },
    knk: { weg: "manuell", bundesland: "" },
    unterlagen: null,
    kennzahlen,
    herkunft: { annualGrossIncome: { quelle: "selbstauskunft", text: "Aus der Selbstauskunft vom 12.08.2026" } },
    erstellt_von: "u1",
    erstellt_am: "2026-09-07T10:00:00Z",
    geaendert_am: "2026-09-07T10:00:00Z",
    ...over,
  };
}

const eingabeVorlage = { investmentId: "inv1", kontaktId: "k1", name: "Variante mit mehr Eigenkapital", eingabe: standardEingabe, knk: standardKaufnebenkostenauswahl, kennzahlen };

beforeEach(() => {
  db.antwort = { data: null, error: null };
  db.aufrufe = [];
});

describe("ohne Migration", () => {
  it("meldet beim Laden ruhig, dass die Tabelle fehlt", async () => {
    db.antwort = { data: null, error: { code: "42P01", message: 'relation "public.investment_berechnungen" does not exist' } };
    const erg = await ladeBerechnungen("inv1");
    expect(erg).toEqual({ berechnungen: [], migrationFehlt: true, fehler: null });
    expect(BERECHNUNGEN_MIGRATION_HINWEIS).toContain("20260907130000_investment_berechnungen.sql");
  });

  it("meldet beim Speichern die PostgREST-Fassung derselben Lücke", async () => {
    db.antwort = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.investment_berechnungen' in the schema cache" } };
    const erg = await speichereBerechnung(eingabeVorlage);
    expect(erg.migrationFehlt).toBe(true);
    expect(erg.berechnung).toBeNull();
  });

  it("meldet beim Löschen dasselbe", async () => {
    db.antwort = { data: null, error: { code: "42P01", message: "does not exist" } };
    const erg = await loescheBerechnung("b1");
    expect(erg).toEqual({ erfolg: false, migrationFehlt: true, fehler: null });
  });

  /*
   * Ein verweigerter Zugriff ist keine fehlende Migration, und die englische
   * Originalmeldung mit Tabellen- und Regelnamen gehört nicht ins Hinweisfeld
   * des Partners. Sie steht im Protokoll, nach außen geht ein deutscher Satz.
   */
  it("nennt einen verweigerten Zugriff beim Namen, ohne die Rohmeldung zu zeigen", async () => {
    db.antwort = { data: null, error: { code: "42501", message: "new row violates row-level security policy" } };
    const erg = await speichereBerechnung(eingabeVorlage);
    expect(erg.migrationFehlt).toBe(false);
    expect(erg.fehler).toContain("nicht bearbeiten");
    expect(erg.fehler).not.toContain("row-level security");
  });
});

describe("Speichern, Laden, Löschen", () => {
  it("legt eine neue Berechnung an und gibt sie geprüft zurück", async () => {
    db.antwort = { data: zeile(), error: null };
    const erg = await speichereBerechnung({ ...eingabeVorlage, erstelltVon: "u1", wohnungId: "w1" });
    const insert = db.aufrufe.find((a) => a.methode === "insert");
    expect(insert!.args[0]).toMatchObject({ investment_id: "inv1", kontakt_id: "k1", wohnung_id: "w1" });
    // Wer sie angelegt hat, setzt die Datenbank aus der angemeldeten Kennung.
    // Käme der Wert aus dem Browser, ließe sich ein fremder Name eintragen.
    expect(insert!.args[0]).not.toHaveProperty("erstellt_von");
    expect(erg.berechnung?.id).toBe("b1");
    expect(erg.berechnung?.eingabe.purchasePrice).toBe(250_000);
    expect(erg.berechnung?.eingabe.clientName).toBe("Anna Muster");
    // Nicht gespeicherte Felder kommen als Standardwert zurück, nicht als undefined.
    expect(erg.berechnung?.eingabe.forecastYears).toBe(standardEingabe.forecastYears);
    expect(erg.berechnung?.kennzahlen.bruttorendite).toBeCloseTo(0.0412, 4);
    expect(erg.berechnung?.herkunft.annualGrossIncome?.quelle).toBe("selbstauskunft");
  });

  it("ändert eine vorhandene Berechnung an ihrer Kennung, ohne erstellt_von anzufassen", async () => {
    db.antwort = { data: zeile({ name: "Neuer Name" }), error: null };
    const erg = await aktualisiereBerechnung("b1", { ...eingabeVorlage, name: "Neuer Name" });
    const update = db.aufrufe.find((a) => a.methode === "update");
    expect(update!.args[0]).toMatchObject({ name: "Neuer Name" });
    expect(update!.args[0]).not.toHaveProperty("erstellt_von");
    expect(db.aufrufe.some((a) => a.methode === "eq" && a.args[0] === "id" && a.args[1] === "b1")).toBe(true);
    expect(erg.berechnung?.name).toBe("Neuer Name");
  });

  it("liefert mehrere Berechnungen je Investment, die zuletzt geänderte zuerst", async () => {
    db.antwort = {
      data: [zeile({ id: "b2", name: "Mit mehr Eigenkapital", geaendert_am: "2026-09-07T12:00:00Z" }), zeile()],
      error: null,
    };
    const erg = await ladeBerechnungen("inv1");
    expect(erg.berechnungen).toHaveLength(2);
    expect(erg.berechnungen[0].id).toBe("b2");
    expect(db.aufrufe.some((a) => a.methode === "eq" && a.args[0] === "investment_id" && a.args[1] === "inv1")).toBe(true);
    expect(db.aufrufe.some((a) => a.methode === "order" && a.args[0] === "geaendert_am")).toBe(true);
  });

  it("fragt ohne Investment gar nicht erst nach", async () => {
    const erg = await ladeBerechnungen("");
    expect(erg.berechnungen).toEqual([]);
    expect(db.aufrufe).toHaveLength(0);
  });

  it("liefert eine einzelne Berechnung über ihre Kennung", async () => {
    db.antwort = { data: zeile(), error: null };
    const erg = await ladeBerechnung("b1");
    expect(erg.berechnung?.investment_id).toBe("inv1");
  });

  it("löscht an der Kennung", async () => {
    db.antwort = { data: [{ id: "b1" }], error: null };
    const erg = await loescheBerechnung("b1");
    expect(erg.erfolg).toBe(true);
    expect(db.aufrufe.some((a) => a.methode === "delete")).toBe(true);
    expect(db.aufrufe.some((a) => a.methode === "eq" && a.args[0] === "id" && a.args[1] === "b1")).toBe(true);
  });

  /*
   * Verweigert die Zugriffsregel das Löschen, ist das kein Fehler, sondern
   * "keine Zeile betroffen". Ohne diese Prüfung meldete die Oberfläche Erfolg,
   * und die Berechnung wäre nach dem nächsten Laden wieder da.
   */
  it("meldet keinen Erfolg, wenn keine Zeile betroffen war", async () => {
    db.antwort = { data: [], error: null };
    const erg = await loescheBerechnung("b1");
    expect(erg.erfolg).toBe(false);
    expect(erg.fehler).toContain("nicht bearbeiten");
  });
});

describe("gespeicherte Eingabe prüfen", () => {
  it("übernimmt nur bekannte Felder mit passendem Typ", () => {
    const eingabe = eingabeAusJson({
      purchasePrice: 300_000,
      clientName: "Anna Muster",
      jointAssessment: true,
      area: "achtzig",        // falscher Typ
      forecastYears: null,    // leer
      unbekanntesFeld: 42,    // gibt es nicht
    });
    expect(eingabe.purchasePrice).toBe(300_000);
    expect(eingabe.clientName).toBe("Anna Muster");
    expect(eingabe.jointAssessment).toBe(true);
    expect(eingabe.area).toBe(standardEingabe.area);
    expect(eingabe.forecastYears).toBe(standardEingabe.forecastYears);
    expect(eingabe).not.toHaveProperty("unbekanntesFeld");
  });

  it("gibt bei Unsinn die Standardeingabe zurück", () => {
    expect(eingabeAusJson(null)).toEqual(standardEingabe);
    expect(eingabeAusJson("kaputt")).toEqual(standardEingabe);
  });
});

describe("alte Speicherstände: ein Kaufpreis seit dem 25.09.2026", () => {
  // Ein Stand von vorher, im alten Sinn: Wohnung 242.000, Möbel 8.000 obendrauf.
  const alterStand = {
    purchasePrice: 242_000,
    furniturePrice: 8_000,
    transferTaxRate: 3.5,
    notaryRate: 1,
    landRegisterRate: 0.5,
    buildingShare: 80,
    buildingDepreciationRate: 2,
    furnitureDepreciationYears: 10,
  };

  it("rechnet einen Stand ohne Versionsmarke auf den Gesamtkaufpreis um", () => {
    const eingabe = eingabeAusJson(alterStand);
    expect(eingabe.purchasePrice).toBe(250_000);
    expect(eingabe.furniturePrice).toBe(8_000);
    expect(eingabe.eingabeVersion).toBe(EINGABE_VERSION);
  });

  it("rechnet danach das Referenzbeispiel", () => {
    const r = berechneInvestment(eingabeAusJson(alterStand));
    // Seit dem 30.09.2026 ohne Nebenkosten auf die Möbel: 5 % auf 242.000.
    expect(r.purchaseCosts).toBeCloseTo(12_100, 6);
    expect(r.totalInvestment).toBeCloseTo(262_100, 6);
    expect(r.depreciationBasis).toBeCloseTo(203_280, 6);
    expect(r.moebelAfaBasis).toBeCloseTo(8_000, 6);
  });

  it("rechnet nie doppelt um: ein gespeicherter neuer Stand bleibt, wie er ist", () => {
    const einmal = eingabeAusJson(alterStand);
    // So landet er beim nächsten Speichern in der Datenbank, samt Marke.
    const wiederGeladen = eingabeAusJson(JSON.parse(JSON.stringify(einmal)));
    expect(wiederGeladen.purchasePrice).toBe(250_000);
    expect(wiederGeladen).toEqual(einmal);
  });

  it("lässt einen Stand mit aktueller Marke unberührt", () => {
    const neu = eingabeAusJson({ ...alterStand, purchasePrice: 250_000, eingabeVersion: 2 });
    expect(neu.purchasePrice).toBe(250_000);
    expect(neu.furniturePrice).toBe(8_000);
  });

  it("ändert an einem alten Stand ohne Möbel nichts außer der Marke", () => {
    const ohneMoebel = eingabeAusJson({ purchasePrice: 300_000 });
    expect(ohneMoebel.purchasePrice).toBe(300_000);
    expect(ohneMoebel.eingabeVersion).toBe(EINGABE_VERSION);
  });
});

describe("alte Speicherstände: Hausgeld getrennt seit Version 4 (22.10.2026)", () => {
  // Unter Version 3 gespeichert: 70 € Summe im alten Feld, 50 € Hausgeld nur als Anzeige.
  const version3 = {
    purchasePrice: 250_000, monthlyColdRent: 900, monthlyOperatingCosts: 70, housingFeeNonRecoverable: 50,
    eingabeVersion: 3,
  };
  it("löst das Hausgeld aus der alten Summe und rechnet wie beim Speichern", () => {
    const eingabe = eingabeAusJson(version3);
    expect(eingabe.eingabeVersion).toBe(EINGABE_VERSION);
    expect(eingabe.housingFeeNonRecoverable).toBe(50);
    expect(eingabe.monthlyOperatingCosts).toBe(20);
    // 840 € im Jahr wie vorher, nicht 1.440 €.
    expect(berechneInvestment(eingabe).years[0].operatingCosts).toBeCloseTo(840, 6);
  });
  it("rechnet einmal um und dann nie wieder", () => {
    const einmal = eingabeAusJson(version3);
    expect(eingabeAusJson(JSON.parse(JSON.stringify(einmal)))).toEqual(einmal);
  });
  it("hält die Summe auch, wenn die Anzeige größer war als die alte Summe", () => {
    const eingabe = eingabeAusJson({ ...version3, monthlyOperatingCosts: 30 });
    expect(eingabe.housingFeeNonRecoverable + eingabe.monthlyOperatingCosts).toBe(30);
  });
  it("lässt ältere Stände ohne das Feld unverändert", () => {
    const eingabe = eingabeAusJson({ purchasePrice: 250_000, monthlyOperatingCosts: 70, eingabeVersion: 2 });
    expect(eingabe.monthlyOperatingCosts).toBe(70);
    expect(eingabe.housingFeeNonRecoverable).toBe(0);
  });
});

/*
 * Version 5 (23.10.2026, Christian): Die Finanzierung wird eingegeben, das
 * Eigenkapital ist der Rest. Ein alter Stand rechnet mit denselben Darlehen
 * weiter; entfallene Felder rechnen nicht mehr mit.
 */
describe("alte Speicherstände: neue Finanzierung seit Version 5 (23.10.2026)", () => {
  // Standardsätze 6,5 + 1,5 + 0,5 = 8,5 %: 25.500 € Nebenkosten, 325.500 € Gesamtbedarf.
  const version4 = { purchasePrice: 300_000, monthlyColdRent: 1000, equity: 15_000, financingCostRate: 0.2, eingabeVersion: 4 };

  it("übernimmt das bisherige Bankdarlehen als Euro-Betrag, das Eigenkapital bleibt", () => {
    const eingabe = eingabeAusJson(version4);
    expect(eingabe.eingabeVersion).toBe(EINGABE_VERSION);
    expect(eingabe.seniorLoanMode).toBe("euro");
    expect(eingabe.seniorLoanValue).toBeCloseTo(310_500, 6);
    const r = berechneInvestment(eingabe);
    expect(r.seniorLoanAmount).toBeCloseTo(310_500, 6);
    expect(r.eigenkapital).toBeCloseTo(15_000, 6);
    // Ohne Finanzierungsnebenkosten: Gesamtbedarf nur Kaufpreis und Nebenkosten.
    expect(r.totalInvestment).toBeCloseTo(325_500, 6);
  });

  it("macht das Nachrangdarlehen zum Euro-Betrag, die Bank bleibt der damalige Rest", () => {
    const eingabe = eingabeAusJson({ ...version4, juniorLoanAmount: 20_000 });
    expect(eingabe.juniorLoanMode).toBe("euro");
    expect(eingabe.juniorLoanValue).toBe(20_000);
    const r = berechneInvestment(eingabe);
    expect(r.seniorLoanAmount).toBeCloseTo(290_500, 6);
    expect(r.juniorLoanAmount).toBeCloseTo(20_000, 6);
    expect(r.eigenkapital).toBeCloseTo(15_000, 6);
  });

  it("behält gedeckelte KfW- und Zweitdarlehen mit dem damals gerechneten Betrag", () => {
    const r = berechneInvestment(eingabeAusJson({ ...version4, kfwEnabled: true, kfwLoanAmount: 500_000, secondLoanAmount: 50_000 }));
    expect(r.kfwLoanAmount).toBeCloseTo(310_500, 6);
    expect(r.secondLoanAmount).toBeCloseTo(0, 6);
    expect(r.seniorLoanAmount).toBeCloseTo(0, 6);
    expect(r.eigenkapital).toBeCloseTo(15_000, 6);
  });

  it("liest das frühere Eigenkapital als Betrag dieses Kunden, auch bei halbem Anteil", () => {
    const r = berechneInvestment(eingabeAusJson({ ...version4, investmentShare: 50 }));
    expect(r.seniorLoanAmount).toBeCloseTo(162_750 - 15_000, 6);
    expect(r.eigenkapital).toBeCloseTo(15_000, 6);
  });

  it("lässt entfallene Felder nicht weiterrechnen", () => {
    const eingabe = eingabeAusJson({
      ...version4,
      financingCostRate: 0.3,
      saleCostRate: 5,
      annualTaxableIncomeGrowth: 3,
      seniorFixedRateYears: 2,
      seniorFollowUpRate: 6,
      seniorFollowUpRepaymentRate: 3,
      seniorFollowUpCosts: 1000,
      seniorFurtherFollowUps: [{ nachJahren: 5, zinsProzent: 7, tilgungProzent: 2, kosten: 300 }],
      specialRepayments: [{ jahr: 2028, betrag: 10_000 }],
      secondFollowUpRate: 7,
      secondFollowUpRepaymentRate: 4,
    });
    for (const feld of [
      "equity", "financingCostRate", "saleCostRate", "annualTaxableIncomeGrowth", "seniorFollowUpRate", "seniorFollowUpRepaymentRate",
      "seniorFollowUpCosts", "seniorFurtherFollowUps", "specialRepayments", "secondFollowUpRate", "secondFollowUpRepaymentRate", "juniorLoanAmount",
    ]) {
      expect(eingabe, feld).not.toHaveProperty(feld);
    }
    const r = berechneInvestment(eingabe);
    // Zins und Rate bleiben nach der Zinsbindung, das Einkommen ist konstant.
    expect(r.years[5].darlehen.bank.zinssatz).toBeCloseTo(0.04, 9);
    expect(r.years[5].darlehen.bank.payment).toBeCloseTo(r.years[1].darlehen.bank.payment, 6);
    expect(r.years[9].taxableIncomeBefore).toBe(r.years[0].taxableIncomeBefore);
    expect(r.totalInvestment).toBeCloseTo(325_500, 6);
  });

  it("übernimmt die frühere Zuführung zur Rücklage als Rücklage im Hausgeld, ohne sie zu ändern", () => {
    const mit = eingabeAusJson({ ...version4, area: 60, monthlyReserveContribution: 45 });
    expect(mit.monthlyReserveContribution).toBe(45);
    expect(mit.monthlyReserveContributionAuto).toBe(false);
    expect(berechneInvestment(mit).years[0].reserveContribution).toBeCloseTo(540, 6);
    // Auch eine frühere 0 bleibt: Ein gespeicherter Stand rechnet nicht plötzlich mit der Vorgabe.
    expect(eingabeAusJson({ ...version4, area: 60 }).monthlyReserveContributionAuto).toBe(false);
  });

  it("rechnet einmal um und dann nie wieder", () => {
    const einmal = eingabeAusJson({ ...version4, juniorLoanAmount: 20_000 });
    expect(eingabeAusJson(JSON.parse(JSON.stringify(einmal)))).toEqual(einmal);
  });

  it("startet eine neue Berechnung mit der Bank bei 100 Prozent des Kaufpreises", () => {
    const neu = eingabeAusJson(null);
    expect(neu.seniorLoanMode).toBe("percent");
    expect(neu.seniorLoanValue).toBe(100);
    expect(neu.monthlyReserveContributionAuto).toBe(true);
    expect(eingabeAusJson({ seniorLoanMode: "unsinn", juniorLoanMode: 3, eingabeVersion: 5 }).seniorLoanMode).toBe("percent");
  });

  it("lässt die Energiefelder gespeicherter Unterlagen fallen", () => {
    const unterlagen = unterlagenAusJson({ energyClass: "B", energyValue: 80, reserveAmount: 12_000 });
    expect(unterlagen).not.toHaveProperty("energyClass");
    expect(unterlagen).not.toHaveProperty("energyValue");
    expect(unterlagen?.reserveAmount).toBe(12_000);
  });
});

describe("All-inclusive-Modell in gespeicherten Berechnungen, seit dem 09.10.2026", () => {
  it("liest einen Stand ohne das Feld als normales Modell", () => {
    expect(eingabeAusJson({ purchasePrice: 300_000, eingabeVersion: 2 }).allInclusive).toBe(false);
    expect(standardEingabe.allInclusive).toBe(false);
  });

  it("übernimmt einen gespeicherten Schalter, aber nur als echten Wahrheitswert", () => {
    expect(eingabeAusJson({ purchasePrice: 300_000, allInclusive: true }).allInclusive).toBe(true);
    expect(eingabeAusJson({ purchasePrice: 300_000, allInclusive: "ja" }).allInclusive).toBe(false);
  });

  it("speichert als Kaufpreis den all-inclusive-Preis, passend zur Bruttorendite", () => {
    const eingabe = { ...standardEingabe, purchasePrice: 200_000, monthlyColdRent: 700, allInclusive: true };
    const ergebnis = berechneInvestment(eingabe);
    expect(kennzahlenAus(eingabe, ergebnis).kaufpreis).toBeCloseTo(200_000 + ergebnis.allInclusiveAufschlag, 6);
  });
});

describe("Kennzahlen und Name", () => {
  it("nimmt die Kennzahlen aus dem Ergebnis, ohne selbst zu rechnen", () => {
    const eingabe = mitEigenkapital({ ...standardEingabe, purchasePrice: 250_000, furniturePrice: 10_000, monthlyColdRent: 850 }, 30_000);
    const ergebnis = berechneInvestment(eingabe);
    const k = kennzahlenAus(eingabe, ergebnis);
    // Der Gesamtkaufpreis. Die Möbel stecken seit dem 25.09.2026 darin und
    // werden nicht mehr dazugezählt.
    expect(k.kaufpreis).toBe(250_000);
    expect(k.eigenkapital).toBeCloseTo(30_000, 6);
    expect(k.bruttorendite).toBe(ergebnis.grossYield);
    expect(k.irr).toBe(ergebnis.irr);
    expect(k.cashflowMonatNachSteuern).toBeCloseTo(ergebnis.years[0].cashflowAfterTax / 12, 6);
  });

  it("schlägt Objekt und Einheit als Namen vor", () => {
    expect(berechnungsnameVorschlag("Musterstraße 12", "7")).toBe("Musterstraße 12, WE 7");
    expect(berechnungsnameVorschlag("Musterstraße 12", "")).toBe("Musterstraße 12");
    expect(berechnungsnameVorschlag("", null)).toMatch(/^Berechnung vom /);
  });
});

describe("KfW-Darlehen in gespeicherten Berechnungen, seit dem 07.10.2026", () => {
  const kfw = {
    kfwEnabled: true,
    kfwProgram: "KfW 261 Sanierung",
    kfwLoanAmount: 150_000,
    kfwInterestRate: 2.1,
    kfwFixedRateYears: 10,
    kfwTermYears: 30,
    kfwGracePeriodYears: 3,
    kfwGrantMode: "euro" as const,
    kfwGrantValue: 15_000,
    kfwGrantYear: 3,
  };

  it("lädt einen alten Stand ohne KfW-Felder mit ausgeschaltetem KfW und unverändertem Ergebnis", () => {
    const alt: Record<string, unknown> = { ...standardEingabe, purchasePrice: 300_000, monthlyColdRent: 1000 };
    for (const feld of Object.keys(kfw)) delete alt[feld];
    const geladen = eingabeAusJson(JSON.parse(JSON.stringify(alt)));
    expect(geladen.kfwEnabled).toBe(false);
    expect(geladen.kfwLoanAmount).toBe(0);
    expect(berechneInvestment(geladen)).toEqual(
      berechneInvestment({ ...standardEingabe, purchasePrice: 300_000, monthlyColdRent: 1000 }),
    );
  });

  it("speichert und lädt alle KfW-Felder unverändert", () => {
    const eingabe = { ...standardEingabe, purchasePrice: 405_000, seniorLoanMode: "euro" as const, seniorLoanValue: 255_000, ...kfw };
    const geladen = eingabeAusJson(JSON.parse(JSON.stringify(eingabe)));
    expect(geladen).toEqual(eingabe);
    expect(berechneInvestment(geladen).kfwTilgungszuschuss).toBe(15_000);
  });
});
