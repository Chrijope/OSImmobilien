import { describe, expect, it } from "vitest";
import { calculateFinanzierbarkeitFromSaData } from "./finanzierbarkeitUtils";
import { finanzierungsrahmenAusSelbstauskunft } from "./finanzierungsrahmenPdf";

/*
 * Der Rahmen auf der Abschlussseite der Selbstauskunft (Artefakt) muss genau
 * die Zahlen des Kundenprofils zeigen: von = minRahmen, Empfehlung = empfRahmen,
 * bis = maxRahmen aus calculateFinanzierbarkeitFromSaData.
 */
const SA = {
  einkommen: { netto: "3.500", miet: "500" },
  mieteWarm: "1.000",
  lebenshaltungskosten: "",
  versBU: "200",
  kredite: [{ art: "Auto", kategorie: "kfz_finanzierung", rate: "150" }],
  vermoegenswerte: [{ art: "Tagesgeld", betrag: "25.000" }],
};

describe("Finanzierungsrahmen aus der Selbstauskunft", () => {
  it("übernimmt die drei Werte unverändert aus dem CRM-Rechenkern", () => {
    const crm = calculateFinanzierbarkeitFromSaData(SA)!;
    const r = finanzierungsrahmenAusSelbstauskunft(SA)!;
    expect(r.kaufpreisVon).toBe(crm.minRahmen);
    expect(r.kaufpreisEmpfehlung).toBe(crm.empfRahmen);
    expect(r.kaufpreisBis).toBe(crm.maxRahmen);
  });

  it("rechnet das Beispiel nach Bankansatz", () => {
    // Einnahmen 3.500 + 500 × 80 % = 3.900; Ausgaben 1.000 + max(1.050, 1.000) + 200 + 150 = 2.400
    const r = finanzierungsrahmenAusSelbstauskunft(SA)!;
    expect(r.einnahmen).toBe(3900);
    expect(r.ausgaben).toBe(2400);
    expect(r.ueberschuss).toBe(1500);
    expect(r.tragbareRate).toBe(1200);
    expect(r.maxDarlehen).toBe(240000);
    expect(r.eigenkapital).toBe(25000);
    expect([r.kaufpreisVon, r.kaufpreisEmpfehlung, r.kaufpreisBis]).toEqual([217000, 265000, 313000]);
    expect(r.ohneRahmen).toBe(false);
  });

  it("zeigt keinen Rahmen, wenn kein Überschuss bleibt", () => {
    const r = finanzierungsrahmenAusSelbstauskunft({ einkommen: { netto: "1.500" }, mieteWarm: "900", vermoegenswerte: [] })!;
    // 1.500 − 900 − 1.000 (Mindest-Lebenshaltung) = −400
    expect(r.ueberschuss).toBe(-400);
    expect(r.ohneRahmen).toBe(true);
  });
});
