import jsPDF from "jspdf";
import { addBrandedHeader, addBrandedFooter, brandedSectionTitle, brandedRow, BRAND, loadLogo, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";
import {
  AFTERSALES_LEISTUNG_SCHLUESSEL,
  aftersalesDatum,
  aftersalesTexte,
  aftersalesZeitpunkt,
  type AftersalesSprache,
} from "../../supabase/functions/_shared/aftersales-beratung-texte.ts";

export interface AftersalesBeratungData {
  kundeName: string;
  kundeAnschrift?: string;
  kunde2Name?: string;
  vpName: string;
  vpEmail?: string;
  objektAdresse?: string;
  /** Kaufdatum / Notartermin */
  kaufdatum?: string;
  /** Vereinbarte Aftersales-Leistungen (Checkliste, Keys wie im Dialog) */
  leistungen?: Record<string, boolean>;
  bemerkungen?: string;
  /** Ort/Datum der Beratung */
  ort?: string;
  datum?: string;
}

export interface AftersalesSignature {
  name: string;
  signatureData: string;          // dataURL PNG
  signedAt: string;               // ISO
}

/**
 * Generiert das Aftersales-Beratungsdokument als PDF mit optionalen
 * Unterschriften (Vertriebspartner + Kunde).
 *
 * Seit dem 25.09.2026 mit denselben Texten wie das endgültige PDF aus
 * `finalize-aftersales-beratung` (`_shared/aftersales-beratung-texte.ts`) und
 * in der Sprache des Kunden (Plan Kundensprache, D17). Ohne Angabe Deutsch.
 */
export async function generateAftersalesBeratungPDF(
  data: AftersalesBeratungData,
  signatures?: { vp?: AftersalesSignature; kunde?: AftersalesSignature },
  sprache: AftersalesSprache = "de",
): Promise<jsPDF> {
  // Akzeptiere sowohl flache Form als auch { aftersalesBeratung: {...} }
  const flat: AftersalesBeratungData = ((data as { aftersalesBeratung?: AftersalesBeratungData })?.aftersalesBeratung ?? data) as AftersalesBeratungData;
  data = flat;
  const T = aftersalesTexte(sprache);
  const sanitize = (s?: string) => (s || T.leer).toString();
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const H = 297;
  const margin = 20;
  const contentW = 210 - 2 * margin;
  let pageNum = 1;

  const logo = await loadLogo();

  let y = addBrandedHeader(doc, logo, T.titel, T.erstelltAm(aftersalesDatum(new Date(), sprache)));

  const checkPage = (needed: number) => {
    if (y + needed > H - 30) {
      addBrandedFooter(doc, pageNum, 0);
      doc.addPage();
      pageNum++;
      y = 18;
    }
  };

  const section = (title: string) => {
    checkPage(14);
    y += 2;
    y = brandedSectionTitle(doc, title, y, margin, contentW);
  };

  const row = (label: string, value: string) => {
    checkPage(6);
    y = brandedRow(doc, label, value, margin + 3, y, 55);
  };

  const absatz = (text: string, groesse = 8.5) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(groesse);
    const zeilen = doc.splitTextToSize(text, contentW - 6);
    checkPage(zeilen.length * 4 + 2);
    doc.text(zeilen, margin + 3, y);
    y += zeilen.length * 4 + 1;
  };

  // ─── Einleitung ───
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.primary);
  const introLines = doc.splitTextToSize(T.einleitung, contentW);
  doc.text(introLines, margin, y);
  y += introLines.length * 4 + 4;

  // ─── Vertragspartner ───
  section(T.abschnittPartner);
  row(T.kunde, sanitize(data.kundeName));
  if (data.kunde2Name) row(T.kaeufer2, data.kunde2Name);
  row(T.anschrift, sanitize(data.kundeAnschrift));
  row(T.vertriebspartner, sanitize(data.vpName));
  if (data.vpEmail) row(T.emailVp, data.vpEmail);
  row(T.objektAdresse, sanitize(data.objektAdresse));
  row(T.kaufdatum, sanitize(data.kaufdatum));
  y += 4;

  // ─── Aftersales-Leistungen ───
  section(T.abschnittLeistungen);
  doc.setFontSize(8.5);
  for (const key of AFTERSALES_LEISTUNG_SCHLUESSEL) {
    const checked = !!data.leistungen?.[key];
    const wrapped = doc.splitTextToSize(T.leistungen[key], contentW - 12);
    checkPage(wrapped.length * 4 + 2);
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.4);
    doc.rect(margin + 3, y - 3.2, 3.4, 3.4);
    if (checked) {
      doc.setTextColor(...BRAND.primary);
      doc.text("X", margin + 3.6, y - 0.5);
    }
    doc.setTextColor(40, 40, 40);
    doc.text(wrapped, margin + 9, y);
    y += Math.max(5, wrapped.length * 4);
  }
  y += 2;

  // ─── Kontakt-Rhythmus ───
  section(T.abschnittRhythmus);
  doc.setTextColor(40, 40, 40);
  for (const zeile of T.rhythmus) absatz(zeile, 8);
  y += 2;

  if (data.bemerkungen) {
    section(T.abschnittBemerkungen);
    doc.setTextColor(20, 20, 20);
    absatz(data.bemerkungen, 8);
  }

  // ─── Beratungsort / -datum ───
  section(T.abschnittOrt);
  row(T.beratungsort, sanitize(data.ort));
  row(T.beratungsdatum, sanitize(data.datum));
  y += 6;

  // ─── Unterschriften ───
  checkPage(70);
  section(T.abschnittUnterschriften);

  const drawSig = (
    title: string,
    fallbackName: string,
    sig?: AftersalesSignature,
  ) => {
    checkPage(40);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.primary);
    doc.text(`${title}: ${sig?.name || fallbackName}`, margin + 3, y);
    y += 2;

    if (sig?.signedAt) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(7);
      doc.setTextColor(...BRAND.muted);
      doc.text(T.unterschriebenAm(aftersalesZeitpunkt(new Date(sig.signedAt), sprache)), margin + 3, y + 3);
    }

    if (sig?.signatureData) {
      try {
        doc.addImage(sig.signatureData, "PNG", margin + 3, y + 5, 60, 22);
      } catch {
        /* ignore */
      }
    } else {
      // Leeres Unterschriftenfeld
      doc.setDrawColor(180, 180, 180);
      doc.setLineWidth(0.2);
      doc.rect(margin + 3, y + 5, 60, 22);
    }
    y += 32;

    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.3);
    doc.line(margin + 3, y, margin + 73, y);
    y += 4;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(sig?.signatureData ? T.ees : T.ausstehend, margin + 3, y);
    doc.setTextColor(0, 0, 0);
    y += 10;
  };

  drawSig(T.vertriebspartner, data.vpName, signatures?.vp);
  drawSig(T.kunde, data.kundeName, signatures?.kunde);

  // ─── Footers ───
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, totalPages);
  }

  return doc;
}
