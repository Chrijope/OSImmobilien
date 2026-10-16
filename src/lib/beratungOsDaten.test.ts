import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OBJEKTE, begruessungsName, konzeptAusSchwerpunkt, rentenluecke, uebernahmeAusSkript } from "./beratungOsDaten";
import { MONATSVERLAUF, VERLAUF_WOHNUNG } from "./beratungKonzeptDaten";

describe("Rechnungen der Beratungspräsentation", () => {
  it("übernimmt die Reihen der Diagramme unverändert aus dem Rechenprotokoll", () => {
    // Tabelle „Verlauf (eine Wohnung, Monatswerte)“ im Rechenprotokoll Überarbeitung 16.10.2026
    const protokoll: Record<number, [number, number]> = {
      25: [-325, -52], 30: [-275, -44], 40: [-166, -48], 49: [-56, -87],
      50: [-43, -359], 57: [51, -440], 60: [1293, 757], 64: [1352, 792],
    };
    for (const [alter, [vor, nach]] of Object.entries(protokoll)) {
      expect(MONATSVERLAUF.find((m) => m.alter === Number(alter)), `Alter ${alter}`).toMatchObject({ vor, nach });
    }
    // „Summe Zuzahlung nach Steuer bis 57: rund 53.900 €“
    const zuzahlung = MONATSVERLAUF.filter((m) => m.alter <= 57).reduce((s, m) => s - m.nach * 12, 0);
    expect(Math.abs(zuzahlung - 53_900)).toBeLessThan(300);
    // Kredit nach 404 Monaten abgezahlt, mit 58; Wert mit 65: 529.930 €
    expect(VERLAUF_WOHNUNG.find((p) => p.rest === 0)?.alter).toBe(59);
    expect(VERLAUF_WOHNUNG.at(-1)).toEqual({ alter: 65, rest: 0, wert: 529_930 });
  });

  it("zeigt jedes Objekt mit sieben Bildern und Konzept", () => {
    expect(OBJEKTE.map((o) => [o.titel, o.konzepte])).toEqual([
      ["Barfusstraße 9", ["steuer"]],
      ["Hauffstraße 38", ["zusatzrente"]],
      ["Doppelhaushälften", ["zusatzrente"]],
    ]);
    for (const o of OBJEKTE) {
      expect(o.bilder).toHaveLength(7);
      for (const b of o.bilder) expect(existsSync(join(process.cwd(), "public", b.src)), b.src).toBe(true);
    }
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

describe("Vorname für die Begrüßung", () => {
  it("nimmt den Kontakt vor den Parametern", () => {
    expect(begruessungsName("Anna", "Anne", "Anne Muster")).toBe("Anna");
    expect(begruessungsName(undefined, "Anna Maria", "Anna Maria Muster")).toBe("Anna Maria");
    expect(begruessungsName(undefined, null, " Jonas Beispiel ")).toBe("Jonas");
  });

  it("macht aus leeren und kaputten Werten keinen Namen", () => {
    expect(begruessungsName(undefined, null, null)).toBe("");
    expect(begruessungsName("  ", "", "undefined undefined")).toBe("");
    expect(begruessungsName(42, "null", "")).toBe("");
  });
});
