/**
 * Die Erklärung hinter der Quelle „Kalkulation“ im MORE Lotsen: Die Zeilen
 * ergeben das Ergebnis des Rechenkerns, fehlende Posten fallen weg, der
 * Schlusssatz folgt den Annahmen.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: async () => ({ data: null, error: new Error("offline") }) }),
    channel: () => ({ on: () => ({ subscribe: () => undefined }) }),
  },
}));

const { kalkulationAusRechner } = await import("@/lib/lotseStore");
const { berechneInvestment, standardEingabe } = await import("@/lib/investmentrechner/rechenkern");
const { kalkulationErklaerung, kalkulationsQuelle } = await import("./lotseKalkulationErklaerung");

const summe = (zeilen: Array<{ wert: number }>) => zeilen.reduce((s, z) => s + z.wert, 0);

describe("kalkulationErklaerung", () => {
  it("die Zeilen ergeben den Cashflow des Rechenkerns, auch mit Leerstand, Anteil und Steuer", () => {
    for (const aenderung of [
      {},
      { vacancyRate: 3 },
      { investmentShare: 50 },
      { taxableIncomeCustomer: 60000, vacancyRate: 2 },
      // Kleines Darlehen, das im ersten Jahr getilgt ist: Die Rate ist gedeckelt (Runde 6).
      { equity: 209000, seniorRepaymentRate: 150 },
    ]) {
      const eingabe = {
        ...standardEingabe, purchasePrice: 200000, monthlyColdRent: 700, monthlyOperatingCosts: 60, monthlyReserveContribution: 20, ...aenderung,
      };
      const ergebnis = berechneInvestment(eingabe);
      const e = kalkulationErklaerung(kalkulationAusRechner(eingabe, ergebnis, "nutzer"))!;
      const cashflow = ergebnis.years[0].cashflowBeforeTax / 12;
      // Jede Zeile ist auf Cent gerundet, deshalb höchstens ein Cent je Zeile Abstand.
      expect(Math.abs(summe(e.rechnung) - cashflow)).toBeLessThanOrEqual(0.005 * (e.rechnung.length + 1));
      expect(e.cashflowVorSteuer!.wert).toBeCloseTo(cashflow, 2);
      const rate = e.rechnung.find((z) => z.text === "minus Kreditrate");
      if (rate) expect(-rate.wert).toBeCloseTo(ergebnis.years[0].debtService / 12, 2);
      if (e.nachSteuer.length) {
        expect(e.eigenanteil!.wert).toBeCloseTo(ergebnis.eigenanteilMonat, 2);
        expect(e.cashflowVorSteuer!.wert + e.nachSteuer[0].wert).toBeCloseTo(e.nachSteuer[1].wert, 1);
        expect(e.nachSteuer[1].wert).toBeCloseTo(ergebnis.years[0].cashflowAfterTax / 12, 2);
      }
    }
  });

  it("die gedeckelte Rate des ersten Jahres ist nicht die volle Monatsrate (Runde 6)", () => {
    const eingabe = { ...standardEingabe, purchasePrice: 200000, monthlyColdRent: 700, equity: 209000, seniorRepaymentRate: 150 };
    const ergebnis = berechneInvestment(eingabe);
    expect(ergebnis.years[0].debtService / 12).toBeLessThan(ergebnis.monthlyDebtService);
    const k = kalkulationAusRechner(eingabe, ergebnis, "nutzer")!;
    expect(k.rate_monat).toBeCloseTo(ergebnis.years[0].debtService / 12, 2);
  });

  it("rechnet das Beispiel aus dem Lotsen genau nach, die Verwaltung steckt in den nicht umlagefähigen Kosten", () => {
    const e = kalkulationErklaerung({
      annahmen: "standard",
      kaltmiete_monat: 360.14, nicht_umlagefaehig_monat: 69.26, ruecklage_monat: 17.17, rate_monat: 457.87,
      cashflow_vor_steuer_monat: -184.16, eigenanteil_monat: 184.16,
    })!;
    expect(e.rechnung.map((z) => z.text)).toEqual([
      "Kaltmiete", "minus nicht umlagefähige Kosten", "minus Zuführung zur Instandhaltungsrücklage", "minus Kreditrate",
    ]);
    expect(Math.round(summe(e.rechnung) * 100) / 100).toBe(-184.16);
    expect(e.cashflowVorSteuer).toMatchObject({ text: "ergibt Cashflow vor Steuer", wert: -184.16 });
    expect(e.cashflowVorSteuer!.betrag).toMatch(/184,16\s€/);
    // Ohne Steuerwerte kein Wert nach Steuer (LOTSE-005).
    expect(e.eigenanteil).toBeNull();
    expect(e.hinweise.join(" ")).toContain("Sondereigentumsverwaltung sind in den nicht umlagefähigen Kosten enthalten");
  });

  it("ohne Steuerwerte kein Eigenanteil und kein Überschuss nach Steuer (LOTSE-005)", () => {
    for (const eigenanteil_monat of [184.16, -50]) {
      const e = kalkulationErklaerung({ annahmen: "standard", kaltmiete_monat: 360.14, cashflow_vor_steuer_monat: -184.16, eigenanteil_monat })!;
      expect(e.eigenanteil).toBeNull();
      expect(JSON.stringify(e)).not.toMatch(/Eigenanteil|Überschuss|nach Steuer/);
    }
    const mitSteuer = kalkulationErklaerung({
      annahmen: "nutzer", cashflow_vor_steuer_monat: -184.16, steuereffekt_monat: 90, cashflow_nach_steuer_monat: -94.16, eigenanteil_monat: 94.16,
    })!;
    expect(mitSteuer.eigenanteil).toMatchObject({ text: "Eigenanteil im Monat", wert: 94.16 });
  });

  it("fehlende Posten fallen weg, es erscheint keine 0", () => {
    const e = kalkulationErklaerung({ annahmen: "nutzer", kaltmiete_monat: 700, rate_monat: 500 })!;
    expect(e.rechnung.map((z) => z.text)).toEqual(["Kaltmiete", "minus Kreditrate"]);
    expect(e.cashflowVorSteuer).toBeNull();
    expect(e.nachSteuer).toEqual([]);
    expect(e.eigenanteil).toBeNull();
    expect(e.annahmen).toEqual([]);
    expect(kalkulationErklaerung(null)).toBeNull();
    expect(kalkulationErklaerung({ annahmen: "standard" })).toBeNull();
  });

  it("Standardannahmen und deine Annahmen haben verschiedene Schlusssätze", () => {
    const zahlen = { kaufpreis: 200000, eigenkapital: 20000, darlehen: 180000, zins_prozent: 4, tilgung_prozent: 1.5, eigentumsanteil_prozent: 100 };
    const standard = kalkulationErklaerung({ annahmen: "standard", ...zahlen })!;
    expect(standard.hinweise).toContain("Standardannahmen der Investmentkalkulation, ohne Kundendaten. Die Rechnung eines bestimmten Kunden kann abweichen.");
    expect(standard.annahmen.map((a) => a.text)).toEqual([
      "Kaufpreis", "Eigenkapital, in Höhe der Kaufnebenkosten vorbelegt", "Darlehen", "Sollzins", "Tilgung", "Eigentumsanteil",
    ]);
    const nutzer = kalkulationErklaerung({ annahmen: "nutzer", ...zahlen })!;
    expect(nutzer.hinweise).toEqual(["Mit deinen Annahmen aus dem Reiter Investmentkalkulation."]);
    expect(nutzer.annahmen[1].text).toBe("Eigenkapital");
    // Keine Gedankenstriche in sichtbaren Texten.
    const texte = JSON.stringify([standard, nutzer]);
    expect(texte).not.toMatch(/[–—]/);
  });

  it("erkennt die Quelle der Kalkulation", () => {
    expect(kalkulationsQuelle("Kalkulation, Standardannahmen")).toBe("standard");
    expect(kalkulationsQuelle("Kalkulation, deine Annahmen")).toBe("nutzer");
    expect(kalkulationsQuelle("Objektdaten, Stand 28.09.2026")).toBeNull();
    expect(kalkulationsQuelle("fehlt: Kalkulation")).toBeNull();
    // Nur die festen Bezeichnungen, nie ein Dokument (REVIEW-006).
    for (const quelle of ["Musterkalkulation.pdf", "Kalkulation des Verkäufers", "Kalkulation, deine Annahmen (Musterkalkulation.pdf)", "Investmentkalkulation"]) {
      expect(kalkulationsQuelle(quelle), quelle).toBeNull();
    }
    expect(kalkulationsQuelle("  kalkulation,  standardannahmen ")).toBe("standard");
  });
});
