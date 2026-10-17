import JSZip from "jszip";
import jsPDF from "jspdf";
import { addBrandedFooter, addBrandedHeader, BRAND, ensureUnicodeFont, loadLogo, PDF_FONT, sanitizePdfText } from "./pdfBranding";

/*
 * Eine Tabelle als Excel oder PDF (17.10.2026, Export der Objektdaten).
 * Bewusst schlicht: eine Kopfzeile, Werte wie angezeigt, Zahlen bleiben in
 * Excel Zahlen. Formatierte Listen mit Formeln baut die Kaufpreisliste
 * (`kaufpreislisteExport.ts`); hier geht es um „was ich sehe, als Datei“.
 */

export type ExportWert = string | number | null | undefined;

export interface ExportTabelle {
  titel: string;
  untertitel?: string;
  kopf: string[];
  zeilen: ExportWert[][];
}

const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const spalte = (i: number) => { let s = ""; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };

export async function tabelleAlsXlsx(t: ExportTabelle): Promise<Blob> {
  const zeile = (werte: ExportWert[], r: number, fett: boolean) =>
    `<row r="${r}">${werte.map((w, i) => {
      const ref = `${spalte(i)}${r}`;
      if (typeof w === "number" && Number.isFinite(w)) return `<c r="${ref}"${fett ? ' s="1"' : ""}><v>${w}</v></c>`;
      if (w === null || w === undefined || w === "") return "";
      return `<c r="${ref}" t="inlineStr"${fett ? ' s="1"' : ""}><is><t xml:space="preserve">${xml(String(w))}</t></is></c>`;
    }).join("")}</row>`;
  const breiten = t.kopf.map((k, i) => Math.min(40, Math.max(k.length, ...t.zeilen.map((z) => String(z[i] ?? "").length)) + 2));
  const blatt = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${breiten.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${b}" customWidth="1"/>`).join("")}</cols><sheetData>${zeile(t.kopf, 1, true)}${t.zeilen.map((z, i) => zeile(z, i + 2, false)).join("")}</sheetData><autoFilter ref="A1:${spalte(t.kopf.length - 1)}${t.zeilen.length + 1}"/></worksheet>`;
  const name = xml(t.titel.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || "Liste");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  zip.file("xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  zip.file("xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file("xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf fontId="0"/><xf fontId="1" applyFont="1"/></cellXfs></styleSheet>`);
  zip.file("xl/worksheets/sheet1.xml", blatt);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

/** Zahl wie im CRM: deutsch, zwei Nachkommastellen bei Beträgen. */
const anzeige = (w: ExportWert) =>
  typeof w === "number" ? w.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : w === null || w === undefined ? "–" : String(w);

export async function tabelleAlsPdf(t: ExportTabelle): Promise<Blob> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const W = 297, H = 210, M = 12, unten = H - 18;
  const texte = [t.kopf, ...t.zeilen.map((z) => z.map(anzeige))];
  // Spaltenbreite nach dem längsten Text, auf die Seitenbreite skaliert.
  const roh = t.kopf.map((_, i) => Math.max(...texte.map((z) => Math.min(String(z[i] ?? "").length, 40))) + 1);
  const faktor = (W - 2 * M) / roh.reduce((a, b) => a + b, 0);
  const breiten = roh.map((b) => b * faktor);
  const zeilenhoehe = 5;
  let y = 0;
  const kopfzeile = () => {
    y = addBrandedHeader(doc, logo, sanitizePdfText(t.titel)) - 2;
    if (t.untertitel) { doc.setFont(PDF_FONT, "normal"); doc.setFontSize(8); doc.setTextColor(...BRAND.text); doc.text(sanitizePdfText(t.untertitel), M, y); y += 5; }
    doc.setFillColor(240, 240, 240);
    doc.rect(M, y - 3.5, W - 2 * M, zeilenhoehe, "F");
    zelle(t.kopf, true);
  };
  const zelle = (werte: ExportWert[], fett: boolean) => {
    doc.setFont(PDF_FONT, fett ? "bold" : "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.text);
    let x = M;
    werte.forEach((w, i) => {
      const text = sanitizePdfText(anzeige(w));
      const passend = doc.splitTextToSize(text, breiten[i] - 1)[0] ?? "";
      if (typeof w === "number") doc.text(passend, x + breiten[i] - 1, y, { align: "right" });
      else doc.text(passend, x, y);
      x += breiten[i];
    });
    y += zeilenhoehe;
  };
  kopfzeile();
  for (const z of t.zeilen) {
    if (y > unten) { doc.addPage(); kopfzeile(); }
    zelle(z, false);
  }
  const seiten = doc.getNumberOfPages();
  for (let p = 1; p <= seiten; p++) { doc.setPage(p); addBrandedFooter(doc, p, seiten); }
  return doc.output("blob");
}
