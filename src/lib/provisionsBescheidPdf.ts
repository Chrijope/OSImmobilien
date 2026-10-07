import { PDF_FONT, applyPdfFontSync } from "./pdfBranding";
import jsPDF from "jspdf";
import type { Provisionsabrechnung } from "./provisionsAbrechnungStore";
import { monatLabel, fmtEUR } from "./provisionsAbrechnungStore";
import { OVERHEAD_AKTIV } from "./lizenzPakete";

export function buildProvisionsBescheidPdf(a: Provisionsabrechnung): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  applyPdfFontSync(doc);
  const W = doc.internal.pageSize.getWidth();
  const M = 56;
  let y = 56;

  // Header
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(18);
  doc.text("Provisionsbescheid", M, y);
  doc.setFont(PDF_FONT, "normal"); doc.setFontSize(9);
  doc.text(`Abrechnung-Nr.: ${a.id.slice(0, 8).toUpperCase()}`, W - M, y, { align: "right" });
  y += 18;
  doc.text(`Erstellt: ${new Date(a.erstelltAm).toLocaleDateString("de-DE")}`, W - M, y, { align: "right" });
  y += 32;

  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(11);
  doc.text(`Abrechnungsmonat: ${monatLabel(a.monat)}`, M, y); y += 16;
  doc.text(`Empfänger: ${a.userName}${a.karriereStufe ? `  ·  ${a.karriereStufe}` : ""}`, M, y); y += 22;

  const section = (title: string) => {
    doc.setFont(PDF_FONT, "bold"); doc.setFontSize(11);
    doc.text(title, M, y); y += 6;
    doc.line(M, y, W - M, y); y += 14;
    doc.setFont(PDF_FONT, "normal"); doc.setFontSize(9);
  };

  const ensureSpace = (need = 60) => {
    if (y + need > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage(); y = 56;
    }
  };

  // Eigene Deals
  section("Eigene Abschlüsse");
  if (a.eigeneDeals.length === 0) {
    doc.text("Keine eigenen Abschlüsse im Abrechnungszeitraum.", M, y); y += 14;
  } else {
    a.eigeneDeals.forEach((d, i) => {
      ensureSpace();
      doc.text(`${i + 1}. ${d.kundeName} · ${d.objekt}`, M, y);
      doc.text(`${d.satz}% von ${fmtEUR(d.kaufpreis)} = ${fmtEUR(d.betrag)}`, W - M, y, { align: "right" });
      y += 14;
    });
  }
  y += 6;
  doc.setFont(PDF_FONT, "bold");
  doc.text("Summe eigene Deals:", M, y);
  doc.text(fmtEUR(a.summeEigen), W - M, y, { align: "right" });
  y += 24; doc.setFont(PDF_FONT, "normal");

  // Junior-Overrides und Overhead-Abzüge erscheinen nur, solange die
  // Overhead-Provision aktiv ist. Ohne sie zeigt der Bescheid nur die
  // eigenen Abschlüsse und den Nettobetrag.
  if (OVERHEAD_AKTIV) {
  // Junior-Overrides
  ensureSpace(80);
  section("Junior-Overrides (erhalten)");
  if (a.overridesErhalten.length === 0) {
    doc.text("Keine Junior-Overrides im Abrechnungszeitraum.", M, y); y += 14;
  } else {
    a.overridesErhalten.forEach((o, i) => {
      ensureSpace();
      doc.text(`${i + 1}. ${o.juniorName} → ${o.kundeName}`, M, y);
      doc.text(`${o.overridePercent}% von ${fmtEUR(o.kaufpreis)} = ${fmtEUR(o.betrag)}`, W - M, y, { align: "right" });
      y += 14;
    });
  }
  y += 6; doc.setFont(PDF_FONT, "bold");
  doc.text("Summe Overrides:", M, y);
  doc.text(fmtEUR(a.summeOverridesErhalten), W - M, y, { align: "right" });
  y += 24; doc.setFont(PDF_FONT, "normal");

  // Overheads abgezogen
  ensureSpace(80);
  section("Karriere-Overheads (abgezogen)");
  if (a.overheadsAbgezogen.length === 0) {
    doc.text("Keine Overhead-Abzüge.", M, y); y += 14;
  } else {
    a.overheadsAbgezogen.forEach((o, i) => {
      ensureSpace();
      doc.text(`${i + 1}. an ${o.anName} · ${o.objekt}`, M, y);
      doc.text(`-${o.overheadRate}% von ${fmtEUR(o.kaufpreis)} = -${fmtEUR(o.betrag)}`, W - M, y, { align: "right" });
      y += 14;
    });
  }
  y += 6; doc.setFont(PDF_FONT, "bold");
  doc.text("Summe Overhead:", M, y);
  doc.text(`-${fmtEUR(a.summeOverhead)}`, W - M, y, { align: "right" });
  y += 28;
  }

  // Netto
  ensureSpace(60);
  doc.line(M, y, W - M, y); y += 18;
  doc.setFont(PDF_FONT, "bold"); doc.setFontSize(13);
  doc.text("Nettobetrag zur Auszahlung", M, y);
  doc.text(fmtEUR(a.netto), W - M, y, { align: "right" });
  y += 30;

  // Status
  doc.setFont(PDF_FONT, "normal"); doc.setFontSize(9);
  doc.text(`Status: ${a.status.toUpperCase()}`, M, y); y += 12;
  if (a.freigegebenAm) {
    doc.text(`Freigegeben am ${new Date(a.freigegebenAm).toLocaleDateString("de-DE")} von ${a.freigegebenVon || "—"}`, M, y);
    y += 12;
  }
  if (a.ausgezahltAm) {
    doc.text(`Ausgezahlt am ${new Date(a.ausgezahltAm).toLocaleDateString("de-DE")} von ${a.ausgezahltVon || "—"}`, M, y);
    y += 12;
  }

  // Footer
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("MOREImmo · Provisionsbescheid · Dieser Bescheid ist computergeneriert und ohne Unterschrift gültig.", W / 2, H - 30, { align: "center" });

  return doc.output("blob");
}