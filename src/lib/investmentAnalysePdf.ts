import { PDF_FONT, ensureUnicodeFont } from "./pdfBranding";
import jsPDF from "jspdf";
import { SPRACH_LOCALE, datumText, type FormatSprache } from "./sprachFormat";


const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;

// OS Immobilien CI: dunkles Marineblau als Grundton, Blau 600 als Akzent.
// Vorher stand hier ein Goldton (180/155/100) samt cremefarbener Fläche.
// Gold gehört nicht mehr zur Marke, deshalb liegen Linien und Flächen
// jetzt auf derselben Blaufamilie wie das übrige Haus.
const BRAND_DARK: [number, number, number] = [20, 30, 50];
const BRAND_ACCENT: [number, number, number] = [21, 114, 79]; // #15724F, Blau 600
const TEXT_PRIMARY: [number, number, number] = [30, 30, 30];
const TEXT_SECONDARY: [number, number, number] = [100, 100, 100];
const BG_LIGHT: [number, number, number] = [248, 248, 248];
const BG_ACCENT: [number, number, number] = [240, 249, 255]; // #F0F9FF, Blau 50
const LINE_COLOR: [number, number, number] = [200, 200, 200];

const LOGO_URL = "/images/moreimmo-logo.png";

interface Tranche {
  bezeichnung: string;
  betrag: number;
  zinssatz: number;
  tilgung: number;
}

interface JahresZeile {
  jahr: number;
  afa: number;
  zinsen: number;
  tilgung: number;
  hausgeldNu: number;
  abzuegeSumme: number;
  steuerlichesErgebnis: number;
  steuerersparnis: number;
  miete: number;
  cashflowBrutto: number;
  cashflowNetto: number;
  eigenbelastungVorSteuer: number;
  eigenbelastungNachSteuer: number;
  tilgungKumuliert: number;
  wertsteigerungJahr: number;
  vermoegenAufbau: number;
  vermoegenKumuliert: number;
  restschuld: number;
  immobilienWert: number;
  renditeNachSteuer: number;
}

export interface InvestmentPdfData {
  objektTitel: string;
  weNr?: string;
  modus: "objekt" | "wohnung";
  kaufpreis: number;
  mieteMonat: number;
  groesse: number;
  nkPct: number;
  hausgeldMonat: number;
  hausgeldUmlagefaehig: number;
  hausgeldNichtUmlagefaehig: number;
  eigenkapital: number;
  sanierungskosten: number;
  sanierungAnteil: number;
  grundAnteilPct: number;
  gebaeudeAnteilPct: number;
  gebaeudeWert: number;
  afaModell: string;
  afaSatz: number;
  effektiverAfaSatz: number;
  restnutzungsdauer: number;
  afaJahr: number;
  afaGesamt: number;
  tranchen: Tranche[];
  gesamtDarlehen: number;
  gewichteterZins: number;
  gewichteteTilgung: number;
  monatsrate: number;
  steuersatz: number;
  mietSteigerung: number;
  wertSteigerung: number;
  betrachtungszeitraum: number;
  berechnung: JahresZeile[];
  totalSteuerersparnis: number;
  totalCashflow: number;
  avgRendite: number;
  showModernisierung?: boolean;
  umlagePct?: number;
  erlaubteUmlage?: number;
  neueMiete?: number;
  deckelProQm?: number;
}

async function loadLogoAsBase64(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) return null;
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

/* ───── Helpers ───── */

let pageNum = 0;
/** Die Wörter der Fußzeile, je Lauf aus der Sprache gesetzt wie `pageNum`. */
let fussTexte = { seite: (n: number) => `Seite ${n}`, vertraulich: "OS Immobilien  •  Vertraulich" };

function addFooter(doc: jsPDF) {
  pageNum++;
  doc.setFontSize(7);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...TEXT_SECONDARY);
  doc.text(fussTexte.seite(pageNum), PAGE_W - MARGIN, PAGE_H - 10, { align: "right" });
  doc.text(fussTexte.vertraulich, MARGIN, PAGE_H - 10);
  doc.setDrawColor(...LINE_COLOR);
  doc.line(MARGIN, PAGE_H - 14, PAGE_W - MARGIN, PAGE_H - 14);
}

function checkPage(doc: jsPDF, y: number, needed = 20): number {
  if (y + needed > PAGE_H - 20) {
    addFooter(doc);
    doc.addPage();
    return 22;
  }
  return y;
}

function sectionHeader(doc: jsPDF, y: number, title: string, sectionNum?: string): number {
  y = checkPage(doc, y, 16);
  // Accent line
  doc.setDrawColor(...BRAND_ACCENT);
  doc.setLineWidth(0.8);
  doc.line(MARGIN, y - 2, MARGIN + 22, y - 2);
  doc.setLineWidth(0.2);

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...BRAND_DARK);
  doc.text(title, MARGIN, y + 3);
  y += 5;
  doc.setDrawColor(...LINE_COLOR);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setTextColor(...TEXT_PRIMARY);
  return y + 6;
}

function dataRow(doc: jsPDF, y: number, label: string, val: string, opts?: { bold?: boolean; indent?: number; highlight?: boolean }): number {
  y = checkPage(doc, y, 5);
  const indent = opts?.indent ?? 0;
  if (opts?.highlight) {
    doc.setFillColor(...BG_ACCENT);
    doc.rect(MARGIN, y - 3.2, CONTENT_W, 5, "F");
  }
  doc.setFontSize(8.5);
  doc.setFont(PDF_FONT, opts?.bold ? "bold" : "normal");
  doc.setTextColor(...TEXT_PRIMARY);
  doc.text(label, MARGIN + 2 + indent, y);
  doc.text(val, PAGE_W - MARGIN - 2, y, { align: "right" });
  return y + 4.8;
}

function separator(doc: jsPDF, y: number): number {
  doc.setDrawColor(230, 230, 230);
  doc.line(MARGIN + 2, y - 1, PAGE_W - MARGIN - 2, y - 1);
  return y + 2;
}

function kpiBox(doc: jsPDF, y: number, items: { label: string; value: string }[]): number {
  y = checkPage(doc, y, 18);
  const boxH = 14;
  // Dark background
  doc.setFillColor(...BRAND_DARK);
  doc.roundedRect(MARGIN, y - 3, CONTENT_W, boxH, 2, 2, "F");
  const colW = CONTENT_W / items.length;
  items.forEach((item, i) => {
    const x = MARGIN + colW * i + colW / 2;
    doc.setFontSize(6.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(180, 180, 180);
    doc.text(item.label, x, y + 1.5, { align: "center" });
    doc.setFontSize(9);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(item.value, x, y + 7, { align: "center" });
  });
  doc.setTextColor(...TEXT_PRIMARY);
  return y + boxH + 5;
}

function summaryBox(doc: jsPDF, y: number, items: { label: string; value: string }[]): number {
  y = checkPage(doc, y, 14);
  const boxH = 12;
  doc.setFillColor(...BG_LIGHT);
  doc.setDrawColor(...LINE_COLOR);
  doc.roundedRect(MARGIN, y - 3, CONTENT_W, boxH, 2, 2, "FD");
  const colW = CONTENT_W / items.length;
  items.forEach((item, i) => {
    const x = MARGIN + colW * i + colW / 2;
    doc.setFontSize(6.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...TEXT_SECONDARY);
    doc.text(item.label, x, y + 1, { align: "center" });
    doc.setFontSize(8.5);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...TEXT_PRIMARY);
    doc.text(item.value, x, y + 6, { align: "center" });
  });
  doc.setTextColor(...TEXT_PRIMARY);
  return y + boxH + 4;
}

/* ───── Texte je Sprache ───── */

/*
 * Plan Kundensprache vom 25.09.2026, Etappe 5 (D14). Die deutschen Texte
 * sind die bisherigen; die Gedankenstriche in Titel und Überschriften sind
 * dabei Doppelpunkten und Kommas gewichen, weil sie in Nutzertexten nicht
 * stehen dürfen. Begriffe nach `src/lib/kundenspracheGlossar.ts`.
 */
export interface AnalyseTexte {
  seite: (n: number) => string;
  vertraulich: string;
  titel: string;
  umlageLabel: string;
  untertitelWe: (objekt: string, we: string) => string;
  erstellt: (datum: string, jahre: number) => string;
  kpiKaufpreis: string;
  kpiMiete: string;
  kpiBrutto: string;
  kpiNetto: string;
  basis: string;
  kaufpreis: string;
  mieteMonat: string;
  mieteJahr: string;
  wohnflaeche: string;
  mieteQm: string;
  kaufpreisQm: string;
  nebenkosten: string;
  eigenkapital: string;
  sanierungAnteil: string;
  sanierungGesamt: string;
  hausgeld: string;
  umlagefaehig: string;
  nichtUmlagefaehig: string;
  modernisierung: string;
  umlageAnteil: (pct: number) => string;
  deckel: string;
  erlaubteUmlage: string;
  aktuelleMiete: string;
  neueMiete: string;
  afaTitel: string;
  grundAnteil: string;
  gebaeudeAnteil: string;
  afaModell: string;
  afaModelle: { linear: string; degressiv: string; gutachten: string };
  restnutzung: string;
  jahre: (n: number) => string;
  afaSatz: string;
  afaJahr: string;
  afaGesamt: string;
  finanzierung: string;
  tranche: (nr: number, bezeichnung: string) => string;
  betrag: string;
  zinssatz: string;
  tilgung: string;
  darlehen: string;
  mischzins: string;
  tilgungSchnitt: string;
  monatsrate: string;
  steuerTitel: string;
  steuersatz: string;
  mietsteigerung: string;
  wertsteigerung: string;
  nettoaufwand: string;
  annuitaet: string;
  mieteDeckt: string;
  derRate: (pct: number) => string;
  eigenVor: string;
  eigenNach: string;
  liquiditaet: string;
  cfVor: string;
  steuerJahr: string;
  cfNach: string;
  vermoegen: string;
  tilgungJahr: string;
  wertJahr: string;
  aufbauJahr: string;
  vermoegenGesamt: (jahre: number) => string;
  wertNach: (jahre: number) => string;
  kennzahlen: string;
  kpiAfa: string;
  kpiSteuer: string;
  kpiCf: string;
  kpiVermoegen: string;
  afaSatzGebaeude: (satz: string, anteil: number) => string;
  brutto: string;
  renditeNach: string;
  jahresuebersicht: string;
  spalten: string[];
  hinweisTitel: string;
  hinweis: string[];
  datei: string;
}

const ANALYSE_TEXTE_DE: AnalyseTexte = {
  seite: (n) => `Seite ${n}`,
  vertraulich: "OS Immobilien  •  Vertraulich",
  titel: "INVESTMENT-ANALYSE",
  umlageLabel: "Umlagefähiger Anteil:",
  untertitelWe: (objekt, we) => `${objekt}, Wohneinheit ${we}`,
  erstellt: (datum, jahre) => `Erstellt am ${datum}  |  Betrachtungszeitraum: ${jahre} Jahre`,
  kpiKaufpreis: "Kaufpreis",
  kpiMiete: "Miete mtl.",
  kpiBrutto: "Bruttorendite",
  kpiNetto: "Nettoaufwand mtl.",
  basis: "Basisdaten",
  kaufpreis: "Kaufpreis:",
  mieteMonat: "Miete monatlich:",
  mieteJahr: "Miete jährlich:",
  wohnflaeche: "Wohnfläche:",
  mieteQm: "Miete pro m²:",
  kaufpreisQm: "Kaufpreis pro m²:",
  nebenkosten: "Kaufnebenkosten:",
  eigenkapital: "Eigenkapital (reduziert Kaufpreis):",
  sanierungAnteil: "Sanierungskosten (Anteil):",
  sanierungGesamt: "Sanierungskosten gesamt:",
  hausgeld: "Hausgeld mtl.",
  umlagefaehig: "Umlagefähig",
  nichtUmlagefaehig: "Nicht umlagef.",
  modernisierung: "Modernisierungsumlage (§559 BGB)",
  umlageAnteil: (pct) => `${pct} % der Sanierungskosten p.a.`,
  deckel: "Deckel pro m²:",
  erlaubteUmlage: "Erlaubte Umlage / Monat:",
  aktuelleMiete: "Aktuelle Miete:",
  neueMiete: "Neue Miete nach Umlage:",
  afaTitel: "Grund & Boden / AfA-Modell",
  grundAnteil: "Grundstücksanteil:",
  gebaeudeAnteil: "Gebäudeanteil:",
  afaModell: "AfA-Modell:",
  afaModelle: { linear: "Linear", degressiv: "Degressiv", gutachten: "RND-Gutachten" },
  restnutzung: "Restnutzungsdauer:",
  jahre: (n) => `${n} Jahre`,
  afaSatz: "AfA-Satz:",
  afaJahr: "AfA pro Jahr (Gebäude):",
  afaGesamt: "AfA pro Jahr (inkl. Sanierung):",
  finanzierung: "Finanzierung / Mischzins",
  tranche: (nr, bezeichnung) => `Tranche ${nr}${bezeichnung ? `: ${bezeichnung}` : ""}`,
  betrag: "Betrag:",
  zinssatz: "Zinssatz:",
  tilgung: "Tilgung:",
  darlehen: "Darlehen gesamt",
  mischzins: "Mischzins",
  tilgungSchnitt: "Ø Tilgung",
  monatsrate: "Monatsrate",
  steuerTitel: "Steuerliche Parameter",
  steuersatz: "Persönlicher Steuersatz:",
  mietsteigerung: "Mietsteigerung p.a.:",
  wertsteigerung: "Wertsteigerung p.a.:",
  nettoaufwand: "Monatlicher Nettoaufwand",
  annuitaet: "Monatsrate (Annuität):",
  mieteDeckt: "Miete deckt:",
  derRate: (pct) => `${pct} % der Rate`,
  eigenVor: "Eigenbelastung vor Steuer / Monat:",
  eigenNach: "Eigenbelastung nach Steuer / Monat:",
  liquiditaet: "Bereich 1: Liquidität",
  cfVor: "Cashflow vor Steuer / Monat:",
  steuerJahr: "Steuerersparnis / Jahr:",
  cfNach: "Cashflow nach Steuer / Monat:",
  vermoegen: "Bereich 2: Vermögensentwicklung",
  tilgungJahr: "Tilgung / Jahr (1. Jahr):",
  wertJahr: "Wertsteigerung / Jahr (1. Jahr):",
  aufbauJahr: "Vermögensaufbau / Jahr (1. Jahr):",
  vermoegenGesamt: (jahre) => `Vermögen gesamt (nach ${jahre} J.):`,
  wertNach: (jahre) => `Immobilienwert (nach ${jahre} J.):`,
  kennzahlen: "Investment-Kennzahlen",
  kpiAfa: "AfA p.a. (inkl. San.)",
  kpiSteuer: "Steuerersparnis ges.",
  kpiCf: "Cashflow netto ges.",
  kpiVermoegen: "Vermögen ges.",
  afaSatzGebaeude: (satz, anteil) => `${satz} · ${anteil} % Gebäude`,
  brutto: "Bruttorendite:",
  renditeNach: "Ø Rendite nach Steuer:",
  jahresuebersicht: "Detaillierte Jahresübersicht",
  spalten: ["Jahr", "Miete", "AfA", "Zinsen", "Steuervort.", "CF brutto", "CF netto", "Netto n.St.", "Restschuld", "Vermögen"],
  hinweisTitel: "⚠  Wichtiger Hinweis",
  hinweis: [
    "Diese Berechnung dient ausschließlich als grobe Einschätzung und ersetzt keine individuelle steuerliche Beratung.",
    "Alle Werte sind Näherungen. Die tatsächliche steuerliche Auswirkung hängt von vielen individuellen Faktoren ab.",
    "Bitte konsultiere einen Steuerberater für eine verbindliche Auskunft. Alle Angaben ohne Gewähr.",
  ],
  datei: "Investment-Analyse",
};

const ANALYSE_TEXTE_EN: AnalyseTexte = {
  seite: (n) => `Page ${n}`,
  vertraulich: "OS Immobilien  •  Confidential",
  titel: "INVESTMENT ANALYSIS",
  umlageLabel: "Recoverable share:",
  untertitelWe: (objekt, we) => `${objekt}, unit ${we}`,
  erstellt: (datum, jahre) => `Prepared on ${datum}  |  Period under review: ${jahre} years`,
  kpiKaufpreis: "Purchase price",
  kpiMiete: "Rent p.m.",
  kpiBrutto: "Gross rental yield",
  kpiNetto: "Net cost p.m.",
  basis: "Basic data",
  kaufpreis: "Purchase price:",
  mieteMonat: "Monthly rent:",
  mieteJahr: "Annual rent:",
  wohnflaeche: "Living space:",
  mieteQm: "Rent per m²:",
  kaufpreisQm: "Purchase price per m²:",
  nebenkosten: "Incidental purchase costs:",
  eigenkapital: "Equity (reduces purchase price):",
  sanierungAnteil: "Renovation costs (share):",
  sanierungGesamt: "Renovation costs in total:",
  hausgeld: "Service charge p.m.",
  umlagefaehig: "Recoverable",
  nichtUmlagefaehig: "Non-recoverable",
  modernisierung: "Modernisation levy (Section 559 BGB)",
  umlageAnteil: (pct) => `${pct}% of renovation costs p.a.`,
  deckel: "Cap per m²:",
  erlaubteUmlage: "Permitted levy / month:",
  aktuelleMiete: "Current rent:",
  neueMiete: "New rent after levy:",
  afaTitel: "Land / depreciation (AfA) model",
  grundAnteil: "Land share:",
  gebaeudeAnteil: "Building share:",
  afaModell: "Depreciation model:",
  afaModelle: { linear: "Straight-line", degressiv: "Declining-balance", gutachten: "Remaining useful life appraisal" },
  restnutzung: "Remaining useful life:",
  jahre: (n) => `${n} years`,
  afaSatz: "Depreciation rate:",
  afaJahr: "Depreciation per year (building):",
  afaGesamt: "Depreciation per year (incl. renovation):",
  finanzierung: "Financing / blended interest rate",
  tranche: (nr, bezeichnung) => `Tranche ${nr}${bezeichnung ? `: ${bezeichnung}` : ""}`,
  betrag: "Amount:",
  zinssatz: "Interest rate:",
  tilgung: "Repayment:",
  darlehen: "Total loan",
  mischzins: "Blended rate",
  tilgungSchnitt: "Ø repayment",
  monatsrate: "Monthly instalment",
  steuerTitel: "Tax parameters",
  steuersatz: "Personal tax rate:",
  mietsteigerung: "Rent increase p.a.:",
  wertsteigerung: "Increase in value p.a.:",
  nettoaufwand: "Monthly net cost",
  annuitaet: "Monthly instalment (annuity):",
  mieteDeckt: "Rent covers:",
  derRate: (pct) => `${pct}% of the instalment`,
  eigenVor: "Own contribution before tax / month:",
  eigenNach: "Own contribution after tax / month:",
  liquiditaet: "Area 1: Liquidity",
  cfVor: "Cash flow before tax / month:",
  steuerJahr: "Tax relief / year:",
  cfNach: "Cash flow after tax / month:",
  vermoegen: "Area 2: Wealth development",
  tilgungJahr: "Repayment / year (year 1):",
  wertJahr: "Increase in value / year (year 1):",
  aufbauJahr: "Wealth building / year (year 1):",
  vermoegenGesamt: (jahre) => `Total wealth (after ${jahre} yrs):`,
  wertNach: (jahre) => `Property value (after ${jahre} yrs):`,
  kennzahlen: "Investment figures",
  kpiAfa: "Depr. p.a. (incl. ren.)",
  kpiSteuer: "Total tax relief",
  kpiCf: "Total net cash flow",
  kpiVermoegen: "Total wealth",
  afaSatzGebaeude: (satz, anteil) => `${satz} · ${anteil}% building`,
  brutto: "Gross rental yield:",
  renditeNach: "Ø return after tax:",
  jahresuebersicht: "Detailed annual overview",
  spalten: ["Year", "Rent", "Depr.", "Interest", "Tax benefit", "CF gross", "CF net", "Net aft. tax", "Rem. debt", "Wealth"],
  hinweisTitel: "⚠  Important note",
  hinweis: [
    "This calculation is intended solely as a rough estimate and does not replace individual tax advice.",
    "All values are approximations. The actual tax effect depends on many individual factors.",
    "Please consult a tax adviser for binding information. All details without guarantee.",
  ],
  datei: "Investment-analysis",
};

export function analyseTexte(sprache: FormatSprache | undefined): AnalyseTexte {
  return sprache === "en" ? ANALYSE_TEXTE_EN : ANALYSE_TEXTE_DE;
}
export { ANALYSE_TEXTE_DE, ANALYSE_TEXTE_EN };

/* ───── Main Export ───── */

export async function generateInvestmentAnalysePdf(data: InvestmentPdfData & { sprache?: FormatSprache }) {
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  pageNum = 0;
  const sprache: FormatSprache = data.sprache === "en" ? "en" : "de";
  const T = analyseTexte(sprache);
  fussTexte = { seite: T.seite, vertraulich: T.vertraulich };
  const locale = SPRACH_LOCALE[sprache];
  const fmt = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
  const fmtDec = (v: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(v);
  const pct = (v: number | string) => (sprache === "en" ? `${v}%` : `${v} %`);
  const fmtPct = (v: number) => pct(v.toFixed(2));
  // Nachkommastellen mit Punkt wie bisher; im Deutschen stand hier schon immer `toFixed`.
  const zahl = (v: number, stellen: number) => v.toFixed(stellen);
  const proQm = (betrag: string) => `${betrag}/m²`;
  const euroQm = (v: number) => (sprache === "en" ? `€${zahl(v, 2)}/m²` : `${zahl(v, 2)} €/m²`);

  const {
    objektTitel, weNr, modus, kaufpreis, mieteMonat, groesse, nkPct,
    hausgeldMonat, hausgeldUmlagefaehig, hausgeldNichtUmlagefaehig,
    eigenkapital, sanierungskosten, sanierungAnteil,
    grundAnteilPct, gebaeudeAnteilPct, gebaeudeWert,
    afaModell, effektiverAfaSatz, restnutzungsdauer, afaJahr, afaGesamt,
    tranchen, gesamtDarlehen, gewichteterZins, gewichteteTilgung, monatsrate,
    steuersatz, mietSteigerung, wertSteigerung, betrachtungszeitraum,
    berechnung, totalSteuerersparnis, totalCashflow,
  } = data;

  const firstRow = berechnung[0];
  const lastRow = berechnung[berechnung.length - 1];

  // Load logo
  const logoBase64 = await loadLogoAsBase64();

  /* ── Page 1: Title Header ── */
  let y = 16;

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", PAGE_W / 2 - 28, y, 56, 14);
      y += 20;
    } catch {
      y += 4;
    }
  }

  // Decorative top bar
  doc.setFillColor(...BRAND_DARK);
  doc.rect(MARGIN, y, CONTENT_W, 1.2, "F");
  y += 6;

  // Title
  doc.setFontSize(16);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...BRAND_DARK);
  doc.text(T.titel, MARGIN, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...TEXT_PRIMARY);
  const subtitle = modus === "wohnung" && weNr ? T.untertitelWe(objektTitel, weNr) : objektTitel;
  doc.text(subtitle, MARGIN, y);
  y += 6;

  doc.setFontSize(8);
  doc.setTextColor(...TEXT_SECONDARY);
  const heute = sprache === "en" ? datumText(new Date(), "en") : new Date().toLocaleDateString("de-DE");
  doc.text(T.erstellt(heute, betrachtungszeitraum), MARGIN, y);
  y += 3;

  // Accent line under header
  doc.setDrawColor(...BRAND_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 8;

  // ── Top KPIs ──
  y = kpiBox(doc, y, [
    { label: T.kpiKaufpreis, value: fmt(kaufpreis) },
    { label: T.kpiMiete, value: fmt(mieteMonat) },
    { label: T.kpiBrutto, value: fmtPct(mieteMonat * 12 / kaufpreis * 100) },
    { label: T.kpiNetto, value: fmt(firstRow?.eigenbelastungNachSteuer || 0) },
  ]);

  // ── 1. Basisdaten ──
  y = sectionHeader(doc, y, T.basis);
  y = dataRow(doc, y, T.kaufpreis, fmt(kaufpreis));
  y = dataRow(doc, y, T.mieteMonat, fmt(mieteMonat));
  y = dataRow(doc, y, T.mieteJahr, fmt(mieteMonat * 12));
  if (groesse > 0) {
    y = dataRow(doc, y, T.wohnflaeche, `${zahl(groesse, 1)} m²`);
    y = dataRow(doc, y, T.mieteQm, euroQm(mieteMonat / groesse));
    y = dataRow(doc, y, T.kaufpreisQm, proQm(fmt(kaufpreis / groesse)));
  }
  y = dataRow(doc, y, T.nebenkosten, `${pct(nkPct)} = ${fmt(kaufpreis * nkPct / 100)}`);
  if (eigenkapital > 0) y = dataRow(doc, y, T.eigenkapital, fmt(eigenkapital));
  if (sanierungAnteil > 0) {
    y = separator(doc, y);
    y = dataRow(doc, y, T.sanierungAnteil, fmt(sanierungAnteil));
    if (sanierungskosten !== sanierungAnteil) {
      y = dataRow(doc, y, T.sanierungGesamt, fmt(sanierungskosten));
    }
  }
  y += 2;
  y = summaryBox(doc, y, [
    { label: T.hausgeld, value: fmt(hausgeldMonat) },
    { label: T.umlagefaehig, value: fmt(hausgeldUmlagefaehig) },
    { label: T.nichtUmlagefaehig, value: fmt(hausgeldNichtUmlagefaehig) },
  ]);

  // ── Modernisierungsumlage ──
  if (data.showModernisierung && sanierungAnteil > 0 && data.erlaubteUmlage && data.erlaubteUmlage > 0) {
    y = sectionHeader(doc, y, T.modernisierung);
    y = dataRow(doc, y, T.umlageLabel, T.umlageAnteil(data.umlagePct || 8));
    y = dataRow(doc, y, T.deckel, data.deckelProQm ? euroQm(data.deckelProQm) : "-");
    y = dataRow(doc, y, T.erlaubteUmlage, fmtDec(data.erlaubteUmlage));
    y = separator(doc, y);
    y = dataRow(doc, y, T.aktuelleMiete, fmt(mieteMonat));
    y = dataRow(doc, y, T.neueMiete, fmt(data.neueMiete || 0), { bold: true, highlight: true });
    y += 2;
  }

  // ── 2. Grund & Boden / AfA ──
  y = sectionHeader(doc, y, T.afaTitel);
  y = dataRow(doc, y, T.grundAnteil, pct(grundAnteilPct));
  y = dataRow(doc, y, T.gebaeudeAnteil, `${pct(gebaeudeAnteilPct)} = ${fmt(gebaeudeWert)}`);
  const afaLabel = afaModell === "linear" ? T.afaModelle.linear : afaModell === "degressiv" ? T.afaModelle.degressiv : T.afaModelle.gutachten;
  y = dataRow(doc, y, T.afaModell, afaLabel);
  y = dataRow(doc, y, T.restnutzung, T.jahre(restnutzungsdauer));
  y = dataRow(doc, y, T.afaSatz, fmtPct(effektiverAfaSatz));
  y = dataRow(doc, y, T.afaJahr, fmt(afaJahr));
  if (afaGesamt > afaJahr) y = dataRow(doc, y, T.afaGesamt, fmt(afaGesamt), { bold: true });
  y += 2;

  // ── 3. Finanzierung ──
  y = sectionHeader(doc, y, T.finanzierung);
  tranchen.forEach((t, i) => {
    y = checkPage(doc, y, 22);
    doc.setFontSize(8.5);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND_DARK);
    doc.text(T.tranche(i + 1, t.bezeichnung), MARGIN + 2, y);
    doc.setTextColor(...TEXT_PRIMARY);
    y += 5;
    y = dataRow(doc, y, T.betrag, fmt(t.betrag), { indent: 4 });
    y = dataRow(doc, y, T.zinssatz, fmtPct(t.zinssatz), { indent: 4 });
    y = dataRow(doc, y, T.tilgung, fmtPct(t.tilgung), { indent: 4 });
  });
  y += 2;
  y = kpiBox(doc, y, [
    { label: T.darlehen, value: fmt(gesamtDarlehen) },
    { label: T.mischzins, value: pct(gewichteterZins.toFixed(3)) },
    { label: T.tilgungSchnitt, value: pct(gewichteteTilgung.toFixed(3)) },
    { label: T.monatsrate, value: fmt(monatsrate) },
  ]);

  // ── 4. Steuerliche Parameter ──
  y = checkPage(doc, y, 30);
  y = sectionHeader(doc, y, T.steuerTitel);
  y = dataRow(doc, y, T.steuersatz, pct(steuersatz));
  y = dataRow(doc, y, T.mietsteigerung, pct(mietSteigerung));
  y = dataRow(doc, y, T.wertsteigerung, pct(wertSteigerung));
  y += 4;

  // ── 5. Monatlicher Nettoaufwand ──
  y = checkPage(doc, y, 35);
  y = sectionHeader(doc, y, T.nettoaufwand);
  y = dataRow(doc, y, T.annuitaet, fmt(monatsrate));
  y = dataRow(doc, y, T.mieteDeckt, T.derRate(monatsrate > 0 ? Math.round((mieteMonat / monatsrate) * 100) : 0));
  y = separator(doc, y);
  y = dataRow(doc, y, T.eigenVor, fmt(firstRow?.eigenbelastungVorSteuer || 0));
  y = dataRow(doc, y, T.eigenNach, fmt(firstRow?.eigenbelastungNachSteuer || 0), { bold: true, highlight: true });
  y += 4;

  // ── 6. Liquidität ──
  y = checkPage(doc, y, 30);
  y = sectionHeader(doc, y, T.liquiditaet);
  y = dataRow(doc, y, T.cfVor, fmt((firstRow?.cashflowBrutto || 0) / 12));
  y = dataRow(doc, y, T.steuerJahr, fmt(firstRow?.steuerersparnis || 0));
  y = dataRow(doc, y, T.cfNach, fmt((firstRow?.cashflowNetto || 0) / 12), { bold: true });
  y += 4;

  // ── 7. Vermögensentwicklung ──
  y = checkPage(doc, y, 40);
  y = sectionHeader(doc, y, T.vermoegen);
  y = dataRow(doc, y, T.tilgungJahr, fmt(firstRow?.tilgung || 0));
  y = dataRow(doc, y, T.wertJahr, fmt(firstRow?.wertsteigerungJahr || 0));
  y = separator(doc, y);
  y = dataRow(doc, y, T.aufbauJahr, fmt(firstRow?.vermoegenAufbau || 0), { bold: true });
  y = dataRow(doc, y, T.vermoegenGesamt(betrachtungszeitraum), fmt(lastRow?.vermoegenKumuliert || 0), { bold: true, highlight: true });
  y = dataRow(doc, y, T.wertNach(betrachtungszeitraum), fmt(lastRow?.immobilienWert || 0), { bold: true });
  y += 4;

  // ── 8. Investment-KPIs ──
  y = checkPage(doc, y, 30);
  y = sectionHeader(doc, y, T.kennzahlen);
  y = kpiBox(doc, y, [
    { label: T.kpiAfa, value: fmt(afaGesamt) },
    { label: T.kpiSteuer, value: fmt(totalSteuerersparnis) },
    { label: T.kpiCf, value: fmt(totalCashflow) },
    { label: T.kpiVermoegen, value: fmt(lastRow?.vermoegenKumuliert || 0) },
  ]);
  y = dataRow(doc, y, T.afaSatz, T.afaSatzGebaeude(pct(effektiverAfaSatz.toFixed(2)), gebaeudeAnteilPct));
  y = dataRow(doc, y, T.brutto, fmtPct(mieteMonat * 12 / kaufpreis * 100));
  if (data.avgRendite > 0) y = dataRow(doc, y, T.renditeNach, fmtPct(data.avgRendite));
  y += 4;

  // ── 9. Jahresübersicht ──
  addFooter(doc);
  doc.addPage();
  y = 22;

  y = sectionHeader(doc, y, T.jahresuebersicht);

  const breiten = [10, 18, 18, 18, 20, 18, 18, 22, 20, 20];
  const cols = T.spalten.map((label, i) => ({ label, w: breiten[i] }));

  // Table header
  doc.setFillColor(...BRAND_DARK);
  doc.roundedRect(MARGIN, y - 3.5, CONTENT_W, 6.5, 1, 1, "F");
  doc.setFontSize(6.5);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(255, 255, 255);
  let xPos = MARGIN + 1;
  cols.forEach(c => {
    doc.text(c.label, xPos, y, { align: "left" });
    xPos += c.w;
  });
  y += 5.5;

  // Table rows
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_PRIMARY);

  berechnung.forEach((r, idx) => {
    y = checkPage(doc, y, 5);
    if (idx % 2 === 0) {
      doc.setFillColor(...BG_LIGHT);
      doc.rect(MARGIN, y - 3, CONTENT_W, 4.8, "F");
    }
    xPos = MARGIN + 1;
    const vals = [
      String(r.jahr),
      fmt(r.miete),
      fmt(r.afa),
      fmt(r.zinsen),
      fmt(r.steuerersparnis),
      fmt(r.cashflowBrutto),
      fmt(r.cashflowNetto),
      fmt(r.eigenbelastungNachSteuer),
      fmt(r.restschuld),
      fmt(r.vermoegenKumuliert),
    ];
    vals.forEach((v, i) => {
      doc.text(v, xPos, y, { align: "left" });
      xPos += cols[i].w;
    });
    y += 4.8;
  });

  // ── Footer / Disclaimer ──
  y += 8;
  y = checkPage(doc, y, 30);
  doc.setDrawColor(...BRAND_ACCENT);
  doc.setLineWidth(0.5);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  doc.setLineWidth(0.2);
  y += 6;

  doc.setFillColor(...BG_ACCENT);
  doc.roundedRect(MARGIN, y - 3, CONTENT_W, 22, 2, 2, "F");

  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...BRAND_DARK);
  doc.text(T.hinweisTitel, MARGIN + 4, y + 1);
  y += 5;

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...TEXT_SECONDARY);
  T.hinweis.forEach(line => {
    doc.text(line, MARGIN + 4, y);
    y += 3.5;
  });

  addFooter(doc);

  const filename = `${T.datei}_${objektTitel.replace(/\s+/g, "-")}${weNr ? `_WE${weNr}` : ""}.pdf`;
  doc.save(filename);
}

