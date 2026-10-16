import { describe, expect, it } from "vitest";
import {
  PLAN_OBJEKT,
  aufTausend,
  konzeptAusSchwerpunkt,
  rentenluecke,
  uebernahmeAusSkript,
  vermoegenNach,
  wertNach,
} from "./beratungOsDaten";

describe("Rechnungen der Beratungspräsentation", () => {
  it("trifft bei 2 % Wertentwicklung die Exposé-Werte", () => {
    // Exposé Hauffstraße 38 WE01: Wert 319.000 €, Vermögen 278.000 €, drei Wohnungen 835.000 €
    const h = PLAN_OBJEKT.zusatzrente;
    expect(aufTausend(wertNach(h.kaufpreis, 2))).toBe(319_000);
    expect(aufTausend(vermoegenNach(h.kaufpreis, h.restschuld, 2))).toBe(278_000);
    expect(aufTausend(3 * vermoegenNach(h.kaufpreis, h.restschuld, 2))).toBe(835_000);
    // Exposé Barfusstraße 9 WE03: Vermögen 572.000 €, drei Wohnungen 1.716.000 €
    const b = PLAN_OBJEKT.steuer;
    expect(aufTausend(vermoegenNach(b.kaufpreis, b.restschuld, 2))).toBe(572_000);
    expect(aufTausend(3 * vermoegenNach(b.kaufpreis, b.restschuld, 2))).toBe(1_716_000);
  });

  it("rechnet die Rentenlücke je Monat und über 25 Jahre", () => {
    expect(rentenluecke(3000, 1800)).toEqual({ monat: 1200, gesamt: 360_000 });
    expect(rentenluecke(1500, 1800)).toEqual({ monat: 0, gesamt: 0 });
    expect(rentenluecke(0, 1800)).toBeNull();
  });

  it("belegt den Konzeptschalter aus dem Schwerpunkt vor", () => {
    expect(konzeptAusSchwerpunkt("steuer")).toBe("steuer");
    expect(konzeptAusSchwerpunkt("zusatzrente")).toBe("zusatzrente");
    expect(konzeptAusSchwerpunkt("beides")).toBe("zusatzrente");
    expect(konzeptAusSchwerpunkt(undefined)).toBe("zusatzrente");
  });
});

describe("Übernahme aus dem Erstgespräch", () => {
  it("übernimmt alte und neue Felder unter ihren Schlüsseln", () => {
    const daten = uebernahmeAusSkript(
      {
        ziele: ["Altersvorsorge", "Vererben", "Familie absichern", "Unbekannt"],
        antworten: {
          investitionMonat: "300-500 €",
          erfahrung: "keine",
          motivWoertlich: " Jetzt anfangen ",
          reserve: "15.000",
          grenzeStress: "500",
          mitentscheider: "Partner",
          wunschNetto: "3.000",
          renteErwartet: "1.800",
          ruhestandAb: "67",
          sorgen: "Leerstand",
          offeneFragen: "Was kostet der Notar?",
          schwerpunkt: "steuer",
        },
      },
      { qualEinkommen: "3.980", qualEigenkapital: "20.000 €" },
    );
    expect(daten).toEqual({
      einnahmen: "3.980",
      eigenkapitalGesamt: "20.000",
      eigenkapital: "20.000",
      beitrag: "300-500",
      erfahrung: "keine",
      motiv: "Jetzt anfangen",
      reserve: "15.000",
      grenzeStress: "500",
      mitentscheider: "Partner",
      wunschNetto: "3.000",
      renteErwartet: "1.800",
      ruhestandAb: "67",
      sorgen: "Leerstand",
      ersteFrage: "Was kostet der Notar?",
      schwerpunkt: "steuer",
      // Vererben und Familie absichern zählen als ein Ziel, Unbekanntes fällt weg.
      ziel: "Sorgenfrei im Alter durch eine Immobilienrente; Sichere finanzielle Zukunft für die Kinder",
    });
  });

  it("verkraftet leere und kaputte Stände", () => {
    expect(uebernahmeAusSkript(null, null)).toEqual({});
    expect(uebernahmeAusSkript({ antworten: { reserve: "   ", sorgen: { x: 1 } as unknown as string }, ziele: "x" as unknown as string[] }, {})).toEqual({});
  });
});
