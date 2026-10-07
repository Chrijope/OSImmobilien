/**
 * Tests fuer die Bewerberauswertung der Statistikseite.
 *
 * Anlass: Die Auswertung fuehrte eine eigene, erfundene Stufenliste
 * ("Screening", "16P-Test", "Interview", "Entscheidung", "Onboarding"). Weil
 * keine davon je passte, stand jeder Bewerber im Balken Eingang, die uebrigen
 * fuenf standen dauerhaft auf null. Ausserdem zaehlten Absager weiter als
 * laufende Bewerber, weil "abgelehnt" klein geschrieben abgefragt wurde.
 */
import { describe, it, expect } from "vitest";
import {
  bewerberKennzahlen,
  bewerberPipelineVerteilung,
  bewerberStufe,
  istBewerberZeile,
  type BewerberZeile,
} from "@/lib/bewerberStatistik";
import { PIPELINE_STUFEN, STATUS_LABELS } from "@/lib/bewerbungStore";

/** Eine Zeile der Tabelle `bewerbungen`, nur mit dem, was die Auswertung liest. */
function zeile(status: string, meta: Record<string, unknown> = {}): BewerberZeile {
  return { status, meta };
}

describe("Stufenliste der Auswertung", () => {
  it("ist genau die Pipeline aus dem Bewerberprozess", () => {
    // Der Kern des Fehlers. Die Auswertung darf keine zweite Liste fuehren,
    // sonst laeuft sie wieder auseinander.
    expect(bewerberPipelineVerteilung([]).map(p => p.stufe)).toEqual(PIPELINE_STUFEN);
  });

  it("beschriftet die Balken mit den Anzeigenamen", () => {
    const verteilung = bewerberPipelineVerteilung([]);
    expect(verteilung.map(p => p.label)).toEqual(PIPELINE_STUFEN.map(s => STATUS_LABELS[s]));
    // Stichprobe: der Wert der Datenbank ist "Erstgespraech" ohne Umlaut.
    expect(verteilung.find(p => p.stufe === "Erstgespraech")?.label).toBe("Erstgespräch");
  });

  it("gibt Abgelehnt und Kein Interesse keinen Balken", () => {
    const stufen = bewerberPipelineVerteilung([]).map(p => p.stufe as string);
    expect(stufen).not.toContain("Abgelehnt");
    expect(stufen).not.toContain("KeinInteresse");
  });
});

describe("Zuordnung zur Stufe", () => {
  it("zaehlt einen Bewerber in der mittleren Stufe, nicht in Eingang", () => {
    const verteilung = bewerberPipelineVerteilung([zeile("Paketwahl")]);
    expect(verteilung.find(p => p.stufe === "Paketwahl")?.count).toBe(1);
    expect(verteilung.find(p => p.stufe === "Eingang")?.count).toBe(0);
  });

  it("verteilt jede Stufe auf ihren eigenen Balken", () => {
    // Vorher standen alle zehn im Balken Eingang.
    const verteilung = bewerberPipelineVerteilung(PIPELINE_STUFEN.map(s => zeile(s)));
    expect(verteilung.every(p => p.count === 1)).toBe(true);
  });

  it("schreibt Altbestaende auf die heutige Stufe um", () => {
    // "Interview" ist ein alter Wert und wird im Store auf "Closing" gemappt.
    // Ohne diese Umschreibung landete der Bewerber im Auffangwert Eingang.
    expect(bewerberStufe(zeile("Interview"))).toBe("Closing");
    const verteilung = bewerberPipelineVerteilung([zeile("Screening"), zeile("Onboarding")]);
    expect(verteilung.find(p => p.stufe === "Erstgespraech")?.count).toBe(1);
    expect(verteilung.find(p => p.stufe === "Nutzer_anlegen")?.count).toBe(1);
    expect(verteilung.find(p => p.stufe === "Eingang")?.count).toBe(0);
  });

  it("laesst Stellen und Termine aus der Tabelle weg", () => {
    expect(istBewerberZeile({ meta: { _type: "stelle" } })).toBe(false);
    expect(istBewerberZeile({ meta: { _type: "bewerber" } })).toBe(true);
    expect(istBewerberZeile({ meta: {} })).toBe(true);
    const verteilung = bewerberPipelineVerteilung([
      zeile("Eingang"),
      { status: "Veröffentlicht", meta: { _type: "stelle" } },
    ]);
    expect(verteilung.find(p => p.stufe === "Eingang")?.count).toBe(1);
  });
});

describe("Kennzahlen", () => {
  it("zaehlt Abgelehnte und Kein Interesse nicht als im Prozess", () => {
    const k = bewerberKennzahlen([
      zeile("Eingang"),
      zeile("Abgelehnt"),
      zeile("KeinInteresse"),
    ]);
    expect(k.gesamt).toBe(3);
    expect(k.imProzess).toBe(1);
    expect(k.ausgeschieden).toBe(2);
  });

  it("zaehlt Aktiv als am Ziel, nicht als im Prozess", () => {
    const k = bewerberKennzahlen([zeile("Aktiv"), zeile("Vertrag")]);
    expect(k.aktiv).toBe(1);
    expect(k.imProzess).toBe(1);
  });

  it("ergibt zusammen wieder die Gesamtzahl", () => {
    const k = bewerberKennzahlen([
      zeile("Eingang"), zeile("Closing"), zeile("Aktiv"),
      zeile("Abgelehnt"), zeile("KeinInteresse"),
    ]);
    expect(k.imProzess + k.aktiv + k.ausgeschieden).toBe(k.gesamt);
  });

  it("gibt es die Stufe Onboarding nicht als eigene Kennzahl", () => {
    // Die alte Kachel "Onboarding" stand immer auf null, weil es diesen
    // Status im Bewerberprozess nicht gibt. Der Altwert gehoert zu
    // "Nutzer anlegen" und damit in den laufenden Prozess.
    const k = bewerberKennzahlen([zeile("Onboarding")]);
    expect(k.imProzess).toBe(1);
    expect(k.aktiv).toBe(0);
  });
});
