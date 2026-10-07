import jsPDF from "jspdf";
import { loadLogo, BRAND, PDF_FONT, ensureUnicodeFont } from "./pdfBranding";

/**
 * Eine Zahl in deutscher Schreibweise, auch wenn sie als Text aus der
 * Datenbank kommt: „4,25“ statt „4.25“. Kein Zahlwert (etwa „–“) bleibt, wie er ist.
 */
const zahlDe = (v: unknown): string => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n.toLocaleString("de-DE", { maximumFractionDigits: 2 }) : String(v ?? "");
};

const MARGIN = 16;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

const fmt = (v: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

// ── CI Farben (Projekt-CI: Hellblau #55C79C) ──
const ACCENT = BRAND.accent;          // [85,199,156] CI-Blau
const ACCENT_DARK = BRAND.accentDark; // [86,150,198]
const DARK = [28, 28, 28] as const;   // body / Headlines
const GRAY = [120, 130, 140] as const;
const LIGHT_BG = [239, 242, 244] as const; // kühles Hellgrau-Blau (--background)
const WHITE = [255, 255, 255] as const;
const GREEN = [16, 152, 122] as const;

interface ExposeObjekt {
  titel: string;
  adresse?: string;
  plz?: string;
  ort?: string;
  badge?: string;
  beschreibung?: string;
  highlights?: string[];
  bild_url?: string;
  groesse_von?: number;
  groesse_bis?: number;
  preis_von?: number;
  preis_bis?: number;
  rendite_von?: number;
  rendite_bis?: number;
  afa_satz?: number;
  afa_modell?: string;
  restnutzungsdauer?: number;
  sanierungskosten?: number;
  grundstueck_anteil?: number;
  global_objekt?: boolean;
  meta?: any;
  global_rendite?: number;
  global_kaufnebenkosten?: number;
  global_baujahr?: number;
  global_gesamt_qm?: number;
  global_etagen?: number;
  global_stellplaetze?: number;
  global_energieeffizienzklasse?: string;
  global_vermietungsstand?: number;
  global_zustand?: string;
  global_jahresnettomiete?: number;
  global_hausgeld_monat?: number;
  global_verkaufspreis?: number;
}

interface ExposeWohnung {
  we_nr?: string;
  etage?: string;
  zimmer?: number;
  groesse?: number;
  miete_gesamt?: number;
  vk_gesamt?: number;
  qm_preis?: number;
  rendite?: number;
  status?: string;
}

export interface StandortDataPdf {
  makrolage?: {
    beschreibung: string;
    einwohner: number;
    arbeitslosenquote: number;
    kaufkraftindex: number;
    mietpreis_durchschnitt_qm: number;
    highlights: string[];
  };
  objekt_koordinaten?: { lat: number; lng: number };
  arbeitgeber?: { name: string; branche: string; mitarbeiter: number; entfernung_km: number; lat?: number; lng?: number }[];
  mikrolage?: {
    kindergaerten?: { name: string; entfernung_m: number; lat?: number; lng?: number }[];
    schulen?: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
    einkaufen?: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
    apotheken?: { name: string; entfernung_m: number; lat?: number; lng?: number }[];
    aerzte?: { name: string; entfernung_m: number; lat?: number; lng?: number }[];
    oepnv?: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
    freizeit?: { name: string; typ: string; entfernung_m: number; lat?: number; lng?: number }[];
  };
}

export interface ExposeData {
  objekt: ExposeObjekt;
  bilder: { url: string; alt?: string }[];
  wohnungen: ExposeWohnung[];
  standort?: StandortDataPdf;
}

function addPageFooter(doc: jsPDF, pageNum: number) {
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text("OS Immobilien – Exposé", MARGIN, PAGE_H - 8);
  doc.text(`Seite ${pageNum}`, PAGE_W - MARGIN, PAGE_H - 8, { align: "right" });
  doc.text(new Date().toLocaleDateString("de-DE"), PAGE_W / 2, PAGE_H - 8, { align: "center" });
}

function checkPage(doc: jsPDF, y: number, needed: number, pageNum: { val: number }): number {
  if (y + needed > PAGE_H - 20) {
    addPageFooter(doc, pageNum.val);
    doc.addPage();
    pageNum.val++;
    return MARGIN + 10;
  }
  return y;
}

async function loadImage(url: string): Promise<string | null> {
  try {
    if (!url) return null;
    const resp = await fetch(url, { mode: "cors" });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateExposePdf(data: ExposeData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const obj = data.objekt;
  const freie = data.wohnungen.filter(w => w.status === "frei");
  const pageNum = { val: 1 };
  const brandLogo = await loadLogo();

  // Typ-Erkennung — bestimmt Cover-Stats, Unit-Seite, Tabelle
  const isGlobal = !!obj.global_objekt;
  const isEinzel = !!obj.meta?.einzelwohnung;
  const isMulti = !isGlobal && !isEinzel;
  const einzelWohnung = isEinzel ? data.wohnungen[0] : null;

  // ── Cover Page ──
  // Background
  doc.setFillColor(...LIGHT_BG);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  // Try to load main image
  const mainUrl = obj.bild_url || (data.bilder[0]?.url) || "";
  let resolvedUrl = mainUrl;
  if (mainUrl && !mainUrl.startsWith("http")) {
    resolvedUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${mainUrl}`;
  }
  const mainImg = resolvedUrl ? await loadImage(resolvedUrl) : null;

  if (mainImg) {
    try {
      doc.addImage(mainImg, "JPEG", 0, 0, PAGE_W, 180, undefined, "FAST");
    } catch { /* ignore image errors */ }
    // Gradient overlay
    for (let i = 0; i < 80; i++) {
      const alpha = i / 80;
      doc.setFillColor(0, 0, 0);
      doc.setGState(new (doc as any).GState({ opacity: alpha * 0.7 }));
      doc.rect(0, 100 + i, PAGE_W, 1, "F");
    }
    doc.setGState(new (doc as any).GState({ opacity: 1 }));
  } else {
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, PAGE_W, 180, "F");
  }

  // Badge
  if (obj.badge) {
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, 15, 60, 8, "F");
    doc.setFontSize(8);
    doc.setTextColor(...DARK);
    doc.setFont(PDF_FONT, "bold");
    doc.text(obj.badge.toUpperCase(), MARGIN + 30, 20.5, { align: "center" });
  }

  // Title on cover
  // Dynamically size title to fit without overlapping address/footer bar
  const maxTitleY = 175; // address sits below title, footer bar at 185
  const addrStr = [obj.adresse, obj.plz, obj.ort].filter(Boolean).join(", ");
  const addrHeight = addrStr ? 8 : 0; // space for address line
  const availableTitleHeight = maxTitleY - 120 - addrHeight; // start ~120, leave room for addr

  let titleFontSize = 26;
  let titleLinesArr: string[];
  // Reduce font size until title fits
  while (titleFontSize >= 16) {
    doc.setFontSize(titleFontSize);
    titleLinesArr = doc.splitTextToSize(obj.titel, CONTENT_W);
    const lineH = titleFontSize * 0.45; // approx line height in mm
    const totalH = titleLinesArr.length * lineH;
    if (totalH <= availableTitleHeight) break;
    titleFontSize -= 2;
  }

  doc.setFontSize(titleFontSize);
  doc.setTextColor(...WHITE);
  doc.setFont(PDF_FONT, "bold");
  titleLinesArr = doc.splitTextToSize(obj.titel, CONTENT_W);
  const titleLineH = titleFontSize * 0.45;
  const totalTitleH = titleLinesArr.length * titleLineH;
  // Position title so it ends just above the address
  const titleStartY = maxTitleY - addrHeight - totalTitleH;
  doc.text(titleLinesArr, MARGIN, titleStartY);

  // Address
  if (addrStr) {
    const addrY = titleStartY + totalTitleH + 4;
    doc.setFontSize(11);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(255, 255, 255);
    doc.text(addrStr, MARGIN, Math.min(addrY, 178));
  }

  // Footer bar – CI Akzentlinie + dunkler Block
  doc.setFillColor(ACCENT_DARK[0], ACCENT_DARK[1], ACCENT_DARK[2]);
  doc.rect(0, 183, PAGE_W, 2, "F");
  doc.setFillColor(...DARK);
  doc.rect(0, 185, PAGE_W, 30, "F");
  if (brandLogo) {
    try { doc.addImage(brandLogo, "PNG", MARGIN, 192, 50, 13); } catch { /* ignore */ }
  } else {
    doc.setFontSize(16);
    doc.setTextColor(...WHITE);
    doc.setFont(PDF_FONT, "bold");
    doc.text("OS IMMOBILIEN", MARGIN, 203);
  }
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text("EXPOSÉ", MARGIN, 211);
  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.text(new Date().toLocaleDateString("de-DE"), PAGE_W - MARGIN, 203, { align: "right" });

  // Stats below footer bar
  let y = 230;
  const statsData = isGlobal
    ? [
        { label: "Gesamtfläche", value: obj.global_gesamt_qm ? `${new Intl.NumberFormat("de-DE").format(obj.global_gesamt_qm)} m²` : "–" },
        { label: "Kaufpreis", value: obj.global_verkaufspreis ? fmt(obj.global_verkaufspreis) : "–" },
        { label: "Rendite", value: obj.global_rendite ? `${zahlDe(obj.global_rendite)} %` : (obj.rendite_von ? `${zahlDe(obj.rendite_von)} %` : "–") },
        { label: "Jahresnettomiete", value: obj.global_jahresnettomiete ? fmt(obj.global_jahresnettomiete) : "–" },
      ]
    : isEinzel && einzelWohnung
      ? [
          { label: "Wohnfläche", value: einzelWohnung.groesse ? `${zahlDe(einzelWohnung.groesse)} m²` : "–" },
          { label: "Kaufpreis", value: einzelWohnung.vk_gesamt ? fmt(einzelWohnung.vk_gesamt) : "–" },
          { label: "Rendite", value: einzelWohnung.rendite ? `${zahlDe(einzelWohnung.rendite)} %` : "–" },
          { label: "Zimmer", value: einzelWohnung.zimmer ? zahlDe(einzelWohnung.zimmer) : "–" },
        ]
      : [
          { label: "Wohnfläche", value: `${zahlDe(obj.groesse_von || "–")} bis ${zahlDe(obj.groesse_bis || "–")} m²` },
          { label: "Kaufpreis ab", value: freie.length > 0 ? fmt(Math.min(...freie.map(w => w.vk_gesamt || Infinity))) : "–" },
          { label: "Rendite", value: `${zahlDe(obj.rendite_von || "–")} bis ${zahlDe(obj.rendite_bis || "–")} %` },
          { label: "Verfügbar", value: `${freie.length} Einheiten` },
        ];

  const statW = CONTENT_W / statsData.length;
  statsData.forEach((s, i) => {
    const sx = MARGIN + i * statW;
    doc.setFillColor(...LIGHT_BG);
    doc.roundedRect(sx + 2, y, statW - 4, 28, 2, 2, "F");
    doc.setFontSize(14);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text(s.value, sx + statW / 2, y + 12, { align: "center" });
    doc.setFontSize(7);
    doc.setTextColor(...GRAY);
    doc.setFont(PDF_FONT, "normal");
    doc.text(s.label.toUpperCase(), sx + statW / 2, y + 20, { align: "center" });
  });

  addPageFooter(doc, pageNum.val);

  // ── Page 2: Willkommen / Highlights auf einen Blick ──
  doc.addPage();
  pageNum.val++;
  y = MARGIN + 5;

  // Top accent bar with logo
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, 22, "F");
  if (brandLogo) {
    try { doc.addImage(brandLogo, "PNG", MARGIN, 5, 38, 11); } catch { /* ignore */ }
  }
  doc.setFontSize(8);
  doc.setTextColor(180, 180, 180);
  doc.text("Exklusiv präsentiert von OS Immobilien", PAGE_W - MARGIN, 14, { align: "right" });
  y = 38;

  // Heading
  doc.setFillColor(...ACCENT);
  doc.rect(MARGIN, y, 40, 3, "F");
  y += 8;
  doc.setFontSize(22);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...DARK);
  doc.text("Herzlich willkommen.", MARGIN, y);
  y += 12;

  // Intro paragraph
  const introCity = obj.ort || "deiner Wunschregion";
  const introText = `Wir freuen uns, dir mit diesem Exposé ein ausgewähltes Immobilien-Investment in ${introCity} zu präsentieren. OS Immobilien begleitet dich als persönlicher Investment-Partner durch den gesamten Prozess, von der ersten Information über die Reservierung und Finanzierung bis zur notariellen Beurkundung und darüber hinaus.`;
  doc.setFontSize(10.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(74, 74, 74);
  const introLines = doc.splitTextToSize(introText, CONTENT_W);
  introLines.forEach((line: string) => { doc.text(line, MARGIN, y); y += 5.5; });
  y += 8;

  // Highlights auf einen Blick
  if (obj.highlights && obj.highlights.length > 0) {
    doc.setFontSize(14);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Die Highlights auf einen Blick", MARGIN, y);
    y += 8;

    obj.highlights.slice(0, 12).forEach(h => {
      y = checkPage(doc, y, 7, pageNum);
      doc.setFontSize(10);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...GREEN);
      doc.text("✓", MARGIN, y);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...DARK);
      const hLines = doc.splitTextToSize(h, CONTENT_W - 8);
      doc.text(hLines[0] || h, MARGIN + 6, y);
      y += 7;
    });
    y += 4;
  }

  addPageFooter(doc, pageNum.val);

  // ── Page 3: Details ──
  doc.addPage();
  pageNum.val++;
  y = MARGIN + 5;

  // Gebäudedaten
  const globalEntries: { label: string; value: string }[] = [];
  if (obj.global_baujahr) globalEntries.push({ label: "Baujahr", value: `${obj.global_baujahr}` });
  if (obj.global_gesamt_qm) globalEntries.push({ label: "Gesamtfläche", value: `${new Intl.NumberFormat("de-DE").format(obj.global_gesamt_qm)} m²` });
  if (obj.global_etagen) globalEntries.push({ label: "Etagen", value: `${obj.global_etagen}` });
  if (obj.global_stellplaetze) globalEntries.push({ label: "Stellplätze", value: `${obj.global_stellplaetze}` });
  if (obj.global_energieeffizienzklasse) globalEntries.push({ label: "Energieeffizienz", value: obj.global_energieeffizienzklasse });
  if (obj.global_vermietungsstand) globalEntries.push({ label: "Vermietungsstand", value: `${zahlDe(obj.global_vermietungsstand)} %` });
  if (obj.global_zustand) globalEntries.push({ label: "Zustand", value: obj.global_zustand });
  if (obj.sanierungskosten && obj.sanierungskosten > 0) globalEntries.push({ label: "Sanierungskosten", value: fmt(obj.sanierungskosten) });
  if (obj.global_jahresnettomiete) globalEntries.push({ label: "Jahresnettomiete", value: fmt(obj.global_jahresnettomiete) });

  if (globalEntries.length > 0) {
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Gebäudedaten", MARGIN, y);
    y += 10;

    globalEntries.forEach((g) => {
      y = checkPage(doc, y, 8, pageNum);
      doc.setFontSize(10);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...GRAY);
      doc.text(g.label, MARGIN, y);
      doc.setTextColor(...DARK);
      doc.setFont(PDF_FONT, "bold");
      doc.text(g.value, PAGE_W - MARGIN, y, { align: "right" });
      doc.setDrawColor(230, 230, 230);
      doc.line(MARGIN, y + 2, PAGE_W - MARGIN, y + 2);
      y += 8;
    });
    y += 8;
  }

  // Beschreibung (strukturiert mit #### Überschriften)
  if (obj.beschreibung) {
    y = checkPage(doc, y, 40, pageNum);
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Über das Objekt", MARGIN, y);
    y += 8;

    // Parse markdown sections
    const rawDesc = obj.beschreibung.replace(/^#{1,4}\s+/gm, "####HEADING####");
    const parts = rawDesc.split("####HEADING####");
    parts.forEach((part) => {
      const trimmed = part.trim();
      if (!trimmed) return;
      const nlIdx = trimmed.indexOf("\n");
      const firstLine = nlIdx > -1 ? trimmed.slice(0, nlIdx).trim() : trimmed;
      const rest = nlIdx > -1 ? trimmed.slice(nlIdx + 1).trim() : "";

      // Check if firstLine looks like a heading (from #### split)
      if (parts.indexOf(part) > 0 || rawDesc.startsWith("####HEADING####")) {
        // Render heading
        y = checkPage(doc, y, 12, pageNum);
        doc.setFontSize(12);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...DARK);
        doc.text(firstLine, MARGIN, y);
        y += 7;
        // Render body
        if (rest) {
          doc.setFontSize(10);
          doc.setFont(PDF_FONT, "normal");
          doc.setTextColor(74, 74, 74);
          const bodyLines = doc.splitTextToSize(rest, CONTENT_W);
          bodyLines.forEach((line: string) => {
            y = checkPage(doc, y, 6, pageNum);
            doc.text(line, MARGIN, y);
            y += 5;
          });
          y += 4;
        }
      } else {
        // Plain paragraph (intro)
        doc.setFontSize(10);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(74, 74, 74);
        const bodyLines = doc.splitTextToSize(trimmed, CONTENT_W);
        bodyLines.forEach((line: string) => {
          y = checkPage(doc, y, 6, pageNum);
          doc.text(line, MARGIN, y);
          y += 5;
        });
        y += 4;
      }
    });
    y += 4;
  }

  // Highlights
  if (obj.highlights && obj.highlights.length > 0) {
    y = checkPage(doc, y, 30, pageNum);
    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Highlights", MARGIN, y);
    y += 8;

    const halfW = CONTENT_W / 2;
    obj.highlights.forEach((h, i) => {
      const col = i % 2;
      if (col === 0) y = checkPage(doc, y, 8, pageNum);
      const x = MARGIN + col * halfW;
      doc.setFontSize(10);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...GREEN);
      doc.text("✓", x, y);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...DARK);
      const hLines = doc.splitTextToSize(h, halfW - 10);
      doc.text(hLines[0] || h, x + 6, y);
      if (col === 1) y += 7;
    });
    if (obj.highlights.length % 2 !== 0) y += 7;
    y += 5;
  }

  // ── Standortanalyse (on same page flow, no forced page breaks) ──
  const standort = data.standort;
  if (standort) {
    // Makrolage
    if (standort.makrolage) {
      y = checkPage(doc, y, 60, pageNum);
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y, 40, 3, "F");
      y += 8;
      doc.setFontSize(14);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text("Standort & Region", MARGIN, y);
      y += 10;

      // Description
      doc.setFontSize(10);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(74, 74, 74);
      const descLines = doc.splitTextToSize(standort.makrolage.beschreibung, CONTENT_W);
      descLines.forEach((line: string) => {
        y = checkPage(doc, y, 6, pageNum);
        doc.text(line, MARGIN, y);
        y += 5;
      });
      y += 6;

      // Stats grid
      const makroStats = [
        { label: "Einwohner", value: new Intl.NumberFormat("de-DE").format(standort.makrolage.einwohner) },
        { label: "Arbeitslosenquote", value: `${zahlDe(standort.makrolage.arbeitslosenquote)} %` },
        { label: "Kaufkraftindex", value: `${standort.makrolage.kaufkraftindex}` },
        { label: "∅ Miete/m²", value: `${standort.makrolage.mietpreis_durchschnitt_qm.toFixed(2)} €` },
      ];
      y = checkPage(doc, y, 26, pageNum);
      const mStatW = CONTENT_W / makroStats.length;
      makroStats.forEach((s, i) => {
        const sx = MARGIN + i * mStatW;
        doc.setFillColor(...LIGHT_BG);
        doc.roundedRect(sx + 2, y, mStatW - 4, 20, 2, 2, "F");
        doc.setFontSize(12);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...DARK);
        doc.text(s.value, sx + mStatW / 2, y + 9, { align: "center" });
        doc.setFontSize(7);
        doc.setTextColor(...GRAY);
        doc.setFont(PDF_FONT, "normal");
        doc.text(s.label.toUpperCase(), sx + mStatW / 2, y + 15, { align: "center" });
      });
      y += 26;

      // Highlights
      if (standort.makrolage.highlights.length > 0) {
        standort.makrolage.highlights.forEach(h => {
          y = checkPage(doc, y, 6, pageNum);
          doc.setFontSize(9);
          doc.setFont(PDF_FONT, "bold");
          doc.setTextColor(...GREEN);
          doc.text("✓", MARGIN, y);
          doc.setFont(PDF_FONT, "normal");
          doc.setTextColor(...DARK);
          doc.text(h, MARGIN + 6, y);
          y += 6;
        });
        y += 4;
      }
    }

    // Arbeitgeber (continues on same page flow)
    if (standort.arbeitgeber && standort.arbeitgeber.length > 0) {
      y = checkPage(doc, y, 30, pageNum);
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y, 40, 3, "F");
      y += 8;
      doc.setFontSize(14);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text("Große Arbeitgeber in der Region", MARGIN, y);
      y += 10;

      // Table header
      const agCols = [
        { label: "Unternehmen", w: 60 },
        { label: "Branche", w: 50 },
        { label: "Mitarbeiter", w: 35 },
        { label: "Entfernung", w: 33 },
      ];
      const agTotalW = agCols.reduce((s, c) => s + c.w, 0);
      const agScale = CONTENT_W / agTotalW;
      const agScaled = agCols.map(c => ({ ...c, w: c.w * agScale }));

      y = checkPage(doc, y, 8, pageNum);
      doc.setFillColor(...DARK);
      doc.rect(MARGIN, y, CONTENT_W, 8, "F");
      doc.setFontSize(7);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...WHITE);
      let agx = MARGIN;
      agScaled.forEach(c => {
        doc.text(c.label, agx + 2, y + 5.5);
        agx += c.w;
      });
      y += 8;

      standort.arbeitgeber.forEach((ag, i) => {
        y = checkPage(doc, y, 7, pageNum);
        if (i % 2 === 0) {
          doc.setFillColor(250, 248, 244);
          doc.rect(MARGIN, y, CONTENT_W, 7, "F");
        }
        doc.setFontSize(8);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...DARK);
        agx = MARGIN;
        const vals = [
          ag.name,
          ag.branche,
          new Intl.NumberFormat("de-DE").format(ag.mitarbeiter),
          `${ag.entfernung_km} km`,
        ];
        vals.forEach((v, vi) => {
          const maxW = agScaled[vi].w - 4;
          const truncated = doc.splitTextToSize(v, maxW)[0] || v;
          doc.text(truncated, agx + 2, y + 5);
          agx += agScaled[vi].w;
        });
        y += 7;
      });
      y += 5;
    }

      // ── Karte mit Mikro- & Makrostandorten ──
    {
      const mapPins: { lat: number; lng: number; style: string }[] = [];
      const ok = (lat?: number, lng?: number) =>
        typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng);

      if (ok(standort.objekt_koordinaten?.lat, standort.objekt_koordinaten?.lng)) {
        mapPins.push({ lat: standort.objekt_koordinaten!.lat, lng: standort.objekt_koordinaten!.lng, style: "ol-marker-red" });
      }
      standort.arbeitgeber?.forEach(a => { if (ok(a.lat, a.lng)) mapPins.push({ lat: a.lat!, lng: a.lng!, style: "ol-marker-blue" }); });
      const m = standort.mikrolage;
      if (m) {
        m.kindergaerten?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker" }); });
        m.schulen?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker" }); });
        m.einkaufen?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker-green" }); });
        m.apotheken?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker-green" }); });
        m.oepnv?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker-blue" }); });
        m.freizeit?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker-green" }); });
        m.aerzte?.forEach(p => { if (ok(p.lat, p.lng)) mapPins.push({ lat: p.lat!, lng: p.lng!, style: "ol-marker-green" }); });
      }

      if (mapPins.length > 0) {
        y = checkPage(doc, y, 110, pageNum);
        doc.setFillColor(...ACCENT);
        doc.rect(MARGIN, y, 40, 3, "F");
        y += 8;
        doc.setFontSize(14);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...DARK);
        doc.text("Standortkarte – Mikro- & Makrolage", MARGIN, y);
        y += 8;

        const markersParam = mapPins.slice(0, 60).map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${p.style}`).join("|");
        const mapW = 800, mapH = 480;
        const mapUrl = `https://staticmap.openstreetmap.de/staticmap.php?size=${mapW}x${mapH}&maptype=mapnik&markers=${encodeURIComponent(markersParam)}`;
        try {
          const mapImg = await loadImage(mapUrl);
          if (mapImg) {
            const renderW = CONTENT_W;
            const renderH = renderW * (mapH / mapW);
            doc.addImage(mapImg, "PNG", MARGIN, y, renderW, renderH, undefined, "FAST");
            // Border
            doc.setDrawColor(...GRAY);
            doc.setLineWidth(0.2);
            doc.rect(MARGIN, y, renderW, renderH);
            y += renderH + 4;

            // Legend
            // Bildung trug hier einen Goldton (245/158/11) passend zum
            // goldenen Kartenstift. Gold gehört nicht mehr zur Marke, deshalb
            // steht dort jetzt das helle Blau der Bildmarke.
            const legend = [
              { c: ACCENT_DARK, label: "Objekt" },
              { c: [37, 99, 235] as const, label: "Arbeitgeber / ÖPNV" },
              { c: [16, 152, 122] as const, label: "Versorgung & Freizeit" },
              { c: [48, 225, 158] as const, label: "Bildung" },
            ];
            doc.setFontSize(8);
            doc.setFont(PDF_FONT, "normal");
            let lx = MARGIN;
            legend.forEach(l => {
              doc.setFillColor(l.c[0], l.c[1], l.c[2]);
              doc.circle(lx + 2, y - 1, 1.3, "F");
              doc.setTextColor(...GRAY);
              doc.text(l.label, lx + 5, y);
              lx += doc.getTextWidth(l.label) + 14;
            });
            y += 6;
          }
        } catch { /* map optional */ }
      }
    }

    // Mikrolage
    if (standort.mikrolage) {
      y = checkPage(doc, y, 30, pageNum);
      doc.setFillColor(...ACCENT);
      doc.rect(MARGIN, y, 40, 3, "F");
      y += 8;
      doc.setFontSize(14);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text("Infrastruktur & Mikrolage", MARGIN, y);
      y += 10;

      const categories: { title: string; items: { name: string; detail: string }[] }[] = [];
      if (standort.mikrolage.kindergaerten?.length) categories.push({ title: "Kindergärten", items: standort.mikrolage.kindergaerten.map(k => ({ name: k.name, detail: `${k.entfernung_m} m` })) });
      if (standort.mikrolage.schulen?.length) categories.push({ title: "Schulen", items: standort.mikrolage.schulen.map(s => ({ name: s.name, detail: `${s.typ} · ${s.entfernung_m} m` })) });
      if (standort.mikrolage.einkaufen?.length) categories.push({ title: "Einkaufen", items: standort.mikrolage.einkaufen.map(e => ({ name: e.name, detail: `${e.typ} · ${e.entfernung_m} m` })) });
      if (standort.mikrolage.apotheken?.length) categories.push({ title: "Apotheken", items: standort.mikrolage.apotheken.map(a => ({ name: a.name, detail: `${a.entfernung_m} m` })) });
      if (standort.mikrolage.aerzte?.length) categories.push({ title: "Ärzte & Gesundheit", items: standort.mikrolage.aerzte.map(a => ({ name: a.name, detail: `${a.entfernung_m} m` })) });
      if (standort.mikrolage.oepnv?.length) categories.push({ title: "ÖPNV", items: standort.mikrolage.oepnv.map(o => ({ name: o.name, detail: `${o.typ} · ${o.entfernung_m} m` })) });
      if (standort.mikrolage.freizeit?.length) categories.push({ title: "Freizeit & Erholung", items: standort.mikrolage.freizeit.map(f => ({ name: f.name, detail: `${f.typ} · ${f.entfernung_m} m` })) });

      categories.forEach(cat => {
        y = checkPage(doc, y, 20, pageNum);
        doc.setFontSize(11);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...DARK);
        doc.text(cat.title, MARGIN, y);
        y += 6;

        // So viele Orte, wie die Messung hat: bis zu zehn je Liste, bei Kitas, Schulen und Apotheken bis zu fünf.
        cat.items.slice(0, 10).forEach(item => {
          y = checkPage(doc, y, 5, pageNum);
          doc.setFontSize(8);
          doc.setFont(PDF_FONT, "normal");
          doc.setTextColor(...DARK);
          doc.text(`• ${item.name}`, MARGIN + 4, y);
          doc.setTextColor(...GRAY);
          doc.text(item.detail, PAGE_W - MARGIN, y, { align: "right" });
          y += 5;
        });
        y += 4;
      });
    }
  }

  addPageFooter(doc, pageNum.val);

  // ── Page 3: Wohneinheiten / Investment-Kennzahlen ──
  if (isGlobal) {
    // Globalobjekt — keine Einzeleinheiten, dafür Investment-Kennzahlen
    doc.addPage();
    pageNum.val++;
    y = MARGIN + 5;

    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Gesamtinvestment", MARGIN, y);
    y += 12;

    const invEntries: { label: string; value: string }[] = [];
    if (obj.global_verkaufspreis) invEntries.push({ label: "Verkaufspreis gesamt", value: fmt(obj.global_verkaufspreis) });
    if (obj.global_gesamt_qm) invEntries.push({ label: "Gesamt-Wohnfläche", value: `${new Intl.NumberFormat("de-DE").format(obj.global_gesamt_qm)} m²` });
    if (obj.global_jahresnettomiete) invEntries.push({ label: "Jahresnettomiete", value: fmt(obj.global_jahresnettomiete) });
    if (obj.global_rendite) invEntries.push({ label: "Rendite", value: `${zahlDe(obj.global_rendite)} %` });
    if (obj.global_hausgeld_monat) invEntries.push({ label: "Hausgeld / Monat", value: fmt(obj.global_hausgeld_monat) });
    if (obj.global_kaufnebenkosten) invEntries.push({ label: "Kaufnebenkosten", value: `${zahlDe(obj.global_kaufnebenkosten)} %` });
    if (obj.global_vermietungsstand) invEntries.push({ label: "Vermietungsstand", value: `${zahlDe(obj.global_vermietungsstand)} %` });
    if (obj.global_etagen) invEntries.push({ label: "Etagen", value: `${obj.global_etagen}` });

    const halfWI = CONTENT_W / 2 - 3;
    invEntries.forEach((a, i) => {
      const col = i % 2;
      const ax = MARGIN + col * (halfWI + 6);
      if (col === 0) y = checkPage(doc, y, 16, pageNum);
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(ax, y, halfWI, 14, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...GRAY);
      doc.text(a.label, ax + 4, y + 6);
      doc.setFontSize(11);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text(a.value, ax + halfWI - 4, y + 6, { align: "right" });
      if (col === 1) y += 18;
    });
    if (invEntries.length % 2 !== 0) y += 18;

    addPageFooter(doc, pageNum.val);
  } else if (isEinzel && einzelWohnung) {
    // Einzelwohnung — nur 1 Steckbrief, keine Tabelle
    doc.addPage();
    pageNum.val++;
    y = MARGIN + 5;

    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Die Wohnung", MARGIN, y);
    y += 10;

    const w = einzelWohnung;
    const cells = [
      { label: "Wohnfläche", value: w.groesse ? `ca. ${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(w.groesse)} m²` : "–" },
      { label: "Räumlichkeiten", value: w.zimmer ? `${zahlDe(w.zimmer)} Zimmer` : "–" },
      { label: "Etage", value: w.etage || "–" },
      { label: "Kaufpreis", value: w.vk_gesamt ? fmt(w.vk_gesamt) : "–" },
    ];
    const cellW = CONTENT_W / cells.length;
    cells.forEach((c, i) => {
      const sx = MARGIN + i * cellW;
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(sx + 1, y, cellW - 2, 18, 2, 2, "F");
      doc.setFontSize(7);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...GRAY);
      doc.text(c.label.toUpperCase(), sx + cellW / 2, y + 6, { align: "center" });
      doc.setFontSize(12);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text(c.value, sx + cellW / 2, y + 14, { align: "center" });
    });
    y += 24;

    const extra: { label: string; value: string }[] = [];
    if (w.qm_preis) extra.push({ label: "€ / m²", value: fmt(w.qm_preis) });
    if (w.miete_gesamt) extra.push({ label: "Miete / Monat", value: fmt(w.miete_gesamt) });
    if (w.rendite) extra.push({ label: "Rendite", value: `${zahlDe(w.rendite)} %` });
    if (w.we_nr) extra.push({ label: "WE-Nr.", value: w.we_nr });

    const halfWE = CONTENT_W / 2 - 3;
    extra.forEach((a, i) => {
      const col = i % 2;
      const ax = MARGIN + col * (halfWE + 6);
      if (col === 0) y = checkPage(doc, y, 14, pageNum);
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(ax, y, halfWE, 12, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...GRAY);
      doc.text(a.label, ax + 4, y + 5);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text(a.value, ax + halfWE - 4, y + 5, { align: "right" });
      if (col === 1) y += 16;
    });

    addPageFooter(doc, pageNum.val);
  } else if (freie.length > 0) {
    doc.addPage();
    pageNum.val++;
    y = MARGIN + 5;

    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text(`Verfügbare Einheiten (${freie.length})`, MARGIN, y);
    y += 10;

    // ── Steckbrief je Wohnung (Wohnung 1, Wohnung 2 …) ──
    freie.slice(0, 8).forEach((w, idx) => {
      y = checkPage(doc, y, 28, pageNum);

      // Titel
      doc.setFontSize(11);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text(`WOHNUNG ${idx + 1}${w.we_nr ? ` · WE ${w.we_nr}` : ""}`, MARGIN, y);
      y += 5;

      // 4-Spalten-Block: Wohnfläche | Zimmer | Etage | Status
      const cells = [
        { label: "Wohnfläche", value: w.groesse ? `ca. ${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(w.groesse)} m²` : "–" },
        { label: "Räumlichkeiten", value: w.zimmer ? `${zahlDe(w.zimmer)} Zimmer` : "–" },
        { label: "Etage", value: w.etage || "–" },
        { label: "Kaufpreis", value: w.vk_gesamt ? fmt(w.vk_gesamt) : "–" },
      ];
      const cellW = CONTENT_W / cells.length;
      cells.forEach((c, i) => {
        const sx = MARGIN + i * cellW;
        doc.setFillColor(...LIGHT_BG);
        doc.roundedRect(sx + 1, y, cellW - 2, 14, 1.5, 1.5, "F");
        doc.setFontSize(7);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...GRAY);
        doc.text(c.label.toUpperCase(), sx + cellW / 2, y + 5, { align: "center" });
        doc.setFontSize(10);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...DARK);
        doc.text(c.value, sx + cellW / 2, y + 11, { align: "center" });
      });
      y += 18;
    });
    y += 4;

    // Table header
    const cols = [
      { label: "WE-Nr.", w: 22 },
      { label: "Etage", w: 18 },
      { label: "Zi.", w: 12 },
      { label: "Fläche", w: 22 },
      { label: "Miete ges.", w: 26 },
      { label: "Kaufpreis", w: 28 },
      { label: "€/m²", w: 24 },
      { label: "Rendite", w: 20 },
    ];
    const totalColW = cols.reduce((s, c) => s + c.w, 0);
    const scale = CONTENT_W / totalColW;
    const scaledCols = cols.map(c => ({ ...c, w: c.w * scale }));

    // Header row
    doc.setFillColor(...DARK);
    doc.rect(MARGIN, y, CONTENT_W, 8, "F");
    doc.setFontSize(7);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...WHITE);
    let cx = MARGIN;
    scaledCols.forEach(c => {
      doc.text(c.label, cx + 2, y + 5.5);
      cx += c.w;
    });
    y += 8;

    // Data rows
    freie.forEach((w, i) => {
      y = checkPage(doc, y, 7, pageNum);
      if (i % 2 === 0) {
        doc.setFillColor(250, 248, 244);
        doc.rect(MARGIN, y, CONTENT_W, 7, "F");
      }
      doc.setFontSize(8);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...DARK);
      cx = MARGIN;
      const vals = [
        w.we_nr || "–",
        w.etage || "–",
        w.zimmer ? zahlDe(w.zimmer) : "–",
        w.groesse ? `${zahlDe(w.groesse)} m²` : "–",
        w.miete_gesamt ? fmt(w.miete_gesamt) : "–",
        w.vk_gesamt ? fmt(w.vk_gesamt) : "–",
        w.qm_preis ? fmt(w.qm_preis) : "–",
        w.rendite ? `${zahlDe(w.rendite)} %` : "–",
      ];
      vals.forEach((v, vi) => {
        doc.text(v, cx + 2, y + 5);
        cx += scaledCols[vi].w;
      });
      y += 7;
    });

    addPageFooter(doc, pageNum.val);
  }

  // ── Page 4: AfA ──
  const afaSatz = obj.afa_satz || 0;
  const sanierung = obj.sanierungskosten || 0;
  if (afaSatz > 0 || sanierung > 0) {
    doc.addPage();
    pageNum.val++;
    y = MARGIN + 5;

    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("AfA & Steuervorteile", MARGIN, y);
    y += 12;

    const afaEntries = [
      { label: "AfA-Modell", value: obj.afa_modell || "Linear" },
      { label: "AfA-Satz", value: `${zahlDe(afaSatz)} %` },
      { label: "Restnutzungsdauer", value: `${obj.restnutzungsdauer || 50} Jahre` },
      { label: "Grundstücksanteil", value: `${zahlDe(obj.grundstueck_anteil || 20)} %` },
    ];
    if (sanierung > 0) afaEntries.push({ label: "Sanierungskosten", value: fmt(sanierung) });

    const halfW = CONTENT_W / 2 - 3;
    afaEntries.forEach((a, i) => {
      const col = i % 2;
      const ax = MARGIN + col * (halfW + 6);
      if (col === 0) y = checkPage(doc, y, 14, pageNum);
      doc.setFillColor(...LIGHT_BG);
      doc.roundedRect(ax, y, halfW, 12, 2, 2, "F");
      doc.setFontSize(9);
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(...GRAY);
      doc.text(a.label, ax + 4, y + 5);
      doc.setFont(PDF_FONT, "bold");
      doc.setTextColor(...DARK);
      doc.text(a.value, ax + halfW - 4, y + 5, { align: "right" });
      if (col === 1) y += 16;
    });
    if (afaEntries.length % 2 !== 0) y += 16;

    addPageFooter(doc, pageNum.val);
  }

  // ── Gallery Page ──
  if (data.bilder.length > 1) {
    doc.addPage();
    pageNum.val++;
    y = MARGIN + 5;

    doc.setFillColor(...ACCENT);
    doc.rect(MARGIN, y, 40, 3, "F");
    y += 8;
    doc.setFontSize(16);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...DARK);
    doc.text("Bildergalerie", MARGIN, y);
    y += 10;

    const galImages = data.bilder.slice(0, 6);
    for (let i = 0; i < galImages.length; i++) {
      const col = i % 2;
      if (col === 0) y = checkPage(doc, y, 70, pageNum);
      let imgUrl = galImages[i].url;
      if (imgUrl && !imgUrl.startsWith("http")) {
        imgUrl = `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${imgUrl}`;
      }
      try {
        const imgData = await loadImage(imgUrl);
        if (imgData) {
          const gw = CONTENT_W / 2 - 3;
          const gx = MARGIN + col * (gw + 6);
          doc.addImage(imgData, "JPEG", gx, y, gw, 60, undefined, "FAST");
        }
      } catch { /* skip */ }
      if (col === 1) y += 65;
    }
    if (galImages.length % 2 !== 0) y += 65;

    addPageFooter(doc, pageNum.val);
  }

  // ── Ansprechpartner / Kontakt-Seite ──
  doc.addPage();
  pageNum.val++;

  // Dunkler Hintergrund
  doc.setFillColor(...DARK);
  doc.rect(0, 0, PAGE_W, PAGE_H, "F");

  // Logo oben mittig
  if (brandLogo) {
    try { doc.addImage(brandLogo, "PNG", PAGE_W / 2 - 28, 35, 56, 15); } catch { /* ignore */ }
  } else {
    doc.setFontSize(22);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...WHITE);
    doc.text("OS IMMOBILIEN", PAGE_W / 2, 45, { align: "center" });
  }

  // Akzentlinie
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.6);
  doc.line(PAGE_W / 2 - 30, 58, PAGE_W / 2 + 30, 58);

  // Headline
  doc.setFontSize(22);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...WHITE);
  doc.text("Dein Ansprechpartner", PAGE_W / 2, 80, { align: "center" });

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(210, 210, 210);
  doc.text("Persönliche Betreuung – von der ersten Information bis", PAGE_W / 2, 92, { align: "center" });
  doc.text("zur notariellen Beurkundung und darüber hinaus.", PAGE_W / 2, 98, { align: "center" });

  // Kontakt-Karte
  const cardY = 120;
  const cardW = 130;
  const cardX = (PAGE_W - cardW) / 2;
  doc.setFillColor(40, 40, 40);
  doc.roundedRect(cardX, cardY, cardW, 60, 3, 3, "F");

  doc.setFontSize(14);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...WHITE);
  doc.text("OS Immobilien", PAGE_W / 2, cardY + 14, { align: "center" });

  doc.setFontSize(10);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(180, 180, 180);
  doc.text("Am Ostbahnhof 1", PAGE_W / 2, cardY + 24, { align: "center" });
  doc.text("15749 Mittenwalde", PAGE_W / 2, cardY + 30, { align: "center" });

  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.3);
  doc.line(cardX + 20, cardY + 38, cardX + cardW - 20, cardY + 38);

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...ACCENT);
  doc.text("osimmobilien.netlify.app", PAGE_W / 2, cardY + 48, { align: "center" });
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(210, 210, 210);
  doc.text("os@os-immobilien.com", PAGE_W / 2, cardY + 55, { align: "center" });

  // Disclaimer
  doc.setFontSize(8);
  doc.setFont(PDF_FONT, "italic");
  doc.setTextColor(150, 150, 150);
  const disc = "Diese Unterlagen dienen ausschließlich zur Erstinformation und stellen kein verbindliches Angebot dar. Alle Angaben beruhen auf Informationen unseres Auftraggebers; eine Haftung für deren Richtigkeit und Vollständigkeit kann nicht übernommen werden.";
  const discLines = doc.splitTextToSize(disc, CONTENT_W);
  let dy = PAGE_H - 30;
  discLines.forEach((l: string) => { doc.text(l, PAGE_W / 2, dy, { align: "center" }); dy += 4.2; });

  return doc.output("blob");
}
