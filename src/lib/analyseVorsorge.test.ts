import { describe, expect, it } from "vitest";
import { calculateScore, zieleAusSchwerpunkt, type AnalysisData } from "@/lib/scoringEngine";
import { berechneExpose } from "@/lib/exposeRechner";
import { standardAnnahmen } from "@/lib/exposeAnnahmen";
import { OS_WOHNUNGEN, mietsteigerungProzent, rechneWohnung, schwerpunkt, vorsorgePlan } from "@/lib/analyseVorsorge";

const kunde = (teil: Partial<AnalysisData> = {}) =>
  ({ age: 35, goals: ["altersvorsorge"], incomeClass: "50k_80k", taxOptimizationInterest: true, ...teil }) as AnalysisData;
const wohnung = (id: string) => OS_WOHNUNGEN.find((w) => w.id === id)!;

describe("Altersvorsorge mit OS-Wohnungen", () => {
  it("drei Käufe im Abstand von drei Jahren, Verkauf mit 67, Altersvorsorge-Objekte zuerst", () => {
    const p = vorsorgePlan(kunde(), 410_000)!;
    expect(p.verkaufsAlter).toBe(67);
    expect(p.wohnungen.map((w) => w.kaufAlter)).toEqual([35, 38, 41]);
    expect(p.wohnungen[0].wohnung.konzept).toBe("zusatzrente");
    expect(new Set(p.wohnungen.map((w) => w.wohnung.id)).size).toBe(3);
  });

  it("Verkaufsvolumen, Kapital und Zusatzrente sind die Summen der Wohnungen", () => {
    const p = vorsorgePlan(kunde(), 410_000)!;
    expect(p.verkaufsvolumen).toBe(p.wohnungen.reduce((s, w) => s + w.verkaufswert, 0));
    expect(p.kapital).toBe(p.wohnungen.reduce((s, w) => s + w.erloes, 0));
    expect(p.zusatzrenteMonat).toBe(Math.round(p.kapital / 300));
    expect(p.kapital).toBeGreaterThan(0);
  });

  it.each([
    // Monatsrechnung im ersten Jahr laut Exposé, Grenzsteuersatz 42 %: Steuerersparnis, Ergebnis nach Steuer.
    ["barfuss", 988, -23],
    ["hauff", 386, -246],
    ["zossen", 735, 349],
    ["brueck", 143, -155],
    // Cottbus seit 17.10.2026 mit 80 % Gebäudeanteil; das Exposé (noch 20 %) wird neu erzeugt.
    ["cottbus", 80, -2],
  ])("%s rechnet im ersten Jahr wie das Exposé", (id, steuer, nachSteuer) => {
    const r = rechneWohnung(wohnung(id as string), 35, 67, 42);
    expect(Math.abs(r.jahr1.steuerMonat - (steuer as number))).toBeLessThanOrEqual(5);
    expect(Math.abs(-r.jahr1.eigenanteilMonat - (nachSteuer as number))).toBeLessThanOrEqual(5);
  });

  it("Verkaufserlös ist Wert minus Restschuld minus 4 % Verkaufskosten, aus dem Exposé-Rechner", () => {
    const r = rechneWohnung(wohnung("hauff"), 35, 67, 42);
    const w = wohnung("hauff");
    const e = berechneExpose(w.objekt, { ...standardAnnahmen(2026), zinsProzent: 4.8, tilgungProzent: 1.2, mietsteigerungProzent: mietsteigerungProzent(w), afaProzent: 3.1, grenzsteuersatzManuellProzent: 42, haltedauerJahre: 32 });
    const ende = e.jahresreihe[31];
    expect(r.verkaufswert).toBe(Math.round(ende.immobilienwertEnde));
    // Restschuld jährlich wie im Exposé: Hauffstraße nach 30 Jahren 64.000 € (Exposé Seite 10).
    expect(Math.round(rechneWohnung(w, 35, 65, 42).restschuld / 1000)).toBe(64);
    expect(r.erloes).toBe(r.verkaufswert - r.restschuld - Math.round(r.verkaufswert * 0.04));
    // 32 Jahre mit 2 % Wertsteigerung: rund das 1,88-Fache.
    expect(r.verkaufswert / 280_170).toBeCloseTo(1.02 ** 32, 1);
  });

  it("höherer Steuersatz bringt mehr Netto, Barfuß mit hoher AfA mehr als Brück mit 2 %", () => {
    expect(rechneWohnung(wohnung("barfuss"), 35, 67, 42).steuerMonat).toBeGreaterThan(rechneWohnung(wohnung("barfuss"), 35, 67, 25).steuerMonat);
    expect(rechneWohnung(wohnung("barfuss"), 35, 67, 42).steuerMonat).toBeGreaterThan(rechneWohnung(wohnung("brueck"), 35, 67, 42).steuerMonat);
  });

  it("Cottbus: Verkäufer trägt die Kaufnebenkosten", () => {
    expect(rechneWohnung(wohnung("cottbus"), 35, 67, 35).nebenkosten).toBe(0);
    expect(rechneWohnung(wohnung("brueck"), 35, 67, 35).nebenkosten).toBeGreaterThan(0);
  });

  it("reicht der Rahmen nicht, füllen die günstigsten auf und der Plan sagt es", () => {
    const p = vorsorgePlan(kunde(), 200_000)!;
    expect(p.wohnungen).toHaveLength(3);
    expect(p.ueberRahmen).toBe(true);
    expect(vorsorgePlan(kunde(), 2_000_000)!.ueberRahmen).toBe(false);
  });

  it("wer spät anfängt, kauft nur, was bis zum Verkauf zehn Jahre schafft", () => {
    expect(vorsorgePlan(kunde({ age: 55 }), 410_000)!.wohnungen.map((w) => w.kaufAlter)).toEqual([55]);
    expect(vorsorgePlan(kunde({ age: 60 }), 410_000)!.verkaufsAlter).toBe(70);
  });

  it("ohne Rahmen kein Plan; Schwerpunkt Steuer nur ohne Altersvorsorge-Ziel", () => {
    expect(vorsorgePlan(kunde(), 0)).toBeNull();
    expect(schwerpunkt(kunde({ goals: ["steuerersparnis"] }))).toBe("steuer");
    expect(schwerpunkt(kunde({ goals: ["steuerersparnis", "altersvorsorge"] }))).toBe("zusatzrente");
    expect(vorsorgePlan(kunde({ goals: ["steuerersparnis"] }), 410_000)!.wohnungen[0].wohnung.konzept).toBe("steuer");
  });
});

describe("Schwerpunkt-Frage statt Ziele", () => {
  it("leitet immer drei Ziele ab, Steuerinteresse nur bei Steuer oder beides", () => {
    for (const s of ["altersvorsorge", "steuer", "beides"] as const) expect(zieleAusSchwerpunkt(s).goals).toHaveLength(3);
    expect(zieleAusSchwerpunkt("altersvorsorge").taxOptimizationInterest).toBe(false);
    expect(zieleAusSchwerpunkt("beides").taxOptimizationInterest).toBe(true);
    expect(schwerpunkt(kunde(zieleAusSchwerpunkt("steuer")))).toBe("steuer");
    expect(schwerpunkt(kunde(zieleAusSchwerpunkt("beides")))).toBe("zusatzrente");
  });

  it("ohne Sparrate, Wohnsituation und Erfahrung sind 15 Punkte Kreditwürdigkeit erreichbar", () => {
    const r = calculateScore({
      age: 35, familyStatus: "", householdSize: 0, dependents: 0, livingSituation: "", profession: "angestellt",
      employmentType: "unbefristet", employmentDuration: 5, netIncome: 3400, additionalIncome: 0, savingsRate: 0,
      equity: 25000, liquidityReserve: 12000, existingLoans: 0, monthlyFixedCosts: 1500, existingProperties: 0,
      investmentExperience: "" as AnalysisData["investmentExperience"], realEstateExperience: "" as AnalysisData["realEstateExperience"],
      incomeClass: "50k_80k", financingWillingness: "ja", ...zieleAusSchwerpunkt("beides"),
    } as AnalysisData);
    expect(r.detailedScores.creditworthiness).toBe(15);
    expect(r.detailedScores.goalAlignment).toBe(5);
  });
});
