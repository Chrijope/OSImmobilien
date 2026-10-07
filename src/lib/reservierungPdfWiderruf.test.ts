import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";

/**
 * Die neuen Abschnitte der Reservierungsvereinbarung im PDF, seit dem
 * 15.09.2026: Widerrufsbelehrung, Wahl zum Beginn, die neun Punkte,
 * Datenschutzerklärung, Fassungsnummer und Ort der Unterschrift.
 *
 * Das Dokument ist das, was der Kunde unterschreibt und als Kopie bekommt.
 * Fehlt darin die Belehrung, läuft die Widerrufsfrist zwölf Monate; fehlt
 * die Fassung, lässt sich später nicht sagen, welcher Wortlaut galt.
 *
 * jsPDF ist eine Attrappe, die jeden Textaufruf und jedes gefüllte Rechteck
 * mitschreibt, wie in `reservierungPdfVerkaeufer.test.ts`.
 */
const { zeilen, rechtecke } = vi.hoisted(() => ({
  zeilen: [] as string[],
  rechtecke: [] as string[],
}));

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
    rect(_x: number, _y: number, _w: number, _h: number, stil?: string) { rechtecke.push(stil || "S"); }
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
const { TEXT_FASSUNG, WIDERRUF_WAHL_SOFORT, WIDERRUF_WAHL_ABWARTEN, VEREINBARUNG_ZIFFERN } = await import("@/lib/reservierungErklaerung");

const enthaelt = (text: string) => zeilen.some((z) => z.includes(text));

const daten = (over: Partial<ReservierungData>): ReservierungData =>
  ({ vorname: "Erika", nachname: "Muster", objStrasse: "Roonstraße 3", wohneinheit: "6", ...over }) as ReservierungData;

/** Ein winziges PNG, damit die Unterschrift als gesetzt gilt. */
const BILD = "data:image/png;base64,iVBORw0KGgo=";

beforeEach(() => { zeilen.length = 0; rechtecke.length = 0; });

describe("Widerrufsbelehrung und Wahl im PDF", () => {
  it("druckt beide Blöcke der Belehrung, aber kein Muster-Widerrufsformular mehr", async () => {
    await generateReservierungPDF(daten({}));
    expect(zeilen).toContain("Widerrufsrecht");
    expect(zeilen).toContain("Folgen des Widerrufs");
    expect(enthaelt("binnen vierzehn Tagen ohne Angabe von Gründen")).toBe(true);
    // Die Anlage ist am 15.09.2026 entfallen, samt Verweis in der Belehrung.
    expect(enthaelt("Muster-Widerrufsformular")).toBe(false);
    expect(enthaelt("(*) Unzutreffendes streichen.")).toBe(false);
  });

  it("druckt beide Wahlsätze, egal was gewählt wurde", async () => {
    await generateReservierungPDF(daten({ widerrufWahl: "abwarten" }));
    expect(enthaelt(WIDERRUF_WAHL_SOFORT.satz)).toBe(true);
    expect(enthaelt(WIDERRUF_WAHL_ABWARTEN.satz)).toBe(true);
  });

  /*
   * Die Kästchen: Ein gefülltes ist ein Rahmen plus eine Füllung. Deckblatt
   * und Zeilen zeichnen ebenfalls gefüllte Flächen, deshalb zählt die
   * Differenz: Seit dem 15.09.2026 gibt es nur noch die beiden Wahlkästchen,
   * mit Wahl kommt also genau eine Füllung dazu. So lässt sich zählen, ohne
   * Pixel zu prüfen.
   */
  it("füllt genau das gewählte Kästchen", async () => {
    await generateReservierungPDF(daten({ widerrufWahl: "" }));
    const ohneWahl = rechtecke.filter((r) => r === "F").length;
    rechtecke.length = 0;
    await generateReservierungPDF(daten({ widerrufWahl: "sofort" }));
    expect(rechtecke.filter((r) => r === "F").length).toBe(ohneWahl + 1);
  });
});

describe("Die neun Punkte im PDF", () => {
  it("druckt alle neun Nummern und die vier Pflichten", async () => {
    await generateReservierungPDF(daten({}));
    expect(VEREINBARUNG_ZIFFERN).toHaveLength(9);
    for (const z of VEREINBARUNG_ZIFFERN) expect(zeilen).toContain(z.nummer);
    expect(enthaelt("a) das Objekt nicht anderen Interessenten anzubieten")).toBe(true);
    expect(enthaelt("d) die notwendigen Vorbereitungen")).toBe(true);
    // Keine alte Ziffer mehr im Dokument.
    expect(zeilen.some((z) => /^5\.\d+ /.test(z))).toBe(false);
  });
});

describe("Fassung, Datenschutz und Unterschrift im PDF", () => {
  it("schreibt die Fassung in die Fußzeile", async () => {
    await generateReservierungPDF(daten({ textFassung: "2026-09-15" }));
    expect(enthaelt("Fassung 2026-09-15")).toBe(true);
  });

  it("nimmt für alte Datensätze ohne Fassung die heutige", async () => {
    await generateReservierungPDF(daten({}));
    expect(enthaelt(`Fassung ${TEXT_FASSUNG}`)).toBe(true);
  });

  it("druckt die Datenschutzerklärung als Absatz ohne Kästchen", async () => {
    await generateReservierungPDF(daten({}));
    expect(zeilen).toContain("6. Datenschutzerklärung");
    expect(enthaelt("Ich/Wir bin/sind damit einverstanden")).toBe(true);
    expect(enthaelt("finanzierendes Kreditinstitut")).toBe(true);
    expect(enthaelt("portal.more.immo/datenschutz")).toBe(true);
  });

  /*
   * Ältere Datensätze tragen noch die entfallenen Felder. Das PDF darf daran
   * nicht scheitern und druckt sie schlicht nicht mehr.
   */
  it("ignoriert die entfallenen Felder älterer Datensätze", async () => {
    await generateReservierungPDF(daten({
      eigenerNotar: true, notarName: "Notariat Beispiel", notarStrasse: "Beispielweg 1",
      datenschutzKenntnis: true, bankEinwilligung: true,
    }));
    expect(enthaelt("Notariat Beispiel")).toBe(false);
    expect(enthaelt("Vorgeschlagenes Notariat")).toBe(false);
    expect(enthaelt("willige/n zusätzlich ein")).toBe(false);
  });

  it("nennt Ort und Uhrzeit der Unterschrift, wenn sie vorliegen", async () => {
    await generateReservierungPDF(daten({}), {
      rv_kaeufer1: { signatureData: BILD, signedAt: "2026-09-15T12:30:00.000Z", name: "Erika Muster", ort: "Rosenheim" },
    });
    expect(enthaelt("Ort: Rosenheim")).toBe(true);
    expect(enthaelt("Digital bestätigt am 15.09.2026")).toBe(true);
    expect(enthaelt(" Uhr")).toBe(true);
  });

  it("druckt die Bestätigung über Belehrung und Kopie über den Unterschriften", async () => {
    await generateReservierungPDF(daten({}));
    expect(enthaelt("einschließlich der Widerrufsbelehrung vor der Unterzeichnung")).toBe(true);
  });

  it("druckt die IBAN für die Rückzahlung bei den Käuferdaten", async () => {
    await generateReservierungPDF(daten({ iban: "DE02 1203 0000 0000 2020 51" }));
    expect(zeilen).toContain("IBAN für die Rückzahlung");
    expect(enthaelt("DE02 1203 0000 0000 2020 51")).toBe(true);
  });

  it("druckt den Freitext aus Abschnitt 3 und sonst das Wort keine", async () => {
    await generateReservierungPDF(daten({ sonstigeInformationen: "Notartermin bitte erst ab Oktober." }));
    expect(enthaelt("Notartermin bitte erst ab Oktober.")).toBe(true);
    zeilen.length = 0;
    await generateReservierungPDF(daten({}));
    expect(zeilen).toContain("keine");
  });
});

/**
 * Die Reservierung ohne Reservierungsgebühr im PDF, seit dem 22.09.2026.
 *
 * Geprüft wird beides nebeneinander: dass die bisherige Fassung unverändert
 * aussieht und dass in der neuen nichts von der Gebühr übrig bleibt. Das ist
 * das Dokument, das der Kunde unterschreibt.
 */
describe("Das PDF ohne Reservierungsgebühr", () => {
  it("druckt im Regelfall weiterhin acht Abschnitte in alter Nummerierung", async () => {
    await generateReservierungPDF(daten({}));
    for (const ueberschrift of [
      "1. Käuferdaten", "2. Objektdaten", "3. Notar und Abwicklung",
      "4. Reservierungsgebühr und Kontoverbindung", "5. Reservierungsvereinbarung",
      "6. Datenschutzerklärung", "7. Widerrufsbelehrung", "8. Unterschriften",
    ]) {
      expect(zeilen, ueberschrift).toContain(ueberschrift);
    }
  });

  it("lässt Gebührenabschnitt und Widerrufsbelehrung weg und zählt lückenlos weiter", async () => {
    await generateReservierungPDF(daten({ gebuehrEntfaellt: true }));
    for (const ueberschrift of [
      "1. Käuferdaten", "2. Objektdaten", "3. Notar und Abwicklung",
      "4. Reservierungsvereinbarung", "5. Datenschutzerklärung", "6. Unterschriften",
    ]) {
      expect(zeilen, ueberschrift).toContain(ueberschrift);
    }
    expect(enthaelt("Reservierungsgebühr und Kontoverbindung")).toBe(false);
    expect(enthaelt("Widerrufsbelehrung")).toBe(false);
    // Keine Lücke in der Zählung: eine „7." oder „8." darf es nicht geben.
    expect(zeilen.some((z) => /^[78]\. /.test(z))).toBe(false);
  });

  it("lässt die IBAN-Zeile weg, wenn es nichts zurückzuzahlen gibt", async () => {
    await generateReservierungPDF(daten({ gebuehrEntfaellt: true, iban: "DE02 1203 0000 0000 2020 51" }));
    expect(zeilen).not.toContain("IBAN für die Rückzahlung");
    expect(enthaelt("DE02 1203 0000 0000 2020 51")).toBe(false);
  });

  /*
   * Die IBAN ist freiwillig. Bleibt sie leer, muss dort der Gedankenstrich
   * des Dokuments stehen, nie ein technischer Wert wie „undefined".
   */
  it("schreibt bei leerer IBAN nichts Technisches ins Dokument", async () => {
    await generateReservierungPDF(daten({ iban: "", p2Iban: "" }));
    const zeile = zeilen.indexOf("IBAN für die Rückzahlung");
    expect(zeile).toBeGreaterThan(-1);
    // Direkt hinter der Beschriftung steht der Wert. Bei leerem Feld ist das
    // der Gedankenstrich des Dokuments, nie „undefined" oder „null".
    expect(zeilen[zeile + 1]).toBe("–");
  });

  it("druckt ohne Gebühr weder Belehrung noch Wahlsätze noch Kästchen", async () => {
    const vorherFuellungen = await (async () => {
      await generateReservierungPDF(daten({ widerrufWahl: "sofort" }));
      return rechtecke.filter((r) => r === "F").length;
    })();
    zeilen.length = 0; rechtecke.length = 0;
    await generateReservierungPDF(daten({ gebuehrEntfaellt: true }));
    expect(enthaelt("binnen vierzehn Tagen ohne Angabe von Gründen")).toBe(false);
    expect(zeilen).not.toContain("Widerrufsrecht");
    expect(zeilen).not.toContain("Folgen des Widerrufs");
    expect(enthaelt(WIDERRUF_WAHL_SOFORT.satz)).toBe(false);
    expect(enthaelt(WIDERRUF_WAHL_ABWARTEN.satz)).toBe(false);
    expect(enthaelt("auflösende Bedingung")).toBe(false);
    // Die beiden Wahlkästchen sind die einzigen im Dokument, also fällt
    // mindestens eine gefüllte Fläche weg.
    expect(rechtecke.filter((r) => r === "F").length).toBeLessThan(vorherFuellungen);
  });

  it("bestätigt über den Unterschriften keine Belehrung, die nicht beiliegt", async () => {
    await generateReservierungPDF(daten({ gebuehrEntfaellt: true }));
    expect(enthaelt("einschließlich der Widerrufsbelehrung")).toBe(false);
    expect(enthaelt("vor der Unterzeichnung vollständig gelesen")).toBe(true);
    expect(enthaelt("dauerhaften Datenträger")).toBe(true);
  });

  it("sagt im Vertragstext ausdrücklich, dass keine Gebühr erhoben wird", async () => {
    await generateReservierungPDF(daten({ gebuehrEntfaellt: true }));
    expect(enthaelt("Für diese Reservierung wird keine Reservierungsgebühr erhoben.")).toBe(true);
    // Und sonst nichts mehr zur Gebühr: kein Betrag, keine Staffel, kein Konto.
    expect(enthaelt("1.500,00 EUR")).toBe(false);
    expect(enthaelt("Verwendungszweck")).toBe(false);
    expect(enthaelt("Kontoinhaber")).toBe(false);
  });

  /*
   * Bestehende Reservierungen kennen das Feld nicht. Sie müssen aussehen wie
   * bisher, sonst bekäme ein Kunde beim erneuten Herunterladen ein anderes
   * Dokument als das unterschriebene.
   */
  it("druckt einen Datensatz ohne das neue Feld unverändert wie bisher", async () => {
    await generateReservierungPDF(daten({}));
    const mitFeld = [...zeilen];
    zeilen.length = 0;
    await generateReservierungPDF(daten({ gebuehrEntfaellt: false }));
    expect(zeilen).toEqual(mitFeld);
  });
});
