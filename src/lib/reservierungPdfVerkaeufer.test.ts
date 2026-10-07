import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";

/**
 * Der Verkäufer steht nicht mehr in der Reservierungsvereinbarung.
 *
 * Bis zum 14.09.2026 hatte das Dokument einen Abschnitt „3. Verkäuferdaten".
 * Christian hat ihn gestrichen: Die Vereinbarung kommt zwischen uns und dem
 * Käufer zustande, wer verkauft, steht im Kaufvertrag. Diese Datei prüfte
 * vorher, dass der Name richtig gedruckt wird, und prüft jetzt, dass er gar
 * nicht mehr erscheint. Die Felder selbst leben weiter, sie hängen am
 * Investment und erreichen von dort den Notar-Aufnahmebogen.
 *
 * jsPDF ist eine Attrappe, die jeden Textaufruf mitschreibt, wie in
 * `anlageVPdf.test.ts`.
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
    getTextWidth(s: string) { return String(s).length * 0.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    save() {}
    output() { return new Blob([]); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

const { generateReservierungPDF } = await import("@/lib/reservierungPdf");

const enthaelt = (text: string) => zeilen.some(z => z.includes(text));

/** Nur die Felder, um die es hier geht. Der Rest darf leer bleiben. */
const daten = (over: Partial<ReservierungData>): ReservierungData =>
  ({ vorname: "Erika", nachname: "Muster", vkName: "", ...over }) as ReservierungData;

beforeEach(() => { zeilen.length = 0; });

describe("Der Verkäufer in der Reservierungsvereinbarung", () => {
  it("druckt keinen Abschnitt Verkäuferdaten mehr", async () => {
    await generateReservierungPDF(daten({
      vkArt: "firma", vkName: "Musterbau Projektentwicklung GmbH",
    }));
    expect(enthaelt("Verkäuferdaten")).toBe(false);
  });

  it("druckt den Firmennamen nirgends, auch wenn er eingetragen ist", async () => {
    await generateReservierungPDF(daten({
      vkArt: "firma", vkName: "Musterbau Projektentwicklung GmbH",
      vkStrasse: "Beispielallee 12", vkPlz: "83022", vkOrt: "Rosenheim",
    }));
    expect(enthaelt("Musterbau Projektentwicklung GmbH")).toBe(false);
    expect(enthaelt("Beispielallee 12")).toBe(false);
  });

  it("druckt auch einen privaten Verkäufer nicht", async () => {
    await generateReservierungPDF(daten({
      vkArt: "person", vkVorname: "Hans", vkName: "Beispiel",
    }));
    expect(enthaelt("Hans Beispiel")).toBe(false);
  });

  /*
   * Zwei Käufer stehen seit dem 14.09.2026 nebeneinander. Der eigene Abschnitt
   * „1b. Käufer 2" mit denselben zehn Beschriftungen ein zweites Mal kostete
   * eine halbe Seite.
   */
  it("stellt zwei Käufer in Spalten dar statt untereinander", async () => {
    await generateReservierungPDF(daten({
      hatPerson2: true, p2Vorname: "Max", p2Nachname: "Muster",
    }));
    expect(zeilen).toContain("Käufer 1");
    expect(zeilen).toContain("Käufer 2");
    expect(zeilen).not.toContain("1b. Käufer 2");
  });

  // Ein einzelner Käufer braucht keine Spaltenköpfe.
  it("lässt die Spaltenköpfe weg, wenn es nur einen Käufer gibt", async () => {
    await generateReservierungPDF(daten({ hatPerson2: false }));
    expect(zeilen).not.toContain("Käufer 1");
    expect(zeilen).not.toContain("Käufer 2");
  });

  /*
   * Ein gestrichener Abschnitt hinterlässt leicht eine Lücke in der Zählung,
   * und ein Dokument, das von 2 auf 4 springt, sieht aus, als fehle eine
   * Seite. Seit dem 15.09.2026 sind es acht Abschnitte, ohne Anlage.
   */
  it("zählt die Abschnitte lückenlos", async () => {
    await generateReservierungPDF(daten({ vkName: "Musterbau GmbH" }));
    for (const titel of [
      "1. Käuferdaten",
      "2. Objektdaten",
      "3. Notar und Abwicklung",
      "4. Reservierungsgebühr und Kontoverbindung",
      "5. Reservierungsvereinbarung",
      "6. Datenschutzerklärung",
      "7. Widerrufsbelehrung",
      "8. Unterschriften",
    ]) {
      expect(zeilen).toContain(titel);
    }
    expect(zeilen).not.toContain("3. Reservierung");
    expect(zeilen).not.toContain("5. Unterschriften");
    expect(zeilen).not.toContain("Anlage: Muster-Widerrufsformular");
  });
});
