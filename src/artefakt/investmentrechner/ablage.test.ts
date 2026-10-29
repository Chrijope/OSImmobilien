import { describe, expect, it, vi } from "vitest";

// Die Artefaktfassung hat keinen Server; die Ablage braucht nur die Leseregeln des Stores.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
// Ein schlichter Speicher, die Testumgebung stellt localStorage nicht immer bereit.
const speicher = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (schluessel: string) => speicher.get(schluessel) ?? null,
  setItem: (schluessel: string, wert: string) => void speicher.set(schluessel, wert),
  removeItem: (schluessel: string) => void speicher.delete(schluessel),
});

const { eingabeLaden, eingabeSpeichern, BEISPIEL_EINGABE } = await import("./ablage");
const { berechneInvestment, EINGABE_VERSION } = await import("@/lib/investmentrechner/rechenkern");

/*
 * Gespeicherte Stände im Browser (localStorage) laufen durch dieselbe
 * Umrechnung wie gespeicherte Berechnungen im CRM (Codex-Kontrolle vom
 * 22.10.2026): kein doppeltes Hausgeld, alte Feldnamen der früheren Fassung.
 */
describe("Ablage der Artefaktfassung", () => {
  it("rechnet einen Stand aus Version 3 mit Hausgeld wie beim Speichern", () => {
    localStorage.setItem(
      "investmentrechner-eingabe-v1",
      JSON.stringify({ purchasePrice: 250000, monthlyColdRent: 900, monthlyOperatingCosts: 70, housingFeeNonRecoverable: 50, eingabeVersion: 3 }),
    );
    const eingabe = eingabeLaden()!;
    expect(eingabe.eingabeVersion).toBe(EINGABE_VERSION);
    expect(eingabe.monthlyOperatingCosts + eingabe.housingFeeNonRecoverable).toBe(70);
    expect(berechneInvestment(eingabe).years[0].operatingCosts).toBeCloseTo(840, 6);
  });

  it("liest die Garage der früheren Fassung und speichert im neuen Format", () => {
    localStorage.setItem("investmentrechner-eingabe-v1", JSON.stringify({ purchasePrice: 285000, garageMiete: 60, garagePreis: 15000, eingabeVersion: 2 }));
    const eingabe = eingabeLaden()!;
    expect(eingabe.monthlyGarageRent).toBe(60);
    expect(eingabe.garagePrice).toBe(15000);
    eingabeSpeichern(eingabe);
    expect(eingabeLaden()).toEqual(eingabe);
  });
});

describe("Beispielzahlen beim ersten Öffnen", () => {
  it("ohne Maklercourtage: das Feld ist im Rechner nicht bedienbar (Gegencheck Einhauser, 29.10.2026)", () => {
    expect(BEISPIEL_EINGABE.brokerRate).toBe(0);
  });
  it("mit den Standards 5 % Zins, 1 % Tilgung und 2 % Wertsteigerung (29.10.2026)", () => {
    expect(BEISPIEL_EINGABE).toMatchObject({ seniorInterestRate: 5, seniorRepaymentRate: 1, annualValueGrowth: 2 });
  });
});
