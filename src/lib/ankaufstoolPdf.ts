import jsPDF from "jspdf";
import {
  addBrandedHeader, addBrandedFooter, brandedSectionTitle, brandedRow, BRAND, loadLogo, PDF_FONT, ensureUnicodeFont,
} from "./pdfBranding";
import { anteilAmErloes, berechneAnkauf, type AnkaufEingaben } from "./ankaufstool";

export const eur = (n: number, stellen = 0) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: stellen, maximumFractionDigits: stellen });
export const prozent = (n: number, stellen = 1) =>
  n.toLocaleString("de-DE", { style: "percent", minimumFractionDigits: stellen, maximumFractionDigits: stellen });
export const zahl = (n: number, stellen = 0) =>
  n.toLocaleString("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: stellen });

/** Eingaben und Ergebnis des Ankaufstools als PDF, Aufbau wie das Excel-Blatt. */
export async function buildAnkaufstoolPdf(e: AnkaufEingaben, objektName = ""): Promise<jsPDF> {
  const r = berechneAnkauf(e);
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const H = 297;
  const margin = 20;
  const contentW = 210 - 2 * margin;
  const logo = await loadLogo();
  const datum = new Date().toLocaleDateString("de-DE");
  let y = addBrandedHeader(doc, logo, "Ankaufstool", `${objektName ? `${objektName} · ` : ""}Erstellt am ${datum}`);

  const checkPage = (needed: number) => {
    if (y + needed > H - 30) {
      doc.addPage();
      y = addBrandedHeader(doc, logo, "Ankaufstool");
    }
  };
  const section = (title: string) => {
    checkPage(20);
    y += 2;
    y = brandedSectionTitle(doc, title, y, margin, contentW);
  };
  // Betrag mit Anteil am Verkaufserlös, wie Spalte C und D der Excel.
  const mitAnteil = (betrag: number) => `${eur(betrag)}  (${prozent(anteilAmErloes(betrag, r.verkaufserloes))})`;
  const row = (label: string, value: string, fett = false) => {
    checkPage(7);
    y = brandedRow(doc, label, value, margin + 3, y, 95, contentW - 6, true, fett);
  };

  // Urteil zuerst, damit es nicht am Seitenende verschwindet.
  const farbe: [number, number, number] =
    r.urteil === "LOHNT SICH" ? [22, 163, 74] : r.urteil === "GRENZWERTIG" ? [217, 119, 6] : [220, 38, 38];
  doc.setFillColor(...farbe);
  doc.roundedRect(margin, y, contentW, 14, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(13);
  doc.text(r.urteil, margin + 5, y + 9);
  doc.setFontSize(9);
  doc.text(`Gewinn ${eur(r.gewinn)} · Marge ${prozent(r.margeErloes)} vom Erlös`, margin + contentW - 5, y + 9, { align: "right" });
  doc.setTextColor(0, 0, 0);
  y += 22;

  section("Ampel-Schwellen (Marge vom Verkaufserlös)");
  row("Grün ab Marge", prozent(e.schwelleGruen));
  row("Gelb ab Marge", prozent(e.schwelleGelb));

  section("Objektdaten");
  row("Wohnfläche gesamt", `${zahl(e.wohnflaeche, 2)} m²`);
  row("Anzahl Wohneinheiten", zahl(e.wohneinheiten));
  row("Projektlaufzeit", `${zahl(e.laufzeitMonate)} Monate`);

  section("Verkaufserlös");
  row("Abgabepreis an Käufer", `${eur(e.abgabepreisProQm)}/m²`);
  row("Verkaufserlös gesamt", eur(r.verkaufserloes), true);
  row("Ø Abgabepreis je Wohnung", eur(r.abgabepreisJeWohnung));

  section("1. Ankauf");
  row("Kaufpreis Objekt", mitAnteil(e.kaufpreis));
  row(`Grunderwerbsteuer (${prozent(e.grunderwerbsteuer, 2)})`, mitAnteil(r.grunderwerbsteuer));
  row(`Notar & Grundbuch Ankauf (${prozent(e.notarAnkauf, 2)})`, mitAnteil(r.notarAnkauf));
  row(`Maklerprovision Einkauf (${prozent(e.maklerEinkauf, 2)})`, mitAnteil(r.maklerEinkauf));
  row("Summe Ankauf", mitAnteil(r.summeAnkauf), true);

  section("2. Sanierung & Aufteilung");
  row(`Sanierung Wohnungen (${eur(e.sanierungProQm)}/m²)`, mitAnteil(r.sanierungWohnungen));
  row("Sanierung Gemeinschaftseigentum pauschal", mitAnteil(e.sanierungGemeinschaft));
  row(`Puffer Unvorhergesehenes (${prozent(e.pufferSanierung)})`, mitAnteil(r.pufferSanierung));
  row("Aufteilung (Teilungserklärung, Abgeschlossenheit, Notar)", mitAnteil(e.aufteilung));
  row("Gutachten / Planung / Sonstiges", mitAnteil(e.gutachtenSonstiges));
  row("Summe Sanierung & Aufteilung", mitAnteil(r.summeSanierung), true);

  section("3. Vertrieb & Mietsubvention");
  row(`Vertriebsprovision (${prozent(e.vertriebsprovision)})`, mitAnteil(r.vertriebsprovision));
  row("Garantiemiete an Käufer", `${eur(e.garantiemieteProQm, 2)}/m²`);
  row("Tatsächliche Marktmiete", `${eur(e.marktmieteProQm, 2)}/m²`);
  row("Laufzeit Mietsubvention", `${zahl(e.subventionMonate)} Monate`);
  row("Mietsubvention gesamt", mitAnteil(r.mietsubvention));
  row("Marketing / Exposé / Fotos", mitAnteil(e.marketing));
  row("Summe Vertrieb & Mietsubvention", mitAnteil(r.summeVertrieb), true);

  section("4. Finanzierung");
  row("Fremdkapitalquote (von Ankauf + Sanierung)", prozent(e.fremdkapitalquote));
  row("Fremdkapital (Darlehen, nur Info)", eur(r.fremdkapital));
  row("Eigenkapitaleinsatz (nur Info)", eur(r.eigenkapital));
  row("Zinssatz p. a.", prozent(e.zinssatz, 2));
  row("Ø Inanspruchnahme des Darlehens", prozent(e.inanspruchnahme));
  row("Zinskosten Projektlaufzeit", mitAnteil(r.zinskosten));
  row("Bankgebühren / Bereitstellungszinsen pauschal", mitAnteil(e.bankgebuehren));
  row("Summe Finanzierung", mitAnteil(r.summeFinanzierung), true);

  section("Ergebnis");
  row("Gesamtkosten (1–4)", mitAnteil(r.gesamtkosten));
  row("Verkaufserlös", mitAnteil(r.verkaufserloes));
  row("Gewinn (was übrig bleibt)", mitAnteil(r.gewinn), true);
  row("Marge vom Verkaufserlös", prozent(r.margeErloes), true);
  row("Marge auf Gesamtkosten", prozent(r.margeKosten));
  row("Rendite auf Eigenkapital (Projekt, nicht annualisiert)", prozent(r.renditeEigenkapital));
  row("Gewinn je Wohnung", eur(r.gewinnJeWohnung));
  row("Gewinn je m²", eur(r.gewinnJeQm));
  row("Gesamtkosten je m²", eur(r.gesamtkostenJeQm));
  row("Mindest-Abgabepreis für 0 € Gewinn", `${eur(r.mindestAbgabepreis)}/m²`);
  row("Nötiger Abgabepreis für Grün-Marge", `${eur(r.abgabepreisGruen)}/m²`);
  row("Urteil", r.urteil, true);

  checkPage(14);
  y += 4;
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(doc.splitTextToSize(ANKAUF_HINWEIS, contentW), margin, y);

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, seiten);
  }
  return doc;
}

export const ANKAUF_HINWEIS =
  "Hinweis: Grobe Go/No-Go-Rechnung vor Steuern (keine Gewerbe-/Einkommensteuer, keine Zinsstaffel). " +
  "Ersetzt keine Detailkalkulation, Bank- oder Steuerberatung.";
