import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  BEWERBER_SPALTEN,
  bewerberSpalteSichtbar,
  bewerberSpaltenFuer,
} from "@/lib/bewerberSpalten";
import { PIPELINE_STUFEN } from "@/lib/bewerbungStore";

/**
 * Die Spalten der Bewerberliste je Stufe.
 *
 * Der Anlass: Die Liste zeigte in jeder Stufe dieselben dreizehn Spalten. Im
 * Eingang standen damit Rechnung, Typ, Bewertung und ein Gesprächstermin, den
 * es dort noch gar nicht geben kann.
 */

describe("Welche Spalten eine Stufe zeigt", () => {
  it("blendet im Eingang alles aus, was es dort noch nicht gibt", () => {
    for (const spalte of ["Rechnung", "Typ", "Bewertung", "Termin"]) {
      expect(bewerberSpalteSichtbar(spalte, "Eingang"), spalte).toBe(false);
    }
  });

  it("zeigt im Eingang, was zum Anrufen gebraucht wird", () => {
    for (const spalte of ["Name", "Telefon", "Kontakt", "Quelle", "Anrufe", "WhatsApp", "Vorab-Score", "Stelle"]) {
      expect(bewerberSpalteSichtbar(spalte, "Eingang"), spalte).toBe(true);
    }
  });

  it("zeigt den Termin nur dort, wo einer ansteht", () => {
    for (const stufe of ["Erstgespraech", "Closing", "FollowUp", "Bedenkzeit"]) {
      expect(bewerberSpalteSichtbar("Termin", stufe), stufe).toBe(true);
    }
    for (const stufe of ["Eingang", "Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv"]) {
      expect(bewerberSpalteSichtbar("Termin", stufe), stufe).toBe(false);
    }
  });

  it("tauscht in der Stufe Vertrag die Bewertung gegen das Unterschriftsdatum", () => {
    // Wer im Vertrag steht, ist längst beurteilt. Die Frage lautet dort, ob
    // und wann unterschrieben wurde.
    expect(bewerberSpalteSichtbar("Unterschrieben", "Vertrag")).toBe(true);
    expect(bewerberSpalteSichtbar("Bewertung", "Vertrag")).toBe(false);
  });

  it("zeigt das Unterschriftsdatum nur in der Stufe Vertrag", () => {
    for (const stufe of PIPELINE_STUFEN) {
      if (stufe === "Vertrag") continue;
      expect(bewerberSpalteSichtbar("Unterschrieben", stufe), stufe).toBe(false);
    }
  });

  it("lässt die Bewertung in allen übrigen Stufen stehen", () => {
    for (const stufe of ["Erstgespraech", "Closing", "FollowUp", "Bedenkzeit", "Paketwahl", "Rechnung", "Nutzer_anlegen", "Aktiv"]) {
      expect(bewerberSpalteSichtbar("Bewertung", stufe), stufe).toBe(true);
    }
  });

  it("zeigt den Zahlstand erst ab der Rechnungsstellung", () => {
    for (const stufe of ["Rechnung", "Nutzer_anlegen", "Aktiv"]) {
      expect(bewerberSpalteSichtbar("Rechnung", stufe), stufe).toBe(true);
    }
    for (const stufe of ["Eingang", "Erstgespraech", "Closing", "Paketwahl", "Vertrag"]) {
      expect(bewerberSpalteSichtbar("Rechnung", stufe), stufe).toBe(false);
    }
  });

  it("hört mit Quelle, Anrufen und WhatsApp auf, sobald der Vertrag läuft", () => {
    for (const stufe of ["Paketwahl", "Vertrag", "Rechnung", "Nutzer_anlegen", "Aktiv"]) {
      for (const spalte of ["Quelle", "Anrufe", "WhatsApp"]) {
        expect(bewerberSpalteSichtbar(spalte, stufe), `${spalte} in ${stufe}`).toBe(false);
      }
    }
  });

  it("lässt in jeder Stufe die sechs Spalten stehen, die sagen wer das ist", () => {
    const immer = ["Erstellt", "Name", "Kontakt", "Telefon", "Vorab-Score", "Stelle"];
    for (const stufe of PIPELINE_STUFEN) {
      for (const spalte of immer) {
        expect(bewerberSpalteSichtbar(spalte, stufe), `${spalte} in ${stufe}`).toBe(true);
      }
    }
  });

  it("behält in jeder Stufe die Reihenfolge der Spaltenliste bei", () => {
    for (const stufe of PIPELINE_STUFEN) {
      const sichtbar = bewerberSpaltenFuer(stufe);
      const plaetze = sichtbar.map((s) => BEWERBER_SPALTEN.indexOf(s));
      expect([...plaetze].sort((a, b) => a - b), stufe).toEqual(plaetze);
      expect(sichtbar.length, stufe).toBeGreaterThan(0);
    }
  });

  it("zeigt bei einem unbekannten Abschnitt lieber alles", () => {
    // Eine Spalte zu viel ist harmlos, eine fehlende Angabe nicht.
    expect(bewerberSpaltenFuer("gibt_es_nicht")).toEqual([...BEWERBER_SPALTEN]);
  });
});

/**
 * Kopfzeile und Zellen sind zwei getrennte Stellen im JSX. Behandelt eine von
 * beiden eine Spalte anders, verrutscht jede Zeile der Tabelle um ein Feld,
 * und niemand sieht es an einem grünen Test. Deshalb wird hier der Quelltext
 * gelesen: Beide Stellen müssen dieselbe Funktion benutzen.
 */
describe("Die Seite benutzt dieselbe Regel für Kopf und Zellen", () => {
  // Pfad ab der Projektwurzel: Unter jsdom ist `import.meta.url` keine
  // Dateiadresse, `new URL(..., import.meta.url)` schlaegt dort fehl.
  const quelle = readFileSync("src/pages/BewerberArbeitsplatz.tsx", "utf-8");

  it("leitet die Sichtbarkeit aus bewerberSpalten.ts ab", () => {
    expect(quelle).toContain("bewerberSpalteSichtbar");
    // Keine zweite, handgeschriebene Liste daneben.
    expect(quelle).not.toContain('"Erstellt", "Name", "Kontakt", "Telefon", "Quelle", "Anrufe"');
  });

  it("schützt jede Zelle, die auch im Kopf geschützt ist", () => {
    for (const spalte of ["Quelle", "Anrufe", "WhatsApp", "Termin", "Rechnung", "Bewertung", "Typ"]) {
      expect(quelle, spalte).toContain(`zeige("${spalte}")`);
    }
  });
});
