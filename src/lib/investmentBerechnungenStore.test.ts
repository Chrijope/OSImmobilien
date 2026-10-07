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
  eingabeAusJson, kennzahlenAus, berechnungsnameVorschlag, BERECHNUNGEN_MIGRATION_HINWEIS,
} = await import("@/lib/investmentBerechnungenStore");
const { standardEingabe, berechneInvestment } = await import("@/lib/investmentrechner/rechenkern");
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
    expect(eingabe.eingabeVersion).toBe(2);
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
    expect(ohneMoebel.eingabeVersion).toBe(2);
  });
});

describe("alte Speicherstände: Finanzierungsnebenkosten seit dem 25.09.2026", () => {
  it("rechnet einen Stand ohne den Satz weiter ohne Finanzierungsnebenkosten", () => {
    expect(eingabeAusJson({ purchasePrice: 300_000, eingabeVersion: 2 }).financingCostRate).toBe(0);
  });

  it("übernimmt einen gespeicherten Satz", () => {
    expect(eingabeAusJson({ purchasePrice: 300_000, financingCostRate: 0.3 }).financingCostRate).toBe(0.3);
  });

  it("startet eine neue Berechnung mit dem Standard", () => {
    expect(eingabeAusJson(null).financingCostRate).toBe(standardEingabe.financingCostRate);
    expect(standardEingabe.financingCostRate).toBe(0.2);
  });
});

describe("Kennzahlen und Name", () => {
  it("nimmt die Kennzahlen aus dem Ergebnis, ohne selbst zu rechnen", () => {
    const eingabe = { ...standardEingabe, purchasePrice: 250_000, furniturePrice: 10_000, equity: 30_000, monthlyColdRent: 850 };
    const ergebnis = berechneInvestment(eingabe);
    const k = kennzahlenAus(eingabe, ergebnis);
    // Der Gesamtkaufpreis. Die Möbel stecken seit dem 25.09.2026 darin und
    // werden nicht mehr dazugezählt.
    expect(k.kaufpreis).toBe(250_000);
    expect(k.eigenkapital).toBe(30_000);
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
    const alt: Record<string, unknown> = { ...standardEingabe, purchasePrice: 300_000, equity: 15_000, monthlyColdRent: 1000 };
    for (const feld of Object.keys(kfw)) delete alt[feld];
    const geladen = eingabeAusJson(JSON.parse(JSON.stringify(alt)));
    expect(geladen.kfwEnabled).toBe(false);
    expect(geladen.kfwLoanAmount).toBe(0);
    expect(berechneInvestment(geladen)).toEqual(
      berechneInvestment({ ...standardEingabe, purchasePrice: 300_000, equity: 15_000, monthlyColdRent: 1000 }),
    );
  });

  it("speichert und lädt alle KfW-Felder unverändert", () => {
    const eingabe = { ...standardEingabe, purchasePrice: 405_000, equity: 20_250, ...kfw };
    const geladen = eingabeAusJson(JSON.parse(JSON.stringify(eingabe)));
    expect(geladen).toEqual(eingabe);
    expect(berechneInvestment(geladen).kfwTilgungszuschuss).toBe(15_000);
  });
});
