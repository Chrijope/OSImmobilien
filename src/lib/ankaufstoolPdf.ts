import jsPDF from "jspdf";
import {
  addBrandedFooter, addBrandedHeader, addCoverPage, brandedSectionTitle, BRAND, ensureUnicodeFont, loadIcon, loadLogo,
  PDF_FONT, sanitizePdfText,
} from "./pdfBranding";
import { anteilAmErloes, berechneAnkauf, type AnkaufEingaben, type AnkaufErgebnis } from "./ankaufstool";

export const eur = (n: number, stellen = 0) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: stellen, maximumFractionDigits: stellen });
export const prozent = (n: number, stellen = 1) =>
  n.toLocaleString("de-DE", { style: "percent", minimumFractionDigits: stellen, maximumFractionDigits: stellen });
export const zahl = (n: number, stellen = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: stellen });

export const ANKAUF_HINWEIS =
  "Hinweis: Grobe Go/No-Go-Rechnung vor Steuern (keine Gewerbe-/Einkommensteuer, keine Zinsstaffel). " +
  "Ersetzt keine Detailkalkulation, Bank- oder Steuerberatung.";

/* Blattmaße wie in pdfBranding. */
const W = 210;
const H = 297;
const M = 20;
const CW = W - 2 * M;
const UNTERKANTE = H - 28;

type RGB = [number, number, number];
const GOLD: RGB = [184, 146, 90]; // Gold der Bildmarke
const GELB: RGB = [214, 140, 20];
const ROT: RGB = [196, 50, 50];

const URTEIL_FARBE: Record<AnkaufErgebnis["urteil"], RGB> = {
  "LOHNT SICH": BRAND.accent,
  GRENZWERTIG: GELB,
  "LOHNT SICH NICHT": ROT,
};

/** Mischt eine Farbe mit Weiß, für helle Flächen in der Farbe des Urteils. */
const hell = (c: RGB, anteil = 0.12): RGB => c.map((v) => Math.round(255 - (255 - v) * anteil)) as RGB;
const s = (t: string) => sanitizePdfText(t);

/**
 * Die dunkle Ergebniskarte. Links die Rechnung (Erlös minus Kosten) oder,
 * auf der Übersicht, Marge und Rendite; groß der Gewinn; rechts das Urteil
 * mit Ampel.
 */
function ergebnisKarte(doc: jsPDF, r: AnkaufErgebnis, e: AnkaufEingaben, y: number, uebersicht: boolean) {
  const farbe = URTEIL_FARBE[r.urteil];
  const hoehe = 46;
  doc.setFillColor(...BRAND.primary);
  doc.roundedRect(M, y, CW, hoehe, 3, 3, "F");
  doc.setFillColor(...farbe);
  doc.roundedRect(M, y, CW, 2.2, 1.1, 1.1, "F");

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.accentLight);
  doc.text("ERGEBNIS · GEWINN", M + 8, y + 11, { charSpace: 1.2 });
  doc.setFontSize(26);
  doc.setTextColor(...(r.gewinn < 0 ? ROT : BRAND.white));
  doc.text(s(eur(r.gewinn)), M + 8, y + 24);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(212, 220, 232);
  const zeilen = uebersicht
    ? [`Marge ${prozent(r.margeErloes)} vom Verkaufserlös`, `Rendite auf Eigenkapital ${prozent(r.renditeEigenkapital)} (nicht annualisiert)`]
    : [`Verkaufserlös ${eur(r.verkaufserloes)}`, `abzüglich Gesamtkosten (1–4) ${eur(r.gesamtkosten)}`];
  zeilen.forEach((z, i) => doc.text(s(z), M + 8, y + 33 + i * 5));

  // Urteil-Schild rechts
  const schildB = 58;
  const sx = M + CW - schildB - 8;
  doc.setFillColor(...farbe);
  doc.roundedRect(sx, y + 9, schildB, 13, 6.5, 6.5, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.white);
  doc.text(r.urteil, sx + schildB / 2, y + 17.2, { align: "center" });

  // Ampel: drei Punkte, der zutreffende leuchtet.
  const ampel: [RGB, boolean][] = [
    [ROT, r.urteil === "LOHNT SICH NICHT"],
    [GELB, r.urteil === "GRENZWERTIG"],
    [BRAND.accent, r.urteil === "LOHNT SICH"],
  ];
  ampel.forEach(([c, an], i) => {
    doc.setFillColor(...(an ? c : ([45, 55, 70] as RGB)));
    doc.circle(sx + schildB / 2 - 8 + i * 8, y + 30, an ? 2.6 : 2, "F");
  });
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.muted);
  doc.text(s(`Grün ab ${prozent(e.schwelleGruen, 0)} · Gelb ab ${prozent(e.schwelleGelb, 0)} Marge`), sx + schildB / 2, y + 39, { align: "center" });
}

/** Eingaben und Ergebnis des Ankaufstools als PDF im Hausstil: Deckblatt, Übersicht, Details. */
export async function buildAnkaufstoolPdf(e: AnkaufEingaben, objektName = ""): Promise<jsPDF> {
  const r = berechneAnkauf(e);
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const [logo, icon] = await Promise.all([loadLogo(), loadIcon()]);
  const kopfTitel = "Ankaufskalkulation";

  // ── Deckblatt ──
  addCoverPage(doc, icon, {
    kennung: "Ankaufsprüfung",
    titel: objektName || "Ankaufskalkulation",
    untertitel: `${objektName ? "Ankaufskalkulation · " : ""}Bauträger-Kalkulation: Lohnt sich das Objekt? ` +
      `${zahl(e.wohneinheiten)} Wohneinheiten, ${zahl(e.wohnflaeche, 2)} m² Wohnfläche.`,
  });

  let y = 0;
  const neueSeite = () => {
    doc.addPage();
    y = addBrandedHeader(doc, logo, kopfTitel, objektName || undefined) + 2;
  };
  const platz = (benoetigt: number) => {
    if (y + benoetigt > UNTERKANTE) neueSeite();
  };
  const abschnitt = (titel: string) => {
    platz(24);
    y += 3;
    y = brandedSectionTitle(doc, titel, y, M, CW);
  };
  const schrift = (groesse: number, fett = false, farbe: RGB = BRAND.text) => {
    doc.setFont(PDF_FONT, fett ? "bold" : "normal");
    doc.setFontSize(groesse);
    doc.setTextColor(...farbe);
  };

  // ── Seite 2: Auf einen Blick ──
  neueSeite();
  abschnitt("Auf einen Blick");

  // Ergebnis als dunkle Hauptkarte: Gewinn groß, Urteil als farbiges Schild.
  ergebnisKarte(doc, r, e, y, true);
  y += 52;

  // Kennzahlen-Kacheln
  const kacheln: [string, string][] = [
    ["Verkaufserlös", eur(r.verkaufserloes)],
    ["Gesamtkosten", eur(r.gesamtkosten)],
    ["Marge auf Kosten", prozent(r.margeKosten)],
    ["Gewinn / Wohnung", eur(r.gewinnJeWohnung)],
  ];
  const kachelB = (CW - 3 * 4) / 4;
  kacheln.forEach(([label, wert], i) => {
    const x = M + i * (kachelB + 4);
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(x, y, kachelB, 21, 2, 2, "F");
    schrift(6.5, false, BRAND.muted);
    doc.text(s(label.toUpperCase()), x + 4, y + 7, { charSpace: 0.6 });
    schrift(12.5, true, BRAND.primary);
    doc.text(s(wert), x + 4, y + 15.5);
  });
  y += 29;

  // Ampel-Skala: wo die Marge zwischen Rot, Gelb und Grün liegt.
  abschnitt("Marge vom Verkaufserlös");
  const skalaMin = Math.min(0, r.margeErloes - 0.03);
  const skalaMax = Math.max(e.schwelleGruen + 0.1, r.margeErloes + 0.05);
  const xAuf = (v: number) => M + ((Math.min(Math.max(v, skalaMin), skalaMax) - skalaMin) / (skalaMax - skalaMin)) * CW;
  const balkenY = y + 6;
  const gelbX = xAuf(Math.min(e.schwelleGelb, e.schwelleGruen));
  const gruenX = xAuf(e.schwelleGruen);
  doc.setFillColor(...hell(ROT, 0.55));
  doc.rect(M, balkenY, gelbX - M, 5, "F");
  doc.setFillColor(...hell(GELB, 0.6));
  doc.rect(gelbX, balkenY, gruenX - gelbX, 5, "F");
  doc.setFillColor(...hell(BRAND.accent, 0.6));
  doc.rect(gruenX, balkenY, M + CW - gruenX, 5, "F");
  // Schwellen beschriften
  schrift(7, false, BRAND.muted);
  doc.text(prozent(e.schwelleGelb, 0), gelbX, balkenY + 10, { align: "center" });
  doc.text(prozent(e.schwelleGruen, 0), gruenX, balkenY + 10, { align: "center" });
  doc.text(prozent(skalaMin, 0), M, balkenY + 10);
  doc.text(prozent(skalaMax, 0), M + CW, balkenY + 10, { align: "right" });
  // Markierung der eigenen Marge
  const mx = xAuf(r.margeErloes);
  doc.setFillColor(...BRAND.primary);
  doc.triangle(mx - 2.2, balkenY - 3.2, mx + 2.2, balkenY - 3.2, mx, balkenY - 0.2, "F");
  doc.setDrawColor(...BRAND.primary);
  doc.setLineWidth(0.6);
  doc.line(mx, balkenY - 0.2, mx, balkenY + 5);
  schrift(8, true, BRAND.primary);
  const markText = `Ihre Marge ${prozent(r.margeErloes)}`;
  const markB = doc.getTextWidth(markText);
  doc.text(markText, Math.min(Math.max(mx - markB / 2, M), M + CW - markB), balkenY - 4.5);
  y = balkenY + 18;

  // Aufteilung des Erlöses als gestapelter Balken.
  abschnitt("Wohin der Verkaufserlös geht");
  const teile: [string, number, RGB][] = [
    ["Ankauf", r.summeAnkauf, BRAND.primary],
    ["Sanierung & Aufteilung", r.summeSanierung, BRAND.accentDark],
    ["Vertrieb & Mietsubvention", r.summeVertrieb, BRAND.accent],
    ["Finanzierung", r.summeFinanzierung, BRAND.muted],
    ["Gewinn", Math.max(0, r.gewinn), GOLD],
  ];
  // Übersteigen die Kosten den Erlös, wird auf die Kosten skaliert.
  const basis = Math.max(r.verkaufserloes, r.gesamtkosten) || 1;
  let bx = M;
  for (const [, betrag, c] of teile) {
    const b = (betrag / basis) * CW;
    if (b <= 0) continue;
    doc.setFillColor(...c);
    doc.rect(bx, y, b, 9, "F");
    bx += b;
  }
  y += 15;
  // Legende in zwei Spalten
  teile.forEach(([label, betrag, c], i) => {
    const x = M + (i % 2) * (CW / 2);
    const ly = y + Math.floor(i / 2) * 7;
    doc.setFillColor(...c);
    doc.roundedRect(x, ly - 2.8, 3, 3, 0.6, 0.6, "F");
    schrift(8, false, BRAND.text);
    doc.text(s(label), x + 5, ly);
    schrift(8, true, BRAND.primary);
    doc.text(s(`${eur(label === "Gewinn" ? r.gewinn : betrag)}  ·  ${prozent(anteilAmErloes(label === "Gewinn" ? r.gewinn : betrag, r.verkaufserloes))}`), x + CW / 2 - 6, ly, { align: "right" });
  });
  y += Math.ceil(teile.length / 2) * 7 + 4;

  // Preisschwellen
  abschnitt("Abgabepreis je m²");
  const preise: [string, number, RGB][] = [
    ["Angesetzt", e.abgabepreisProQm, BRAND.primary],
    ["Mindestens (0 € Gewinn)", r.mindestAbgabepreis, ROT],
    ["Für Grün nötig", r.abgabepreisGruen, BRAND.accent],
  ];
  const preisB = (CW - 2 * 4) / 3;
  preise.forEach(([label, wert, c], i) => {
    const x = M + i * (preisB + 4);
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(x, y, preisB, 19, 2, 2, "F");
    doc.setFillColor(...c);
    doc.rect(x, y + 3, 1.2, 13, "F");
    schrift(6.5, false, BRAND.muted);
    doc.text(s(label.toUpperCase()), x + 5, y + 7, { charSpace: 0.5 });
    schrift(12, true, BRAND.primary);
    doc.text(s(`${eur(wert)}/m²`), x + 5, y + 14.5);
  });
  y += 26;

  // ── Detailtabellen ──
  const SP_EINGABE = M + 108;
  const SP_BETRAG = M + 146;
  const SP_ANTEIL = M + CW;
  const tabellenKopf = () => {
    platz(16);
    doc.setFillColor(...BRAND.light);
    doc.rect(M, y, CW, 7, "F");
    schrift(6.5, true, BRAND.muted);
    doc.text("POSITION", M + 3, y + 4.6, { charSpace: 0.5 });
    // Rechtsbündig ohne Sperrung: jsPDF rechnet sie dort nicht mit.
    doc.text("EINGABE", SP_EINGABE, y + 4.6, { align: "right" });
    doc.text("BETRAG", SP_BETRAG, y + 4.6, { align: "right" });
    doc.text("% V. ERLÖS", SP_ANTEIL - 3, y + 4.6, { align: "right" });
    y += 7;
  };
  type Zeile = { label: string; eingabe?: string; betrag?: number; summe?: boolean; info?: boolean };
  const tabelle = (titel: string, zeilen: Zeile[]) => {
    // Titel, Kopf und die ersten Zeilen bleiben zusammen auf einer Seite.
    platz(24 + 7 + Math.min(zeilen.length, 3) * 7);
    abschnitt(titel);
    tabellenKopf();
    for (const z of zeilen) {
      platz(8);
      const hoehe = 7;
      if (z.summe) {
        doc.setFillColor(...hell(BRAND.accent, 0.08));
        doc.rect(M, y, CW, hoehe, "F");
      }
      const grund = y + 4.7;
      schrift(8.5, !!z.summe, z.info ? BRAND.muted : BRAND.text);
      doc.text(s(z.label), M + 3, grund);
      if (z.eingabe) {
        schrift(8.5, false, BRAND.muted);
        doc.text(s(z.eingabe), SP_EINGABE, grund, { align: "right" });
      }
      if (z.betrag !== undefined) {
        schrift(8.5, true, z.info ? BRAND.muted : BRAND.primary);
        doc.text(s(eur(z.betrag)), SP_BETRAG, grund, { align: "right" });
        if (!z.info) {
          schrift(8, !!z.summe, BRAND.muted);
          doc.text(prozent(anteilAmErloes(z.betrag, r.verkaufserloes)), SP_ANTEIL - 3, grund, { align: "right" });
        }
      }
      if (!z.summe) {
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.15);
        doc.line(M, y + hoehe, M + CW, y + hoehe);
      }
      y += hoehe;
    }
    y += 4;
  };

  neueSeite();
  tabelle("Objektdaten & Verkaufserlös", [
    { label: "Wohnfläche gesamt", eingabe: `${zahl(e.wohnflaeche, 2)} m²` },
    { label: "Anzahl Wohneinheiten", eingabe: zahl(e.wohneinheiten) },
    { label: "Projektlaufzeit (Ankauf bis letzter Verkauf)", eingabe: `${zahl(e.laufzeitMonate)} Monate` },
    { label: "Abgabepreis an Käufer (Durchschnitt)", eingabe: `${eur(e.abgabepreisProQm)}/m²` },
    { label: "Ø Abgabepreis je Wohnung", betrag: r.abgabepreisJeWohnung, info: true },
    { label: "Verkaufserlös gesamt", betrag: r.verkaufserloes, summe: true },
  ]);
  tabelle("1. Ankauf", [
    { label: "Kaufpreis Objekt", betrag: e.kaufpreis },
    { label: "Grunderwerbsteuer", eingabe: prozent(e.grunderwerbsteuer, 2), betrag: r.grunderwerbsteuer },
    { label: "Notar & Grundbuch Ankauf", eingabe: prozent(e.notarAnkauf, 2), betrag: r.notarAnkauf },
    { label: "Maklerprovision Einkauf", eingabe: prozent(e.maklerEinkauf, 2), betrag: r.maklerEinkauf },
    { label: "Summe Ankauf", betrag: r.summeAnkauf, summe: true },
  ]);
  tabelle("2. Sanierung & Aufteilung", [
    { label: "Sanierung Wohnungen", eingabe: `${eur(e.sanierungProQm)}/m²`, betrag: r.sanierungWohnungen },
    { label: "Sanierung Gemeinschaftseigentum pauschal", betrag: e.sanierungGemeinschaft },
    { label: "Puffer Unvorhergesehenes (der Sanierung)", eingabe: prozent(e.pufferSanierung), betrag: r.pufferSanierung },
    { label: "Aufteilung (Teilungserklärung, Notar)", betrag: e.aufteilung },
    { label: "Gutachten / Planung / Sonstiges", betrag: e.gutachtenSonstiges },
    { label: "Summe Sanierung & Aufteilung", betrag: r.summeSanierung, summe: true },
  ]);
  tabelle("3. Vertrieb & Mietsubvention", [
    { label: "Vertriebsprovision (vom Abgabepreis)", eingabe: prozent(e.vertriebsprovision), betrag: r.vertriebsprovision },
    { label: "Garantiemiete an Käufer", eingabe: `${eur(e.garantiemieteProQm, 2)}/m²` },
    { label: "Tatsächliche Marktmiete", eingabe: `${eur(e.marktmieteProQm, 2)}/m²` },
    { label: "Laufzeit Mietsubvention", eingabe: `${zahl(e.subventionMonate)} Monate` },
    { label: "Mietsubvention gesamt", betrag: r.mietsubvention },
    { label: "Marketing / Exposé / Fotos", betrag: e.marketing },
    { label: "Summe Vertrieb & Mietsubvention", betrag: r.summeVertrieb, summe: true },
  ]);
  tabelle("4. Finanzierung", [
    { label: "Fremdkapitalquote (von Ankauf + Sanierung)", eingabe: prozent(e.fremdkapitalquote) },
    { label: "Fremdkapital (Darlehen), nur Info", betrag: r.fremdkapital, info: true },
    { label: "Eigenkapitaleinsatz, nur Info", betrag: r.eigenkapital, info: true },
    { label: "Zinssatz p. a.", eingabe: prozent(e.zinssatz, 2) },
    { label: "Ø Inanspruchnahme des Darlehens", eingabe: prozent(e.inanspruchnahme) },
    { label: "Zinskosten Projektlaufzeit", betrag: r.zinskosten },
    { label: "Bankgebühren / Bereitstellungszinsen", betrag: e.bankgebuehren },
    { label: "Summe Finanzierung", betrag: r.summeFinanzierung, summe: true },
  ]);
  abschnitt("Ergebnis");
  platz(48);
  ergebnisKarte(doc, r, e, y, false);
  y += 50;

  // Kennzahlen als zweispaltige Liste
  abschnitt("Kennzahlen");
  const kennzahlen: [string, string][] = [
    ["Marge vom Verkaufserlös", prozent(r.margeErloes)],
    ["Marge auf Gesamtkosten", prozent(r.margeKosten)],
    ["Rendite auf Eigenkapital (nicht annualisiert)", prozent(r.renditeEigenkapital)],
    ["Gewinn je Wohnung", eur(r.gewinnJeWohnung)],
    ["Gewinn je m²", eur(r.gewinnJeQm)],
    ["Gesamtkosten je m²", eur(r.gesamtkostenJeQm)],
    ["Mindest-Abgabepreis für 0 € Gewinn", `${eur(r.mindestAbgabepreis)}/m²`],
    ["Nötiger Abgabepreis für Grün-Marge", `${eur(r.abgabepreisGruen)}/m²`],
  ];
  const spalteB = (CW - 8) / 2;
  for (let i = 0; i < kennzahlen.length; i += 2) {
    platz(8);
    kennzahlen.slice(i, i + 2).forEach(([label, wert], j) => {
      const x = M + j * (spalteB + 8);
      schrift(8, false, BRAND.muted);
      doc.text(s(label), x + 1, y + 4.7);
      schrift(8.5, true, BRAND.primary);
      doc.text(s(wert), x + spalteB - 1, y + 4.7, { align: "right" });
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.15);
      doc.line(x, y + 7, x + spalteB, y + 7);
    });
    y += 7;
  }
  y += 6;

  // Hinweis
  schrift(7.5, false, BRAND.muted);
  const hinweis = doc.splitTextToSize(s(ANKAUF_HINWEIS), CW - 10) as string[];
  platz(hinweis.length * 3.6 + 8);
  doc.setFillColor(...BRAND.light);
  doc.roundedRect(M, y, CW, hinweis.length * 3.6 + 6, 2, 2, "F");
  doc.text(hinweis, M + 5, y + 5.2);

  // Fußzeilen, das Deckblatt zählt nicht mit.
  const seiten = doc.getNumberOfPages();
  for (let i = 2; i <= seiten; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, seiten - 1);
  }
  return doc;
}
