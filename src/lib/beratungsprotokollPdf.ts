import jsPDF from "jspdf";
import {
  addBrandedFooter, addBrandedHeader, brandedRow, brandedSectionTitle, BRAND, ensureUnicodeFont, loadLogo, PDF_FONT, sanitizePdfText,
} from "./pdfBranding";
import { datumDe, TEXTE, type BeratungsprotokollDaten } from "./beratungsprotokoll";

export interface ProtokollUnterschrift {
  name: string;
  /** data:image/png;base64,… */
  signatureData: string;
  /** ISO */
  signedAt: string;
}

const W = 210;
const H = 297;
const RAND = 20;
const BREITE = W - 2 * RAND;
/** Unterhalb davon beginnt die Fußzeile. */
const UNTEN = H - 28;

const zeitpunkt = (iso: string) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium", timeStyle: "short" });

/**
 * Das Beratungs- und Qualitätsprotokoll als PDF im Erscheinungsbild der
 * übrigen Kundendokumente. Dieselbe Funktion zeichnet die Live-Vorschau im
 * CRM, die Ansicht auf der Signaturseite und das endgültige PDF, das nach
 * der Unterschrift des Kunden im Investment abgelegt wird.
 *
 * Ohne Unterschriften bleiben die Unterschriftsfelder leer. Die Unterschrift
 * des Kunden steht an jeder Bestätigung der Vorlage (er unterschreibt einmal
 * elektronisch für das ganze Dokument).
 */
export async function erzeugeBeratungsprotokollPdf(
  d: BeratungsprotokollDaten,
  unterschriften?: { vp?: ProtokollUnterschrift; kunde?: ProtokollUnterschrift },
): Promise<jsPDF> {
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  let y = addBrandedHeader(doc, logo, TEXTE.titel);
  const ortDatum = [d.ort.trim(), datumDe(d.datum)].filter(Boolean).join(", ");

  const platz = (noetig: number) => {
    if (y + noetig <= UNTEN) return;
    doc.addPage();
    y = addBrandedHeader(doc, logo, TEXTE.titel);
  };

  const absatz = (text: string, opt: { groesse?: number; fett?: boolean; farbe?: [number, number, number]; einzug?: number } = {}) => {
    const groesse = opt.groesse ?? 8.5;
    const einzug = opt.einzug ?? 0;
    doc.setFont(PDF_FONT, opt.fett ? "bold" : "normal");
    doc.setFontSize(groesse);
    doc.setTextColor(...(opt.farbe ?? BRAND.text));
    const zeilen: string[] = doc.splitTextToSize(sanitizePdfText(text), BREITE - einzug);
    const zeilenHoehe = groesse * 0.45;
    for (const zeile of zeilen) {
      platz(zeilenHoehe);
      doc.text(zeile, RAND + einzug, y);
      y += zeilenHoehe;
    }
    y += 1.6;
  };

  const abschnitt = (titel: string) => {
    platz(22);
    y += 2;
    y = brandedSectionTitle(doc, titel, y, RAND, BREITE);
  };

  const zeilen = (paare: Array<[string, string]>) => {
    for (const [label, wert] of paare) {
      platz(8);
      y = brandedRow(doc, label, wert, RAND, y, 62, BREITE);
    }
    y += 1;
  };

  const kreuz = (an: boolean, text: string) => {
    doc.setFontSize(8.5);
    const zeilenZahl = (doc.splitTextToSize(sanitizePdfText(text), BREITE - 7) as string[]).length;
    platz(zeilenZahl * 3.9 + 2);
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.3);
    doc.rect(RAND, y - 2.9, 3.4, 3.4);
    if (an) {
      doc.setFillColor(...BRAND.accent);
      doc.rect(RAND + 0.7, y - 2.2, 2, 2, "F");
    }
    const start = y;
    absatz(text, { einzug: 7, fett: an, farbe: an ? BRAND.primary : BRAND.text });
    if (y < start + 5) y = start + 5;
  };

  /** Zeile „Ort, Datum“ bzw. „Datum“ mit Wert, optional mit Unterschrift des Kunden. */
  const ortZeile = (label: string, wert: string) => {
    platz(7);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.primary);
    doc.text(label, RAND, y);
    doc.setFont(PDF_FONT, "normal");
    doc.text(sanitizePdfText(wert || ""), RAND + doc.getTextWidth(label) + 2, y);
    y += 6;
  };

  const unterschriftBild = (sig: ProtokollUnterschrift | undefined, x: number, oben: number, breite: number) => {
    if (!sig?.signatureData) return;
    try {
      doc.addImage(sig.signatureData, "PNG", x, oben, breite, breite * 0.33);
    } catch {
      /* ungültiges Bild: Feld bleibt leer */
    }
  };

  /** Bestätigungsfeld der Vorlage: Linie, darunter klein die Beschriftung. */
  const bestaetigung = (abschnitte: string) => {
    platz(26);
    y += 2;
    const linieY = y + 15;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.primary);
    if (ortDatum) doc.text(sanitizePdfText(ortDatum), RAND, linieY - 1.5);
    unterschriftBild(unterschriften?.kunde, RAND + 95, y, 45);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.line(RAND, linieY, RAND + BREITE, linieY);
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(TEXTE.bestaetigung(abschnitte), RAND + BREITE / 2, linieY + 3.5, { align: "center" });
    y = linieY + 9;
  };

  // ── Titel und Einleitung ──
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(16);
  doc.setTextColor(...BRAND.primary);
  doc.text(TEXTE.titel.toUpperCase(), RAND, y);
  y += 6;
  absatz(TEXTE.untertitel, { groesse: 9, farbe: BRAND.muted });
  y += 2;
  absatz(TEXTE.einleitung);
  // Hinweis als Kasten wie in der Vorlage
  doc.setFontSize(8);
  const hinweis: string[] = doc.splitTextToSize(sanitizePdfText(TEXTE.hinweisOben), BREITE - 8);
  const kastenHoehe = hinweis.length * 3.6 + 4;
  platz(kastenHoehe + 2);
  doc.setFillColor(...BRAND.light);
  doc.rect(RAND, y - 1, BREITE, kastenHoehe, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(RAND, y - 1, 1.2, kastenHoehe, "F");
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.text);
  doc.text(hinweis, RAND + 4, y + 2.6);
  y += kastenHoehe + 3;

  // ── 1 bis 4 ──
  abschnitt(TEXTE.a1);
  zeilen([
    [TEXTE.a1Zeilen.kaeuferName, d.kaeuferName],
    [TEXTE.a1Zeilen.kaeuferAnschrift, d.kaeuferAnschrift],
    [TEXTE.a1Zeilen.weitereKaeufer, d.weitereKaeufer],
  ]);
  abschnitt(TEXTE.a2);
  zeilen([
    [TEXTE.a2Zeilen.objektAdresse, d.objektAdresse],
    [TEXTE.a2Zeilen.objektLage, d.objektLage],
    [TEXTE.a2Zeilen.einheitNr, d.einheitNr],
    [TEXTE.a2Zeilen.groesse, d.groesse],
    [TEXTE.a2Zeilen.verkaufspreis, d.verkaufspreis],
    [TEXTE.a2Zeilen.stellplatz, d.stellplatz],
  ]);
  absatz(TEXTE.a2Text, { groesse: 8, farbe: BRAND.muted });
  abschnitt(TEXTE.a3);
  absatz(TEXTE.a3Text);
  abschnitt(TEXTE.a4);
  kreuz(d.nutzung === "eigennutzung", TEXTE.a4Eigennutzung);
  kreuz(d.nutzung === "vermietung", TEXTE.a4Vermietung);
  absatz(TEXTE.a4Besichtigt(d.besichtigtGeschoss.trim(), d.besichtigtLage));
  ortZeile(TEXTE.ortDatum, ortDatum);
  bestaetigung("1 bis 4");

  // ── 5 ──
  abschnitt(TEXTE.a5);
  absatz(TEXTE.a5Hinweis);
  const beauftragter = d.besichtigung === "beauftragt" || d.besichtigung === "beauftragt_zugeschaltet" ? d.beauftragter.trim() : "";
  kreuz(d.besichtigung === "selbst", TEXTE.a5Selbst);
  kreuz(d.besichtigung === "beauftragt_zugeschaltet", TEXTE.a5Zugeschaltet(d.besichtigung === "beauftragt_zugeschaltet" ? beauftragter : ""));
  kreuz(d.besichtigung === "beauftragt", TEXTE.a5Beauftragt(d.besichtigung === "beauftragt" ? beauftragter : ""));
  kreuz(d.besichtigung === "nicht_wahrgenommen", TEXTE.a5Nicht);
  absatz(TEXTE.a5Text);
  ortZeile(TEXTE.datum, datumDe(d.datum));
  platz(16);
  ortZeile(TEXTE.unterschriftKaeufer, "");
  unterschriftBild(unterschriften?.kunde, RAND + 30, y - 11, 36);
  y += 4;
  bestaetigung("5");

  // ── 6 bis 11 ──
  abschnitt(TEXTE.a6);
  zeilen([
    [TEXTE.a6Zeilen.kaufangebot, d.kaufangebot],
    [TEXTE.a6Zeilen.vertriebDurch, d.vertriebDurch],
  ]);
  for (const text of TEXTE.a6Text) absatz(text);
  abschnitt(TEXTE.a7);
  absatz(TEXTE.a7Text);
  abschnitt(TEXTE.a8);
  absatz(TEXTE.a8Text);
  abschnitt(TEXTE.a9);
  absatz(TEXTE.a9Text);
  abschnitt(TEXTE.a10);
  kreuz(d.mietverhaeltnis === "leer", TEXTE.a10Leer);
  kreuz(d.mietverhaeltnis === "vermietet", TEXTE.a10Vermietet(d.mietverhaeltnis === "vermietet" ? d.nettokaltmiete.trim() : ""));
  absatz(TEXTE.a10Text);
  abschnitt(TEXTE.a11);
  absatz(TEXTE.a11Text);
  ortZeile(TEXTE.a11Uebergeben, datumDe(d.unterlagenUebergebenAm));
  for (const text of TEXTE.a11Text2) absatz(text);
  ortZeile(TEXTE.ortDatum, ortDatum);
  bestaetigung("6 bis 11");

  // ── 12 bis 15 ──
  abschnitt(TEXTE.a12);
  absatz(TEXTE.a12Text);
  abschnitt(TEXTE.a13);
  for (const text of TEXTE.a13Text) absatz(text);
  absatz(TEXTE.a13Hinweis, { groesse: 8, farbe: BRAND.muted });
  abschnitt(TEXTE.a14);
  absatz(TEXTE.a14Text);
  abschnitt(TEXTE.a15);
  for (const text of TEXTE.a15Text) absatz(text);
  bestaetigung("12 bis 15");

  // ── 16 und 17 ──
  abschnitt(TEXTE.a16);
  zeilen([
    [TEXTE.a16Zeilen.erstkontaktDurch, d.erstkontaktDurch],
    [TEXTE.a16Zeilen.erstgespraechVon, d.erstgespraechVon],
    [TEXTE.a16Zeilen.erstgespraechOrt, d.erstgespraechOrt],
    [TEXTE.a16Zeilen.erstgespraechDatum, datumDe(d.erstgespraechDatum)],
    [TEXTE.a16Zeilen.unterlagenPapierAm, datumDe(d.unterlagenPapierAm)],
  ]);
  abschnitt(TEXTE.a17);
  for (const text of TEXTE.a17Text) absatz(text);
  ortZeile(TEXTE.ortDatum, ortDatum);

  // ── Unterschriften ──
  platz(46);
  y += 2;
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.primary);
  doc.text(TEXTE.unterschriften, RAND, y);
  y += 4;
  const spalte = (BREITE - 10) / 2;
  const feld = (x: number, titel: string, name: string, sig?: ProtokollUnterschrift) => {
    unterschriftBild(sig, x, y, 55);
    const linieY = y + 22;
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.3);
    doc.line(x, linieY, x + spalte, linieY);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.primary);
    doc.text(sanitizePdfText(sig?.name || name || ""), x, linieY + 4);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(titel, x, linieY + 7.5);
    if (sig?.signedAt) doc.text(TEXTE.unterschriebenAm(zeitpunkt(sig.signedAt)), x, linieY + 11);
  };
  feld(RAND, TEXTE.unterschriftVp, d.vertriebDurch, unterschriften?.vp);
  feld(RAND + spalte + 10, TEXTE.unterschriftKunde, [d.kaeuferName, d.weitereKaeufer].filter((s) => s.trim()).join(", "), unterschriften?.kunde);

  const seiten = doc.getNumberOfPages();
  for (let i = 1; i <= seiten; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i, seiten);
  }
  doc.setTextColor(0, 0, 0);
  return doc;
}
