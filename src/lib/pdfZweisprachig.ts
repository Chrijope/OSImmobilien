import type jsPDF from "jspdf";
import { BRAND, PDF_FONT, sanitizePdfText, textInBreite } from "./pdfBranding";

/**
 * Bausteine für zweisprachige PDFs (Plan Kundensprache, Entscheidung 6 und 7).
 *
 * Reservierung und Selbstauskunft gehen an Bank, Notar und Bauträger, die
 * Deutsch lesen, und an einen Kunden, der Englisch liest. Deshalb steht in
 * diesen Dokumenten bei englischen Kunden jede Beschriftung zweimal: oben
 * deutsch in der gewohnten Größe, darunter kleiner und heller die englische.
 * So bleibt das deutsche Dokument für die Bank genauso lesbar wie vorher.
 *
 * Bewusst eine eigene Datei neben `pdfBranding.ts`: Das Hausdesign bleibt
 * unverändert, und rein deutsche Dokumente laufen nicht durch diesen Code.
 */

/** Die Farbe der englischen Zweitzeile: heller als das Deutsche, aber lesbar. */
export const ZWEITSPRACHE_FARBE: [number, number, number] = [110, 120, 135];

/** Abstand der englischen Beschriftung unter der deutschen. */
const EN_ABSTAND = 3.1;

/**
 * Eine Zeile mit Beschriftung und Wert, Beschriftung in beiden Sprachen.
 *
 * Dieselbe Aufteilung wie `brandedRow`: Beschriftung links, Wert fett ab
 * `labelOffset`, Trennlinie unter der letzten Zeile. Ohne englische
 * Beschriftung (oder wenn sie gleich lautet, etwa „IBAN“) entspricht die Zeile
 * `brandedRow`, nur mit derselben Höhe wie die zweizeiligen, damit die
 * Abstände im Block gleich bleiben.
 *
 * @returns die y-Position für die nächste Zeile
 */
export function zweisprachigeZeile(
  doc: jsPDF,
  labelDe: string,
  labelEn: string | null | undefined,
  value: string,
  x: number,
  y: number,
  labelOffset: number,
  linienBreite?: number,
  labelFett = false,
  /** Wert am rechten Zeilenende, wie `brandedRow` mit `wertRechts`. */
  wertRechts = false,
): number {
  const breite = linienBreite ?? labelOffset + 40;
  const labelBreite = (wertRechts ? breite - 45 : labelOffset) - 2;
  const en = (labelEn ?? "").trim();
  const mitEn = !!en && en.toLowerCase() !== labelDe.trim().toLowerCase();

  doc.setFont(PDF_FONT, labelFett ? "bold" : "normal");
  doc.setTextColor(...(labelFett ? BRAND.primary : BRAND.muted));
  textInBreite(doc, labelDe, x, y, labelBreite, 8, 6);
  if (mitEn) {
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...ZWEITSPRACHE_FARBE);
    textInBreite(doc, en, x, y + EN_ABSTAND, labelBreite, 6.5, 5.5);
  }

  // Der Wert wie in `brandedRow`: umbrechen, zu lange Wörter hart teilen.
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.primary);
  const wertBreite = wertRechts ? 43 : breite - labelOffset;
  let zeilen: string[] = doc.splitTextToSize(sanitizePdfText(value || "–"), wertBreite) as string[];
  zeilen = zeilen.flatMap((z) => {
    if (doc.getTextWidth(z) <= wertBreite) return [z];
    const teile: string[] = [];
    let rest = z;
    while (rest.length > 0 && doc.getTextWidth(rest) > wertBreite) {
      let schnitt = rest.length;
      while (schnitt > 1 && doc.getTextWidth(rest.slice(0, schnitt)) > wertBreite) schnitt--;
      teile.push(rest.slice(0, schnitt));
      rest = rest.slice(schnitt);
    }
    if (rest) teile.push(rest);
    return teile;
  });
  zeilen.forEach((zeile, i) => {
    if (wertRechts) doc.text(zeile, x + breite, y + i * 3.6, { align: "right" });
    else doc.text(zeile, x + labelOffset, y + i * 3.6);
  });

  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(0, 0, 0);

  // Die Linie sitzt unter dem Tieferen von beidem: englische Beschriftung
  // oder letzte Wertzeile.
  const hoehe = Math.max(Math.max(0, zeilen.length - 1) * 3.6, EN_ABSTAND);
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.15);
  doc.line(x, y + hoehe + 1.6, x + breite, y + hoehe + 1.6);
  return y + hoehe + 5.2;
}

/** Wie hoch wird eine zweisprachige Zeile? Für die Seitenumbruchprüfung vorab. */
export function zweisprachigeZeileHoehe(doc: jsPDF, value: string, wertBreite: number): number {
  doc.setFontSize(8);
  const n = Math.max(1, (doc.splitTextToSize(sanitizePdfText(value || "–"), wertBreite) as string[]).length);
  return Math.max((n - 1) * 3.6, EN_ABSTAND) + 5.2;
}

/**
 * Abschnittsüberschrift in beiden Sprachen, im Stil von `brandedSectionTitle`.
 *
 * Passt das Englische in dieselbe Zeile, steht es hinter einem Schrägstrich
 * kleiner und heller daneben. Sonst steht es in einer zweiten Zeile, und die
 * Haarlinie rutscht mit.
 *
 * @returns die y-Position für den Inhalt darunter
 */
export function zweisprachigerAbschnitt(
  doc: jsPDF,
  titelDe: string,
  titelEn: string,
  y: number,
  margin: number,
  contentW: number,
): number {
  const de = sanitizePdfText(titelDe);
  const en = sanitizePdfText(titelEn);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(11);
  const breiteDe = doc.getTextWidth(de);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  const breiteEn = doc.getTextWidth(` / ${en}`);
  const eineZeile = 6 + breiteDe + breiteEn <= contentW - 2;

  const balkenHoehe = eineZeile ? 6.4 : 10.4;
  doc.setFillColor(...BRAND.accent);
  doc.rect(margin, y - 3.6, 2.2, balkenHoehe, "F");

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.primary);
  doc.text(de, margin + 6, y + 1);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...ZWEITSPRACHE_FARBE);
  if (eineZeile) doc.text(` / ${en}`, margin + 6 + breiteDe, y + 1);
  else doc.text(en, margin + 6, y + 5.2);

  const linie = eineZeile ? y + 6.5 : y + 8.5;
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.3);
  doc.line(margin, linie, margin + contentW, linie);

  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(0, 0, 0);
  return linie + 7.5;
}
