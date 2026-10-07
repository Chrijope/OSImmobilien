import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";

/**
 * Ein alter Vorgang mit gespeicherter Steuer-ID ergibt weiterhin ein sauberes
 * PDF, nur ohne diese Zeile.
 *
 * Die Reservierung erhebt die Nummer seit dem 22.09.2026 nicht mehr. In den
 * bereits gespeicherten Datensätzen steht sie aber weiter, sie liegen als
 * JSON in `investments.meta.rvData` und werden bewusst nicht angerührt. Wer
 * eine solche Reservierung erneut öffnet oder ihr PDF nachdruckt, darf weder
 * eine Fehlermeldung sehen noch die alte Zeile.
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

/** Ein Vorgang aus der Zeit vor dem 22.09.2026, mit Steuer-ID für beide. */
const alterVorgang = () =>
  ({
    vorname: "Erika", nachname: "Muster", objStrasse: "Roonstraße 3",
    wohneinheit: "6", telefon: "0800 1", email: "e@example.de",
    steuerId: "123/456/78901",
    hatPerson2: true,
    p2Vorname: "Max", p2Nachname: "Muster",
    p2Telefon: "0800 2", p2Email: "m@example.de",
    p2SteuerId: "987/654/32109",
  }) as unknown as ReservierungData;

beforeEach(() => { zeilen.length = 0; });

describe("Ein alter Vorgang mit Steuer-ID", () => {
  it("erzeugt das PDF ohne Fehler", async () => {
    await expect(generateReservierungPDF(alterVorgang())).resolves.toBeTruthy();
  });

  it("druckt die Zeile Steuer-ID nicht mehr", async () => {
    await generateReservierungPDF(alterVorgang());
    expect(zeilen).not.toContain("Steuer-ID");
    expect(enthaelt("Steuer-ID")).toBe(false);
  });

  it("druckt auch die gespeicherten Nummern selbst nicht mehr", async () => {
    await generateReservierungPDF(alterVorgang());
    expect(enthaelt("123/456/78901")).toBe(false);
    expect(enthaelt("987/654/32109")).toBe(false);
  });

  it("druckt die übrigen Käuferangaben unverändert weiter", async () => {
    await generateReservierungPDF(alterVorgang());
    // Die Nachbarzeilen der entfallenen Angabe stehen noch, damit sicher ist,
    // dass nicht versehentlich der ganze Block verschwunden ist.
    expect(zeilen).toContain("Telefon");
    expect(zeilen).toContain("E-Mail");
    expect(enthaelt("Erika")).toBe(true);
    expect(enthaelt("e@example.de")).toBe(true);
  });
});
