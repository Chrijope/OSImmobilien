import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Was im gedruckten Notar-Aufnahmebogen wirklich steht.
 *
 * Zwei Befunde hängen genau hier: Der Bogen benannte nur das Haus und nicht
 * die Wohnung, und der Verkäufername wurde am letzten Leerzeichen geteilt.
 * Beides ließ sich im Formular nicht sehen, sondern erst im Dokument, das zum
 * Notar geht. Deshalb wird das Dokument geprüft und nicht die Eingabemaske.
 *
 * jsPDF wird durch eine Attrappe ersetzt, die jeden Textaufruf mitschreibt.
 * Dasselbe Vorgehen wie in `anlageVPdf.test.ts`.
 */
const { zeilen } = vi.hoisted(() => ({ zeilen: [] as string[] }));

vi.mock("jspdf", () => {
  class GState { constructor(_: unknown) {} }
  class JsPdfAttrappe {
    private seiten = 1;
    addFileToVFS() {}
    addFont() {}
    setFont() {}
    setFontSize() {}
    setTextColor() {}
    setFillColor() {}
    setDrawColor() {}
    setLineWidth() {}
    setGState() {}
    rect() {}
    roundedRect() {}
    ellipse() {}
    line() {}
    text(s: string | string[]) {
      for (const t of Array.isArray(s) ? s : [s]) zeilen.push(String(t));
    }
    addImage() {}
    addPage() { this.seiten += 1; }
    setPage() {}
    getNumberOfPages() { return this.seiten; }
    // Großzügig, damit nichts wegen der Breite abgeschnitten wird und die
    // Prüfung den ganzen Text zu sehen bekommt.
    getTextWidth(s: string) { return String(s).length * 0.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    save() {}
    output() { return new Blob([]); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

const { generateKaufvertragPDF } = await import("@/lib/kaufvertragPdf");

/** Steht diese Zeile im Dokument? */
const enthaelt = (text: string) => zeilen.some(z => z.includes(text));

beforeEach(() => { zeilen.length = 0; });

describe("Die Wohnung steht im gedruckten Bogen", () => {
  it("druckt Wohneinheit und Wohnungsnummer unter der Adresse", async () => {
    await generateKaufvertragPDF({
      obj_adresse: "Roonstraße 3, 95028 Hof",
      obj_wohneinheit: "6",
      obj_wohnungsnummer: "Nr. 12",
    });
    expect(enthaelt("Roonstraße 3, 95028 Hof")).toBe(true);
    expect(enthaelt("Wohneinheit")).toBe(true);
    expect(enthaelt("Wohnungsnummer laut Teilungserklärung")).toBe(true);
    expect(enthaelt("Nr. 12")).toBe(true);
  });

  it("druckt die Zeilen auch leer, damit der Notar die Lücke sieht", async () => {
    await generateKaufvertragPDF({ obj_adresse: "Roonstraße 3, 95028 Hof" });
    expect(enthaelt("Wohnungsnummer laut Teilungserklärung")).toBe(true);
  });
});

describe("Der Verkäufername im gedruckten Bogen", () => {
  it("druckt eine Firma in einer Zeile und ungeteilt", async () => {
    await generateKaufvertragPDF({
      vk_art: "firma",
      vk_name: "Musterbau Projektentwicklung GmbH",
    });
    expect(enthaelt("Firma")).toBe(true);
    expect(enthaelt("Musterbau Projektentwicklung GmbH")).toBe(true);
    // Kein Vorname für eine Gesellschaft.
    expect(zeilen.filter(z => z === "Vorname").length).toBe(1); // nur beim Käufer
  });

  it("druckt eine Privatperson mit Vor- und Nachnamen", async () => {
    await generateKaufvertragPDF({
      vk_art: "person", vk_vorname: "Erika", vk_name: "Mustermann",
    });
    expect(enthaelt("Erika")).toBe(true);
    expect(enthaelt("Mustermann")).toBe(true);
    expect(zeilen.filter(z => z === "Vorname").length).toBe(2); // Verkäufer und Käufer
  });

  it("druckt einen bestehenden Eintrag ohne Wahl unverändert", async () => {
    await generateKaufvertragPDF({ vk_name: "Musterbau Projektentwicklung GmbH" });
    expect(enthaelt("Musterbau Projektentwicklung GmbH")).toBe(true);
  });

  it("setzt eine bereits geschehene Teilung wieder zusammen, wenn Firma gewählt ist", async () => {
    // So sieht ein Bogen aus, der vor 09/2026 vorbefüllt wurde.
    await generateKaufvertragPDF({
      vk_art: "firma",
      vk_vorname: "Musterbau Projektentwicklung",
      vk_name: "GmbH",
    });
    expect(enthaelt("Musterbau Projektentwicklung GmbH")).toBe(true);
  });
});
