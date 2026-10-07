import { PDF_FONT, applyPdfFontSync } from "./pdfBranding";
import jsPDF from "jspdf";
import type { Mieter } from "./mieterStore";

export interface MieterhoehungData {
  mieter: Mieter;
  alteMiete: number;
  neueMiete: number;
  erhoehungAb: string;
  begruendung: "mietspiegel" | "modernisierung" | "index" | "staffel";
  mietspiegelWert?: number;
  modernisierungskosten?: number;
  indexAlt?: number;
  indexNeu?: number;
  absenderFirma: string;
  absenderAdresse: string;
}

export function berechneKappungsgrenze(aktuelleKaltmiete: number, mietvertragBeginn: string, grenze: 15 | 20 = 20): number {
  // Kappungsgrenze: max. 20% (oder 15% in angespannten Märkten) in 3 Jahren
  return aktuelleKaltmiete * (1 + grenze / 100);
}

export function berechneModernisierungsUmlage(kosten: number, wohnflaeche: number, gesamtflaeche: number): number {
  // § 559 BGB: 8% der auf die Wohnung entfallenden Kosten p.a., auf Monat umrechnen
  const anteil = wohnflaeche / gesamtflaeche;
  return Math.round((kosten * anteil * 0.08) / 12 * 100) / 100;
}

export function berechneIndexMiete(aktuelleKaltmiete: number, indexAlt: number, indexNeu: number): number {
  if (indexAlt <= 0) return aktuelleKaltmiete;
  return Math.round(aktuelleKaltmiete * (indexNeu / indexAlt) * 100) / 100;
}

function fmtDate(d: string) {
  if (!d) return "___________";
  const parts = d.split("-");
  return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : d;
}

function fmtEuro(v: number) {
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
}

export function generateMieterhoehungPDF(data: MieterhoehungData): jsPDF {
  const doc = new jsPDF();
  applyPdfFontSync(doc);
  const m = 20;
  let y = 25;
  const lh = 6;
  const pw = 170;

  const line = (text: string, bold = false, size = 10) => {
    doc.setFontSize(size);
    doc.setFont(PDF_FONT, bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, pw);
    lines.forEach((l: string) => {
      if (y > 270) { doc.addPage(); y = 25; }
      doc.text(l, m, y);
      y += lh;
    });
  };

  const gap = (h = 4) => { y += h; };

  // Header
  line(data.absenderFirma, true);
  line(data.absenderAdresse, false, 9);
  gap(8);
  line(`${data.mieter.vorname} ${data.mieter.nachname}`);
  if (data.mieter.strasse) line(`${data.mieter.strasse}`);
  if (data.mieter.plz || data.mieter.ort) line(`${data.mieter.plz || ""} ${data.mieter.ort || ""}`);
  gap(8);

  line(`Datum: ${fmtDate(new Date().toISOString().split("T")[0])}`, false, 9);
  gap(6);

  // Title
  doc.setFontSize(14);
  doc.setFont(PDF_FONT, "bold");
  doc.text("Mieterhöhungsverlangen", m, y);
  y += 10;

  line(`gemäß §§ 558 ff. BGB`, false, 10);
  gap(4);

  // Object
  line(`Objekt: ${data.mieter.objektName || data.mieter.objektId}`);
  line(`Wohneinheit: ${data.mieter.wohneinheitName || data.mieter.wohneinheitId}`);
  gap(4);

  line("Sehr geehrte/r Mieter/in,");
  gap(2);

  const diff = data.neueMiete - data.alteMiete;
  const prozent = data.alteMiete > 0 ? Math.round((diff / data.alteMiete) * 10000) / 100 : 0;

  if (data.begruendung === "mietspiegel") {
    line(`hiermit bitten wir Sie um Ihre Zustimmung zur Erhöhung der Nettokaltmiete. Die ortsübliche Vergleichsmiete laut aktuellem Mietspiegel beträgt ${fmtEuro(data.mietspiegelWert || data.neueMiete)} pro Monat.`);
  } else if (data.begruendung === "modernisierung") {
    line(`aufgrund der durchgeführten Modernisierungsmaßnahmen gemäß § 559 BGB erhöhen wir die monatliche Nettokaltmiete wie folgt:`);
  } else if (data.begruendung === "index") {
    line(`aufgrund der Veränderung des Verbraucherpreisindex (VPI) vom Statistischen Bundesamt passen wir die Miete gemäß der vereinbarten Indexklausel an:`);
    gap(2);
    line(`Alter Indexstand: ${data.indexAlt || "–"}`);
    line(`Neuer Indexstand: ${data.indexNeu || "–"}`);
  } else {
    line(`gemäß der vereinbarten Staffelung erhöht sich die monatliche Nettokaltmiete wie folgt:`);
  }
  gap(4);

  // Calculation box
  line("Bisherige Nettokaltmiete:", true);
  line(`${fmtEuro(data.alteMiete)} monatlich`);
  gap(2);
  line("Neue Nettokaltmiete:", true);
  line(`${fmtEuro(data.neueMiete)} monatlich`);
  gap(2);
  line(`Erhöhung: ${fmtEuro(diff)} (${prozent}%)`, true);
  gap(2);
  line(`Wirksam ab: ${fmtDate(data.erhoehungAb)}`, true);
  gap(6);

  if (data.begruendung === "mietspiegel") {
    line("Wir bitten Sie, der Mieterhöhung innerhalb von zwei Monaten (Überlegungsfrist gemäß § 558b BGB) zuzustimmen.");
    gap(2);
    line("Sollten Sie der Erhöhung nicht zustimmen, behalten wir uns vor, die Zustimmung gerichtlich geltend zu machen (§ 558b Abs. 2 BGB).");
  }
  gap(6);

  line("Mit freundlichen Grüßen");
  gap(10);
  doc.line(m, y, m + 65, y);
  y += 5;
  line(data.absenderFirma);

  return doc;
}
