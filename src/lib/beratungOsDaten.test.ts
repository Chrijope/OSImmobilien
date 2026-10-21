import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OBJEKTE, begruessungsName, konzeptAusSchwerpunkt, rentenluecke, uebernahmeAusSkript } from "./beratungOsDaten";
import { KONZEPT_ALTER, KONZEPT_STEUER, MONATSVERLAUF, VERLAUF_WOHNUNG } from "./beratungKonzeptDaten";
import { BEISPIEL } from "./beratungBeispielrechnung";
import { lueckenSatz } from "./beratungOsDaten";

describe("Rechnungen der Beratungspräsentation", () => {
  it("übernimmt die Reihen der Diagramme unverändert aus der gemeinsamen Beispielrechnung", () => {
    // Monatswerte je Alter bei 65.000 € brutto (seit 21.10.2026), vor und nach Steuer.
    const pdf: Record<number, [number, number]> = {
      25: [-411, -173], 30: [-374, -165], 40: [-306, -169], 49: [-252, -205],
      50: [-246, -395], 57: [-210, -465], 60: [672, 397], 64: [645, 378],
    };
    for (const [alter, [vor, nach]] of Object.entries(pdf)) {
      expect(MONATSVERLAUF.find((m) => m.alter === Number(alter)), `Alter ${alter}`).toMatchObject({ vor, nach });
    }
    // „Nach Steuer zahlen Sie bis 57 insgesamt rund 93.000 € zu“
    const zuzahlung = MONATSVERLAUF.filter((m) => m.alter <= 57).reduce((s, m) => s - m.nach * 12, 0);
    expect(Math.abs(zuzahlung - 93_000)).toBeLessThan(300);
    // Kredit nach 404 Monaten abgezahlt, mit 58; Wert mit 65: rund 388.600 €
    expect(VERLAUF_WOHNUNG.find((p) => p.rest === 0)?.alter).toBe(59);
    expect(VERLAUF_WOHNUNG.at(-1)).toMatchObject({ alter: 65, rest: 0 });
    expect(Math.round(VERLAUF_WOHNUNG.at(-1)!.wert / 100) * 100).toBe(388_600);
  });

  it("rechnet die Beispielwohnung mit 65.000 € brutto: Rate und Hausgeld gehen in Miete, Steuer und Anteil auf", () => {
    const w = BEISPIEL.wohnung;
    expect(BEISPIEL.person.bruttoJahr).toBe(65_000);
    expect([w.miete, w.ersparnis, w.anteil, w.tilgung, w.vorSteuer]).toEqual([633, 238, 173, 180, 411]);
    // Anteil auf den Folien und im Monatsverlauf gleich (Rundung der Ersparnis, 21.10.2026).
    expect(MONATSVERLAUF[0].nach).toBe(-w.anteil);
    expect(BEISPIEL.mehr[0].anfang).toBe(w.anteil);
    expect(w.miete + w.ersparnis + w.anteil).toBe(w.rate + w.hausgeld);
    expect(w.vorSteuer - w.ersparnis).toBe(w.anteil);
    expect(BEISPIEL.drei.ersparnisJahr1).toBe(653);
    // Vorsorgepauschale ohne AV-Teil (KV und PV über 1.900 €), Codex-Prüfung 21.10.2026.
    expect(BEISPIEL.person.lohnsteuerJahr).toBe(10_772);
    expect(KONZEPT_STEUER.dreiWege.mitOs.wert).toBe("+238 €");
    expect(KONZEPT_STEUER.finanzamt.wert).toBe("898 €");
    expect(KONZEPT_STEUER.hebel.balken.map((b) => b.label)).not.toContain("bis 8 % möglich");
    expect(KONZEPT_ALTER.rente.wege.map((x) => x.wert)).toEqual(["≈ 1.056.000 €", "≈ 1.510 € im Monat"]);
    expect(KONZEPT_ALTER.mehrWohnungen.zeilen[1].werte).toEqual(["173 €", "366 €", "580 €"]);
    // Ganze Zahlen statt „0,39 Mio.“ (Christian, 21.10.2026).
    expect(KONZEPT_ALTER.mehrWohnungen.saeulen.map((x) => x.wert)).toEqual(["388.600 €", "777.200 €", "1.165.800 €"]);
    expect(KONZEPT_ALTER.arbeitsleben.ergebnis.map((k) => k.wert)).toEqual(["≈ 1.440 €", "130.300 €", "≈ 1.165.800 €"]);
  });

  it("nennt unter der Rentenlücke die Anteile aus den Eingaben, ohne Lücke keinen Satz", () => {
    expect(lueckenSatz(3000, 800)).toBe(
      "Die gesetzliche Rente deckt rund 27 % Ihres Wunschnettos. 73 % müssen Sie selbst aufbauen. Je früher Sie beginnen, desto leichter.",
    );
    expect(lueckenSatz(2000, 2500)).toBeNull();
    expect(lueckenSatz(0, 800)).toBeNull();
  });

  it("zeigt jedes Objekt mit sieben Bildern und Konzept", () => {
    expect(OBJEKTE.map((o) => [o.titel, o.konzepte])).toEqual([
      ["Barfusstraße 9", ["steuer"]],
      ["Hauffstraße 38", ["zusatzrente"]],
      ["Doppelhaushälften", ["steuer"]],
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
