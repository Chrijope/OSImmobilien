import jsPDF from "jspdf";
import type { Mieter } from "./mieterStore";
import { loadLogo, addBrandedHeader, addBrandedFooter, BRAND, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";

export interface RaumZustand {
  raum: string;
  zustand: "gut" | "normal" | "maengel";
  maengel: string;
  fotos: number;
}

export interface UebergabeProtokollData {
  mieter: Mieter;
  typ: "einzug" | "auszug";
  datum: string;
  raeume: RaumZustand[];
  zaehlerstaende: { typ: string; standAlt: string; standNeu: string; zaehlerNr: string }[];
  schluessel: { typ: string; anzahl: number; zurueckgegeben?: boolean }[];
  allgemeinzustand: string;
  maengelListe: string;
  vereinbarungen: string;
  vermieterName: string;
  vermieterVertreter: string;
}

const RAEUME_DEFAULT: RaumZustand[] = [
  { raum: "Flur / Eingang", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "Wohnzimmer", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "Schlafzimmer", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "Küche", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "Badezimmer", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "WC (sep.)", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "Balkon / Terrasse", zustand: "gut", maengel: "", fotos: 0 },
  { raum: "Keller / Abstellraum", zustand: "gut", maengel: "", fotos: 0 },
];

const ZAEHLER_DEFAULT = [
  { typ: "Strom", standAlt: "", standNeu: "", zaehlerNr: "" },
  { typ: "Wasser (kalt)", standAlt: "", standNeu: "", zaehlerNr: "" },
  { typ: "Wasser (warm)", standAlt: "", standNeu: "", zaehlerNr: "" },
  { typ: "Heizung", standAlt: "", standNeu: "", zaehlerNr: "" },
  { typ: "Gas", standAlt: "", standNeu: "", zaehlerNr: "" },
];

const SCHLUESSEL_DEFAULT = [
  { typ: "Wohnungsschlüssel", anzahl: 2, zurueckgegeben: false },
  { typ: "Briefkastenschlüssel", anzahl: 1, zurueckgegeben: false },
  { typ: "Kellerschlüssel", anzahl: 1, zurueckgegeben: false },
  { typ: "Haustürschlüssel", anzahl: 1, zurueckgegeben: false },
];

export function getDefaultProtokollData(mieter: Mieter, typ: "einzug" | "auszug"): UebergabeProtokollData {
  return {
    mieter,
    typ,
    datum: new Date().toISOString().split("T")[0],
    raeume: [...RAEUME_DEFAULT.map(r => ({ ...r }))],
    zaehlerstaende: [...ZAEHLER_DEFAULT.map(z => ({ ...z }))],
    schluessel: [...SCHLUESSEL_DEFAULT.map(s => ({ ...s }))],
    allgemeinzustand: "",
    maengelListe: "",
    vereinbarungen: "",
    vermieterName: "MOREImmo",
    vermieterVertreter: "",
  };
}

const zustandLabel = (z: string) => z === "gut" ? "✓ Gut" : z === "normal" ? "○ Normal" : "✗ Mängel";

export async function generateUebergabeProtokollPDF(data: UebergabeProtokollData): Promise<jsPDF> {
  const doc = new jsPDF();
  await ensureUnicodeFont(doc);
  const m = 20;
  const logo = await loadLogo();
  const title = data.typ === "einzug" ? "EINZUGSPROTOKOLL" : "AUSZUGSPROTOKOLL";
  let y = addBrandedHeader(doc, logo, title, "(Wohnungsübergabeprotokoll nach § 546 BGB)");
  const lh = 5.5;
  const pw = 170;

  const line = (text: string, bold = false, size = 10) => {
    doc.setFontSize(size);
    doc.setFont(PDF_FONT, bold ? "bold" : "normal");
    const lines = doc.splitTextToSize(text, pw);
    lines.forEach((l: string) => {
      if (y > 270) { doc.addPage(); y = 20; }
      doc.text(l, m, y);
      y += lh;
    });
  };

  const gap = (h = 3) => { y += h; };

  // Meta
  line(`Datum: ${formatDate(data.datum)}`, false, 10);
  gap(2);
  line("Vermieter:", true);
  line(data.vermieterName);
  if (data.vermieterVertreter) line(`Vertreten durch: ${data.vermieterVertreter}`);
  gap(2);
  line("Mieter:", true);
  line(`${data.mieter.vorname} ${data.mieter.nachname}`);
  if (data.mieter.strasse) line(`${data.mieter.strasse}, ${data.mieter.plz || ""} ${data.mieter.ort || ""}`);
  gap(2);
  line("Mietobjekt:", true);
  line(`${data.mieter.objektName || data.mieter.objektId} – ${data.mieter.wohneinheitName || data.mieter.wohneinheitId}`);
  gap(6);

  // 1. Raumzustand
  line("1. Zustand der Räume", true, 12);
  gap(2);

  // Table header
  const colW = [60, 25, 85];
  const tableX = m;
  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  doc.text("Raum", tableX, y);
  doc.text("Zustand", tableX + colW[0], y);
  doc.text("Mängel / Bemerkungen", tableX + colW[0] + colW[1], y);
  y += lh;
  doc.line(m, y - 2, m + pw, y - 2);

  doc.setFont(PDF_FONT, "normal");
  data.raeume.forEach(r => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.text(r.raum, tableX, y);
    doc.text(zustandLabel(r.zustand), tableX + colW[0], y);
    const mangel = r.maengel || "–";
    const mLines = doc.splitTextToSize(mangel, colW[2]);
    mLines.forEach((ml: string, i: number) => {
      doc.text(ml, tableX + colW[0] + colW[1], y + i * lh);
    });
    y += Math.max(lh, mLines.length * lh) + 1;
  });
  gap(6);

  // 2. Zählerstände
  line("2. Zählerstände", true, 12);
  gap(2);

  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  doc.text("Zähler", tableX, y);
  doc.text("Zähler-Nr.", tableX + 35, y);
  doc.text("Alter Stand", tableX + 80, y);
  doc.text("Neuer Stand", tableX + 120, y);
  y += lh;
  doc.line(m, y - 2, m + pw, y - 2);

  doc.setFont(PDF_FONT, "normal");
  data.zaehlerstaende.forEach(z => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.text(z.typ, tableX, y);
    doc.text(z.zaehlerNr || "–", tableX + 35, y);
    doc.text(z.standAlt || "–", tableX + 80, y);
    doc.text(z.standNeu || "–", tableX + 120, y);
    y += lh + 1;
  });
  gap(6);

  // 3. Schlüssel
  line("3. Schlüsselübergabe", true, 12);
  gap(2);

  doc.setFontSize(9);
  doc.setFont(PDF_FONT, "bold");
  doc.text("Schlüssel", tableX, y);
  doc.text("Anzahl", tableX + 70, y);
  if (data.typ === "auszug") doc.text("Zurückgegeben", tableX + 110, y);
  y += lh;
  doc.line(m, y - 2, m + pw, y - 2);

  doc.setFont(PDF_FONT, "normal");
  data.schluessel.forEach(s => {
    if (y > 265) { doc.addPage(); y = 20; }
    doc.text(s.typ, tableX, y);
    doc.text(String(s.anzahl), tableX + 70, y);
    if (data.typ === "auszug") doc.text(s.zurueckgegeben ? "✓ Ja" : "✗ Nein", tableX + 110, y);
    y += lh + 1;
  });
  gap(6);

  // 4. Allgemeinzustand
  if (data.allgemeinzustand) {
    line("4. Allgemeinzustand", true, 12);
    gap(2);
    line(data.allgemeinzustand);
    gap(6);
  }

  // 5. Mängelliste
  if (data.maengelListe) {
    line(`${data.allgemeinzustand ? "5" : "4"}. Festgestellte Mängel`, true, 12);
    gap(2);
    line(data.maengelListe);
    gap(6);
  }

  // 6. Vereinbarungen
  if (data.vereinbarungen) {
    const nr = (data.allgemeinzustand ? 1 : 0) + (data.maengelListe ? 1 : 0) + 4;
    line(`${nr}. Vereinbarungen`, true, 12);
    gap(2);
    line(data.vereinbarungen);
    gap(6);
  }

  // Signatures
  gap(8);
  line(`${data.mieter.ort || "München"}, den ${formatDate(data.datum)}`);
  gap(12);
  doc.line(m, y, m + 65, y);
  doc.line(m + 90, y, m + pw, y);
  y += 5;
  line("Vermieter                                                                    Mieter");

  // Branded footer on every page
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, pageCount);
  }

  return doc;
}

function formatDate(d: string) {
  if (!d) return "___________";
  const parts = d.split("-");
  if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
  return d;
}
