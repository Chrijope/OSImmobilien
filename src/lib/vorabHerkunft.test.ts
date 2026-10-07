import { describe, it, expect } from "vitest";
import { anzahlVorabFelder, vorabEtikett, vorabHerkunft } from "./vorabHerkunft";
import type { FormularAntworten } from "./bewerberFormular";

// Die Herkunft wird aus dem Vergleich abgeleitet, es gibt am Datensatz keine
// Liste übernommener Felder. Diese Tests halten die vier Zustände fest.

const antworten: FormularAntworten = {
  beschaeftigung: "angestellt",
  zeitProWoche: "10_bis_20",
  hintergrund: ["vertrieb", "netzwerk"],
};

describe("vorabHerkunft", () => {
  it("meldet ohne Formular nichts", () => {
    expect(vorabHerkunft("zeitProWoche", null, {}).status).toBe("keine");
  });

  it("meldet ein leeres Feld als offen", () => {
    expect(vorabHerkunft("zeitProWoche", antworten, {}).status).toBe("offen");
  });

  it("erkennt den übernommenen Wert", () => {
    const h = vorabHerkunft("zeitProWoche", antworten, { zeitProWoche: "10_bis_20" });
    expect(h.status).toBe("uebernommen");
    expect(h.formularText).toContain("10 bis 20 Stunden");
  });

  it("erkennt eine Abweichung im Gespräch", () => {
    expect(vorabHerkunft("zeitProWoche", antworten, { zeitProWoche: "vollzeit" }).status)
      .toBe("abweichend");
  });

  it("vergleicht Listen unabhängig von der Reihenfolge", () => {
    // "netzwerk" ist kein Pfad und fällt in der Übersetzung heraus.
    expect(vorabHerkunft("pfade", antworten, { pfade: ["vertrieb"] }).status)
      .toBe("uebernommen");
  });

  it("kennzeichnet ein Feld ohne tragfähige Entsprechung nicht", () => {
    // "Etwas anderes" trägt keine Information, die ins Feld gehört.
    expect(vorabHerkunft("beschaeftigungsart", { beschaeftigung: "sonstiges" }, {}).status)
      .toBe("keine");
  });

  it("zählt nur Felder, die das Formular wirklich belegen kann", () => {
    // Beschäftigung, Zeit pro Woche und Pfade. Erreichbarkeit hat kein Zielfeld.
    expect(anzahlVorabFelder({ ...antworten, erreichbarkeit: ["abends"] })).toBe(3);
    expect(anzahlVorabFelder(null)).toBe(0);
  });

  it("hat nur für gekennzeichnete Zustände ein Etikett", () => {
    expect(vorabEtikett("uebernommen")).toMatch(/vorab beantwortet/);
    expect(vorabEtikett("abweichend")).toMatch(/geändert/);
    expect(vorabEtikett("offen")).toBe("");
    expect(vorabEtikett("keine")).toBe("");
  });
});
