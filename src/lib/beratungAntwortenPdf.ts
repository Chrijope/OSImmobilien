import jsPDF from "jspdf";
import { BRAND, PDF_FONT, ensureUnicodeFont, loadLogo, sanitizePdfText } from "./pdfBranding";

/**
 * Die Antworten aus der Beratungspräsentation als PDF, zum Mitgeben als
 * Kopie (Wunsch Christian, 20.10.2026). Je Abschnitt ein runder Kasten mit
 * der Frage und der gewählten Antwort bzw. dem eingegebenen Text. Alles im
 * Browser, nichts geht an einen Server.
 */
export interface AntwortZeile {
  frage: string;
  antwort: string;
}
export interface AntwortAbschnitt {
  titel: string;
  zeilen: ReadonlyArray<AntwortZeile>;
}

/** Leere Antworten stehen trotzdem da, damit sichtbar ist, was gefragt wurde. */
export const OHNE_ANGABE = "Keine Angabe";

const W = 210;
const H = 297;
const RAND = 18;
const INNEN = 6;
const BREITE = W - 2 * RAND;
const FUSS_Y = H - 12;

export async function erzeugeAntwortenPdf(abschnitte: ReadonlyArray<AntwortAbschnitt>, stand = new Date()): Promise<jsPDF> {
  // compress: Ohne wird das Logo unkomprimiert eingebettet, rund 3,7 MB statt weniger Hundert KB.
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4", compress: true });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const datum = stand.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

  let y = RAND;
  if (logo) {
    try {
      const { width, height } = doc.getImageProperties(logo);
      const b = 46;
      doc.addImage(logo, "PNG", RAND, y, b, (b * height) / width, undefined, "FAST");
      y += (b * height) / width + 8;
    } catch {
      y += 4;
    }
  }
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(20);
  doc.setTextColor(...BRAND.primary);
  doc.text("Ihre Antworten aus der Beratung", RAND, y + 6);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...BRAND.muted);
  doc.text(`Stand ${datum} · Kopie für Ihre Unterlagen`, RAND, y + 13);
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.8);
  doc.line(RAND, y + 17, RAND + 18, y + 17);
  y += 26;

  const textBreite = BREITE - 2 * INNEN;
  /** Eine Zeile vorbereiten: umbrochene Frage und Antwort samt Höhe. */
  const vorbereiten = (z: AntwortZeile) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    const frage: string[] = doc.splitTextToSize(sanitizePdfText(z.frage), textBreite);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(10.5);
    const roh = z.antwort.trim() || OHNE_ANGABE;
    const antwort: string[] = doc.splitTextToSize(sanitizePdfText(roh), textBreite);
    return { frage, antwort, leer: !z.antwort.trim(), hoehe: frage.length * 3.6 + antwort.length * 4.9 + 4 };
  };

  const neueSeite = () => {
    doc.addPage();
    y = RAND;
  };

  /** Ein Kasten mit den Zeilen, die auf die Seite passen. */
  const kasten = (zeilen: ReturnType<typeof vorbereiten>[]) => {
    const hoehe = zeilen.reduce((s, z) => s + z.hoehe, 0) + 2 * INNEN - 4;
    doc.setFillColor(...BRAND.light);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.roundedRect(RAND, y, BREITE, hoehe, 4, 4, "FD");
    let zy = y + INNEN;
    zeilen.forEach((z, i) => {
      if (i > 0) {
        doc.setDrawColor(...BRAND.separator);
        doc.line(RAND + INNEN, zy - 2, RAND + BREITE - INNEN, zy - 2);
      }
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BRAND.muted);
      z.frage.forEach((t) => {
        zy += 3.6;
        doc.text(t, RAND + INNEN, zy - 0.8);
      });
      doc.setFont(PDF_FONT, z.leer ? "normal" : "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(...(z.leer ? BRAND.muted : BRAND.text));
      z.antwort.forEach((t) => {
        zy += 4.9;
        doc.text(t, RAND + INNEN, zy - 0.8);
      });
      zy += 4;
    });
    y += hoehe + 8;
  };

  for (const a of abschnitte) {
    const zeilen = a.zeilen.map(vorbereiten);
    // Titel nie allein am Seitenende.
    if (y + 10 + (zeilen[0]?.hoehe ?? 0) + 2 * INNEN > FUSS_Y - 6) neueSeite();
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.accent);
    doc.setCharSpace(0.6);
    doc.text(sanitizePdfText(a.titel).toUpperCase(), RAND, y + 3);
    doc.setCharSpace(0);
    y += 7;
    let stapel: typeof zeilen = [];
    let platz = FUSS_Y - 6 - y - 2 * INNEN;
    for (const z of zeilen) {
      if (stapel.length && z.hoehe > platz) {
        kasten(stapel);
        neueSeite();
        stapel = [];
        platz = FUSS_Y - 6 - y - 2 * INNEN;
      }
      stapel.push(z);
      platz -= z.hoehe;
    }
    if (stapel.length) kasten(stapel);
  }

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.2);
    doc.line(RAND, FUSS_Y - 4, W - RAND, FUSS_Y - 4);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(6);
    doc.setTextColor(...BRAND.muted);
    doc.text("OS REAL ESTATE GMBH · BERATUNG · DEINE ANTWORTEN", RAND, FUSS_Y);
    doc.text(`STAND ${datum} · SEITE ${i} / ${seiten}`, W - RAND, FUSS_Y, { align: "right" });
  }
  return doc;
}
