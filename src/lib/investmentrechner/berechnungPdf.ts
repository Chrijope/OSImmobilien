/**
 * Die Investmentberechnung als PDF zum Herunterladen, seit dem 28.09.2026.
 *
 * Vorher gab es nur den Knopf „Berechnung als PDF und Drucken“, der den
 * Druckdialog des Browsers öffnete. Das Druckstück war eine HTML-Seite, und
 * deren Tabellen liefen je nach Browser und Druckeinstellung rechts über den
 * Blattrand. Christian wollte die Datei direkt, ohne Druckdialog, und keine
 * Tabelle mehr, die übersteht.
 *
 * Deshalb wird das Dokument hier mit jsPDF im Haus-Design aus
 * `pdfBranding.ts` gezeichnet. Jede Tabelle teilt die Satzspiegelbreite in
 * feste Anteile auf, eine Spalte kann also gar nicht breiter werden als ihr
 * Anteil. Passt ein Betrag nicht, wird die Schrift kleiner und erst zuletzt
 * gekürzt. Lange Zeiträume laufen über mehrere Seiten, der Tabellenkopf steht
 * auf jeder Seite neu. Anders als im alten Druck stehen alle Prognosejahre in
 * den Tabellen, nicht nur die ersten zehn.
 *
 * Inhalt und Reihenfolge folgen der Ansicht „Berechnung“ (ExposeDokument.tsx),
 * die Texte kommen aus denselben Quellen (`dokumentTexte.ts`,
 * `kennzahlTexte.ts`, Rechenwege, Glossar), in der Sprache des Kunden.
 * Gerechnet wird hier nichts, alle Zahlen kommen aus dem Rechenkern.
 */
import jsPDF from "jspdf";
import {
  BRAND,
  PDF_FONT,
  addBrandedFooter,
  addBrandedHeader,
  addCoverPage,
  brandedSectionTitle,
  ensureUnicodeFont,
  loadIcon,
  loadLogo,
  sanitizePdfText,
} from "@/lib/pdfBranding";
import type { FormatSprache } from "@/lib/sprachFormat";
import { ausgewiesenerKaufpreis, type InvestmentEingabe, type InvestmentErgebnis, type Jahreswert } from "./rechenkern";
import { sanierungenBereinigt, type UnterlagenDaten, type UnterlagenDokument } from "./unterlagenAuslesen";
import { formatEuro, formatEuroCent, formatProzent, formatZahl } from "./formatierer";
import { dokumentTexteFuer, hinweisOhneSteuerwirkung, type DokumentTexte } from "./dokumentTexte";
import { kennzahlTexteFuer, type KennzahlTexte } from "./kennzahlTexte";
import { glossar, rechenwege } from "./kennzahlErklaerungen";
import {
  einordnung,
  formatUnterschied,
  formatVergleichswert,
  jahreDativ,
  jahreEnglisch,
  objektMarke,
  vergleichBezeichnung,
  vergleicheObjekte,
  type Vergleichszeile,
} from "./objektvergleich";
import { kaufpreisHinweis, kaufpreiszeilen } from "@/components/investmentrechner/Auswertungen";
import { VERGLEICHSSEITE_KENNZAHLEN } from "@/components/investmentrechner/ExposeDokument";

/** Ein Objekt mit allem, was seine Berechnung braucht, wie `ExposeObjekt`. */
export interface BerechnungPdfObjekt {
  input: InvestmentEingabe;
  result: InvestmentErgebnis;
  photos: string[];
  documents: UnterlagenDokument[];
  documentData: UnterlagenDaten;
}

type Farbe = [number, number, number];

const W = 210;
const H = 297;
export const BERECHNUNG_PDF_RAND = 20;
const M = BERECHNUNG_PDF_RAND;
const CW = W - 2 * M;
/** Unterkante des Satzspiegels, darunter beginnt die Fußzeile. */
const SEITENENDE = H - 26;
const NEGATIV: Farbe = [185, 28, 28];
const POSITIV: Farbe = [21, 128, 61];

const s = sanitizePdfText;

/** Der laufende Stand eines Dokuments: wo geschrieben wird und was im Seitenkopf steht. */
interface Lauf {
  doc: jsPDF;
  logo: string | null;
  kopf: string;
  y: number;
  sprache: FormatSprache;
  t: DokumentTexte;
  k: KennzahlTexte;
}

function neueSeite(l: Lauf) {
  l.doc.addPage();
  l.y = addBrandedHeader(l.doc, l.logo, l.kopf);
}

/** Beginnt eine neue Seite, wenn der nächste Block nicht mehr passt. */
function platz(l: Lauf, mm: number) {
  if (l.y + mm > SEITENENDE) neueSeite(l);
}

function schrift(doc: jsPDF, groesse: number, fett = false, farbe: Farbe = BRAND.text) {
  doc.setFont(PDF_FONT, fett ? "bold" : "normal");
  doc.setFontSize(groesse);
  doc.setTextColor(farbe[0], farbe[1], farbe[2]);
}

/**
 * Macht einen einzeiligen Text passend: erst kleiner, dann gekürzt. Lässt
 * die gefundene Schriftgröße gesetzt und gibt den Text zurück.
 */
function einpassen(doc: jsPDF, text: string, breite: number, groesse: number, minimum: number): string {
  let g = groesse;
  doc.setFontSize(g);
  while (doc.getTextWidth(text) > breite && g > minimum) {
    g -= 0.25;
    doc.setFontSize(g);
  }
  if (doc.getTextWidth(text) <= breite) return text;
  let gekuerzt = text;
  while (gekuerzt.length > 1 && doc.getTextWidth(`${gekuerzt}…`) > breite) gekuerzt = gekuerzt.slice(0, -1);
  return `${gekuerzt.trimEnd()}…`;
}

/**
 * Bricht Text auf die Breite um. Ein einzelnes Wort, das allein schon zu
 * breit ist, bricht jsPDF nicht; es wird hier hart geteilt, damit nichts
 * über den Rand läuft.
 */
function umbrechen(doc: jsPDF, text: string, breite: number): string[] {
  const zeilen = doc.splitTextToSize(s(text), breite) as string[];
  return zeilen.flatMap((zeile) => {
    if (doc.getTextWidth(zeile) <= breite) return [zeile];
    const teile: string[] = [];
    let rest = zeile;
    while (rest.length > 0 && doc.getTextWidth(rest) > breite) {
      let schnitt = rest.length;
      while (schnitt > 1 && doc.getTextWidth(rest.slice(0, schnitt)) > breite) schnitt--;
      teile.push(rest.slice(0, schnitt));
      rest = rest.slice(schnitt);
    }
    if (rest) teile.push(rest);
    return teile;
  });
}

function absatz(l: Lauf, text: string, groesse = 8.5, farbe: Farbe = BRAND.text, abstand = groesse * 0.45) {
  schrift(l.doc, groesse, false, farbe);
  for (const zeile of umbrechen(l.doc, text, CW)) {
    platz(l, abstand);
    schrift(l.doc, groesse, false, farbe);
    l.doc.text(zeile, M, l.y);
    l.y += abstand;
  }
  l.y += 2;
}

function augenbraue(l: Lauf, text: string) {
  platz(l, 22);
  schrift(l.doc, 7, true, BRAND.accent);
  l.doc.text(einpassen(l.doc, s(text.toUpperCase()), CW, 7, 5.5), M, l.y);
  l.y += 5;
}

function ueberschrift(l: Lauf, text: string) {
  l.y += 3;
  platz(l, 22);
  l.y = brandedSectionTitle(l.doc, einpassen(l.doc, s(text), CW - 8, 11, 8), l.y, M, CW);
}

/** Beschriftung links, Wert rechtsbündig, Haarlinie darunter. */
function zeile(l: Lauf, label: string, wert: string, fett = false) {
  const doc = l.doc;
  platz(l, 6.5);
  schrift(doc, 8, fett, fett ? BRAND.primary : BRAND.muted);
  const wertText = s(wert);
  schrift(doc, 8.5, true, BRAND.primary);
  const wertBreite = Math.min(CW * 0.45, doc.getTextWidth(wertText));
  const gesetzterWert = einpassen(doc, wertText, CW * 0.45, 8.5, 6.5);
  doc.text(gesetzterWert, M + CW, l.y, { align: "right" });
  schrift(doc, 8, fett, fett ? BRAND.primary : BRAND.muted);
  doc.text(einpassen(doc, s(label), CW - wertBreite - 4, 8, 6), M, l.y);
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.15);
  doc.line(M, l.y + 2.4, M + CW, l.y + 2.4);
  l.y += 6.2;
}

interface Kachel {
  label: string;
  wert: string;
  notiz?: string | null;
  ton?: "negativ" | "positiv";
}

/** Kacheln im Raster, jede Reihe so hoch wie ihre höchste Kachel. */
function kacheln(l: Lauf, liste: Kachel[], spalten: number) {
  const doc = l.doc;
  const abstand = 3;
  const breite = (CW - abstand * (spalten - 1)) / spalten;
  const innen = breite - 6;
  for (let start = 0; start < liste.length; start += spalten) {
    const reihe = liste.slice(start, start + spalten);
    const gemessen = reihe.map((kachel) => {
      schrift(doc, 6.8, true);
      const label = umbrechen(doc, kachel.label, innen);
      schrift(doc, 6.2);
      const notiz = kachel.notiz ? umbrechen(doc, kachel.notiz, innen) : [];
      return { kachel, label, notiz };
    });
    const hoehe = Math.max(...gemessen.map((g) => 4 + g.label.length * 2.9 + 7.5 + g.notiz.length * 2.6 + 2.5));
    platz(l, hoehe + abstand);
    gemessen.forEach((g, i) => {
      const x = M + i * (breite + abstand);
      doc.setFillColor(...BRAND.light);
      doc.roundedRect(x, l.y, breite, hoehe, 1.6, 1.6, "F");
      let y = l.y + 4.6;
      schrift(doc, 6.8, true, BRAND.muted);
      for (const z of g.label) {
        doc.text(z, x + 3, y);
        y += 2.9;
      }
      y += 4.6;
      const farbe = g.kachel.ton === "negativ" ? NEGATIV : g.kachel.ton === "positiv" ? POSITIV : BRAND.primary;
      schrift(doc, 12, true, farbe);
      doc.text(einpassen(doc, s(g.kachel.wert), innen, 12, 7), x + 3, y);
      y += 3.6;
      schrift(doc, 6.2, false, BRAND.muted);
      for (const z of g.notiz) {
        doc.text(z, x + 3, y);
        y += 2.6;
      }
    });
    l.y += hoehe + abstand;
  }
  l.y += 2;
}

type Zelle = string | { text: string; ton: "negativ" | "positiv" };

export interface Tabellenspalte {
  titel: string;
  /** Anteil an der Satzspiegelbreite. Die Anteile werden auf die volle Breite verteilt. */
  anteil: number;
  links?: boolean;
}

/**
 * Tabelle über die volle Satzspiegelbreite.
 *
 * Die Spaltenbreiten ergeben sich aus den Anteilen und summieren sich genau
 * auf die Breite zwischen den Rändern, unabhängig vom Inhalt. Überschriften
 * brechen um, Zellen werden kleiner gesetzt oder gekürzt, nie breiter. Reicht
 * die Seite nicht, beginnt eine neue mit wiederholtem Tabellenkopf.
 */
function tabelle(l: Lauf, spalten: Tabellenspalte[], zeilen: Zelle[][]) {
  const doc = l.doc;
  const summe = spalten.reduce((a, sp) => a + sp.anteil, 0);
  const breiten = spalten.map((sp) => (CW * sp.anteil) / summe);
  const xe = breiten.map((_, i) => M + breiten.slice(0, i).reduce((a, b) => a + b, 0));
  const pad = 1.4;
  const zeilenHoehe = 5.2;

  schrift(doc, 6.6, true);
  const kopfzeilen = spalten.map((sp, i) => umbrechen(doc, sp.titel, breiten[i] - 2 * pad));
  const kopfHoehe = Math.max(...kopfzeilen.map((z) => z.length)) * 2.8 + 3.2;

  const kopf = () => {
    doc.setFillColor(...BRAND.light);
    doc.rect(M, l.y, CW, kopfHoehe, "F");
    spalten.forEach((sp, i) => {
      let y = l.y + 3.9;
      for (const z of kopfzeilen[i]) {
        schrift(doc, 6.6, true, BRAND.primary);
        const text = einpassen(doc, z, breiten[i] - 2 * pad, 6.6, 5);
        if (sp.links) doc.text(text, xe[i] + pad, y);
        else doc.text(text, xe[i] + breiten[i] - pad, y, { align: "right" });
        y += 2.8;
      }
    });
    l.y += kopfHoehe;
  };

  platz(l, kopfHoehe + zeilenHoehe * 3);
  kopf();
  zeilen.forEach((reihe) => {
    if (l.y + zeilenHoehe > SEITENENDE) {
      neueSeite(l);
      kopf();
    }
    reihe.forEach((zelle, i) => {
      const text = typeof zelle === "string" ? zelle : zelle.text;
      const ton = typeof zelle === "string" ? undefined : zelle.ton;
      schrift(doc, 7.2, i === 0, ton === "negativ" ? NEGATIV : ton === "positiv" ? POSITIV : BRAND.text);
      const gesetzt = einpassen(doc, s(text), breiten[i] - 2 * pad, 7.2, 5.2);
      const y = l.y + zeilenHoehe * 0.68;
      if (spalten[i].links) doc.text(gesetzt, xe[i] + pad, y);
      else doc.text(gesetzt, xe[i] + breiten[i] - pad, y, { align: "right" });
    });
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.15);
    doc.line(M, l.y + zeilenHoehe, M + CW, l.y + zeilenHoehe);
    l.y += zeilenHoehe;
  });
  l.y += 5;
}

/** Ton einer Zahl: rot, wenn sie negativ ist, sonst ohne Farbe oder grün. */
function mitTon(wert: number, text: string, positivGruen = true): Zelle {
  if (wert < 0) return { text, ton: "negativ" };
  return positivGruen && wert > 0 ? { text, ton: "positiv" } : text;
}

/** Ein Betrag mit Vorzeichen, wie in der Cashflowleiste der Ansicht. */
function mitVorzeichen(wert: number, format: (betrag: number) => string): string {
  const betrag = format(Math.abs(wert));
  if (betrag === format(0)) return betrag;
  return wert > 0 ? `+${betrag}` : `−${betrag}`;
}

interface Reihe {
  werte: number[];
  farbe: Farbe;
  label: string;
}

/** Liniendiagramm über die Jahre, mit Raster in Tausend und Legende. */
function liniendiagramm(l: Lauf, jahre: number[], reihen: Reihe[], hoehe = 60) {
  const doc = l.doc;
  platz(l, hoehe + 12);
  const links = M + 14;
  const rechts = M + CW;
  const oben = l.y + 2;
  const unten = l.y + hoehe - 8;
  const alle = reihen.flatMap((r) => r.werte);
  const minimum = Math.min(0, ...alle);
  const maximum = Math.max(1, ...alle);
  const spanne = maximum - minimum || 1;
  const x = (i: number) => links + (i / Math.max(1, jahre.length - 1)) * (rechts - links);
  const y = (wert: number) => oben + ((maximum - wert) / spanne) * (unten - oben);

  doc.setLineWidth(0.15);
  doc.setDrawColor(...BRAND.separator);
  for (const anteil of [0, 0.25, 0.5, 0.75, 1]) {
    const wert = minimum + spanne * anteil;
    doc.line(links, y(wert), rechts, y(wert));
    schrift(doc, 6, false, BRAND.muted);
    doc.text(`${formatZahl(Math.round(wert / 1e3), l.sprache, 0)}${l.t.diagramm.tausend}`, links - 2, y(wert) + 1, { align: "right" });
  }
  doc.setLineWidth(0.7);
  for (const reihe of reihen) {
    doc.setDrawColor(...reihe.farbe);
    for (let i = 1; i < reihe.werte.length; i++) doc.line(x(i - 1), y(reihe.werte[i - 1]), x(i), y(reihe.werte[i]));
  }
  const schritt = Math.max(1, Math.ceil(jahre.length / 12));
  schrift(doc, 6, false, BRAND.muted);
  jahre.forEach((jahr, i) => {
    if (i % schritt !== 0 && i !== jahre.length - 1) return;
    // Das letzte Jahr steht rechtsbündig, damit es nicht über den Rand ragt.
    const letztes = i === jahre.length - 1;
    doc.text(String(jahr), x(i), unten + 4.5, { align: letztes ? "right" : i === 0 ? "left" : "center" });
  });
  let lx = links;
  const ly = unten + 10;
  for (const reihe of reihen) {
    doc.setFillColor(...reihe.farbe);
    doc.rect(lx, ly - 2, 3, 2, "F");
    schrift(doc, 7, false, BRAND.text);
    const label = einpassen(doc, s(reihe.label), (rechts - links) / reihen.length - 8, 7, 5.5);
    doc.text(label, lx + 4.5, ly);
    lx += (rechts - links) / reihen.length;
  }
  l.y += hoehe + 10;
}

/** Aufteilung des Vermögenszuwachses als gestapelter Balken mit Legende. */
function zusammensetzung(l: Lauf, input: InvestmentEingabe, result: InvestmentErgebnis) {
  const doc = l.doc;
  const d = l.t.diagramm;
  const letztes = result.years[result.years.length - 1];
  const anteile: { label: string; wert: number; farbe: Farbe }[] = [
    { label: d.eigenkapital, wert: Math.max(0, input.equity), farbe: BRAND.primary },
    { label: d.tilgung, wert: Math.max(0, result.getilgtGesamt), farbe: BRAND.accent },
    { label: d.wertzuwachs, wert: Math.max(0, letztes.wertzuwachs), farbe: BRAND.accentLight },
    { label: d.steuereffekt, wert: Math.max(0, result.cumulativeTaxEffect), farbe: BRAND.muted },
  ];
  const summe = Math.max(1, anteile.reduce((a, b) => a + b.wert, 0));
  platz(l, 26);
  schrift(doc, 7, true, BRAND.muted);
  doc.text(einpassen(doc, s(d.zusammensetzung), CW, 7, 5.5), M, l.y);
  l.y += 3;
  let x = M;
  for (const a of anteile) {
    const b = (a.wert / summe) * CW;
    if (b <= 0) continue;
    doc.setFillColor(...a.farbe);
    doc.rect(x, l.y, b, 5, "F");
    x += b;
  }
  l.y += 9;
  const spalte = CW / 4;
  anteile.forEach((a, i) => {
    const lx = M + i * spalte;
    doc.setFillColor(...a.farbe);
    doc.rect(lx, l.y - 2, 3, 2, "F");
    schrift(doc, 6.6, false, BRAND.muted);
    doc.text(einpassen(doc, s(a.label), spalte - 6, 6.6, 5.2), lx + 4.5, l.y);
    schrift(doc, 8.5, true, BRAND.primary);
    doc.text(einpassen(doc, s(formatEuro(a.wert, l.sprache)), spalte - 6, 8.5, 6), lx + 4.5, l.y + 4.2);
  });
  l.y += 10;
}

// ── Bilder ──────────────────────────────────────────────────────────────────

interface Bild {
  daten: string;
  format: string;
  breite: number;
  hoehe: number;
}

async function alsDataUrl(quelle: string): Promise<string | null> {
  if (quelle.startsWith("data:")) return quelle;
  try {
    const antwort = await fetch(quelle);
    if (!antwort.ok) return null;
    const blob = await antwort.blob();
    return await new Promise((resolve) => {
      const leser = new FileReader();
      leser.onloadend = () => resolve(typeof leser.result === "string" ? leser.result : null);
      leser.onerror = () => resolve(null);
      leser.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Lädt ein Objektbild. Was sich nicht laden oder lesen lässt, fällt still weg. */
async function ladeBild(doc: jsPDF, quelle: string): Promise<Bild | null> {
  const daten = await alsDataUrl(quelle);
  if (!daten) return null;
  const mime = /^data:image\/([a-z+]+)/i.exec(daten)?.[1]?.toLowerCase() ?? "";
  const format = mime === "png" ? "PNG" : mime === "webp" ? "WEBP" : mime === "jpeg" || mime === "jpg" ? "JPEG" : "";
  if (!format) return null;
  try {
    const eigenschaften = doc.getImageProperties(daten);
    if (eigenschaften.width && eigenschaften.height) {
      return { daten, format, breite: eigenschaften.width, hoehe: eigenschaften.height };
    }
  } catch {
    /* jsPDF erkennt das Format am Dateikopf und kennt nicht jede JPEG-Variante. */
  }
  // Dann misst der Browser das Bild; beim Zeichnen gilt das Format aus der Data-URL.
  if (typeof Image === "undefined") return null;
  const masse = await new Promise<{ b: number; h: number } | null>((resolve) => {
    const bild = new Image();
    bild.onload = () => resolve(bild.naturalWidth && bild.naturalHeight ? { b: bild.naturalWidth, h: bild.naturalHeight } : null);
    bild.onerror = () => resolve(null);
    bild.src = daten;
  });
  return masse ? { daten, format, breite: masse.b, hoehe: masse.h } : null;
}

function bilderraster(l: Lauf, bilder: Bild[]) {
  const doc = l.doc;
  const abstand = 4;
  const zelleB = (CW - abstand) / 2;
  const zelleH = zelleB * 0.7;
  for (let i = 0; i < bilder.length; i += 2) {
    platz(l, zelleH + abstand);
    bilder.slice(i, i + 2).forEach((bild, j) => {
      const x = M + j * (zelleB + abstand);
      doc.setFillColor(...BRAND.light);
      doc.rect(x, l.y, zelleB, zelleH, "F");
      // Eingepasst, nicht beschnitten: jsPDF kennt keine Maske.
      const faktor = Math.min(zelleB / bild.breite, zelleH / bild.hoehe);
      const b = bild.breite * faktor;
      const h = bild.hoehe * faktor;
      try {
        doc.addImage(bild.daten, bild.format, x + (zelleB - b) / 2, l.y + (zelleH - h) / 2, b, h, undefined, "FAST");
      } catch {
        /* Ein kaputtes Bild bleibt eine leere Fläche. */
      }
    });
    l.y += zelleH + abstand;
  }
}

// ── Die Teile des Dokuments ─────────────────────────────────────────────────

function objektteil(l: Lauf, objekt: BerechnungPdfObjekt, bilder: Bild[], marke?: string) {
  const { input, result, documentData, documents } = objekt;
  const { t, k, sprache } = l;
  const euro = (wert: number) => formatEuro(wert, sprache);
  const euroCent = (wert: number) => formatEuroCent(wert, sprache);
  const prozent = (wert: number) => formatProzent(wert, sprache);
  const zahl = (wert: number, stellen = 3) => formatZahl(wert, sprache, stellen);
  const prozentZahl = (wert: number) => (sprache === "en" ? `${zahl(wert)}%` : `${zahl(wert)} %`);
  const wege = rechenwege(input, result, k, sprache);
  const erstes = result.years[0];
  const letztes = result.years[result.years.length - 1];
  const kach = k.kacheln;

  l.kopf = `OS Immobilien · ${t.kopf.investmentkalkulation}${marke ? ` · ${marke}` : ""}`;
  neueSeite(l);

  // Objekt und Überblick
  augenbraue(l, [marke, input.propertyType].filter(Boolean).join(" · ") || t.kopf.persoenlicheKalkulation);
  schrift(l.doc, 16, true, BRAND.primary);
  for (const z of umbrechen(l.doc, input.propertyTitle || t.kopf.investmentobjekt, CW)) {
    l.doc.text(z, M, l.y + 3);
    l.y += 7;
  }
  if (input.address) {
    schrift(l.doc, 9, false, BRAND.muted);
    for (const z of umbrechen(l.doc, input.address, CW)) {
      l.doc.text(z, M, l.y + 1);
      l.y += 4.4;
    }
  }
  l.y += 4;

  const fakten: Kachel[] = [
    {
      label: result.allInclusive ? t.kaufpreis.gesamtAllInclusive : t.kaufpreis.gesamt,
      wert: euro(ausgewiesenerKaufpreis(input, result)),
      notiz: input.furniturePrice > 0 ? t.deckblatt.inklMoebel(euro(input.furniturePrice)) : null,
    },
  ];
  if (input.area > 0) fakten.push({ label: t.deckblatt.wohnflaeche, wert: `${zahl(input.area)} m²` });
  if (input.rooms > 0) fakten.push({ label: t.deckblatt.zimmer, wert: zahl(input.rooms) });
  if (input.constructionYear > 0) fakten.push({ label: t.deckblatt.baujahr, wert: String(input.constructionYear) });
  if (documentData.energyClass) fakten.push({ label: t.deckblatt.energieklasse, wert: documentData.energyClass });
  kacheln(l, fakten, Math.min(4, fakten.length));

  kacheln(
    l,
    [
      { label: kach.kaltmiete, wert: euro(result.effectiveAnnualRent / 12), notiz: wege.kaltmiete?.text },
      { label: kach.kreditrate, wert: euroCent(result.monthlyDebtService), notiz: wege.kreditrate?.text },
      { label: kach.bruttorendite, wert: prozent(result.grossYield), notiz: wege.bruttorendite?.text },
      { label: kach.nettorendite, wert: prozent(result.netYield), notiz: wege.nettorendite?.text },
    ],
    4,
  );

  const vorSteuerMonat = erstes.cashflowBeforeTax / 12;
  const nachSteuerMonat = erstes.cashflowAfterTax / 12;
  const zahltDrauf = nachSteuerMonat < 0;
  const steuerhinweis =
    input.taxCalculationMode === "tariff"
      ? t.cashflowleiste.tarif(input.jointAssessment)
      : t.cashflowleiste.manuell(formatZahl(input.marginalTaxRate, sprache, 3));
  ueberschrift(l, zahltDrauf ? kach.zahlstDuDrauf : kach.bekommstDuRaus);
  kacheln(
    l,
    [
      {
        label: kach.cashflowVorSteuer,
        wert: mitVorzeichen(vorSteuerMonat, euroCent),
        notiz: wege.cashflowVorSteuer?.text,
        ton: vorSteuerMonat < 0 ? "negativ" : undefined,
      },
      {
        label: kach.cashflowNachSteuer,
        wert: mitVorzeichen(nachSteuerMonat, euroCent),
        notiz: [wege.cashflowNachSteuer?.text, hinweisOhneSteuerwirkung(input, result, sprache)].filter(Boolean).join(" · "),
        ton: zahltDrauf ? "negativ" : undefined,
      },
      {
        label: kach.vermoegensaufbau,
        wert: euroCent(result.vermoegensaufbauMonat),
        notiz: [
          wege.vermoegensaufbau?.text,
          `${k.zusaetze.imMonat} · ${k.zusaetze.davonTilgung(euroCent(result.tilgungMonat))}${
            result.faktorJeEuro > 0 ? ` · ${k.zusaetze.jeEingezahltemEuro(formatZahl(result.faktorJeEuro, sprache, 2))}` : ""
          }`,
        ]
          .filter(Boolean)
          .join(" · "),
      },
      {
        label: kach.gesamtvermoegen(result.years.length),
        wert: euro(letztes.totalWealth),
        notiz: wege.gesamtvermoegen?.text,
        ton: letztes.totalWealth < 0 ? "negativ" : undefined,
      },
      {
        label: kach.steuereffektErstesJahr,
        wert: mitVorzeichen(erstes.taxEffect, euro),
        notiz: [wege.steuereffektErstesJahr?.text, `${k.zusaetze.steuereffektMonat(mitVorzeichen(erstes.taxEffect / 12, euroCent))} · ${steuerhinweis}`]
          .filter(Boolean)
          .join(" · "),
        ton: erstes.taxEffect < 0 ? "negativ" : undefined,
      },
      {
        label: kach.steuereffektGesamt(result.years.length),
        wert: mitVorzeichen(result.cumulativeTaxEffect, euro),
        notiz: [wege.steuereffektGesamt?.text, k.zusaetze.steuereffektZeitraum(erstes.year, letztes.year)]
          .filter(Boolean)
          .join(" · "),
        ton: result.cumulativeTaxEffect < 0 ? "negativ" : undefined,
      },
    ],
    3,
  );

  const zahltZu = letztes.cumulativeEigenanteil > 0;
  kacheln(
    l,
    [
      { label: kach.immobilienwert(letztes.year), wert: euro(letztes.propertyValue), notiz: wege.immobilienwert?.text },
      { label: kach.restschuld(letztes.year), wert: euro(letztes.remainingDebt), notiz: wege.restschuld?.text },
      {
        label: kach.immobilieMinusRestschuld(letztes.year),
        wert: euro(letztes.propertyEquity),
        notiz: wege.immobilieMinusRestschuld?.text,
      },
      {
        label: zahltZu ? kach.selbstEingezahlt(result.years.length) : kach.ueberschuss(result.years.length),
        wert: euro(zahltZu ? letztes.cumulativeEigenanteil : Math.abs(letztes.cumulativeCashflowAfterTax)),
        notiz: wege.selbstEingezahlt?.text,
      },
    ],
    4,
  );

  const erhaltungsjahre =
    input.rehabMode === "expense"
      ? String(input.rehabDistributionYears)
      : input.buildingDepreciationRate > 0
        ? String(Math.round(100 / input.buildingDepreciationRate))
        : "?";
  zeile(l, t.deckblatt.erhaltungsaufwandModell, t.deckblatt.ueberJahre(euro(input.rehabExpense), erhaltungsjahre));
  l.y += 3;

  ueberschrift(l, t.deckblatt.kaufpreisdetails);
  for (const z of kaufpreiszeilen(result, sprache)) zeile(l, z.label, z.wert, z.summe);
  const hinweisKaufpreis = kaufpreisHinweis(result, sprache);
  if (hinweisKaufpreis) absatz(l, hinweisKaufpreis, 7, BRAND.muted);
  l.y += 3;

  ueberschrift(l, t.deckblatt.finanzierungSteuer);
  zeile(l, t.deckblatt.bankdarlehen, euro(result.seniorLoanAmount));
  if (input.juniorLoanAmount > 0) zeile(l, t.deckblatt.nachrangdarlehen, euro(input.juniorLoanAmount));
  zeile(l, t.deckblatt.zinsTilgung, `${prozentZahl(input.seniorInterestRate)} / ${prozentZahl(input.seniorRepaymentRate)}`);
  zeile(l, t.deckblatt.eingesetztesEigenkapital, euro(input.equity), true);
  zeile(l, t.deckblatt.zveVorErwerb, euro(result.combinedTaxableIncome));
  const grenzsteuersatz = input.taxCalculationMode === "tariff" ? result.marginalTotalTaxRate : input.marginalTaxRate / 100;
  zeile(
    l,
    input.taxCalculationMode === "tariff" ? t.deckblatt.grenzsteuersatzTarif : t.deckblatt.grenzsteuersatzManuell,
    prozent(grenzsteuersatz),
  );

  // Steuerbetrachtung
  neueSeite(l);
  augenbraue(l, t.steuerSeite.augenbraue);
  ueberschrift(l, t.steuerSeite.titel);
  absatz(l, t.steuerSeite.einleitung, 8.5, BRAND.muted);
  kacheln(
    l,
    [
      { label: t.steuerSeite.steuerklasse, wert: String(input.taxClass) },
      { label: t.steuerSeite.veranlagung, wert: input.jointAssessment ? t.steuerSeite.splitting : t.steuerSeite.grundtabelle },
      { label: t.steuerSeite.investitionsanteil, wert: prozentZahl(input.investmentShare) },
      { label: t.steuerSeite.berechnung, wert: input.taxCalculationMode === "tariff" ? t.steuerSeite.tarif : t.steuerSeite.manuell },
    ],
    4,
  );
  const sp = t.steuerprofil;
  const profil: [string, string][] = [
    [sp.brutto, euro(input.annualGrossIncome)],
    [sp.zve, euro(result.combinedTaxableIncome)],
    [sp.est, euro(result.taxProfile.incomeTax)],
    [sp.soli, euro(result.taxProfile.solidarity)],
    [sp.kist, euro(result.taxProfile.churchTax)],
    [sp.gesamt, euro(result.taxProfile.totalTax)],
    [sp.effektiv, prozent(result.taxProfile.effectiveRate)],
    [sp.grenz, prozent(result.marginalTotalTaxRate)],
  ];
  profil.forEach(([label, wert], i) => zeile(l, label, wert, i === 5));
  l.y += 3;
  const st = t.steuerSeite;
  kacheln(
    l,
    [
      {
        label: st.ohneImmobilie(erstes.year),
        wert: euro(erstes.taxBefore.totalTax),
        notiz: `${st.zve} ${euro(erstes.taxableIncomeBefore)} · ${st.est} ${euro(erstes.taxBefore.incomeTax)} · ${st.soli} ${euro(erstes.taxBefore.solidarity)} · ${st.kist} ${euro(erstes.taxBefore.churchTax)}`,
      },
      {
        label: st.mitImmobilie(erstes.year),
        wert: euro(erstes.taxAfter.totalTax),
        notiz: `${st.zve} ${euro(erstes.taxableIncomeAfter)} · ${st.steuereffekt} ${erstes.taxEffect >= 0 ? "+" : ""}${euro(erstes.taxEffect)}`,
        ton: erstes.taxEffect >= 0 ? "positiv" : "negativ",
      },
    ],
    2,
  );
  ueberschrift(l, st.steuerwirkung(input.startYear, letztes.year));
  const stt = t.steuerTabelle;
  tabelle(
    l,
    [
      { titel: stt.jahr, anteil: 9, links: true },
      { titel: stt.zveVorher, anteil: 15 },
      { titel: stt.ergebnisVuV, anteil: 15 },
      { titel: stt.zveNachher, anteil: 15 },
      { titel: stt.steuerVorher, anteil: 15 },
      { titel: stt.steuerNachher, anteil: 15 },
      { titel: stt.steuereffekt, anteil: 16 },
    ],
    result.years.map((j) => [
      String(j.year),
      euro(j.taxableIncomeBefore),
      mitTon(j.allocatedTaxableResult, euro(j.allocatedTaxableResult)),
      euro(j.taxableIncomeAfter),
      euro(j.taxBefore.totalTax),
      euro(j.taxAfter.totalTax),
      mitTon(j.taxEffect, `${j.taxEffect >= 0 ? "+" : ""}${euro(j.taxEffect)}`),
    ]),
  );
  absatz(l, st.kleingedruckt, 7, BRAND.muted);

  // Vermögensentwicklung
  neueSeite(l);
  augenbraue(l, t.prognoseSeite.augenbraue(input.startYear, letztes.year));
  ueberschrift(l, t.prognoseSeite.titel);
  liniendiagramm(
    l,
    result.years.map((j) => j.year),
    [
      { werte: result.years.map((j) => j.totalWealth), farbe: BRAND.accent, label: t.diagramm.gesamtvermoegen },
      { werte: result.years.map((j) => j.propertyEquity), farbe: BRAND.muted, label: t.diagramm.immobilienEigenkapital },
    ],
  );
  zusammensetzung(l, input, result);
  kacheln(
    l,
    [
      { label: t.prognoseSeite.wertzuwachs, wert: euro(letztes.wertzuwachs) },
      { label: t.prognoseSeite.getilgt, wert: euro(result.getilgtGesamt) },
      { label: t.prognoseSeite.steuereffektKumuliert, wert: euro(result.years.reduce((a, j) => a + j.taxEffect, 0)) },
    ],
    3,
  );
  ueberschrift(l, t.prognoseSeite.erklaerungTitel);
  absatz(l, t.prognoseSeite.erklaerung);

  // Jahrestabellen, über alle Jahre
  neueSeite(l);
  augenbraue(l, t.tabellenSeite.augenbraue);
  ueberschrift(l, t.tabellenSeite.titel);
  const ct = t.cashflowTabelle;
  tabelle(
    l,
    [
      { titel: ct.jahr, anteil: 8.5, links: true },
      { titel: ct.miete, anteil: 11 },
      { titel: ct.zinsen, anteil: 11 },
      { titel: ct.tilgung, anteil: 11 },
      { titel: ct.kosten, anteil: 11 },
      { titel: ct.cfVorSteuer, anteil: 11 },
      { titel: ct.steuereffekt, anteil: 11.5 },
      { titel: ct.cfNachSteuer, anteil: 11 },
      { titel: ct.eigenkapital, anteil: 14 },
    ],
    result.years.map((j: Jahreswert) => [
      String(j.year),
      euro(j.effectiveRent),
      euro(j.interest),
      euro(j.principal),
      // Mit der Rücklagenzuführung, damit Miete minus Zinsen, Tilgung und Kosten den Cashflow ergibt.
      euro(j.operatingCosts + (j.reserveContribution ?? 0)),
      mitTon(j.cashflowBeforeTax, euro(j.cashflowBeforeTax)),
      mitTon(j.taxEffect, euro(j.taxEffect)),
      mitTon(j.cashflowAfterTax, euro(j.cashflowAfterTax)),
      euro(j.propertyEquity),
    ]),
  );
  ueberschrift(l, t.tabellenSeite.afaTitel);
  const at = t.tabellenSeite;
  tabelle(
    l,
    [
      { titel: at.jahr, anteil: 9, links: true },
      { titel: at.afaRegulaer, anteil: 15 },
      { titel: at.sonderAfa, anteil: 15 },
      { titel: at.afaMoebel, anteil: 15 },
      { titel: at.erhaltungsaufwand, anteil: 16 },
      { titel: at.ergebnisVuV, anteil: 15 },
      { titel: at.steuereffekt, anteil: 15 },
    ],
    result.years.map((j) => [
      String(j.year),
      euro(j.buildingDepreciation),
      euro(j.specialDepreciation),
      euro(j.furnitureDepreciation),
      euro(j.rehabDeduction),
      mitTon(j.allocatedTaxableResult, euro(j.allocatedTaxableResult)),
      euro(j.taxEffect),
    ]),
  );

  // Objektunterlagen
  neueSeite(l);
  const us = t.unterlagenSeite;
  const ut = t.unterlagen;
  augenbraue(l, us.augenbraue);
  ueberschrift(l, us.titel);
  absatz(l, us.einleitung, 8.5, BRAND.muted);
  const sanierungen = sanierungenBereinigt(documentData.renovations);
  kacheln(
    l,
    [
      {
        label: us.energieklasse,
        wert: documentData.energyClass || us.keineAngabe,
        notiz: documentData.energyValue > 0 ? `${zahl(documentData.energyValue, 1)} kWh/(m²·a)` : us.kennwertFehlt,
      },
      {
        label: us.ruecklagenbestand,
        wert: documentData.reserveAmount > 0 ? euro(documentData.reserveAmount) : us.keineAngabe,
        notiz: documentData.reserveAsOf ? us.stand(documentData.reserveAsOf) : us.stichtagFehlt,
      },
      { label: us.sanierungshistorie, wert: String(sanierungen.length), notiz: us.massnahmen(sanierungen.length) },
    ],
    3,
  );
  ueberschrift(l, ut.energieausweis);
  zeile(l, ut.art, documentData.certificateType || ut.keineAngabe);
  zeile(l, ut.energietraeger, documentData.energyCarrier || ut.keineAngabe);
  zeile(l, ut.gueltigBis, documentData.certificateValidUntil || ut.keineAngabe);
  l.y += 3;
  ueberschrift(l, ut.ruecklage);
  zeile(l, `${ut.gesamtbestand}${documentData.reserveAsOf ? ut.stand(documentData.reserveAsOf) : ""}`, euro(documentData.reserveAmount));
  zeile(l, ut.anteilEinheit, documentData.reserveUnitShare > 0 ? euro(documentData.reserveUnitShare) : ut.nichtAusgewiesen);
  l.y += 3;
  ueberschrift(l, ut.sanierungen);
  if (sanierungen.length > 0) for (const eintrag of sanierungen) absatz(l, `• ${eintrag}`, 8.5, BRAND.text);
  else absatz(l, ut.keineSanierungen, 8.5, BRAND.muted);
  ueberschrift(l, us.beruecksichtigteUnterlagen);
  if (documents.length > 0) {
    for (const dokument of documents) {
      zeile(l, dokument.name, `${dokument.category}${dokument.pages > 0 ? ` · ${us.seitenKurz(dokument.pages)}` : ""}`);
    }
    l.y += 3;
  } else {
    absatz(l, us.keineUnterlagen, 8.5, BRAND.muted);
  }
  ueberschrift(l, us.pruefhinweisTitel);
  absatz(l, us.pruefhinweis, 8, BRAND.muted);

  // Objektbilder, nur wenn es welche gibt
  if (bilder.length > 0) {
    neueSeite(l);
    augenbraue(l, t.fotoSeite.augenbraue);
    ueberschrift(l, input.propertyTitle || t.kopf.investmentobjekt);
    bilderraster(l, bilder);
  }

  // Glossar und Hinweis zur Modellrechnung
  neueSeite(l);
  augenbraue(l, t.glossarSeite.augenbraue);
  ueberschrift(l, k.glossar.ueberschriftDokument);
  const inhalt = glossar(k);
  absatz(l, inhalt.einleitung, 8.5, BRAND.muted);
  for (const gruppe of inhalt.gruppen) {
    platz(l, 20);
    schrift(l.doc, 9.5, true, BRAND.primary);
    l.doc.text(s(gruppe.titel), M, l.y + 2);
    l.y += 7;
    for (const eintrag of gruppe.eintraege) {
      platz(l, 14);
      schrift(l.doc, 8.5, true, BRAND.primary);
      l.doc.text(einpassen(l.doc, s(eintrag.titel), CW, 8.5, 6.5), M, l.y);
      l.y += 4;
      absatz(l, eintrag.bedeutung, 7.8, BRAND.text, 3.4);
      l.y -= 1;
      absatz(l, eintrag.formel, 7.2, BRAND.muted, 3.2);
    }
  }
  absatz(l, inhalt.rundung, 7, BRAND.muted);
  absatz(l, inhalt.keineSteuerberatung, 7, BRAND.muted);
  ueberschrift(l, t.fotoSeite.hinweisTitel);
  absatz(l, t.fotoSeite.hinweis, 7.2, BRAND.muted);
}

/** Die kompakte Vergleichsseite bei zwei Objekten, wie `ExposeVergleichsseite`. */
function vergleichsseite(l: Lauf, a: BerechnungPdfObjekt, b: BerechnungPdfObjekt) {
  const { sprache } = l;
  const t = l.t.vergleich;
  l.kopf = `OS Immobilien · ${l.t.kopf.investmentkalkulation} · ${t.marke}`;
  neueSeite(l);
  const alle = vergleicheObjekte({ eingabe: a.input, ergebnis: a.result }, { eingabe: b.input, ergebnis: b.result });
  const zeilen = VERGLEICHSSEITE_KENNZAHLEN.map((bez) => alle.find((z) => z.bezeichnung === bez)).filter(
    (z): z is Vergleichszeile => z !== undefined,
  );
  const laufzeit = Math.min(a.result.years.length, b.result.years.length);
  const letztesJahr = a.result.years[laufzeit - 1]?.year ?? a.input.startYear;
  const titelA = a.input.propertyTitle || t.objektA;
  const titelB = b.input.propertyTitle || t.objektB;

  augenbraue(l, t.marke);
  ueberschrift(l, t.titel);
  absatz(l, t.einleitung(sprache === "en" ? jahreEnglisch(laufzeit) : jahreDativ(laufzeit)), 8.5, BRAND.muted);
  kacheln(
    l,
    [
      { label: objektMarke(0, sprache), wert: formatEuro(ausgewiesenerKaufpreis(a.input, a.result), sprache), notiz: `${titelA} · ${a.input.address || t.adresseFehlt}` },
      { label: objektMarke(1, sprache), wert: formatEuro(ausgewiesenerKaufpreis(b.input, b.result), sprache), notiz: `${titelB} · ${b.input.address || t.adresseFehlt}` },
    ],
    2,
  );
  tabelle(
    l,
    [
      { titel: t.kennzahl, anteil: 34, links: true },
      { titel: `A · ${titelA}`, anteil: 22 },
      { titel: `B · ${titelB}`, anteil: 22 },
      { titel: t.unterschied, anteil: 22 },
    ],
    zeilen.map((z) => {
      const mitJahr = z.bezeichnung === "Immobilienwert" || z.bezeichnung === "Restschuld" || z.bezeichnung === "Gesamtvermögen";
      const unterschied = formatUnterschied(z.unterschied, z.einheit, sprache);
      return [
        `${vergleichBezeichnung(z.bezeichnung, sprache)}${mitJahr ? ` (${t.imJahr(letztesJahr)})` : ""}`,
        formatVergleichswert(z.wertA, z.einheit, sprache),
        formatVergleichswert(z.wertB, z.einheit, sprache),
        z.besser === "b" ? { text: unterschied, ton: "positiv" } : z.besser === "a" ? { text: unterschied, ton: "negativ" } : unterschied,
      ];
    }),
  );
  ueberschrift(l, t.vermoegenBeider);
  liniendiagramm(
    l,
    a.result.years.slice(0, laufzeit).map((j) => j.year),
    [
      { werte: a.result.years.slice(0, laufzeit).map((j) => j.totalWealth), farbe: BRAND.accent, label: `A · ${titelA}` },
      { werte: b.result.years.slice(0, laufzeit).map((j) => j.totalWealth), farbe: BRAND.muted, label: `B · ${titelB}` },
    ],
    52,
  );
  ueberschrift(l, t.einordnung);
  absatz(l, einordnung({ eingabe: a.input, ergebnis: a.result }, { eingabe: b.input, ergebnis: b.result }, sprache), 9);
  absatz(l, t.kleingedruckt, 7, BRAND.muted);
}

/** Dateiname ohne Kundennamen: Berechnung_<Objekt>_<Einheit>_<Datum>.pdf. */
export function berechnungPdfDateiname(
  objekte: Pick<BerechnungPdfObjekt, "input">[],
  sprache: FormatSprache = "de",
  datum: Date = new Date(),
): string {
  const sauber = (text: string) =>
    text
      .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
      .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  // Die Vorbelegung setzt den Titel als „Objekt, Einheit“ zusammen.
  const [objekt = "", ...einheit] = (objekte[0]?.input.propertyTitle ?? "").split(",");
  const tag = `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, "0")}-${String(datum.getDate()).padStart(2, "0")}`;
  const teile = [
    sprache === "en" ? "Calculation" : "Berechnung",
    sauber(objekt) || (sprache === "en" ? "Property" : "Objekt"),
    sauber(einheit.join(" ")),
    objekte.length > 1 ? (sprache === "en" ? "Comparison" : "Vergleich") : "",
    tag,
  ];
  return `${teile.filter(Boolean).join("_")}.pdf`;
}

/**
 * Baut das PDF. Ein Objekt ergibt die Berechnung, zwei Objekte die
 * Vergleichsseite und danach je Objekt die ganze Berechnung.
 */
export async function erzeugeBerechnungPdf(objekte: BerechnungPdfObjekt[], sprache: FormatSprache = "de"): Promise<jsPDF> {
  if (objekte.length === 0) throw new Error("Keine Berechnung zum Herunterladen");
  const spr: FormatSprache = sprache === "en" ? "en" : "de";
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  await ensureUnicodeFont(doc);
  const [logo, icon] = await Promise.all([loadLogo(), loadIcon()]);
  const bilder = await Promise.all(
    objekte.map(async (objekt) =>
      (await Promise.all(objekt.photos.slice(0, 6).map((foto) => ladeBild(doc, foto)))).filter((b): b is Bild => b !== null),
    ),
  );
  const t = dokumentTexteFuer(spr);
  const k = kennzahlTexteFuer(spr);
  const vergleich = objekte.length > 1;
  const erstes = objekte[0].input;

  addCoverPage(doc, icon, {
    sprache: spr,
    kennung: t.kopf.persoenlicheKalkulation,
    titel: vergleich ? t.vergleich.titel : erstes.propertyTitle || t.kopf.investmentobjekt,
    untertitel: vergleich
      ? objekte.slice(0, 2).map((o, i) => `${objektMarke(i, spr)}: ${o.input.propertyTitle || o.input.address || ""}`).join("  ·  ")
      : erstes.address || undefined,
    empfaenger: erstes.clientName.trim() || undefined,
  });

  const lauf: Lauf = { doc, logo, kopf: "", y: 0, sprache: spr, t, k };
  if (vergleich) {
    vergleichsseite(lauf, objekte[0], objekte[1]);
    objekte.slice(0, 2).forEach((objekt, i) => objektteil(lauf, objekt, bilder[i], objektMarke(i, spr)));
  } else {
    objektteil(lauf, objekte[0], bilder[0]);
  }

  const seiten = doc.getNumberOfPages();
  for (let seite = 2; seite <= seiten; seite++) {
    doc.setPage(seite);
    addBrandedFooter(doc, seite, seiten);
  }
  return doc;
}

/** Baut das PDF und speichert es direkt, ohne Druckdialog. Gibt den Dateinamen zurück. */
export async function ladeBerechnungPdfHerunter(objekte: BerechnungPdfObjekt[], sprache: FormatSprache = "de"): Promise<string> {
  const doc = await erzeugeBerechnungPdf(objekte, sprache);
  const name = berechnungPdfDateiname(objekte, sprache);
  doc.save(name);
  return name;
}
