import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";

/**
 * Das PDF der Reservierungsvereinbarung für ein Globalobjekt (das ganze Haus).
 *
 * Unterschrieben wird das PDF, deshalb muss hier stehen, was der Entwurf vom
 * 23.09.2026 verlangt: Kaufgegenstand statt Wohneinheit, keine Staffel, fester
 * Betrag von 3.000 EUR, die eigene Fassung in der Fußzeile, und bei einer
 * Gesellschaft deren Angaben statt Geburtsdatum und Güterstand, keine
 * Widerrufsbelehrung und die Unterschriftszeile „Für die Käuferin“.
 *
 * jsPDF ist eine Attrappe, die jeden Textaufruf mitschreibt, wie in
 * `reservierungPdfWiderruf.test.ts`.
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

const enthaelt = (text: string) => zeilen.some((z) => z.includes(text));

const haus = (over: Partial<ReservierungData> = {}): ReservierungData => ({
  vorname: "Erika", nachname: "Muster", geburtsdatum: "01.01.1980", staatsangehoerigkeit: "Deutsch",
  strasse: "Kundenweg", hausnummer: "4", plz: "80331", ort: "München", telefon: "0170 1", email: "erika@muster.test",
  gueterstand: "", hatPerson2: false,
  objStrasse: "Musterstraße 1", objPlz: "95028", objOrt: "Hof", gesamtpreis: "1.850.000", wohneinheit: "",
  gesamtobjekt: true, kaeuferArt: "privat", anzahlEinheiten: "8", aufteilung: "nicht_aufgeteilt",
  grundbuchAmtsgericht: "Hof", grundbuchGemarkung: "Hof", grundbuchFlurstueck: "123/4",
  stellplaetzeGaragen: "8 Stellplätze auf dem Grundstück", flaecheGesamt: "640",
  textFassung: "2026-09-23 Gesamtobjekt",
  ...over,
}) as ReservierungData;

const gmbh = (over: Partial<ReservierungData> = {}) => haus({
  kaeuferArt: "gesellschaft", firma: "Muster Immobilien GmbH", rechtsform: "GmbH",
  firmaStrasse: "Hauptstraße", firmaHausnummer: "5", firmaPlz: "80331", firmaOrt: "München",
  registergericht: "Amtsgericht München", registernummer: "HRB 123456",
  vorname: "Max", nachname: "Muster", vertreterFunktion: "Geschäftsführer",
  geburtsdatum: "", staatsangehoerigkeit: "",
  ...over,
});

beforeEach(() => { zeilen.length = 0; });

describe("Abschnitt 2 und 4 beim ganzen Haus", () => {
  it("nennt den Kaufgegenstand statt einer Wohneinheit, dazu Anzahl, Grundbuch, Aufteilung und Stellplätze", async () => {
    await generateReservierungPDF(haus());
    expect(enthaelt("als Ganzes über MOREImmo zu erwerben")).toBe(true);
    expect(zeilen).toContain("Kaufgegenstand");
    expect(enthaelt("Gesamtobjekt (Grundstück mit Gebäude und sämtlichen Einheiten)")).toBe(true);
    expect(zeilen).toContain("8 Einheiten");
    expect(enthaelt("Amtsgericht Hof, Gemarkung Hof, Flurstück(e) 123/4")).toBe(true);
    expect(zeilen).toContain("nicht aufgeteilt");
    expect(zeilen).toContain("8 Stellplätze auf dem Grundstück");
    expect(zeilen).toContain("Kaufpreis gesamt");
    expect(zeilen).not.toContain("Wohneinheit");
    expect(zeilen).not.toContain("Gesamtpreis");
    // Die Fläche steht bewusst nicht im Dokument.
    expect(enthaelt("640")).toBe(false);
  });

  it("zeigt keine Staffel, sondern die feste Gebühr für das Gesamtobjekt", async () => {
    await generateReservierungPDF(haus());
    expect(enthaelt("Kaufpreis unter")).toBe(false);
    expect(enthaelt("Kaufpreis ab")).toBe(false);
    expect(zeilen).toContain("Reservierungsgebühr für ein Gesamtobjekt");
    expect(zeilen).toContain("3.000,00 EUR");
    expect(enthaelt("1.500,00 EUR")).toBe(false);
    expect(enthaelt("Reservierungsgebühr Musterstraße 1 Gesamtobjekt, Muster")).toBe(true);
  });

  it("druckt die Fassung des Globalobjekts in die Fußzeile", async () => {
    await generateReservierungPDF(haus());
    expect(zeilen).toContain("Fassung 2026-09-23 Gesamtobjekt");
  });

  it("enthält bei Privatpersonen die Belehrung und beim Abwarten „das Objekt“", async () => {
    await generateReservierungPDF(haus({ widerrufWahl: "abwarten" }));
    expect(zeilen).toContain("Widerrufsrecht");
    expect(enthaelt("dass das Objekt bis zum Ablauf der Widerrufsfrist nicht für mich reserviert ist")).toBe(true);
    expect(enthaelt("(Punkt 10)")).toBe(true);
    expect(enthaelt("Unterschrift Käufer 1")).toBe(true);
  });
});

describe("Die Käuferin ist eine Gesellschaft", () => {
  it("führt Firma, Register und Vertreter, aber kein Geburtsdatum und keine Staatsangehörigkeit", async () => {
    await generateReservierungPDF(gmbh());
    for (const label of ["Firma", "Rechtsform", "Sitz / Anschrift", "Registergericht / Nummer", "vertreten durch", "IBAN für die Rückzahlung"]) {
      expect(zeilen).toContain(label);
    }
    expect(zeilen).toContain("Amtsgericht München, HRB 123456");
    expect(zeilen).toContain("Max Muster, Geschäftsführer");
    expect(zeilen).not.toContain("Geburtsdatum");
    expect(zeilen).not.toContain("Staatsangehörigkeit");
    expect(zeilen).not.toContain("Güterstand");
  });

  it("hat keine Widerrufsbelehrung und bestätigt über den Unterschriften nur die Kopie", async () => {
    await generateReservierungPDF(gmbh());
    expect(zeilen).not.toContain("Widerrufsrecht");
    expect(enthaelt("Widerrufsbelehrung")).toBe(false);
    expect(enthaelt("Beginn der Reservierung")).toBe(false);
    expect(enthaelt("diese Vereinbarung vor der Unterzeichnung vollständig gelesen")).toBe(true);
    expect(enthaelt("für eine Gesellschaft unterzeichnet, versichert")).toBe(true);
  });

  it("unterschreibt „Für die Käuferin“ und nicht als Käufer 1, ohne zweiten Käufer", async () => {
    await generateReservierungPDF(gmbh({ hatPerson2: true, p2Vorname: "Anna", p2Nachname: "Zweite" }));
    expect(zeilen).toContain("Für die Käuferin: Muster Immobilien GmbH, Max Muster, Geschäftsführer");
    expect(enthaelt("Unterschrift Käufer 1")).toBe(false);
    expect(enthaelt("Käufer 2")).toBe(false);
  });

  it("nennt im Verwendungszweck die Firma", async () => {
    await generateReservierungPDF(gmbh());
    expect(enthaelt("Reservierungsgebühr Musterstraße 1 Gesamtobjekt, Muster Immobilien GmbH")).toBe(true);
  });
});

describe("Die Einzelwohnung bleibt, wie sie war", () => {
  it("druckt weiter Wohneinheit, Staffel und Gesamtpreis", async () => {
    await generateReservierungPDF({ vorname: "Erika", nachname: "Muster", objStrasse: "Roonstraße 3", wohneinheit: "6", gesamtpreis: "250.000" } as ReservierungData);
    expect(zeilen).toContain("Wohneinheit");
    expect(zeilen).toContain("Gesamtpreis");
    expect(enthaelt("Kaufpreis unter 300.000,00 EUR")).toBe(true);
    expect(zeilen).not.toContain("Kaufgegenstand");
    expect(zeilen).toContain("Fassung 2026-09-22");
  });
});
