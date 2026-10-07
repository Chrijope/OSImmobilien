/**
 * PDF-Erzeugung der Anlage-V-Aufstellung (Stufe 3 der Kundenportal-Sanierung).
 *
 * Nutzt das gemeinsame Branding aus pdfBranding.ts: dunkles Deckblatt,
 * laufender Kopf, Fusszeile mit Firmenzeile und Seitenzahl. Inhaltlich eine
 * Tabelle Posten / Betrag / Quelle / Rechtsgrundlage je Abschnitt, dazu ein
 * Warnkasten, wenn Angaben fehlen.
 *
 * Rechtlicher Rahmen: Auf jeder Seite steht der Hinweis, dass es sich um eine
 * Aufstellung zur VORBEREITUNG der Anlage V handelt, die keine Steuerberatung
 * ersetzt. Amtliche Zeilennummern werden bewusst nicht behauptet.
 *
 * Sprache: Die Aufstellung bleibt immer deutsch, auch für englischsprachige
 * Kunden (Plan Kundensprache, Entscheidung 8). Sie geht an einen deutschen
 * Steuerberater und bereitet ein deutsches Formular vor. Englisch sind nur
 * die Portaloberfläche und der Hinweis dazu (`portal.steuer.*` in den
 * Sprachdateien). Deshalb gibt es hier bewusst keinen Sprachparameter; ein
 * Test hält das fest (`kundenPdfSprache.test.ts`).
 */

import jsPDF from "jspdf";
import {
  PDF_FONT,
  BRAND,
  ensureUnicodeFont,
  loadLogo,
  loadIcon,
  addCoverPage,
  addBrandedHeader,
  addBrandedFooter,
  brandedSectionTitle,
  sanitizePdfText,
} from "@/lib/pdfBranding";
import {
  anlageVDateiname,
  type AnlageVAufstellung,
  type AnlageVZeile,
} from "@/lib/anlageVExport";

const W = 210;
const H = 297;
const MARGIN = 20;
const CONTENT_W = W - 2 * MARGIN;

/* Spaltenraster der Postentabelle (Summe = CONTENT_W) */
const COL_POSTEN = 66;
const COL_BETRAG = 26;
const COL_QUELLE = 46;
const COL_RECHT = CONTENT_W - COL_POSTEN - COL_BETRAG - COL_QUELLE;

const fmtEuro = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(v);

function vorbereitungsHinweis(jahr: number): string {
  return `Aufstellung zur Vorbereitung der Anlage V, Veranlagungsjahr ${jahr}. `
    + "Ersetzt keine Steuerberatung, bitte mit deinem Steuerberater abstimmen.";
}

/** Blob als reines Base64 (ohne data:-Praefix), fuer den Mailanhang. */
function blobZuBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const komma = dataUrl.indexOf(",");
      if (komma < 0) {
        reject(new Error("PDF konnte nicht kodiert werden"));
        return;
      }
      resolve(dataUrl.slice(komma + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("PDF konnte nicht gelesen werden"));
    reader.readAsDataURL(blob);
  });
}

/** Seitenumbruch, wenn der Platz nicht mehr reicht. Fusszeilen kommen am Ende. */
function checkPage(doc: jsPDF, y: number, benoetigt: number, titel: string): number {
  if (y + benoetigt > H - 30) {
    doc.addPage();
    return addBrandedHeader(doc, _logo, titel);
  }
  return y;
}

let _logo: string | null = null;

function zeilenHoehe(doc: jsPDF, zeile: AnlageVZeile): { posten: string[]; quelle: string[]; recht: string[]; hoehe: number } {
  doc.setFontSize(7.5);
  const posten = doc.splitTextToSize(sanitizePdfText(zeile.posten), COL_POSTEN - 3) as string[];
  doc.setFontSize(6.5);
  const quelle = doc.splitTextToSize(sanitizePdfText(zeile.quelle), COL_QUELLE - 3) as string[];
  const recht = doc.splitTextToSize(sanitizePdfText(zeile.rechtsgrundlage || "–"), COL_RECHT - 2) as string[];
  const maxZeilen = Math.max(posten.length, quelle.length, recht.length, 1);
  return { posten, quelle, recht, hoehe: maxZeilen * 3.2 + 3 };
}

function tabellenKopf(doc: jsPDF, y: number): number {
  doc.setFillColor(...BRAND.primary);
  doc.rect(MARGIN, y - 3.6, CONTENT_W, 6, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.white);
  doc.text("POSTEN", MARGIN + 2, y, { charSpace: 0.5 });
  doc.text("BETRAG", MARGIN + COL_POSTEN + COL_BETRAG - 2, y, { align: "right", charSpace: 0.5 });
  doc.text("QUELLE", MARGIN + COL_POSTEN + COL_BETRAG + 2, y, { charSpace: 0.5 });
  doc.text("RECHTSGRUNDLAGE", MARGIN + COL_POSTEN + COL_BETRAG + COL_QUELLE + 2, y, { charSpace: 0.5 });
  doc.setTextColor(0, 0, 0);
  return y + 6;
}

function tabellenZeile(doc: jsPDF, y: number, zeile: AnlageVZeile, gerade: boolean, titel: string): number {
  const teile = zeilenHoehe(doc, zeile);
  y = checkPage(doc, y, teile.hoehe + 4, titel);
  if (gerade) {
    doc.setFillColor(...BRAND.light);
    doc.rect(MARGIN, y - 3.2, CONTENT_W, teile.hoehe, "F");
  }

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.text);
  teile.posten.forEach((z, i) => doc.text(z, MARGIN + 2, y + i * 3.2));

  if (zeile.fehlt || zeile.betrag == null) {
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.muted);
    doc.text("Angabe fehlt", MARGIN + COL_POSTEN + COL_BETRAG - 2, y, { align: "right" });
  } else {
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.primary);
    doc.text(fmtEuro(zeile.betrag), MARGIN + COL_POSTEN + COL_BETRAG - 2, y, { align: "right" });
  }

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.muted);
  teile.quelle.forEach((z, i) => doc.text(z, MARGIN + COL_POSTEN + COL_BETRAG + 2, y + i * 3.2));
  teile.recht.forEach((z, i) => doc.text(z, MARGIN + COL_POSTEN + COL_BETRAG + COL_QUELLE + 2, y + i * 3.2));

  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.15);
  doc.line(MARGIN, y + teile.hoehe - 3.2, MARGIN + CONTENT_W, y + teile.hoehe - 3.2);
  doc.setTextColor(0, 0, 0);
  return y + teile.hoehe;
}

function summenZeile(doc: jsPDF, y: number, label: string, betrag: number, titel: string): number {
  y = checkPage(doc, y, 9, titel);
  doc.setFillColor(...BRAND.light);
  doc.rect(MARGIN, y - 3.4, CONTENT_W, 6.4, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.primary);
  doc.text(sanitizePdfText(label), MARGIN + 2, y);
  doc.text(fmtEuro(betrag), MARGIN + CONTENT_W - 2, y, { align: "right" });
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(0, 0, 0);
  return y + 8;
}

/** Warnkasten fuer eine unvollstaendige Aufstellung. */
function warnkasten(doc: jsPDF, y: number, aufstellung: AnlageVAufstellung, titel: string): number {
  const anzahl = aufstellung.fehlendeAngaben.length;
  const kopf = anzahl === 1
    ? "Aufstellung unvollständig, eine Angabe fehlt"
    : `Aufstellung unvollständig, ${anzahl} Angaben fehlen`;
  doc.setFontSize(7);
  const zeilen = aufstellung.fehlendeAngaben.map(
    (f) => doc.splitTextToSize(`• ${sanitizePdfText(f)}`, CONTENT_W - 8) as string[],
  );
  const textHoehe = zeilen.reduce((s, z) => s + z.length * 3.3, 0);
  const boxH = 10 + textHoehe + 3;
  y = checkPage(doc, y, boxH + 6, titel);

  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(217, 119, 6);
  doc.setLineWidth(0.4);
  doc.roundedRect(MARGIN, y - 4, CONTENT_W, boxH, 2, 2, "FD");

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(8);
  doc.setTextColor(154, 84, 8);
  doc.text(sanitizePdfText(kopf), MARGIN + 4, y + 1);
  let zy = y + 6;
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 72, 15);
  for (const block of zeilen) {
    for (const z of block) {
      doc.text(z, MARGIN + 4, zy);
      zy += 3.3;
    }
  }
  doc.setTextColor(0, 0, 0);
  return y + boxH + 4;
}

/**
 * Baut das komplette Dokument. Ob daraus ein Download (erzeugeAnlageVPdf)
 * oder ein Base64-Anhang fuer den Mailversand (erzeugeAnlageVPdfBase64)
 * wird, entscheidet der Aufrufer.
 */
async function baueAnlageVDoc(aufstellung: AnlageVAufstellung): Promise<jsPDF> {
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const [logo, icon] = await Promise.all([loadLogo(), loadIcon()]);
  _logo = logo;

  const hinweis = vorbereitungsHinweis(aufstellung.jahr);
  const titel = `Anlage V Vorbereitung ${aufstellung.jahr}`;

  /* ── Deckblatt ── */
  addCoverPage(doc, icon, {
    kennung: "Steuerunterlage",
    titel: "Anlage V, Vorbereitung",
    untertitel: `${aufstellung.bezeichnung}, Veranlagungsjahr ${aufstellung.jahr}. `
      + (aufstellung.unvollstaendig
        ? `Aufstellung unvollständig, ${aufstellung.fehlendeAngaben.length === 1 ? "eine Angabe fehlt" : `${aufstellung.fehlendeAngaben.length} Angaben fehlen`}, Details im Dokument.`
        : "Alle benötigten Angaben sind erfasst."),
    empfaenger: aufstellung.bezeichnung,
    datum: aufstellung.erstelltAm,
    fusszeile: hinweis,
  });

  /* ── Inhaltsseite(n) ── */
  doc.addPage();
  let y = addBrandedHeader(doc, logo, titel, hinweis);

  // Warnkasten zuerst, damit der Steuerberater ihn sicher sieht.
  if (aufstellung.unvollstaendig) {
    y = warnkasten(doc, y, aufstellung, titel);
  }

  // Objektangaben
  y = brandedSectionTitle(doc, "Objektangaben", y, MARGIN, CONTENT_W);
  for (const o of aufstellung.objekt) {
    y = checkPage(doc, y, 7, titel);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(sanitizePdfText(o.label), MARGIN, y);
    doc.setFont(PDF_FONT, o.fehlt ? "normal" : "bold");
    doc.setTextColor(...(o.fehlt ? BRAND.muted : BRAND.primary));
    doc.text(sanitizePdfText(o.wert), MARGIN + 50, y);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(MARGIN, y + 2, MARGIN + CONTENT_W, y + 2);
    y += 6;
  }
  y += 4;

  // Einnahmen
  y = checkPage(doc, y, 26, titel);
  y = brandedSectionTitle(doc, "Einnahmen", y, MARGIN, CONTENT_W);
  y = tabellenKopf(doc, y);
  aufstellung.einnahmen.forEach((z, i) => { y = tabellenZeile(doc, y, z, i % 2 === 0, titel); });
  y = summenZeile(doc, y, "Summe Einnahmen", aufstellung.summeEinnahmen, titel);
  y += 2;

  // Werbungskosten
  y = checkPage(doc, y, 26, titel);
  y = brandedSectionTitle(doc, "Werbungskosten", y, MARGIN, CONTENT_W);
  y = tabellenKopf(doc, y);
  aufstellung.werbungskosten.forEach((z, i) => { y = tabellenZeile(doc, y, z, i % 2 === 0, titel); });
  y = summenZeile(doc, y, "Summe Werbungskosten", aufstellung.summeWerbungskosten, titel);
  y += 2;

  // Erhaltungsaufwand als Belegliste
  if (aufstellung.erhaltungsBelege.length > 0) {
    y = checkPage(doc, y, 20, titel);
    y = brandedSectionTitle(doc, `Erhaltungsaufwand ${aufstellung.jahr}, Einzelbelege`, y, MARGIN, CONTENT_W);
    for (const b of aufstellung.erhaltungsBelege) {
      y = checkPage(doc, y, 6, titel);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...BRAND.text);
      doc.text(sanitizePdfText(b.titel), MARGIN + 2, y);
      doc.setTextColor(...BRAND.muted);
      doc.text(b.datum ? `Beleg vom ${b.datum}` : "Belegdatum unbekannt", MARGIN + 100, y);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...BRAND.primary);
      doc.text(fmtEuro(b.betrag), MARGIN + CONTENT_W - 2, y, { align: "right" });
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.15);
      doc.line(MARGIN, y + 1.8, MARGIN + CONTENT_W, y + 1.8);
      y += 5.2;
    }
    y += 4;
  }

  // Ergebnis
  y = checkPage(doc, y, 34, titel);
  y = brandedSectionTitle(doc, "Ergebnis", y, MARGIN, CONTENT_W);
  const verlust = aufstellung.ueberschussVerlust < 0;
  doc.setFillColor(...BRAND.primary);
  doc.roundedRect(MARGIN, y - 3, CONTENT_W, 16, 2, 2, "F");
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.accentLight);
  doc.text(
    sanitizePdfText(
      verlust
        ? "ÜBERSCHUSS DER WERBUNGSKOSTEN (VERLUST AUS VERMIETUNG UND VERPACHTUNG)"
        : "ÜBERSCHUSS DER EINNAHMEN AUS VERMIETUNG UND VERPACHTUNG",
    ),
    MARGIN + 4,
    y + 2,
    { charSpace: 0.4 },
  );
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(13);
  doc.setTextColor(...BRAND.white);
  doc.text(fmtEuro(aufstellung.ueberschussVerlust), MARGIN + 4, y + 9);
  doc.setTextColor(0, 0, 0);
  y += 19;

  // Hinweise unter dem Ergebnis
  const hinweise: string[] = [];
  if (aufstellung.miteigentumsanteilP !== 100) {
    hinweise.push(`Alle Posten sind anteilig mit ${aufstellung.miteigentumsanteilP} % Miteigentumsanteil angesetzt.`);
  }
  if (aufstellung.vermieteteMonateAngenommen) {
    hinweise.push("Die erste Mieteinnahme ist nicht erfasst, es sind 12 vermietete Monate angenommen.");
  }
  if (aufstellung.sonderAfaHinweis) hinweise.push(aufstellung.sonderAfaHinweis);
  hinweise.push(
    "Die Gliederung folgt der Struktur der Anlage V (Einnahmen, Werbungskosten, Ergebnis) ohne amtliche Zeilennummern. "
    + "Die Übertragung in das amtliche Formular nimmt dein Steuerberater vor.",
  );
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  doc.setTextColor(...BRAND.muted);
  for (const h of hinweise) {
    const zeilen = doc.splitTextToSize(sanitizePdfText(h), CONTENT_W) as string[];
    y = checkPage(doc, y, zeilen.length * 3.3 + 2, titel);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    for (const z of zeilen) {
      doc.text(z, MARGIN, y);
      y += 3.3;
    }
    y += 1.5;
  }
  doc.setTextColor(0, 0, 0);

  /* ── Fusszeilen: Vorbereitungs-Hinweis plus Branding, ohne Deckblatt ── */
  const seiten = doc.getNumberOfPages();
  for (let i = 2; i <= seiten; i++) {
    doc.setPage(i);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(sanitizePdfText(hinweis), W / 2, H - 23, { align: "center", maxWidth: CONTENT_W });
    addBrandedFooter(doc, i - 1, seiten - 1);
  }

  return doc;
}

/**
 * Erzeugt das PDF und loest den Download aus.
 * Dateiname: anlage-v-vorbereitung_<bezeichnung>_<jahr>.pdf
 */
export async function erzeugeAnlageVPdf(aufstellung: AnlageVAufstellung): Promise<void> {
  const doc = await baueAnlageVDoc(aufstellung);
  doc.save(anlageVDateiname(aufstellung.bezeichnung, aufstellung.jahr));
}

/**
 * Erzeugt dasselbe PDF als Base64 fuer den Server-Versand an den
 * Steuerberater (Edge Function send-anlage-v). Kein Download.
 */
export async function erzeugeAnlageVPdfBase64(
  aufstellung: AnlageVAufstellung,
): Promise<{ base64: string; dateiname: string }> {
  const doc = await baueAnlageVDoc(aufstellung);
  const base64 = await blobZuBase64(doc.output("blob"));
  return { base64, dateiname: anlageVDateiname(aufstellung.bezeichnung, aufstellung.jahr) };
}
