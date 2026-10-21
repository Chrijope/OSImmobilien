import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { OBJEKTE, begruessungsName, konzeptAusSchwerpunkt, rentenluecke, uebernahmeAusSkript } from "./beratungOsDaten";
import { KONZEPT_ALTER, KONZEPT_STEUER, MONATSVERLAUF, VERLAUF_WOHNUNG } from "./beratungKonzeptDaten";
import { BEISPIEL } from "./beratungBeispielrechnung";
import { lueckenSatz } from "./beratungOsDaten";

describe("Rechnungen der Beratungspräsentation", () => {
  it("übernimmt die Reihen der Diagramme unverändert aus der gemeinsamen Beispielrechnung", () => {
    // Monatswerte je Alter bei 65.000 € brutto, Beispielwohnung Hauffstraße 38 c, WE 13 (seit 21.10.2026), vor und nach Steuer.
    const pdf: Record<number, [number, number]> = {
      25: [-661, -288], 30: [-603, -274], 40: [-496, -279], 49: [-411, -336],
      50: [-402, -647], 57: [-346, -769], 60: [1083, 626], 64: [1041, 596],
    };
    for (const [alter, [vor, nach]] of Object.entries(pdf)) {
      expect(MONATSVERLAUF.find((m) => m.alter === Number(alter)), `Alter ${alter}`).toMatchObject({ vor, nach });
    }
    // „Nach Steuer zahlen Sie bis 57 insgesamt rund 153.400 € zu“
    const zuzahlung = MONATSVERLAUF.filter((m) => m.alter <= 57).reduce((s, m) => s - m.nach * 12, 0);
    expect(Math.abs(zuzahlung - 153_400)).toBeLessThan(300);
    // Kredit nach 404 Monaten abgezahlt, mit 58; Wert mit 65: rund 629.300 €
    expect(VERLAUF_WOHNUNG.find((p) => p.rest === 0)?.alter).toBe(59);
    expect(VERLAUF_WOHNUNG.at(-1)).toMatchObject({ alter: 65, rest: 0 });
    expect(Math.round(VERLAUF_WOHNUNG.at(-1)!.wert / 100) * 100).toBe(629_300);
  });

  it("rechnet die Beispielwohnung mit 65.000 € brutto: Rate und Hausgeld gehen in Miete, Steuer und Anteil auf", () => {
    const w = BEISPIEL.wohnung;
    expect(BEISPIEL.person.bruttoJahr).toBe(65_000);
    expect([w.miete, w.ersparnis, w.anteil, w.tilgung, w.vorSteuer]).toEqual([1021, 373, 288, 291, 661]);
    // Anteil auf den Folien und im Monatsverlauf gleich (Rundung der Ersparnis, 21.10.2026).
    expect(MONATSVERLAUF[0].nach).toBe(-w.anteil);
    expect(BEISPIEL.mehr[0].anfang).toBe(w.anteil);
    expect(w.miete + w.ersparnis + w.anteil).toBe(w.rate + w.hausgeld);
    expect(w.vorSteuer - w.ersparnis).toBe(w.anteil);
    expect(BEISPIEL.drei.ersparnisJahr1).toBe(897);
    // Vorsorgepauschale ohne AV-Teil (KV und PV über 1.900 €), Codex-Prüfung 21.10.2026.
    expect(BEISPIEL.person.lohnsteuerJahr).toBe(10_772);
    expect(KONZEPT_STEUER.dreiWege.mitOs.wert).toBe("+373 €");
    expect(KONZEPT_STEUER.finanzamt.wert).toBe("898 €");
    expect(KONZEPT_STEUER.hebel.balken.map((b) => b.label)).not.toContain("bis 8 % möglich");
    expect(KONZEPT_ALTER.rente.wege.map((x) => x.wert)).toEqual(["≈ 1.710.000 €", "4.792 € Mieteinnahmen im Monat"]);
    // Die Zusatzrente nach Kosten und Steuer steht darunter (Christian, 21.10.2026).
    expect(KONZEPT_ALTER.rente.wege[1].text).toContain("≈ 2.440 € Zusatzrente im Monat");
    expect(KONZEPT_ALTER.mehrWohnungen.zeilen[1].werte).toEqual(["288 €", "629 €", "1.086 €"]);
    // Ganze Zahlen statt „0,39 Mio.“ (Christian, 21.10.2026).
    expect(KONZEPT_ALTER.mehrWohnungen.saeulen.map((x) => x.wert)).toEqual(["629.300 €", "1.258.600 €", "1.887.900 €"]);
    expect(KONZEPT_ALTER.arbeitsleben.ergebnis.map((k) => k.wert)).toEqual(["≈ 2.320 €", "195.000 €", "≈ 1.887.900 €"]);
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
