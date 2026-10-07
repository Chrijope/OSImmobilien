import jsPDF from "jspdf";
import QRCode from "qrcode";
import {
  addBrandedFooter,
  loadLogo,
  BRAND,
  ensureUnicodeFont,
  sanitizePdfText,
  PDF_FONT,
} from "./pdfBranding";
import type { PitchContext } from "./tippgeberPitches";

// Persönlicher Mini-Flyer (A4, eine Seite) für den Tippgeber:
// - Foto / Branding
// - Headline + Storytelling
// - QR-Code zum persönlichen Empfehlungs-Link
// - Tippgeber-Name & VP-Name
//
// Druckbar oder per Mail / WhatsApp als PDF teilen.

const W = 210;
const H = 297;
const MARGIN = 18;
const CONTENT_W = W - 2 * MARGIN;

function setColor(doc: jsPDF, c: [number, number, number]) {
  doc.setTextColor(c[0], c[1], c[2]);
}
function setFill(doc: jsPDF, c: [number, number, number]) {
  doc.setFillColor(c[0], c[1], c[2]);
}
function setDraw(doc: jsPDF, c: [number, number, number]) {
  doc.setDrawColor(c[0], c[1], c[2]);
}

export async function generateTippgeberFlyerPdf(ctx: PitchContext): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();

  // ── Top brand bar
  setFill(doc, BRAND.accent);
  doc.rect(0, 0, W, 8, "F");

  // ── Logo
  let y = 24;
  if (logo) {
    try {
      const lw = 60, lh = 16;
      doc.addImage(logo, "PNG", W / 2 - lw / 2, y, lw, lh);
      y += lh + 12;
    } catch { y += 16; }
  }

  // ── Kicker
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.accentDark);
  doc.text("PERSÖNLICHE EMPFEHLUNG", W / 2, y, { align: "center", charSpace: 1.6 });
  y += 14;

  // ── Headline
  doc.setFontSize(30);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.primary);
  doc.text("Immobilien als", W / 2, y, { align: "center" });
  y += 11;
  doc.text("Kapitalanlage –", W / 2, y, { align: "center" });
  y += 11;
  doc.text("verständlich erklärt.", W / 2, y, { align: "center" });
  y += 8;

  // Accent underline
  setDraw(doc, BRAND.accent);
  doc.setLineWidth(1.4);
  doc.line(W / 2 - 28, y, W / 2 + 28, y);
  y += 14;

  // ── Subline
  doc.setFontSize(12);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, [70, 80, 95]);
  const sub = sanitizePdfText(
    `Empfohlen von ${ctx.tippgeberVorname} – Beratung durch ${ctx.vpFullName}.`
  );
  const subLines = doc.splitTextToSize(sub, CONTENT_W - 20);
  doc.text(subLines, W / 2, y, { align: "center" });
  y += subLines.length * 6 + 10;

  // ── Drei Argumente
  const benefits = [
    { icon: "✓", titel: "Steuervorteile", text: "Lohnsteuer reduzieren durch AfA & Werbungskosten" },
    { icon: "✓", titel: "Vermögensaufbau", text: "Mieter und Finanzamt tilgen den Großteil mit" },
    { icon: "✓", titel: "Inflationsschutz", text: "Sachwert statt Sparbuch – langfristig stabil" },
  ];
  const cardH = 26;
  const gap = 4;
  const cardW = (CONTENT_W - 2 * gap) / 3;
  benefits.forEach((b, i) => {
    const x = MARGIN + i * (cardW + gap);
    setFill(doc, [247, 250, 253]);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, "F");
    setDraw(doc, [220, 232, 244]);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, cardW, cardH, 2.5, 2.5, "S");
    doc.setFontSize(13);
    doc.setFont(PDF_FONT, "bold");
    setColor(doc, BRAND.accent);
    doc.text(b.icon, x + 6, y + 9);
    doc.setFontSize(10);
    setColor(doc, BRAND.primary);
    doc.text(b.titel, x + 12, y + 9);
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    setColor(doc, [80, 95, 115]);
    const bt = doc.splitTextToSize(b.text, cardW - 12);
    doc.text(bt, x + 6, y + 16);
  });
  y += cardH + 14;

  // ── QR-Code Box (groß, zentral)
  const qrSize = 60;
  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(ctx.landingpageUrl, {
      width: 600,
      margin: 1,
      color: { dark: "#0F172A", light: "#FFFFFF" },
    });
  } catch (e) {
    console.warn("QR-Code generation failed", e);
  }

  const boxH = qrSize + 30;
  setFill(doc, [243, 248, 252]);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 3, 3, "F");
  setDraw(doc, [217, 232, 243]);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN, y, CONTENT_W, boxH, 3, 3, "S");
  setFill(doc, BRAND.accent);
  doc.rect(MARGIN, y, 3, boxH, "F");

  // Left text
  const textX = MARGIN + 12;
  const textW = CONTENT_W - qrSize - 24;
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, [90, 120, 149]);
  doc.text("SCANNE & STARTE", textX, y + 12, { charSpace: 0.8 });
  doc.setFontSize(16);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.primary);
  const h2 = doc.splitTextToSize("Kostenloses 20-Min-Erstgespräch", textW);
  doc.text(h2, textX, y + 22);
  doc.setFontSize(9.5);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, [70, 85, 100]);
  const desc = doc.splitTextToSize(
    "Unverbindlich, locker, ohne Verkaufsdruck. Du siehst, ob das Thema zu dir und deiner Situation passt.",
    textW
  );
  doc.text(desc, textX, y + 32);

  // QR right
  if (qrDataUrl) {
    try {
      const qx = W - MARGIN - qrSize - 8;
      const qy = y + (boxH - qrSize) / 2;
      // White card behind QR
      setFill(doc, [255, 255, 255]);
      doc.roundedRect(qx - 3, qy - 3, qrSize + 6, qrSize + 6, 2, 2, "F");
      doc.addImage(qrDataUrl, "PNG", qx, qy, qrSize, qrSize);
    } catch (e) {
      console.warn("QR add failed", e);
    }
  }
  y += boxH + 10;

  // ── Link text (für nicht-Scanner)
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, BRAND.muted);
  doc.text("Oder im Browser öffnen:", MARGIN, y);
  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, [15, 90, 138]);
  const linkLines = doc.splitTextToSize(ctx.landingpageUrl, CONTENT_W);
  doc.text(linkLines, MARGIN, y + 6);

  // ── Footer
  addBrandedFooter(doc, 1, 1);
  return doc;
}
