import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Rauchtest der PDF-Erzeugung: jsPDF wird durch eine Attrappe ersetzt, die
 * alle Zeichenaufrufe schluckt. Geprueft wird, dass die Erzeugung nicht wirft
 * und der Download mit dem vorgegebenen Dateinamen ausgeloest wird.
 */
const { gespeichert } = vi.hoisted(() => ({ gespeichert: [] as string[] }));

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
    text() {}
    addImage() {}
    addPage() { this.seiten += 1; }
    setPage() {}
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 1.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    save(name: string) { gespeichert.push(name); }
    output(typ: string) {
      if (typ === "blob") return new Blob(["pdf-attrappe"], { type: "application/pdf" });
      throw new Error(`output(${typ}) nicht nachgebildet`);
    }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

import { erzeugeAnlageVPdf, erzeugeAnlageVPdfBase64 } from "@/lib/anlageVPdf";
import { baueAnlageVAufstellung, type AnlageVInvestment } from "@/lib/anlageVExport";

const inv = (over: Partial<AnlageVInvestment> = {}): AnlageVInvestment => ({
  id: "t1",
  bezeichnung: "Testwohnung",
  kaufpreis: 300000,
  kaufdatum: "2024-05-15",
  baujahr: 1990,
  nebenkosten: 30000,
  darlehenssumme: 250000,
  offene_tilgung: 240000,
  zinssatz: 4,
  monatliche_rate: 1200,
  mieteinnahmen_kalt: 1000,
  hausgeld: 300,
  ruecklagen: 50,
  dokumente: [
    { typ: "Reparatur/Erhaltung", titel: "Handwerker", betrag: 500, datum: "2026-03-12T12:00:00.000Z" },
  ],
  meta: { erste_miete: "2024-06-01" },
  gebaeude_anteil_prozent: 80,
  umlagen_monat: 200,
  grundsteuer_jahr: 400,
  versicherung_jahr: 300,
  verwaltungskosten_jahr: 350,
  hausgeld_nicht_umlage_monat: 90,
  ...over,
});

beforeEach(() => { gespeichert.length = 0; });

describe("erzeugeAnlageVPdf", () => {
  it("erzeugt das PDF einer vollstaendigen Aufstellung und speichert es unter dem vorgegebenen Namen", async () => {
    const aufstellung = baueAnlageVAufstellung(inv(), { jahr: 2026, herkunft: "eigen" });
    await expect(erzeugeAnlageVPdf(aufstellung)).resolves.toBeUndefined();
    expect(gespeichert).toEqual(["anlage-v-vorbereitung_testwohnung_2026.pdf"]);
  });

  it("wirft auch bei einer unvollstaendigen Aufstellung nicht (Warnkasten-Pfad)", async () => {
    const aufstellung = baueAnlageVAufstellung(
      inv({
        nebenkosten: 0,
        zinssatz: 0,
        gebaeude_anteil_prozent: null,
        umlagen_monat: null,
        grundsteuer_jahr: null,
        versicherung_jahr: null,
        verwaltungskosten_jahr: null,
        hausgeld_nicht_umlage_monat: null,
        dokumente: [],
      }),
      { jahr: 2026, herkunft: "moreimmo" },
    );
    expect(aufstellung.unvollstaendig).toBe(true);
    await expect(erzeugeAnlageVPdf(aufstellung)).resolves.toBeUndefined();
    expect(gespeichert).toHaveLength(1);
  });
});

describe("erzeugeAnlageVPdfBase64", () => {
  it("liefert das PDF als reines Base64 samt Dateiname, ohne Download", async () => {
    const aufstellung = baueAnlageVAufstellung(inv(), { jahr: 2026, herkunft: "eigen" });
    const ergebnis = await erzeugeAnlageVPdfBase64(aufstellung);
    expect(ergebnis.dateiname).toBe("anlage-v-vorbereitung_testwohnung_2026.pdf");
    // Base64 des Attrappen-Inhalts "pdf-attrappe", ohne data:-Praefix.
    expect(ergebnis.base64).toBe(btoa("pdf-attrappe"));
    expect(ergebnis.base64).not.toContain(",");
    // Kein Download: save() der Attrappe wurde nicht aufgerufen.
    expect(gespeichert).toHaveLength(0);
  });
});
