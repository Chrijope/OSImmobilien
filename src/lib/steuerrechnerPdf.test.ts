/**
 * Rauchtest der Auswertung als PDF. jsPDF wird durch eine Attrappe ersetzt,
 * die alle Zeichenaufrufe schluckt. Gleiche Bauweise wie ablaufplanPdf.test.ts.
 *
 * Geprueft wird, dass mindestens vier Seiten entstehen, dass ein Blob mit Datumsnamen
 * herauskommt statt eines Downloads, und dass die Zahlen aus dem Rechenkern im
 * Dokument landen, statt hier ein zweites Mal gerechnet zu werden.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { gespeichert, texte, seitenzahl } = vi.hoisted(() => ({
  gespeichert: [] as string[],
  texte: [] as string[],
  seitenzahl: { wert: 1 },
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
    rect() {}
    roundedRect() {}
    ellipse() {}
    circle() {}
    line() {}
    text(s: string) { texte.push(String(s)); }
    addImage() {}
    addPage() { this.seiten += 1; seitenzahl.wert = this.seiten; }
    setPage() {}
    getNumberOfPages() { return this.seiten; }
    getTextWidth(s: string) { return String(s).length * 1.5; }
    splitTextToSize(s: string) { return [String(s)]; }
    save(name: string) { gespeichert.push(name); }
    output() { return new Blob(["%PDF-1.4"], { type: "application/pdf" }); }
  }
  return { default: JsPdfAttrappe, jsPDF: JsPdfAttrappe, GState };
});

import { baueSteuerAuswertungPdf } from "@/lib/steuerrechnerPdf";
import { berechne } from "@/lib/steuerRechner";
import { standardAntworten, zuEingaben } from "@/lib/steuerrechnerStrecke";

const ANTWORTEN = { ...standardAntworten(), jahresbrutto: 85000, startzeitpunkt: "sofort" as const };
const ERGEBNIS = berechne(zuEingaben(ANTWORTEN));

/**
 * Betrag wie im Dokument. Das schmale geschuetzte Leerzeichen, das Intl vor
 * das Eurozeichen setzt, ersetzt `sanitizePdfText` durch ein gewoehnliches.
 * Ohne diese Angleichung vergleicht der Test zwei Zeichenketten, die auf dem
 * Blatt identisch aussehen.
 */
const eur = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  })
    .format(Math.round(n))
    .replace(/\s/g, " ");

beforeEach(() => {
  gespeichert.length = 0;
  texte.length = 0;
  seitenzahl.wert = 1;
});

describe("Die Auswertung als PDF", () => {
  it("gibt einen Blob mit Datumsnamen zurueck und laedt nichts herunter", async () => {
    // Der Download ist durch den Mailversand ersetzt. Wuerde hier noch
    // `save` laufen, bekaeme der Interessent die Datei zweimal.
    const { blob, dateiname } = await baueSteuerAuswertungPdf(
      ERGEBNIS,
      ANTWORTEN,
      { vorname: "Max", nachname: "Mustermann" },
      { name: "Christian Peetz", telefon: "0171 1111111", email: "os@os-immobilien.com", userId: "u-1" },
    );
    expect(dateiname).toMatch(/^OS Immobilien-Steuerauswertung-\d{4}-\d{2}-\d{2}\.pdf$/);
    expect(blob).toBeInstanceOf(Blob);
    expect(gespeichert).toEqual([]);
  });

  /**
   * Seit dem 17.09.2026 bricht jeder Abschnitt selbst um, wenn er nicht mehr
   * auf die Seite passt. Vorher lief er einfach unter den Seitenrand und war
   * im fertigen PDF nicht mehr da, siehe `platz` in `steuerrechnerPdf.ts`.
   * Eine feste Seitenzahl kann es damit nicht mehr geben: Sie haengt an den
   * Antworten. Mindestens sind es die vier Abschnitte.
   */
  it("hat mindestens vier Seiten und bricht bei Bedarf um", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    expect(seitenzahl.wert).toBeGreaterThanOrEqual(4);
  });

  it("traegt die Zahlen aus dem Rechenkern, nicht eigene", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    const alles = texte.join(" | ");
    expect(alles).toContain(eur(ERGEBNIS.vorher.summe));
    expect(alles).toContain(eur(ERGEBNIS.spanne.regulaer.ersparnisJahr));
    expect(alles).toContain(eur(ERGEBNIS.spanne.erhoeht.ersparnisJahr));
  });

  it("schreibt die Ersparnis als Spanne, nicht als eine Zahl", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    const alles = texte.join(" | ");
    const jahr = `${eur(ERGEBNIS.spanne.jahr1.von)} bis ${eur(ERGEBNIS.spanne.jahr1.bis)}`;
    const zehn = `${eur(ERGEBNIS.spanne.zehnJahre.von)} bis ${eur(ERGEBNIS.spanne.zehnJahre.bis)}`;
    expect(alles).toContain(jahr);
    expect(alles).toContain(zehn);
  });

  it("nennt keinen Immobilientyp, sondern die typisierte Annahme", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    const alles = texte.join(" | ");
    expect(alles).toContain("typisiert");
    for (const typ of ["Neubau", "Sanierter Bestand", "WG- & Co-Living-Konzept"]) {
      expect(alles).not.toContain(typ);
    }
  });

  it("sagt dazu, dass das obere Ende ein Gutachten voraussetzt", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    expect(texte.join(" | ")).toContain("Gutachten");
  });

  it("vermerkt das Erstgespraech, in dem die genauen Zahlen kommen", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    expect(texte.join(" | ")).toContain("Erstgespräch");
  });

  it("nennt den Weg zum Partner mit Name, Nummer und Mailadresse", async () => {
    await baueSteuerAuswertungPdf(
      ERGEBNIS,
      ANTWORTEN,
      { vorname: "Max", nachname: "M" },
      { name: "Hermann Vogl", telefon: "0171 2222222", email: "os@os-immobilien.com", userId: "u-2" },
    );
    const alles = texte.join(" | ");
    expect(alles).toContain("Hermann Vogl");
    expect(alles).toContain("0171 2222222");
    expect(alles).toContain("os@os-immobilien.com");
  });

  it("sagt ausdruecklich, dass es eine Modellrechnung und keine Steuerberatung ist", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" });
    const alles = texte.join(" | ");
    expect(alles).toContain("keine Steuerberatung");
  });
});

describe("Die Auswertung auf Englisch (Plan Kundensprache, D20)", () => {
  it("hat einen englischen Dateinamen ohne Umlaute", async () => {
    const { dateiname } = await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" }, undefined, "en");
    expect(dateiname).toMatch(/^OS Immobilien-Tax-Analysis-[\w-]+\.pdf$/);
  });

  it("sagt, dass sie auf deutschem Steuerrecht beruht, und schreibt Beträge englisch", async () => {
    await baueSteuerAuswertungPdf(ERGEBNIS, ANTWORTEN, { vorname: "Max", nachname: "M" }, undefined, "en");
    const alles = texte.join(" | ");
    expect(alles).toContain("based on German tax law");
    expect(alles).toContain("not tax advice");
    expect(alles).not.toContain("keine Steuerberatung");
    expect(alles).toMatch(/€\d{1,3}(,\d{3})+/);
  });
});
