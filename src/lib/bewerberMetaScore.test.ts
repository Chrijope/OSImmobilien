import { describe, it, expect } from "vitest";
import { metaScore } from "./bewerberMetaScore";

/**
 * Die Vorabeinschätzung aus den Bewerbungsfragen.
 *
 * Die Punkte hat Christian am 14.09.2026 festgelegt, auf Grundlage der
 * Antworten, die in den Daten tatsächlich vorkommen. Diese Datei hält sie
 * fest: Wer sie ändert, ändert die Reihenfolge, in der über hundert Bewerber
 * angerufen werden, und das soll eine Entscheidung sein und kein Versehen.
 */

describe("Die drei Beispiele, an denen entschieden wurde", () => {
  it("Immobilienprofi, 5+ Jahre, Vollzeit: 100 und A", () => {
    const s = metaScore({
      immobilienErfahrung: "ja",
      vertriebsbereich: "Immobilienvertrieb",
      vertriebserfahrung: "Mehr als 5 Jahre",
      stundenProWoche: "30+ Stunden",
    });
    expect(s?.wert).toBe(100);
    expect(s?.stufe).toBe("A");
  });

  it("aus der Finanzdienstleistung, 5+ Jahre, Vollzeit: 67 und B", () => {
    const s = metaScore({
      immobilienErfahrung: "nein",
      vertriebsbereich: "Finanzdienstleistungen",
      vertriebserfahrung: "Mehr als 5 Jahre",
      stundenProWoche: "30+ Stunden",
    });
    expect(s?.wert).toBe(67);
    expect(s?.stufe).toBe("B");
  });

  it("B2B, 3 bis 5 Jahre, 10 bis 20 Stunden: 38 und C", () => {
    const s = metaScore({
      immobilienErfahrung: "nein",
      vertriebsbereich: "B2B-Vertrieb",
      vertriebserfahrung: "3–5 Jahre",
      stundenProWoche: "10–20 Stunden",
    });
    expect(s?.wert).toBe(38);
    expect(s?.stufe).toBe("C");
  });
});

describe("Die Rangfolge der Antworten", () => {
  const nurBereich = (wert: string) => metaScore({ vertriebsbereich: wert })?.wert ?? -1;

  /*
   * B2C steht über B2B, obwohl B2B häufiger ist: Kapitalanlagen gehen an
   * Privatpersonen. Wer Endkunden überzeugt hat, ist näher an unserem
   * Geschäft als jemand aus dem Firmenkundenvertrieb.
   */
  it("stellt Endkundenvertrieb über Firmenkundenvertrieb", () => {
    expect(nurBereich("B2C-Vertrieb")).toBeGreaterThan(nurBereich("B2B-Vertrieb"));
  });

  it("ordnet die Bereiche wie festgelegt", () => {
    expect(nurBereich("Immobilienvertrieb")).toBeGreaterThan(nurBereich("Finanzdienstleistungen"));
    expect(nurBereich("Finanzdienstleistungen")).toBeGreaterThan(nurBereich("B2C-Vertrieb"));
    expect(nurBereich("B2B-Vertrieb")).toBeGreaterThan(nurBereich("Sonstiges"));
  });

  it("gibt für Immobilienerfahrung die vollen Punkte, für ein Nein keine", () => {
    expect(metaScore({ immobilienErfahrung: "ja" })?.wert).toBe(100);
    expect(metaScore({ immobilienErfahrung: "nein" })?.wert).toBe(0);
  });
});

describe("Was bei unvollständigen Angaben geschieht", () => {
  /*
   * Wie beim Bogen-Score: Eine unbeantwortete Frage zählt in keiner der beiden
   * Summen. Wer drei Fragen übersprungen hat, wird dafür nicht bestraft.
   */
  it("rechnet nur mit den beantworteten Fragen", () => {
    const s = metaScore({ immobilienErfahrung: "ja", vertriebsbereich: "Immobilienvertrieb" });
    // 30 von 30 plus 25 von 25, also 100 aus zwei Fragen.
    expect(s?.wert).toBe(100);
    expect(s?.posten).toHaveLength(2);
  });

  it("gibt null, wenn keine einzige Frage beantwortet ist", () => {
    expect(metaScore({})).toBeNull();
    expect(metaScore({ immobilienErfahrung: "", vertriebsbereich: "  " })).toBeNull();
  });

  /*
   * Eine unbekannte Antwort ist eine Antwort. Sie bringt null Punkte, zählt
   * aber in der erreichbaren Summe mit. Sie stillschweigend zu überspringen
   * würde die Zahl schönrechnen: Wer „Sonstiges (Gastronomie)" schreibt,
   * stünde sonst so da wie jemand, der die Frage gar nicht bekommen hat.
   */
  it("wertet eine unbekannte Antwort mit null, überspringt sie aber nicht", () => {
    const s = metaScore({ immobilienErfahrung: "ja", vertriebsbereich: "Gastronomie" });
    expect(s?.wert).toBe(55); // 30 von 55 möglichen
    expect(s?.posten).toHaveLength(2);
  });
});

describe("Schreibweisen aus der Praxis", () => {
  // Die Felder lassen sich im CRM von Hand überschreiben, und bei Meta steht
  // ein Halbgeviertstrich, den beim Tippen kaum jemand trifft.
  it("erkennt Groß- und Kleinschreibung sowie beide Strichformen", () => {
    expect(metaScore({ immobilienErfahrung: "Ja" })?.wert).toBe(100);
    expect(metaScore({ vertriebserfahrung: "3-5 Jahre" })?.wert)
      .toBe(metaScore({ vertriebserfahrung: "3–5 Jahre" })?.wert);
    expect(metaScore({ stundenProWoche: "10-20 Stunden" })?.wert)
      .toBe(metaScore({ stundenProWoche: "10–20 Stunden" })?.wert);
  });

  it("stört sich nicht an Leerzeichen am Rand", () => {
    expect(metaScore({ immobilienErfahrung: "  ja  " })?.wert).toBe(100);
  });
});

describe("Die Aufschlüsselung für den Tooltip", () => {
  it("nennt je Frage die Antwort im Wortlaut und die Punkte", () => {
    const s = metaScore({ immobilienErfahrung: "ja", stundenProWoche: "20–30 Stunden" });
    expect(s?.posten).toEqual([
      { frage: "Immobilienvertrieb", antwort: "ja", punkte: 30, moeglich: 30 },
      { frage: "Stunden pro Woche", antwort: "20–30 Stunden", punkte: 15, moeglich: 20 },
    ]);
  });
});
