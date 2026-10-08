import jsPDF from "jspdf";
import {
  addBrandedFooter, addBrandedHeader, brandedSectionTitle, BRAND, ensureUnicodeFont, loadLogo, PDF_FONT, sanitizePdfText,
} from "./pdfBranding";
import { eur, prozent, zahl } from "./ankaufstoolPdf";
import { berechneSubvention, type SubventionsEingaben } from "./mietsubvention";

export const SUBVENTION_HINWEIS =
  "Hinweis: Interne Berechnung. Die zulässige Mieterhöhung (Kappungsgrenze, Mietspiegel, " +
  "Mietpreisbremse) ist je Einheit gesondert zu prüfen.";

const W = 210;
const H = 297;
const M = 20;
const CW = W - 2 * M;
const UNTERKANTE = H - 28;
type RGB = [number, number, number];
const s = (t: string) => sanitizePdfText(t);
export const datumDe = (iso: string) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("de-DE") : "–");

/** Annahmen, Tabelle je Einheit, Summen und Überweisungsbetrag an die Hausverwaltung. */
export async function buildMietsubventionPdf(e: SubventionsEingaben): Promise<jsPDF> {
  const r = berechneSubvention(e);
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const kopf = () => addBrandedHeader(doc, logo, "Mietsubvention", e.objektName || undefined) + 2;
  let y = kopf();
  const schrift = (groesse: number, fett = false, farbe: RGB = BRAND.text) => {
    doc.setFont(PDF_FONT, fett ? "bold" : "normal");
    doc.setFontSize(groesse);
    doc.setTextColor(...farbe);
  };
  const platz = (n: number) => {
    if (y + n > UNTERKANTE) {
      doc.addPage();
      y = kopf();
    }
  };

  // ── Annahmen ──
  y = brandedSectionTitle(doc, "Annahmen", y + 3, M, CW);
  const annahmen: [string, string][] = [
    ["Objekt", e.objektName || "–"],
    ["Hausverwaltung", e.hausverwaltung || "–"],
    ["Stichtag", datumDe(e.stichtag)],
    ["Mietsteigerung (Standard)", prozent(e.steigerung, 1)],
    ["Subventionsdauer", `${zahl(e.monate)} Monate`],
    ["Wohneinheiten", zahl(e.zeilen.length)],
  ];
  const spalteB = (CW - 8) / 2;
  annahmen.forEach(([label, wert], i) => {
    const x = M + (i % 2) * (spalteB + 8);
    const zy = y + Math.floor(i / 2) * 7;
    schrift(8, false, BRAND.muted);
    doc.text(s(label), x + 1, zy + 4.7);
    schrift(8.5, true, BRAND.primary);
    doc.text(s(wert), x + spalteB - 1, zy + 4.7, { align: "right" });
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(x, zy + 7, x + spalteB, zy + 7);
  });
  y += Math.ceil(annahmen.length / 2) * 7 + 6;

  // ── Tabelle je Einheit ──
  y = brandedSectionTitle(doc, "Ist- und Soll-Miete je Einheit", y + 3, M, CW);
  // Rechte Kante je Spalte; die erste Spalte (WE) ist linksbündig.
  const kanten = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((k) => M + 12 + k * 19.5);
  const kopfzeile = ["WE", "Ist Whg.", "Ist Garage", "Ist ges.", "Steig.", "Soll Whg.", "Soll Garage", "Soll ges.", "Differenz"];
  const tabellenKopf = () => {
    doc.setFillColor(...BRAND.light);
    doc.rect(M, y, CW, 7, "F");
    schrift(6.5, true, BRAND.muted);
    kopfzeile.forEach((t, i) => doc.text(s(t.toUpperCase()), i === 0 ? M + 2 : kanten[i], y + 4.6, { align: i === 0 ? "left" : "right" }));
    y += 7;
  };
  const zeileZeichnen = (werte: string[], fett: boolean) => {
    werte.forEach((t, i) => {
      schrift(7.5, fett || i === 8, i === 8 || i === 7 ? BRAND.primary : BRAND.text);
      doc.text(s(t), i === 0 ? M + 2 : kanten[i], y + 4.4, { align: i === 0 ? "left" : "right" });
    });
    y += 6.5;
  };
  tabellenKopf();
  e.zeilen.forEach((z, i) => {
    if (y + 6.5 > UNTERKANTE) {
      platz(99);
      tabellenKopf();
    }
    const zr = r.zeilen[i];
    zeileZeichnen([
      z.weNr || String(i + 1), eur(z.istWohnung || 0, 2), eur(z.istGarage || 0, 2), eur(zr.istGesamt, 2),
      prozent(zr.steigerung, 1), eur(zr.sollWohnung, 2), eur(zr.sollGarage, 2), eur(zr.sollGesamt, 2), eur(zr.differenz, 2),
    ], false);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(M, y, M + CW, y);
  });
  platz(8);
  doc.setFillColor(...BRAND.light);
  doc.rect(M, y, CW, 7, "F");
  zeileZeichnen([
    "Summe", eur(r.summeIstWohnung, 2), eur(r.summeIstGarage, 2), eur(r.summeIst, 2), "",
    eur(r.summeSollWohnung, 2), eur(r.summeSollGarage, 2), eur(r.summeSoll, 2), eur(r.differenzMonat, 2),
  ], true);
  y += 6;

  // ── Überweisung an die Hausverwaltung ──
  platz(60);
  y = brandedSectionTitle(doc, "Subvention an die Hausverwaltung", y + 3, M, CW);
  const hoehe = 34;
  doc.setFillColor(...BRAND.primary);
  doc.roundedRect(M, y, CW, hoehe, 3, 3, "F");
  doc.setFillColor(...BRAND.accent);
  doc.roundedRect(M, y, CW, 2.2, 1.1, 1.1, "F");
  schrift(7, true, BRAND.accentLight);
  doc.text(s(`ÜBERWEISUNGSBETRAG${e.hausverwaltung ? ` AN ${e.hausverwaltung.toUpperCase()}` : ""}`), M + 8, y + 10, { charSpace: 1 });
  schrift(24, true, BRAND.white);
  doc.text(s(eur(r.subventionGesamt, 2)), M + 8, y + 21.5);
  schrift(8.5, false, [212, 220, 232]);
  doc.text(s(`${eur(r.differenzMonat, 2)} pro Monat × ${zahl(e.monate)} Monate`), M + 8, y + 28.5);
  // Rechts: Monat und Jahr
  const rx = M + CW - 8;
  schrift(7, false, BRAND.muted);
  doc.text("PRO MONAT", rx, y + 10, { align: "right" });
  doc.text("PRO JAHR", rx, y + 21, { align: "right" });
  schrift(12, true, BRAND.white);
  doc.text(s(eur(r.differenzMonat, 2)), rx, y + 16, { align: "right" });
  doc.text(s(eur(r.differenzJahr, 2)), rx, y + 27, { align: "right" });
  y += hoehe + 4;

  schrift(7.5, false, BRAND.muted);
  const hinweis = doc.splitTextToSize(s(SUBVENTION_HINWEIS), CW - 2) as string[];
  // Ohne Kasten, damit er bei üblicher Größe noch auf die erste Seite passt.
  platz(hinweis.length * 3.6 + 2);
  doc.text(hinweis, M + 1, y + 3.5);

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, seiten);
  }
  return doc;
}
