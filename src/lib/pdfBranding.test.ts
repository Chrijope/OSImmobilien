import { describe, it, expect, vi } from "vitest";
import { brandedRow } from "@/lib/pdfBranding";

/**
 * Attrappe eines jsPDF-Dokuments.
 *
 * Sie misst Text so, wie jsPDF es tut: proportional zur Zeichenzahl und zur
 * Schriftgroesse. Das reicht, um zu pruefen, ob ein Wert umgebrochen wird
 * und ob er in der zugewiesenen Breite bleibt.
 */
function attrappe(breiteProZeichen = 1.6) {
  const gezeichnet: Array<{ text: string; x: number; y: number }> = [];
  const doc: any = {
    setFontSize: vi.fn(), setFont: vi.fn(), setTextColor: vi.fn(),
    setDrawColor: vi.fn(), setLineWidth: vi.fn(),
    linien: [] as Array<{ y: number }>,
    getTextWidth: (s: string) => s.length * breiteProZeichen,
    text: (t: string, x: number, y: number) => { gezeichnet.push({ text: t, x, y }); },
    line: (_x1: number, y1: number) => { doc.linien.push({ y: y1 }); },
    splitTextToSize: (s: string, max: number) => {
      const woerter = String(s).split(" ");
      const zeilen: string[] = [];
      let aktuell = "";
      for (const w of woerter) {
        const test = aktuell ? `${aktuell} ${w}` : w;
        if (test.length * breiteProZeichen > max && aktuell) { zeilen.push(aktuell); aktuell = w; }
        else aktuell = test;
      }
      if (aktuell) zeilen.push(aktuell);
      return zeilen.length ? zeilen : [""];
    },
  };
  return { doc, gezeichnet };
}

describe("brandedRow bricht lange Werte um", () => {
  // In der Selbstauskunft mit zwei Personen: labelOffset 32, Linienbreite 72.
  // Fuer den Wert bleiben damit 40 mm bis zur Spalte der zweiten Person.
  const OFFSET = 32;
  const BREITE = 72;
  const PLATZ = BREITE - OFFSET;

  const zeichne = (wert: string) => {
    const { doc, gezeichnet } = attrappe();
    const unten = brandedRow(doc, "E-Mail", wert, 20, 100, OFFSET, BREITE);
    // Der erste Eintrag ist die Beschriftung, danach kommen die Wertzeilen.
    const wertZeilen = gezeichnet.filter((g) => g.x === 20 + OFFSET);
    return { unten, wertZeilen, doc };
  };

  it("laesst einen kurzen Wert in einer Zeile", () => {
    const { unten, wertZeilen } = zeichne("Herr");
    expect(wertZeilen).toHaveLength(1);
    expect(unten).toBe(107);
  });

  it("bricht eine lange Mailadresse um, statt sie ueberlaufen zu lassen", () => {
    // Genau der gemeldete Fall bei Kai Laube.
    const { wertZeilen } = zeichne("kai.laube-richtsteiger@email.de");
    expect(wertZeilen.length).toBeGreaterThan(1);
  });

  it("bricht PLZ und Ort um", () => {
    const { wertZeilen } = zeichne("93155 Hohenschambach / Hemau");
    expect(wertZeilen.length).toBeGreaterThan(1);
  });

  it("keine Zeile ist breiter als der Platz bis zur Nachbarspalte", () => {
    for (const wert of [
      "kai.laube-richtsteiger@email.de",
      "93155 Hohenschambach / Hemau",
      "Steuerkanzlei Schriml Lohn und Gehaltsabrechnung GmbH",
    ]) {
      const { wertZeilen, doc } = zeichne(wert);
      for (const z of wertZeilen) {
        expect(doc.getTextWidth(z.text), `"${z.text}" bei Wert "${wert}"`).toBeLessThanOrEqual(PLATZ);
      }
    }
  });

  it("teilt auch ein einzelnes zu langes Wort ohne Trennstelle", () => {
    // splitTextToSize bricht nur an Leerzeichen. Ohne die harte Teilung
    // liefe so ein Wert weiter ueber den Rand.
    const { wertZeilen, doc } = zeichne("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(wertZeilen.length).toBeGreaterThan(1);
    for (const z of wertZeilen) expect(doc.getTextWidth(z.text)).toBeLessThanOrEqual(PLATZ);
  });

  it("schiebt die naechste Zeile nach unten, wenn umgebrochen wurde", () => {
    const kurz = zeichne("Herr").unten;
    const lang = zeichne("93155 Hohenschambach / Hemau").unten;
    expect(lang).toBeGreaterThan(kurz);
  });

  it("setzt die Trennlinie unter die letzte Zeile, nicht unter die erste", () => {
    const { doc } = zeichne("93155 Hohenschambach / Hemau");
    const linie = doc.linien[doc.linien.length - 1].y;
    expect(linie).toBeGreaterThan(103.5);
  });
});
