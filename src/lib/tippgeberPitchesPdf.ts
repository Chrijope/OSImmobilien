import jsPDF from "jspdf";
import {
  addBrandedFooter,
  loadLogo,
  BRAND,
  ensureUnicodeFont,
  sanitizePdfText,
  PDF_FONT,
} from "./pdfBranding";
import { PITCH_VARIANTS, SALES_PROZESS_SCHRITTE, type PitchContext } from "./tippgeberPitches";

// ─── Layout constants (A4) ───
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

function drawTopBrandBar(doc: jsPDF) {
  setFill(doc, BRAND.accent);
  doc.rect(0, 0, W, 6, "F");
}

function drawPageFooter(doc: jsPDF, page: number, total: number) {
  addBrandedFooter(doc, page, total);
}

// ─── Cover page ───
function drawCoverPage(doc: jsPDF, logo: string | null, ctx: PitchContext) {
  drawTopBrandBar(doc);

  // Logo
  let y = 28;
  if (logo) {
    try {
      const lw = 56, lh = 14;
      doc.addImage(logo, "PNG", W / 2 - lw / 2, y, lw, lh);
      y += lh + 14;
    } catch { y += 14; }
  }

  // Kicker
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.accentDark);
  doc.text("PITCH-TOOLKIT", W / 2, y, { align: "center", charSpace: 1.2 });
  y += 12;

  // Headline
  doc.setFontSize(28);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.primary);
  doc.text("Deine WhatsApp- & SMS-", W / 2, y, { align: "center" });
  y += 10;
  doc.text("Vorlagen für Empfehlungen", W / 2, y, { align: "center" });
  y += 8;

  // Accent underline
  setDraw(doc, BRAND.accent);
  doc.setLineWidth(1);
  doc.line(W / 2 - 25, y, W / 2 + 25, y);
  y += 14;

  // Sub line
  doc.setFontSize(12);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, BRAND.muted);
  doc.text(
    sanitizePdfText(`Persönlich erstellt für ${ctx.tippgeberVorname}`),
    W / 2, y, { align: "center" }
  );
  y += 6;
  doc.text(
    sanitizePdfText(`Dein Vertriebspartner: ${ctx.vpFullName}`),
    W / 2, y, { align: "center" }
  );
  y += 18;

  // Inhalt-Cards row (3 stat cards)
  const cardY = y;
  const cardH = 24;
  const gap = 4;
  const cardW = (CONTENT_W - 2 * gap) / 3;
  const cards = [
    { num: `${PITCH_VARIANTS.length}`, label: "Pitch-Varianten" },
    { num: `${SALES_PROZESS_SCHRITTE.length}`, label: "Prozess-Schritte" },
    { num: "100%", label: "Tracking inklusive" },
  ];
  cards.forEach((c, i) => {
    const x = MARGIN + i * (cardW + gap);
    setFill(doc, BRAND.light);
    doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "F");
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    setColor(doc, BRAND.accentDark);
    doc.text(c.num, x + cardW / 2, cardY + 11, { align: "center" });
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    setColor(doc, BRAND.muted);
    doc.text(c.label, x + cardW / 2, cardY + 18, { align: "center" });
  });
  y = cardY + cardH + 14;

  // Empfehlungs-Link box (hero)
  const linkBoxY = y;
  const linkBoxH = 36;
  setFill(doc, [243, 248, 252]);
  doc.roundedRect(MARGIN, linkBoxY, CONTENT_W, linkBoxH, 3, 3, "F");
  setDraw(doc, [211, 235, 226]);
  doc.setLineWidth(0.3);
  doc.roundedRect(MARGIN, linkBoxY, CONTENT_W, linkBoxH, 3, 3, "S");
  // Left accent
  setFill(doc, BRAND.accent);
  doc.rect(MARGIN, linkBoxY, 2.5, linkBoxH, "F");

  doc.setFontSize(8);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, [90, 120, 149]);
  doc.text("DEIN PERSÖNLICHER EMPFEHLUNGS-LINK", MARGIN + 7, linkBoxY + 8, { charSpace: 0.6 });
  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, [24, 97, 69]);
  const urlLines = doc.splitTextToSize(ctx.landingpageUrl, CONTENT_W - 14);
  doc.text(urlLines, MARGIN + 7, linkBoxY + 16);
  doc.setFontSize(8);
  setColor(doc, BRAND.muted);
  doc.text(
    "In allen Pitches eingebaut – Empfehlungen werden automatisch dir zugeordnet.",
    MARGIN + 7, linkBoxY + linkBoxH - 5
  );
  y = linkBoxY + linkBoxH + 12;

  // Hinweis-Box
  setFill(doc, [255, 248, 225]);
  doc.roundedRect(MARGIN, y, CONTENT_W, 22, 2, 2, "F");
  setFill(doc, [230, 180, 50]);
  doc.rect(MARGIN, y, 2.5, 22, "F");
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, [120, 90, 20]);
  doc.text("Wichtig: Authentisch bleiben", MARGIN + 7, y + 7);
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, [90, 70, 18]);
  const hint = doc.splitTextToSize(
    "Die Texte sind nur Vorschläge. Passe sie unbedingt an dein eigenes Wording an, damit sie authentisch beim Empfänger ankommen.",
    CONTENT_W - 14
  );
  doc.text(hint, MARGIN + 7, y + 13);

  drawPageFooter(doc, 1, 0);
}

// ─── Prozess page ───
function drawProzessPage(doc: jsPDF) {
  drawTopBrandBar(doc);

  let y = 24;
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.accentDark);
  doc.text("DAS PASSIERT NACH EINER EMPFEHLUNG", MARGIN, y, { charSpace: 0.8 });
  y += 8;
  doc.setFontSize(22);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.primary);
  doc.text("So läuft der Prozess", MARGIN, y);
  y += 5;
  setDraw(doc, BRAND.accent);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y + 1, MARGIN + 40, y + 1);
  y += 10;

  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, BRAND.muted);
  const intro = doc.splitTextToSize(
    "Damit du genau weißt, was nach deiner Empfehlung passiert – hier die 6 Schritte vom Erstgespräch bis zum Investment.",
    CONTENT_W
  );
  doc.text(intro, MARGIN, y);
  y += intro.length * 4.5 + 8;

  // Numbered cards
  for (const s of SALES_PROZESS_SCHRITTE) {
    const cardH = 24;
    // Background
    setFill(doc, [250, 251, 252]);
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2, 2, "F");
    setDraw(doc, [230, 235, 240]);
    doc.setLineWidth(0.2);
    doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 2, 2, "S");

    // Number circle
    setFill(doc, BRAND.accent);
    doc.circle(MARGIN + 10, y + cardH / 2, 6, "F");
    doc.setFontSize(12);
    doc.setFont(PDF_FONT, "bold");
    setColor(doc, [255, 255, 255]);
    doc.text(String(s.nr), MARGIN + 10, y + cardH / 2 + 1.6, { align: "center" });

    // Title + duration
    const textX = MARGIN + 22;
    doc.setFontSize(11);
    doc.setFont(PDF_FONT, "bold");
    setColor(doc, BRAND.primary);
    doc.text(sanitizePdfText(s.titel), textX, y + 9);

    // Duration pill (right)
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "normal");
    setColor(doc, BRAND.accentDark);
    const dauerW = doc.getTextWidth(s.dauer) + 8;
    setFill(doc, [233, 243, 252]);
    doc.roundedRect(W - MARGIN - dauerW - 2, y + 5, dauerW, 6, 1.5, 1.5, "F");
    doc.text(s.dauer, W - MARGIN - dauerW / 2 - 2, y + 9, { align: "center" });

    // Description
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "normal");
    setColor(doc, [90, 95, 105]);
    const desc = doc.splitTextToSize(sanitizePdfText(s.beschreibung), CONTENT_W - 28);
    doc.text(desc, textX, y + 15);

    y += cardH + 4;
  }

  drawPageFooter(doc, 2, 0);
}

// ─── Pitch page (one pitch per page = clean hero treatment) ───
function drawPitchPage(
  doc: jsPDF,
  ctx: PitchContext,
  pitchIndex: number,
  pageNum: number,
) {
  const p = PITCH_VARIANTS[pitchIndex];
  drawTopBrandBar(doc);

  let y = 22;

  // Counter "01 / 08"
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.muted);
  const counter = `${String(pitchIndex + 1).padStart(2, "0")} / ${String(PITCH_VARIANTS.length).padStart(2, "0")}`;
  doc.text(counter, W - MARGIN, y, { align: "right" });

  // Kicker (topic)
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.accentDark);
  doc.text(sanitizePdfText(p.thema.toUpperCase()), MARGIN, y, { charSpace: 0.8 });
  y += 9;

  // Title
  doc.setFontSize(22);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, BRAND.primary);
  const titleLines = doc.splitTextToSize(sanitizePdfText(p.titel), CONTENT_W);
  doc.text(titleLines, MARGIN, y);
  y += titleLines.length * 9 + 2;

  // Accent line
  setDraw(doc, BRAND.accent);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y, MARGIN + 30, y);
  y += 10;

  // Body card
  const bodyText = sanitizePdfText(p.text(ctx));
  const bodyFontSize = 11;
  const bodyLineH = 6.2;
  doc.setFontSize(bodyFontSize);
  doc.setFont(PDF_FONT, "normal");
  const bodyLines = doc.splitTextToSize(bodyText, CONTENT_W - 16);
  const cardH = bodyLines.length * bodyLineH + 14;

  setFill(doc, [250, 251, 252]);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 3, 3, "F");
  setDraw(doc, [225, 230, 235]);
  doc.setLineWidth(0.2);
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 3, 3, "S");

  setColor(doc, [40, 45, 55]);
  doc.text(bodyLines, MARGIN + 8, y + 10);
  y += cardH + 10;

  // Link-Highlight Box
  const linkH = 18;
  setFill(doc, [243, 248, 252]);
  doc.roundedRect(MARGIN, y, CONTENT_W, linkH, 2, 2, "F");
  setFill(doc, BRAND.accent);
  doc.rect(MARGIN, y, 2, linkH, "F");

  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "bold");
  setColor(doc, [90, 120, 149]);
  doc.text("ENTHALTENER LINK", MARGIN + 6, y + 6.5, { charSpace: 0.5 });
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, [24, 97, 69]);
  const linkLines = doc.splitTextToSize(ctx.landingpageUrl, CONTENT_W - 12);
  doc.text(linkLines, MARGIN + 6, y + 13);
  y += linkH + 8;

  // Tipp footer hint
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, "normal");
  setColor(doc, BRAND.muted);
  const tip = 'Tipp: Schicke deinem Kontakt die Nachricht und bitte ihn, sich über deinen Link für ein kostenloses Erstgespräch einzutragen. Nur so wird der Kontakt automatisch dir als Tippgeber zugeordnet. Alternativ kannst du ihn auch direkt in deinem Tippgeber-Account unter „Neuer Kontakt" anlegen – dann läuft er ebenfalls auf dich.';
  const tipLines = doc.splitTextToSize(tip, CONTENT_W);
  doc.text(tipLines, MARGIN, y);

  drawPageFooter(doc, pageNum, 0);
}

export async function generateTippgeberPitchesPdf(ctx: PitchContext): Promise<jsPDF> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();

  // Page 1: Cover
  drawCoverPage(doc, logo, ctx);

  // Page 2: Prozess
  doc.addPage();
  drawProzessPage(doc);

  // Pages 3+: one pitch per page
  for (let i = 0; i < PITCH_VARIANTS.length; i++) {
    doc.addPage();
    drawPitchPage(doc, ctx, i, i + 3);
  }

  // Rewrite footers with final total page count
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, total);
  }

  return doc;
}
