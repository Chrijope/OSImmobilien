import { PDF_FONT, applyPdfFontSync } from "./pdfBranding";
import jsPDF from "jspdf";
import type { Mieter, MieterZahlung } from "@/lib/mieterStore";

export type Mahnstufe = 1 | 2 | 3;

export interface MahnungData {
  mieter: Mieter;
  zahlung: MieterZahlung;
  stufe: Mahnstufe;
  fristTage: number;
  absenderFirma: string;
  absenderAdresse: string;
}

const MAHNSTUFEN_CONFIG: Record<Mahnstufe, { titel: string; betreff: string; textIntro: string; textSchluss: string }> = {
  1: {
    titel: "Zahlungserinnerung",
    betreff: "Zahlungserinnerung, ausstehende Mietzahlung",
    textIntro: "bei der Überprüfung unserer Konten haben wir festgestellt, dass die nachstehend aufgeführte Zahlung bisher nicht bei uns eingegangen ist. Wir gehen davon aus, dass es sich um ein Versehen handelt.",
    textSchluss: "Bitte überweisen Sie den ausstehenden Betrag innerhalb der genannten Frist auf unser Konto. Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie dieses bitte als gegenstandslos.",
  },
  2: {
    titel: "Mahnung",
    betreff: "Mahnung, ausstehende Mietzahlung",
    textIntro: "trotz unserer Zahlungserinnerung konnten wir leider keinen Zahlungseingang für die unten aufgeführte Forderung feststellen. Wir bitten Sie dringend, den Rückstand umgehend auszugleichen.",
    textSchluss: "Sollte der Ausgleich nicht fristgerecht erfolgen, behalten wir uns weitere rechtliche Schritte vor. Bei Zahlungsschwierigkeiten setzen Sie sich bitte umgehend mit uns in Verbindung.",
  },
  3: {
    titel: "Letzte Mahnung",
    betreff: "Letzte Mahnung, ausstehende Mietzahlung",
    textIntro: "leider mussten wir feststellen, dass unsere bisherigen Zahlungsaufforderungen ohne Ergebnis geblieben sind. Wir fordern Sie hiermit letztmalig auf, den ausstehenden Betrag zu begleichen.",
    textSchluss: "Sollte der Betrag nicht innerhalb der gesetzten Frist auf unserem Konto eingehen, sehen wir uns gezwungen, ohne weitere Vorwarnung rechtliche Schritte einzuleiten und die Angelegenheit an unseren Rechtsanwalt zu übergeben. Sämtliche dadurch entstehenden Kosten gehen zu Ihren Lasten.",
  },
};

export function getMahnstufenConfig() {
  return MAHNSTUFEN_CONFIG;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function formatCurrency(v: number): string {
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function generateMahnungPDF(data: MahnungData): jsPDF {
  const { mieter, zahlung, stufe, fristTage, absenderFirma, absenderAdresse } = data;
  const config = MAHNSTUFEN_CONFIG[stufe];
  const doc = new jsPDF("p", "mm", "a4");
  applyPdfFontSync(doc);
  const soll = zahlung.kaltmiete + zahlung.nebenkosten;
  const ausstehend = soll - zahlung.betragGezahlt;
  const heute = new Date();
  const fristDatum = new Date(heute);
  fristDatum.setDate(fristDatum.getDate() + fristTage);

  const [monatJahr, monatNr] = zahlung.monat.split("-");
  const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const monatName = `${monate[parseInt(monatNr) - 1]} ${monatJahr}`;

  let y = 25;

  // Absender
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(`${absenderFirma} · ${absenderAdresse}`, 20, y);
  y += 12;

  // Empfänger
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(`${mieter.vorname} ${mieter.nachname}`, 20, y);
  y += 5;
  if (mieter.strasse) { doc.text(mieter.strasse, 20, y); y += 5; }
  if (mieter.plz || mieter.ort) { doc.text(`${mieter.plz || ""} ${mieter.ort || ""}`, 20, y); y += 5; }
  y += 5;

  // Datum
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(formatDate(heute), 190, y, { align: "right" });
  y += 10;

  // Betreff
  doc.setFontSize(13);
  doc.setTextColor(0);
  doc.setFont(PDF_FONT, "bold");
  doc.text(config.betreff, 20, y);
  y += 10;

  // Anrede + Intro
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "normal");
  const anrede = `Sehr geehrte/r ${mieter.vorname} ${mieter.nachname},`;
  doc.text(anrede, 20, y);
  y += 7;

  const introLines = doc.splitTextToSize(config.textIntro, 170);
  doc.text(introLines, 20, y);
  y += introLines.length * 5 + 8;

  // Forderungsdetails Box
  doc.setFillColor(245, 245, 245);
  doc.rect(20, y, 170, 38, "F");
  doc.setDrawColor(200);
  doc.rect(20, y, 170, 38, "S");
  y += 7;

  doc.setFont(PDF_FONT, "bold");
  doc.text("Forderungsdetails", 25, y);
  y += 7;

  doc.setFont(PDF_FONT, "normal");
  doc.text(`Mietobjekt:`, 25, y);
  doc.text(`${mieter.objektName || ""}, ${mieter.wohneinheitName || ""}`, 80, y);
  y += 5;
  doc.text(`Mietzeitraum:`, 25, y);
  doc.text(monatName, 80, y);
  y += 5;
  doc.text(`Gesamtmiete (Soll):`, 25, y);
  doc.text(formatCurrency(soll), 80, y);
  y += 5;
  doc.text(`Bereits gezahlt:`, 25, y);
  doc.text(formatCurrency(zahlung.betragGezahlt), 80, y);
  y += 5;

  doc.setFont(PDF_FONT, "bold");
  doc.text(`Ausstehender Betrag:`, 25, y);
  doc.setTextColor(180, 0, 0);
  doc.text(formatCurrency(ausstehend), 80, y);
  doc.setTextColor(0);
  y += 12;

  // Frist
  doc.setFont(PDF_FONT, "bold");
  doc.text(`Zahlungsfrist: ${formatDate(fristDatum)}`, 20, y);
  y += 8;

  doc.setFont(PDF_FONT, "normal");

  // Schlusstext
  const schlussLines = doc.splitTextToSize(config.textSchluss, 170);
  doc.text(schlussLines, 20, y);
  y += schlussLines.length * 5 + 10;

  // Gruss
  doc.text("Mit freundlichen Grüßen", 20, y);
  y += 7;
  doc.setFont(PDF_FONT, "bold");
  doc.text(absenderFirma, 20, y);

  // Mahnstufe Badge
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.setFont(PDF_FONT, "italic");
  doc.text(`${config.titel} (Stufe ${stufe} von 3)`, 20, 285);

  return doc;
}

export function getMahnungEmailHtml(data: MahnungData): string {
  const { mieter, zahlung, stufe, fristTage, absenderFirma } = data;
  const config = MAHNSTUFEN_CONFIG[stufe];
  const soll = zahlung.kaltmiete + zahlung.nebenkosten;
  const ausstehend = soll - zahlung.betragGezahlt;
  const heute = new Date();
  const fristDatum = new Date(heute);
  fristDatum.setDate(fristDatum.getDate() + fristTage);

  const [monatJahr, monatNr] = zahlung.monat.split("-");
  const monate = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const monatName = `${monate[parseInt(monatNr) - 1]} ${monatJahr}`;

  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${config.betreff}</title></head>
<body style="font-family:Arial,sans-serif;color:#222;line-height:1.6;max-width:600px;margin:0 auto;padding:20px;background:#fff;">
  <p style="color:#888;font-size:12px;">${absenderFirma}</p>
  <h2 style="color:#222;margin-top:20px;">${config.betreff}</h2>
  <p>Sehr geehrte/r ${mieter.vorname} ${mieter.nachname},</p>
  <p>${config.textIntro}</p>
  <table style="width:100%;border-collapse:collapse;background:#f8f8f8;border:1px solid #ddd;border-radius:4px;margin:16px 0;">
    <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Mietobjekt</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${mieter.objektName || ""}, ${mieter.wohneinheitName || ""}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Mietzeitraum</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${monatName}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Gesamtmiete (Soll)</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${formatCurrency(soll)}</td></tr>
    <tr><td style="padding:8px 12px;border-bottom:1px solid #eee;">Bereits gezahlt</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${formatCurrency(zahlung.betragGezahlt)}</td></tr>
    <tr><td style="padding:8px 12px;font-weight:bold;color:#b00;">Ausstehend</td><td style="padding:8px 12px;font-weight:bold;color:#b00;">${formatCurrency(ausstehend)}</td></tr>
  </table>
  <p><strong>Zahlungsfrist: ${formatDate(fristDatum)}</strong></p>
  <p>${config.textSchluss}</p>
  <p>Mit freundlichen Grüßen<br><strong>${absenderFirma}</strong></p>
  <hr style="border:none;border-top:1px solid #eee;margin-top:30px;">
  <p style="font-size:11px;color:#999;">${config.titel} (Stufe ${stufe} von 3), automatisch erstellt</p>
</body></html>`;
}
