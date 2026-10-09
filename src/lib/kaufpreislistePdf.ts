import jsPDF from "jspdf";
import {
  addBrandedFooter, addBrandedHeader, brandedSectionTitle, BRAND, ensureUnicodeFont, loadLogo, PDF_FONT, sanitizePdfText, textInBreite,
} from "./pdfBranding";
import { eur, prozent, zahl } from "./ankaufstoolPdf";
import { datumDe } from "./mietsubventionPdf";
import { berechneKaufpreisliste, HAUSGELD_KATEGORIEN, hausgeldMonat, kategorieSumme, type KplEingaben } from "./kaufpreisliste";

export const KPL_HINWEIS =
  "Hinweise: Hausgeld je Einheit = Ansätze des Wirtschaftsplans nach Verteiler (MEA-Anteil bzw. je Einheit) / 12. " +
  "Mietrendite = Jahresmiete / Verkaufspreis. Überschuss Soll = Sollmiete – nicht umlagefähiges Hausgeld – Erhaltungsrücklage. " +
  "Mietsubvention = Gesamtbetrag anteilig nach Verkaufspreis. Alle Angaben ohne Gewähr.";

// A4 quer
const W = 297;
const H = 210;
const M = 20;
const CW = W - 2 * M;
const UNTERKANTE = H - 26;
type RGB = [number, number, number];
const s = (t: string) => sanitizePdfText(t);
const leerOder = (n: number | null, f: (n: number) => string) => (n === null ? "–" : f(n));

/**
 * Die Kaufpreisliste im Querformat: Eckdaten, eine Zeile je Einheit mit den
 * wichtigsten Spalten, GESAMT-Zeile und der Wirtschaftsplan in Kurzform. Alle
 * Spalten stehen in der Excel; 32 Spalten passen nicht lesbar auf A4.
 */
export async function buildKaufpreislistePdf(e: KplEingaben): Promise<jsPDF> {
  const r = berechneKaufpreisliste(e);
  const g = r.gesamt;
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const kopf = () => addBrandedHeader(doc, logo, e.objektName ? `Kaufpreisliste ${e.objektName}` : "Kaufpreisliste") - 4;
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

  // ── Eckdaten ──
  const eck: [string, string][] = [
    ["Objekt", e.objektName || "–"], ["Ort", e.ort || "–"], ["Stand", datumDe(e.stand)],
    ["Soll-Miete Vorgabe", e.sollQmVorgabe === null ? "–" : `${eur(e.sollQmVorgabe, 2)}/m²`],
    ["Mietsubvention gesamt", leerOder(e.subventionGesamt, (n) => eur(n))], ["Einheiten", `${g.einheiten} WE, ${g.vermietet} vermietet`],
  ];
  const spalteB = (CW - 16) / 3;
  eck.forEach(([label, wert], i) => {
    const x = M + (i % 3) * (spalteB + 8);
    const zy = y + Math.floor(i / 3) * 6.5;
    schrift(7.5, false, BRAND.muted);
    doc.text(s(label), x + 1, zy + 4.5);
    schrift(8, true, BRAND.primary);
    doc.text(s(wert), x + spalteB - 1, zy + 4.5, { align: "right" });
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(x, zy + 6.5, x + spalteB, zy + 6.5);
  });
  y += 2 * 6.5 + 5;

  // ── Tabelle je Einheit ──
  // [Überschrift, Breite in mm, linksbündig]
  const spalten: [string, number, boolean?][] = [
    ["WE", 10, true], ["Lage / Nutzung", 26, true], ["Status", 15, true], ["Mieter", 25, true],
    ["Fläche", 14], ["MEA", 9], ["Ist mtl.", 15], ["Ist/m²", 11], ["Gesamtm.", 16], ["Soll mtl.", 15],
    ["Kaufpreis", 18], ["VK/m²", 13], ["Rend. Ist", 12], ["Rend. Soll", 12], ["Hausgeld", 15], ["Überschuss", 15], ["Subvention", 16],
  ];
  const kanten: { x: number; b: number; links: boolean }[] = [];
  let x = M;
  for (const [, b, links] of spalten) {
    kanten.push({ x: links ? x + 1.2 : x + b - 1.2, b: b - 2.4, links: !!links });
    x += b;
  }
  const tabellenKopf = () => {
    doc.setFillColor(...BRAND.light);
    doc.rect(M, y, CW, 7, "F");
    schrift(6.3, true, BRAND.muted);
    spalten.forEach(([t], i) => doc.text(s(t), kanten[i].x, y + 4.6, { align: kanten[i].links ? "left" : "right" }));
    y += 7;
  };
  const zeileZeichnen = (werte: string[], fett: boolean) => {
    werte.forEach((t, i) => {
      schrift(6.8, fett, i === 16 || i === 11 ? BRAND.primary : BRAND.text);
      const k = kanten[i];
      if (k.links) textInBreite(doc, t, k.x, y + 4.2, k.b, 6.8, 5);
      else doc.text(s(t), k.x, y + 4.2, { align: "right" });
    });
    y += 5.6;
  };
  tabellenKopf();
  e.zeilen.forEach((z, i) => {
    if (y + 5.6 > UNTERKANTE) {
      platz(99);
      tabellenKopf();
    }
    const zr = r.zeilen[i];
    zeileZeichnen([
      z.we || String(i + 1), z.lage, z.status, z.mieter,
      leerOder(z.flaeche, (n) => `${zahl(n, 2)} m²`), leerOder(z.mea, (n) => zahl(n, 1)),
      leerOder(z.ist, (n) => eur(n, 2)), leerOder(zr.istQm, (n) => eur(n, 2)), leerOder(zr.gesamtmiete, (n) => eur(n, 2)),
      leerOder(zr.soll, (n) => eur(n, 2)), leerOder(z.vk, (n) => eur(n)), leerOder(zr.vkQm, (n) => eur(n, 0)),
      leerOder(zr.renditeIst, (n) => prozent(n, 2)), leerOder(zr.renditeSoll, (n) => prozent(n, 2)),
      leerOder(zr.hg, (n) => eur(n, 2)), leerOder(zr.ueberschuss, (n) => eur(n, 2)), leerOder(zr.subvention, (n) => eur(n, 2)),
    ], false);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(M, y, M + CW, y);
  });
  platz(8);
  doc.setFillColor(...BRAND.light);
  doc.rect(M, y, CW, 5.6, "F");
  zeileZeichnen([
    "GESAMT", "", `${g.vermietet} verm. / ${g.einheiten} WE`, "", `${zahl(g.flaeche, 2)} m²`, zahl(g.mea, 1),
    eur(g.ist, 2), leerOder(g.istQm, (n) => eur(n, 2)), eur(g.gesamtmiete, 2), eur(g.soll, 2), eur(g.vk), leerOder(g.vkQm, (n) => eur(n, 0)),
    leerOder(g.renditeIst, (n) => prozent(n, 2)), leerOder(g.renditeSoll, (n) => prozent(n, 2)),
    eur(g.hg, 2), eur(g.ueberschuss, 2), eur(g.subvention, 2),
  ], true);
  y += 4;

  // ── Wirtschaftsplan in Kurzform ──
  platz(42);
  y = brandedSectionTitle(doc, "Wirtschaftsplan (Ansätze pro Jahr)", y + 4, M, CW) - 3;
  const wp = e.wirtschaftsplan;
  const wpZeilen: [string, string][] = [
    ...HAUSGELD_KATEGORIEN.map((k): [string, string] => [k, eur(kategorieSumme(wp, k), 2)]),
    ["Summe der Ausgaben", eur(HAUSGELD_KATEGORIEN.reduce((t, k) => t + kategorieSumme(wp, k), 0), 2)],
    ["Gesamt-MEA / Einheiten (Verteiler WE)", `${leerOder(wp.gesamtMea, (n) => zahl(n, 1))} / ${leerOder(wp.anzahlEinheiten, (n) => zahl(n))}`],
  ];
  const pruef = hausgeldMonat(wp, wp.pruefMea);
  if (pruef !== null) wpZeilen.push([`Prüfung: Hausgeld bei ${zahl(wp.pruefMea!, 1)} MEA`, `${eur(pruef, 2)} / Monat`]);
  const breiteWp = (CW - 8) / 2;
  wpZeilen.forEach(([label, wert], i) => {
    const sx = M + (i % 2) * (breiteWp + 8);
    const zy = y + Math.floor(i / 2) * 6;
    schrift(7.5, false, BRAND.muted);
    doc.text(s(label), sx + 1, zy + 4.3);
    schrift(8, true, BRAND.primary);
    doc.text(s(wert), sx + breiteWp - 1, zy + 4.3, { align: "right" });
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(sx, zy + 6, sx + breiteWp, zy + 6);
  });
  y += Math.ceil(wpZeilen.length / 2) * 6 + 2;

  schrift(7, false, BRAND.muted);
  const hinweis = doc.splitTextToSize(s(KPL_HINWEIS), CW - 2) as string[];
  platz(hinweis.length * 3.4 + 2);
  doc.text(hinweis, M + 1, y + 3);

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, seiten);
  }
  return doc;
}
