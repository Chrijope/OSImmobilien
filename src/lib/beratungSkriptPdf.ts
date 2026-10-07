/**
 * Sprechskripte zur Beratungspräsentation MOREImmo als PDF.
 *
 * Bewusst ohne Abbildungen aus der Präsentation. Die Vorgängerfassung arbeitete
 * mit Bildschirmfotos aus einem laufenden Vorschaufenster, war dadurch langsam,
 * fehleranfällig und auf einen geladenen Browser angewiesen. Dieses Dokument
 * entsteht rein aus Text und ist deshalb sofort da: ein Klick, ein Download,
 * keine Wartezeit und kein Zwischenspeicher.
 *
 * Die Zuordnung zur Präsentation läuft über die Abschnittsnummer, die vor jedem
 * Skript groß ausgewiesen ist. Am Bildschirm läuft dieselbe Reihenfolge.
 *
 * Aufbau: Deckblatt, Übersicht mit Seitenzahlen, ein Abschnitt je Station,
 * Hinweisblatt.
 */
import jsPDF from "jspdf";
import {
  loadLogo,
  loadIcon,
  BRAND,
  ensureUnicodeFont,
  PDF_FONT,
  sanitizePdfText,
  addCoverPage,
  addBrandedHeader,
  addBrandedFooter,
  brandedSectionTitle,
} from "@/lib/pdfBranding";
import { BERATUNG_SPRECHSKRIPTE, sprechskriptFuerAnrede } from "@/lib/beratungSprechskripte";

// A4 Hochformat in Millimetern
const SEITE_B = 210;
const SEITE_H = 297;
const RAND = 20;
const BREITE = SEITE_B - RAND * 2;
/** Unterste Zeile, die Text belegen darf. Der Markenfuss beginnt bei H minus 20. */
const UNTERKANTE = SEITE_H - 32;

const TITEL = "Sprechskripte zur Beratungspräsentation";

/** Breite der Nummernspalte. Der Text daneben beginnt eingerückt. */
const NR_SPALTE = 16;
const TEXT_X = RAND + NR_SPALTE;
const TEXT_B = SEITE_B - RAND - TEXT_X;

export const SKRIPT_PDF_DATEINAME = "MOREImmo_Sprechskripte_Beratung.pdf";

export async function buildBeratungSkriptPdf(): Promise<{ blob: Blob; dateiname: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  // Das Deckblatt ist dunkel, dort traegt nur die Bildmarke.
  const icon = await loadIcon();

  // Das ganze Projekt spricht per Du. Ohne Du-Fassung bleibt die Sie-Fassung,
  // sie enthält dann keine direkte Anrede.
  const skripte = BERATUNG_SPRECHSKRIPTE.map((s) => sprechskriptFuerAnrede(s, "du"));
  let y = 0;

  const neueSeite = () => {
    doc.addPage();
    y = addBrandedHeader(doc, logo, TITEL);
  };

  const platzPruefen = (hoehe: number) => {
    if (y + hoehe > UNTERKANTE) neueSeite();
  };

  /** Fließtext in einer Spalte, Zeile für Zeile mit Umbruchprüfung. */
  const absatz = (
    text: string,
    opts: { x?: number; breite?: number; groesse?: number; farbe?: [number, number, number]; zeile?: number } = {},
  ) => {
    const x = opts.x ?? TEXT_X;
    const breite = opts.breite ?? TEXT_B;
    const groesse = opts.groesse ?? 10;
    const zeile = opts.zeile ?? 5.2;
    const farbe = opts.farbe ?? BRAND.text;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(groesse);
    for (const ln of doc.splitTextToSize(sanitizePdfText(text), breite) as string[]) {
      platzPruefen(zeile);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(groesse);
      doc.setTextColor(...farbe);
      doc.text(ln, x, y);
      y += zeile;
    }
    doc.setTextColor(0, 0, 0);
  };

  /** Kleine Versalzeile über einem Block. */
  const label = (text: string, x = TEXT_X) => {
    platzPruefen(6);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(sanitizePdfText(text), x, y, { charSpace: 0.6 });
    doc.setTextColor(0, 0, 0);
    y += 4.6;
  };

  /* ── Deckblatt ── */
  addCoverPage(doc, icon, {
    kennung: "Vertriebsakademie · Kapitel 5 · Beratungsgespräch",
    titel: "Sprechskripte zur Beratungspräsentation",
    untertitel: "Was du in welchem Abschnitt sagst, und warum",
    datum: new Date().toLocaleDateString("de-DE"),
    fusszeile: "Nur für den internen Gebrauch. Nicht an Kunden weitergeben.",
  });

  /* ── Übersicht, Seite bleibt zunächst leer ── */
  doc.addPage();
  const uebersichtSeite = doc.getNumberOfPages();

  /* ── Die Abschnitte ── */
  const eintraege: { nr: string; station: string; seite: number }[] = [];
  neueSeite();

  skripte.forEach((s, i) => {
    const nr = String(i + 1).padStart(2, "0");

    // Ein Abschnitt beginnt nie mit weniger als sechs Zeilen Platz darunter,
    // sonst steht die Nummer allein am Seitenende.
    platzPruefen(34);
    if (i > 0) y += 4;

    const kopfY = y;

    // Nummernplakette. Sie ist die Bruecke zur Praesentation, deshalb gross.
    doc.setFillColor(...BRAND.accent);
    doc.roundedRect(RAND, kopfY - 5.5, 12, 9, 1.5, 1.5, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.white);
    doc.text(nr, RAND + 6, kopfY + 0.8, { align: "center" });

    // Stationsname
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...BRAND.primary);
    const titelZeilen = doc.splitTextToSize(sanitizePdfText(s.station), TEXT_B) as string[];
    doc.text(titelZeilen, TEXT_X, kopfY);
    y = kopfY + titelZeilen.length * 6 + 3;

    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.line(TEXT_X, y, SEITE_B - RAND, y);
    y += 6;
    doc.setTextColor(0, 0, 0);

    eintraege.push({ nr, station: s.station, seite: doc.getNumberOfPages() - 1 });

    if (s.ueberleitung) {
      label("ÜBERLEITUNG DAVOR");
      const start = y;
      absatz(`„${s.ueberleitung}“`, { x: TEXT_X + 5, breite: TEXT_B - 5, groesse: 9.5, zeile: 4.8 });
      // Senkrechte Marke daneben, damit sich die Ueberleitung vom Skript abhebt.
      // Nur zeichnen, wenn kein Seitenumbruch dazwischenlag.
      if (y > start) {
        doc.setDrawColor(...BRAND.accentLight);
        doc.setLineWidth(1.2);
        doc.line(TEXT_X + 1, start - 3.4, TEXT_X + 1, y - 4);
      }
      y += 3;
    }

    label("SPRECHSKRIPT");
    absatz(`„${s.skript}“`, { groesse: 10.5, farbe: BRAND.primary, zeile: 5.4 });
    y += 3;

    // Begruendung in einem ruhigen Kasten, klar als Innensicht erkennbar
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    const warumZeilen = doc.splitTextToSize(sanitizePdfText(s.warum), TEXT_B - 10) as string[];
    const kastenH = warumZeilen.length * 4.3 + 11;
    platzPruefen(kastenH + 4);
    doc.setFillColor(...BRAND.light);
    doc.rect(TEXT_X, y, TEXT_B, kastenH, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(TEXT_X, y, 1.4, kastenH, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text("WARUM DAS SO AUFGEBAUT IST", TEXT_X + 5, y + 5.5, { charSpace: 0.6 });
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.text);
    let wy = y + 10.5;
    for (const ln of warumZeilen) {
      doc.text(ln, TEXT_X + 5, wy);
      wy += 4.3;
    }
    doc.setTextColor(0, 0, 0);
    y += kastenH + 8;
  });

  /* ── Hinweisblatt ── */
  neueSeite();
  y = brandedSectionTitle(doc, "Hinweise zur Nutzung", y, RAND, BREITE);
  y += 4;
  for (const a of [
    "Die Skripte sind Leitplanken, kein Vorlesetext. Wer abliest, klingt wie ein Anrufbeantworter. Lies einen Abschnitt, leg das Blatt weg und sprich ihn in eigenen Worten.",
    "Die Reihenfolge der Abschnitte ist bewusst gewählt und trägt sich gegenseitig. Wer einen Abschnitt überspringt, nimmt dem folgenden die Grundlage. Wenn die Zeit knapp wird, kürze innerhalb eines Abschnitts, nicht den Abschnitt selbst.",
    "Die Begründung unter jedem Skript ist für dich, nicht für den Kunden. Sie erklärt, welche Wirkung der Abschnitt haben soll. Wer sie verstanden hat, kann improvisieren, ohne die Wirkung zu verlieren.",
    "Die Nummer vor jedem Abschnitt entspricht der Reihenfolge in der Präsentation. So findest du im Gespräch sofort die passende Stelle.",
    "Dieses Dokument ist ausschließlich für interne Schulungszwecke bestimmt. Es enthält Formulierungen und Begründungen, die nicht für Kundenaugen gedacht sind. Bitte nicht weitergeben und im Termin nicht offen liegen lassen.",
  ]) {
    absatz(a, { x: RAND, breite: BREITE });
    y += 3;
  }

  /* ── Übersicht nachtragen, jetzt sind die Seitenzahlen bekannt ── */
  doc.setPage(uebersichtSeite);
  let uy = addBrandedHeader(doc, logo, TITEL);
  uy = brandedSectionTitle(doc, "Die Abschnitte im Überblick", uy, RAND, BREITE);
  uy += 5;
  for (const e of eintraege) {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.accent);
    doc.text(e.nr, RAND, uy);

    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...BRAND.text);
    const name = (doc.splitTextToSize(sanitizePdfText(e.station), BREITE - 30) as string[])[0];
    doc.text(name, RAND + 10, uy);

    const punkteVon = RAND + 10 + doc.getTextWidth(name) + 2;
    const punkteBis = SEITE_B - RAND - 8;
    if (punkteBis > punkteVon) {
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.2);
      doc.line(punkteVon, uy - 1, punkteBis, uy - 1);
    }

    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.accent);
    doc.text(String(e.seite), SEITE_B - RAND, uy, { align: "right" });
    uy += 7;
  }
  doc.setTextColor(0, 0, 0);

  /* ── Fusszeilen zuletzt, das Deckblatt bleibt ohne ── */
  const gesamt = doc.getNumberOfPages();
  for (let i = 2; i <= gesamt; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, gesamt - 1);
  }

  return { blob: doc.output("blob"), dateiname: SKRIPT_PDF_DATEINAME };
}
