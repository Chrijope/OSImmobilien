import { jsPDF } from "jspdf";
import { calculateFinanzierbarkeitFromSaData, RAHMEN_PUFFER, RAHMEN_ANNUITAET } from "./finanzierbarkeitUtils";
import {
  BRAND,
  PDF_FONT,
  addBrandedFooter,
  addBrandedHeader,
  brandedRow,
  brandedSectionTitle,
  ensureUnicodeFont,
  loadLogo,
  sanitizePdfText,
} from "./pdfBranding";

/*
 * Finanzierungsrahmen aus einer ausgefüllten Selbstauskunft, für den
 * Vertriebspartner (Christian, 30.10.2026): nach der Selbstauskunft direkt in
 * die Objektwahl, mit Kaufpreis von, Empfehlung und bis.
 *
 * Gerechnet wird ausschließlich mit `calculateFinanzierbarkeitFromSaData`, also
 * genau so wie im Kundenprofil des CRM. Die Kaufpreise sind die drei Werte des
 * Rahmens (Darlehen zu 80, 100 und 120 Prozent plus Eigenkapital); die
 * Kaufnebenkosten werden bewusst nicht abgezogen, sie kommen aus Eigenkapital
 * oder einem Nachrangdarlehen.
 */
export interface Finanzierungsrahmen {
  kaufpreisVon: number;
  kaufpreisEmpfehlung: number;
  kaufpreisBis: number;
  einnahmen: number;
  ausgaben: number;
  ueberschuss: number;
  tragbareRate: number;
  maxDarlehen: number;
  eigenkapital: number;
  zweiPersonen: boolean;
  immobilienHinweis: string | null;
  /** Kein Überschuss, also kein Darlehen: dann gibt es keinen Rahmen zum Anzeigen. */
  ohneRahmen: boolean;
}

export function finanzierungsrahmenAusSelbstauskunft(data: unknown): Finanzierungsrahmen | null {
  const r = calculateFinanzierbarkeitFromSaData(data);
  if (!r) return null;
  return {
    kaufpreisVon: r.minRahmen,
    kaufpreisEmpfehlung: r.empfRahmen,
    kaufpreisBis: r.maxRahmen,
    einnahmen: r.sumEink,
    ausgaben: r.sumAusg,
    ueberschuss: r.ueberschuss,
    tragbareRate: Math.max(0, Math.round(r.ueberschuss * RAHMEN_PUFFER)),
    maxDarlehen: r.maxDarlehen,
    eigenkapital: r.eigenkapital,
    zweiPersonen: r.hasPerson2,
    immobilienHinweis: r.immobilienHinweis,
    ohneRahmen: r.maxDarlehen <= 0,
  };
}

export const euro = (n: number) =>
  `${Math.round(n).toLocaleString("de-DE")} €`;

export const RAHMEN_ERKLAERUNG = [
  `Einnahmen nach Bankansatz: Mieteinnahmen zu 80 %, alles andere wie eingetragen.`,
  `Ausgaben nach Bankansatz: Lebenshaltung mindestens 30 % vom Netto, mindestens 1.000 € je Person.`,
  `Tragbare Rate: ${Math.round(RAHMEN_PUFFER * 100)} % des monatlichen Überschusses.`,
  `Darlehen: Rate × 12 ÷ ${String(RAHMEN_ANNUITAET * 100).replace(".", ",")} % (Zins und Tilgung).`,
  `Kaufpreis von, Empfehlung und bis: Darlehen zu 80 %, 100 % und 120 % plus Eigenkapital. Kaufnebenkosten sind nicht abgezogen.`,
];

/** Eine Seite A4 im CI der Dokumente (pdfBranding). */
export async function erstelleFinanzierungsrahmenPdf(
  rahmen: Finanzierungsrahmen,
  kundeName: string,
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const M = 20;
  const B = 170;
  const datum = new Date().toLocaleDateString("de-DE");

  let y = addBrandedHeader(doc, logo, "Finanzierungsrahmen");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(18);
  doc.setTextColor(...BRAND.primary);
  doc.text(sanitizePdfText(`Finanzierungsrahmen${kundeName ? ` ${kundeName}` : ""}`), M, y);
  y += 7;
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  doc.text(sanitizePdfText(`Grundlage: Selbstauskunft vom ${datum}${rahmen.zweiPersonen ? ", beide Personen zusammen" : ""}`), M, y);
  y += 12;

  if (rahmen.ohneRahmen) {
    doc.setFillColor(...BRAND.light);
    doc.rect(M, y, B, 22, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    doc.text("Derzeit kein Finanzierungsrahmen", M + 5, y + 9);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.text);
    doc.text(sanitizePdfText(`Die Ausgaben sind höher als die Einnahmen (Überschuss ${euro(rahmen.ueberschuss)}).`), M + 5, y + 16);
    y += 32;
  } else {
    // Drei Kacheln: von, Empfehlung (hervorgehoben), bis.
    const kachelB = (B - 8) / 3;
    const kacheln: [string, number, boolean][] = [
      ["Kaufpreis von", rahmen.kaufpreisVon, false],
      ["Empfehlung", rahmen.kaufpreisEmpfehlung, true],
      ["Kaufpreis bis", rahmen.kaufpreisBis, false],
    ];
    kacheln.forEach(([titel, wert, hervor], i) => {
      const x = M + i * (kachelB + 4);
      if (hervor) {
        doc.setFillColor(...BRAND.accent);
        doc.rect(x, y, kachelB, 26, "F");
      } else {
        doc.setFillColor(...BRAND.light);
        doc.rect(x, y, kachelB, 26, "F");
      }
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...(hervor ? BRAND.white : BRAND.muted));
      doc.text(titel.toUpperCase(), x + 5, y + 8, { charSpace: 0.4 });
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(16);
      doc.setTextColor(...(hervor ? BRAND.white : BRAND.primary));
      doc.text(euro(wert), x + 5, y + 19);
    });
    y += 34;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.text);
    const satz = doc.splitTextToSize(
      sanitizePdfText(`Für die Objektwahl: Wohnungen mit einem Kaufpreis bis rund ${euro(rahmen.kaufpreisEmpfehlung)} passen zur Empfehlung, bis ${euro(rahmen.kaufpreisBis)} ist die Obergrenze. Die Kaufnebenkosten kommen aus Eigenkapital oder einem Nachrangdarlehen und sind hier nicht abgezogen.`),
      B,
    );
    doc.text(satz, M, y);
    y += satz.length * 4.6 + 8;
  }

  y = brandedSectionTitle(doc, "Rechenweg", y, M, B);
  const zeilen: [string, string, boolean?][] = [
    ["Einnahmen im Monat (Bankansatz)", euro(rahmen.einnahmen)],
    ["Ausgaben im Monat (Bankansatz)", euro(rahmen.ausgaben)],
    ["Überschuss im Monat", euro(rahmen.ueberschuss), true],
    [`Tragbare Rate (${Math.round(RAHMEN_PUFFER * 100)} % des Überschusses)`, euro(rahmen.tragbareRate)],
    ["Darlehen (Rate × 12 ÷ 6 %)", euro(Math.max(0, rahmen.maxDarlehen))],
    ["Eigenkapital laut Selbstauskunft", euro(rahmen.eigenkapital)],
    ["Empfohlener Rahmen (Darlehen + Eigenkapital)", euro(rahmen.ohneRahmen ? 0 : rahmen.kaufpreisEmpfehlung), true],
  ];
  for (const [label, wert, fett] of zeilen) {
    y = brandedRow(doc, label, wert, M, y, 110, B, true, !!fett);
  }
  y += 6;

  y = brandedSectionTitle(doc, "So wird gerechnet", y, M, B);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.text);
  for (const t of RAHMEN_ERKLAERUNG) {
    const z = doc.splitTextToSize(sanitizePdfText(`• ${t}`), B);
    doc.text(z, M, y);
    y += z.length * 4 + 1.5;
  }
  if (rahmen.immobilienHinweis) {
    y += 3;
    const z = doc.splitTextToSize(sanitizePdfText(rahmen.immobilienHinweis), B);
    doc.setTextColor(...BRAND.muted);
    doc.text(z, M, y);
    y += z.length * 4;
  }

  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  const fuss = doc.splitTextToSize(
    "Unverbindliche Orientierung auf Grundlage der Angaben in der Selbstauskunft. Keine Finanzierungszusage und keine Finanzierungsberatung; die Entscheidung trifft die Bank nach Prüfung der Unterlagen.",
    B,
  );
  doc.text(fuss, M, 297 - 30);
  addBrandedFooter(doc, 1, 1);
  return doc;
}
