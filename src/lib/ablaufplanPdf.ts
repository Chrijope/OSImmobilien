import jsPDF from "jspdf";
import {
  addCoverPage,
  addBrandedHeader,
  addBrandedFooter,
  loadLogo,
  loadIcon,
  BRAND,
  ensureUnicodeFont,
  sanitizePdfText,
  PDF_FONT,
} from "./pdfBranding";
import {
  ABLAUF_STATIONEN,
  ABLAUF_GESAMTDAUER,
  ABLAUF_GRUNDREGEL,
  ABLAUF_ORIENTIERUNG,
  ablaufStufenLabel,
} from "./ablaufplan";

/**
 * PDF "Ablaufplan": der Gesamtablauf von Neuer Lead bis Provisionszahlung
 * als gestaltete Zeitleiste im Haus-CI: dunkles Deckblatt aus addCoverPage,
 * laufender Kopf aus addBrandedHeader, Fusszeile aus addBrandedFooter.
 *
 * Inhaltlich identisch mit der Akademie-Seite "Der Weg zum Abschluss",
 * beide lesen aus `src/lib/ablaufplan.ts`.
 */

const W = 210;
const H = 297;
/** Gleicher Rand wie der Haus-Renderer simpleDocPdf. */
const MARGIN = 20;
const CONTENT_W = W - 2 * MARGIN;
const BOTTOM_LIMIT = H - 32;

/** Spalte, in der der Stationstext beginnt (rechts neben dem Nummernkreis). */
const TEXT_X = MARGIN + 14;
const TEXT_W = W - MARGIN - TEXT_X;

/** Erfolgsgruen der letzten Station, derselbe Ton wie die Erfolgs-Callouts in simpleDocPdf. */
const ERFOLG: [number, number, number] = [40, 140, 90];

const setColor = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

/**
 * Hoehe einer Station vorab messen, damit sie nie ueber den Seitenumbruch
 * bricht. Die Abstaende sind bewusst kompakt gewaehlt, damit alle acht
 * Stationen UND der Gesamtdauer-Kasten gemeinsam auf eine Inhaltsseite
 * passen; eine zweite Seite nur fuer den Kasten waere Verschwendung.
 */
function stationHoehe(
  doc: jsPDF,
  beschreibung: string,
  stufenZeile: string,
  zeitZusatz?: string,
  imCrm?: string[],
): number {
  doc.setFontSize(9.5);
  const beschrZeilen = doc.splitTextToSize(sanitizePdfText(beschreibung), TEXT_W) as string[];
  doc.setFontSize(8);
  const stufenZeilen = doc.splitTextToSize(sanitizePdfText(stufenZeile), TEXT_W) as string[];
  // Der CRM-Block: Ueberschrift plus je Satz seine umbrochenen Zeilen.
  let crmHoehe = 0;
  if (imCrm && imCrm.length > 0) {
    doc.setFontSize(8.5);
    crmHoehe = 4.5;
    for (const satz of imCrm) {
      const zeilen = doc.splitTextToSize(sanitizePdfText(satz), TEXT_W - 4) as string[];
      crmHoehe += zeilen.length * 3.9 + 1.2;
    }
    crmHoehe += 3;
  }
  // Titelzeile 5.5, Zusatz 3.5, Beschreibung, CRM-Block, Stufenzeilen, Abstand 5
  return 5.5 + (zeitZusatz ? 3.5 : 0) + beschrZeilen.length * 4.2 + crmHoehe + stufenZeilen.length * 3.7 + 5;
}

export async function generateAblaufplanPDF(): Promise<void> {
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const icon = await loadIcon();

  // Dunkles Deckblatt im Hausmuster
  addCoverPage(doc, icon, {
    kennung: "Vertriebsakademie",
    titel: "Ablaufplan",
    untertitel: "Vom neuen Lead bis zur Provisionszahlung",
  });
  doc.addPage();

  const kopf = () => addBrandedHeader(doc, logo, "Ablaufplan");
  let y = kopf();

  // Kurze Einordnung auf der ersten Inhaltsseite
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  setColor(doc, BRAND.muted);
  const intro = doc.splitTextToSize(
    sanitizePdfText(
      "Alle acht Stationen von Neuer Lead bis Provisionszahlung, den Pipelinestufen zugeordnet, mit Zeitangaben je Termin.",
    ),
    CONTENT_W,
  ) as string[];
  for (const zeile of intro) {
    doc.text(zeile, MARGIN, y);
    y += 4.5;
  }
  y += 4;

  // Wo alles zu finden ist, vor der Grundregel. Beide Bloecke werden gleich
  // gezeichnet, deshalb eine kleine Hilfsfunktion statt zweimal derselbe Code.
  const kasten = (titel: string, saetze: string[]) => {
    doc.setFontSize(8.8);
    const zeilenProSatz = saetze.map(
      (satz) => doc.splitTextToSize(sanitizePdfText(satz), CONTENT_W - 14) as string[],
    );
    const h = 9 + zeilenProSatz.reduce((sum, z) => sum + z.length * 4.1 + 1.2, 0) + 3;
    if (y + h > BOTTOM_LIMIT) { doc.addPage(); y = kopf(); }
    setFill(doc, BRAND.light);
    doc.roundedRect(MARGIN, y, CONTENT_W, h, 2, 2, "F");
    let ry = y + 6;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9.5);
    setColor(doc, BRAND.primary);
    doc.text(sanitizePdfText(titel), MARGIN + 5, ry);
    ry += 5.5;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.8);
    setColor(doc, BRAND.text);
    zeilenProSatz.forEach((zeilen) => {
      zeilen.forEach((zeile, i) => {
        if (i === 0) doc.text("\u2022", MARGIN + 5, ry);
        doc.text(zeile, MARGIN + 9, ry);
        ry += 4.1;
      });
      ry += 1.2;
    });
    y += h + 6;
  };

  kasten(ABLAUF_ORIENTIERUNG.titel, ABLAUF_ORIENTIERUNG.saetze);

  // Die Grundregel gilt an jeder Station und steht deshalb einmal davor.
  // Seite und PDF zeigen sie identisch, beide lesen aus ABLAUF_GRUNDREGEL.
  {
    doc.setFontSize(8.8);
    const regelZeilen = ABLAUF_GRUNDREGEL.saetze.map(
      (satz) => doc.splitTextToSize(sanitizePdfText(satz), CONTENT_W - 14) as string[],
    );
    const regelH = 9 + regelZeilen.reduce((sum, z) => sum + z.length * 4.1 + 1.2, 0) + 3;
    setFill(doc, BRAND.light);
    doc.roundedRect(MARGIN, y, CONTENT_W, regelH, 2, 2, "F");
    let ry = y + 6;
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9.5);
    setColor(doc, BRAND.primary);
    doc.text(sanitizePdfText(ABLAUF_GRUNDREGEL.titel), MARGIN + 5, ry);
    ry += 5.5;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.8);
    setColor(doc, BRAND.text);
    regelZeilen.forEach((zeilen) => {
      zeilen.forEach((zeile, i) => {
        if (i === 0) doc.text("\u2022", MARGIN + 5, ry);
        doc.text(zeile, MARGIN + 9, ry);
        ry += 4.1;
      });
      ry += 1.2;
    });
    y += regelH + 6;
  }

  ABLAUF_STATIONEN.forEach((station, i) => {
    const istLetzte = i === ABLAUF_STATIONEN.length - 1;
    const stufenZeile = `Pipelinestufen: ${station.stufen.map(ablaufStufenLabel).join(" · ")}`;
    const hoehe = stationHoehe(doc, station.beschreibung, stufenZeile, station.zeitZusatz, station.imCrm);

    if (y + hoehe > BOTTOM_LIMIT) {
      doc.addPage();
      y = kopf();
    }

    const kreisY = y - 1.6;

    // Verbindungslinie zur naechsten Station
    if (!istLetzte) {
      setDraw(doc, BRAND.separator);
      doc.setLineWidth(0.5);
      doc.line(MARGIN + 4.5, kreisY + 4.5, MARGIN + 4.5, kreisY + hoehe + 3);
    }

    // Nummernkreis
    setFill(doc, istLetzte ? ERFOLG : BRAND.accent);
    doc.circle(MARGIN + 4.5, kreisY, 4.5, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(10);
    setColor(doc, BRAND.white);
    doc.text(String(i + 1), MARGIN + 4.5, kreisY + 1.3, { align: "center" });

    // Titel links, Zeitnote rechts
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(12);
    setColor(doc, BRAND.primary);
    doc.text(sanitizePdfText(station.titel), TEXT_X, y);
    if (station.zeit) {
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(10);
      setColor(doc, BRAND.accentDark);
      doc.text(sanitizePdfText(station.zeit), W - MARGIN, y, { align: "right" });
    }
    y += 5.5;

    if (station.zeitZusatz) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8);
      setColor(doc, BRAND.accentDark);
      doc.text(sanitizePdfText(station.zeitZusatz), W - MARGIN, y - 2, { align: "right" });
      y += 3.5;
    }

    // Beschreibung
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9.5);
    setColor(doc, BRAND.text);
    const beschrZeilen = doc.splitTextToSize(sanitizePdfText(station.beschreibung), TEXT_W) as string[];
    for (const zeile of beschrZeilen) {
      doc.text(zeile, TEXT_X, y);
      y += 4.2;
    }

    // So machst du das im CRM
    if (station.imCrm && station.imCrm.length > 0) {
      y += 1.5;
      doc.setFont(PDF_FONT, "bold");
      doc.setFontSize(8);
      setColor(doc, BRAND.primary);
      doc.text("SO MACHST DU DAS IM CRM", TEXT_X, y);
      y += 4.5;
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8.5);
      setColor(doc, BRAND.text);
      for (const satz of station.imCrm) {
        const zeilen = doc.splitTextToSize(sanitizePdfText(satz), TEXT_W - 4) as string[];
        zeilen.forEach((zeile, i) => {
          if (i === 0) {
            setColor(doc, BRAND.primary);
            doc.text("\u2022", TEXT_X, y);
            setColor(doc, BRAND.text);
          }
          doc.text(zeile, TEXT_X + 4, y);
          y += 3.9;
        });
        y += 1.2;
      }
      y += 1.5;
    }

    // Zugeordnete Pipelinestufen
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    setColor(doc, BRAND.muted);
    const stufenZeilen = doc.splitTextToSize(sanitizePdfText(stufenZeile), TEXT_W) as string[];
    for (const zeile of stufenZeilen) {
      doc.text(zeile, TEXT_X, y);
      y += 3.7;
    }

    y += 5;
  });

  // Gesamtdauer-Kasten
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9.5);
  const dauerZeilen = doc.splitTextToSize(sanitizePdfText(ABLAUF_GESAMTDAUER), CONTENT_W - 12) as string[];
  const kastenH = 12 + dauerZeilen.length * 4.6;
  if (y + kastenH > BOTTOM_LIMIT) {
    doc.addPage();
    y = kopf();
  }
  setFill(doc, BRAND.light);
  doc.roundedRect(MARGIN, y, CONTENT_W, kastenH, 2, 2, "F");
  setFill(doc, BRAND.accent);
  doc.rect(MARGIN, y, 2, kastenH, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(8);
  setColor(doc, BRAND.accentDark);
  doc.text("GESAMTDAUER IM BLICK", MARGIN + 7, y + 6, { charSpace: 1 });
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9.5);
  setColor(doc, BRAND.primary);
  let dy = y + 11.5;
  for (const zeile of dauerZeilen) {
    doc.text(zeile, MARGIN + 7, dy);
    dy += 4.6;
  }

  // Fusszeilen nur auf den Inhaltsseiten. Auf dem Deckblatt steht die
  // Firmenzeile schon, dort stoert eine zweite. Gleiche Zaehlung wie in
  // simpleDocPdf: das Deckblatt zaehlt nicht mit.
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, total - 1);
  }

  doc.save(`OS Immobilien-Ablaufplan-${new Date().toISOString().slice(0, 10)}.pdf`);
}
