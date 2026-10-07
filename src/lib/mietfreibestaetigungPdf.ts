import jsPDF from "jspdf";
import { addBrandedHeader, addBrandedFooter, brandedSectionTitle, BRAND, loadLogo, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";

/**
 * Generiert eine leere Mietfreibestätigung als Download-PDF.
 * Stil: angelehnt an selbstauskunft.de, mit MOREImmo Branding.
 */
export async function generateMietfreibestaetigungPDF(): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const W = 210;
  const margin = 20;
  const contentW = W - 2 * margin;

  const logo = await loadLogo();
  let y = addBrandedHeader(
    doc,
    logo,
    "Mietfreibestätigung",
    "Bestätigung der mietfreien Wohnsituation für die Bank",
  );

  // Einleitungstext
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.primary);
  const intro =
    "Hiermit bestätige ich als Vermieter / Eigentümer, dass die unten genannte Person bei mir mietfrei wohnt. Diese Bestätigung dient ausschließlich der Vorlage bei einem Kreditinstitut zur Bonitätsprüfung im Rahmen einer Immobilienfinanzierung.";
  const introLines = doc.splitTextToSize(intro, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * 4 + 6;

  // ─── Vermieter ───
  y = brandedSectionTitle(doc, "Angaben zum Vermieter / Eigentümer", y, margin, contentW);
  y = drawField(doc, "Vor- und Nachname", margin, y, contentW);
  y = drawField(doc, "Straße, Hausnummer", margin, y, contentW);
  y = drawTwoFields(doc, "PLZ", "Ort", margin, y, contentW);
  y = drawField(doc, "Telefon", margin, y, contentW);
  y = drawField(doc, "E-Mail", margin, y, contentW);
  y += 4;

  // ─── Mieter / Bewohner ───
  y = brandedSectionTitle(doc, "Angaben zum mietfrei wohnenden Bewohner", y, margin, contentW);
  y = drawField(doc, "Vor- und Nachname", margin, y, contentW);
  y = drawField(doc, "Geburtsdatum", margin, y, contentW);
  y += 4;

  // ─── Wohnobjekt ───
  y = brandedSectionTitle(doc, "Anschrift des Wohnobjekts", y, margin, contentW);
  y = drawField(doc, "Straße, Hausnummer", margin, y, contentW);
  y = drawTwoFields(doc, "PLZ", "Ort", margin, y, contentW);
  y = drawField(doc, "Mietverhältnis besteht seit", margin, y, contentW);
  y += 4;

  // ─── Bestätigung ───
  y = brandedSectionTitle(doc, "Bestätigung", y, margin, contentW);
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.primary);
  const bestaetigung =
    "Ich bestätige hiermit ausdrücklich, dass die o. g. Person bei mir mietfrei wohnt und keinerlei Mietzahlungen oder anteilige Wohnkosten an mich entrichtet werden. Diese Erklärung erfolgt wahrheitsgemäß und kann der Bank zur Vorlage übergeben werden.";
  const bLines = doc.splitTextToSize(bestaetigung, contentW);
  doc.text(bLines, margin, y);
  y += bLines.length * 4 + 10;

  // ─── Unterschrift ───
  y = drawTwoFields(doc, "Ort, Datum", "Unterschrift Vermieter", margin, y, contentW, true);

  // Footer
  addBrandedFooter(doc, 1, 1);

  doc.save("Mietfreibestaetigung_MOREImmo_Offices.pdf");
}

function drawField(doc: jsPDF, label: string, x: number, y: number, w: number): number {
  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.muted);
  doc.text(label, x, y);
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.3);
  doc.line(x, y + 5.5, x + w, y + 5.5);
  return y + 11;
}

function drawTwoFields(
  doc: jsPDF,
  l1: string,
  l2: string,
  x: number,
  y: number,
  w: number,
  wide: boolean = false,
): number {
  const colW = wide ? (w - 8) / 2 : (w - 6) / 2;
  drawField(doc, l1, x, y, colW);
  drawField(doc, l2, x + colW + 6, y, colW);
  return y + 11;
}
