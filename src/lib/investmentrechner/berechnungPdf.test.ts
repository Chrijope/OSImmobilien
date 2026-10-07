import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Das PDF „Berechnung herunterladen“ (28.09.2026).
 *
 * Gezeichnet wird mit dem echten jsPDF. Die Attrappe unten ist eine
 * Unterklasse, die jeden Textaufruf samt Seite, Breite und Ausrichtung
 * mitschreibt und `save` abfängt. So lässt sich prüfen, dass kein Text,
 * insbesondere keine Tabellenzelle, rechts über den Satzspiegel hinausläuft,
 * auch bei dreißig Jahren und sehr großen Beträgen.
 */
const mitschnitt = vi.hoisted(() => ({
  texte: [] as { seite: number; text: string; links: number; rechts: number; y: number }[],
  gespeichert: [] as string[],
}));

vi.mock("jspdf", async (original) => {
  const echt = await original<typeof import("jspdf")>();
  class Messend extends echt.default {
    constructor(...args: ConstructorParameters<typeof echt.default>) {
      super(...args);
      const zeichne = this.text.bind(this);
      this.text = ((text: string | string[], x: number, y: number, optionen?: { align?: string; charSpace?: number }) => {
        const seite = this.getCurrentPageInfo().pageNumber;
        for (const zeile of Array.isArray(text) ? text : [text]) {
          const breite = this.getTextWidth(zeile) + Math.max(0, zeile.length - 1) * (optionen?.charSpace ?? 0);
          const links = optionen?.align === "right" ? x - breite : optionen?.align === "center" ? x - breite / 2 : x;
          mitschnitt.texte.push({ seite, text: zeile, links, rechts: links + breite, y });
        }
        return zeichne(text, x, y, optionen as never);
      }) as typeof this.text;
      this.save = ((name: string) => {
        mitschnitt.gespeichert.push(name);
        return this;
      }) as unknown as typeof this.save;
    }
  }
  return { ...echt, default: Messend, jsPDF: Messend };
});

import { berechneInvestment, standardEingabe, type InvestmentEingabe } from "./rechenkern";
import { leereUnterlagenDaten } from "./unterlagenAuslesen";
import {
  BERECHNUNG_PDF_RAND,
  berechnungPdfDateiname,
  erzeugeBerechnungPdf,
  ladeBerechnungPdfHerunter,
  type BerechnungPdfObjekt,
} from "./berechnungPdf";

const SEITE_B = 210;
const SEITE_H = 297;
// Rundung von jsPDF bei der Breitenmessung.
const TOLERANZ = 0.05;

function objekt(over: Partial<InvestmentEingabe> = {}): BerechnungPdfObjekt {
  const input: InvestmentEingabe = {
    ...standardEingabe,
    propertyTitle: "Musterstraße 12, WE 7",
    address: "Musterstraße 12, 80331 München",
    purchasePrice: 300000,
    furniturePrice: 10000,
    rehabExpense: 20000,
    equity: 30000,
    monthlyColdRent: 1000,
    monthlyOperatingCosts: 50,
    ...over,
  };
  return { input, result: berechneInvestment(input), photos: [], documents: [], documentData: leereUnterlagenDaten };
}

/** Große Beträge in allen Spalten, damit die Zellen am vollsten sind. */
const gross: Partial<InvestmentEingabe> = {
  clientName: "Familie Beispiel",
  purchasePrice: 98765432,
  monthlyColdRent: 412345,
  taxableIncomeCustomer: 12345678,
  equity: 1234567,
  juniorLoanAmount: 5000000,
};

beforeEach(() => {
  mitschnitt.texte.length = 0;
  mitschnitt.gespeichert.length = 0;
});

function pruefeRaender() {
  expect(mitschnitt.texte.length).toBeGreaterThan(100);
  for (const eintrag of mitschnitt.texte) {
    const wo = `Seite ${eintrag.seite}: „${eintrag.text}“`;
    expect(eintrag.rechts, wo).toBeLessThanOrEqual(SEITE_B - BERECHNUNG_PDF_RAND + TOLERANZ);
    expect(eintrag.links, wo).toBeGreaterThanOrEqual(BERECHNUNG_PDF_RAND - TOLERANZ);
    expect(eintrag.y, wo).toBeLessThanOrEqual(SEITE_H - 10);
  }
}

describe("Berechnung als PDF: nichts läuft über den Rand", () => {
  it.each([
    ["kurzer Zeitraum ohne Kundendaten", [objekt({ forecastYears: 3 })]],
    ["dreißig Jahre mit Kundendaten und großen Beträgen", [objekt({ ...gross, forecastYears: 30 })]],
    [
      "Vergleich zweier Objekte über dreißig Jahre",
      [
        objekt({ ...gross, forecastYears: 30 }),
        objekt({ ...gross, forecastYears: 30, propertyTitle: "Beispielweg 3 mit einem sehr langen Objektnamen, WE 12" }),
      ],
    ],
  ])("%s", async (_name, objekte) => {
    await erzeugeBerechnungPdf(objekte);
    pruefeRaender();
  });

  it("zeigt alle dreißig Jahre und wiederholt den Tabellenkopf auf Folgeseiten", async () => {
    const doc = await erzeugeBerechnungPdf([objekt({ ...gross, forecastYears: 30 })]);
    const jahre = new Set(mitschnitt.texte.map((t) => t.text));
    expect(jahre.has("2026")).toBe(true);
    expect(jahre.has("2055")).toBe(true);
    // Die AfA-Tabelle läuft bei dreißig Jahren auf die nächste Seite, ihr Kopf steht dort erneut.
    const seitenMitKopf = new Set(mitschnitt.texte.filter((t) => t.text === "Reguläre AfA").map((t) => t.seite));
    expect(seitenMitKopf.size).toBeGreaterThan(1);
    expect(doc.getNumberOfPages()).toBeGreaterThan(8);
  });

  it("schreibt keine Gedankenstriche", async () => {
    await erzeugeBerechnungPdf([objekt({ forecastYears: 10 })]);
    expect(mitschnitt.texte.filter((t) => /[–—]/.test(t.text))).toEqual([]);
  });
});

describe("Herunterladen", () => {
  it("speichert die Datei direkt und nennt sie nach Objekt, Einheit und Datum, ohne Kundennamen", async () => {
    const name = await ladeBerechnungPdfHerunter([objekt({ clientName: "Familie Beispiel" })]);
    expect(mitschnitt.gespeichert).toEqual([name]);
    expect(name).toMatch(/^Berechnung_Musterstrasse-12_WE-7_\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(name).not.toContain("Beispiel");
  });

  it("baut den Dateinamen ohne Umlaute, mit Rückfall und für den Vergleich", () => {
    const tag = new Date(2026, 8, 28);
    expect(berechnungPdfDateiname([objekt()], "de", tag)).toBe("Berechnung_Musterstrasse-12_WE-7_2026-09-28.pdf");
    expect(berechnungPdfDateiname([objekt({ propertyTitle: "" })], "de", tag)).toBe("Berechnung_Objekt_2026-09-28.pdf");
    expect(berechnungPdfDateiname([objekt(), objekt()], "en", tag)).toBe(
      "Calculation_Musterstrasse-12_WE-7_Comparison_2026-09-28.pdf",
    );
  });
});
