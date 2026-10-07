import jsPDF from "jspdf";
import { addBrandedHeader, addBrandedFooter, brandedSectionTitle, BRAND, loadLogo, PDF_FONT, ensureUnicodeFont, loadIcon, addCoverPage, type DeckblattAngaben } from "./pdfBranding";

/**
 * Generischer Renderer für mehrseitige Branded-Dokumente.
 * Inhalte werden als strukturierter Block-Array übergeben.
 */
export type DocBlock =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "list"; items: string[]; ordered?: boolean }
  | { type: "kv"; label: string; value: string }
  | { type: "checkbox"; text: string; checked?: boolean }
  /** `spalten` sind relative Breiten, etwa [1, 3, 5]. Ohne Angabe gleich breit. */
  | { type: "table"; head: string[]; rows: string[][]; spalten?: number[] }
  | { type: "callout"; text: string; variant?: "info" | "warn" | "success" }
  | { type: "spacer"; size?: number }
  | { type: "pageBreak" }
  /** Plakatseite: eine eigene Seite mit einem einzigen, groß gesetzten Satz
   *  in einem gerahmten Kasten. Zum Ausdrucken und Aufhängen. */
  | { type: "poster"; text: string; untertitel?: string; nummer?: string }
  /** Karte mit Rahmen: optionale Nummer, fette Überschrift, Fließtext.
   *  Für Werte, Feindbilder und andere Aufzählungen mit Erklärung. */
  | { type: "karte"; titel: string; text: string; nummer?: string; akzent?: boolean };

export interface SimpleDocConfig {
  title: string;
  subtitle?: string;
  blocks: DocBlock[];
  filename: string;
  /**
   * Dunkles Deckblatt vor der ersten Inhaltsseite. Ohne Angabe beginnt das
   * Dokument wie bisher direkt mit dem Inhalt.
   */
  deckblatt?: DeckblattAngaben;
}

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 20;
const CONTENT_W = PAGE_W - 2 * MARGIN;
const BOTTOM_LIMIT = PAGE_H - 32;

/**
 * Ersetzt Unicode-Zeichen, die in der Standard-Helvetica (WinAnsi) von jsPDF
 * nicht enthalten sind, durch ASCII-Äquivalente. Verhindert Darstellungsfehler
 * wie Letter-Spacing oder falsche Glyphen (z. B. „≥" → „"e").
 */
const sanitize = (s: string): string =>
  (s ?? "")
    .replace(/≥/g, ">=")
    .replace(/≤/g, "<=")
    .replace(/≠/g, "!=")
    .replace(/≈/g, "~")
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/⇒/g, "=>")
    .replace(/⇐/g, "<=")
    .replace(/×/g, "x")
    .replace(/·/g, "•");

export async function generateSimpleDocPdf(config: SimpleDocConfig): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  // Erst die Schrift, dann alles andere. Ohne Netz faellt jsPDF still auf
  // Helvetica zurueck, das Dokument entsteht trotzdem.
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();

  if (config.deckblatt) {
    addCoverPage(doc, await loadIcon(), config.deckblatt);
    doc.addPage();
  }

  let ersteSeite = true;
  const kopf = () => {
    const untertitel = ersteSeite && config.subtitle ? sanitize(config.subtitle) : undefined;
    ersteSeite = false;
    return addBrandedHeader(doc, logo, sanitize(config.title), untertitel);
  };
  let y = kopf();

  /** Legt bei Bedarf eine neue Seite an. Gibt true zurück, wenn umgebrochen
   *  wurde, damit etwa eine Tabelle ihren Kopf wiederholen kann. */
  const ensureSpace = (needed: number): boolean => {
    if (y + needed > BOTTOM_LIMIT) {
      doc.addPage();
      y = kopf();
      return true;
    }
    return false;
  };

  for (const block of config.blocks) {
    switch (block.type) {
      case "h2":
        ensureSpace(14);
        y = brandedSectionTitle(doc, sanitize(block.text), y + 2, MARGIN, CONTENT_W);
        break;

      case "h3":
        ensureSpace(8);
        doc.setFontSize(10);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...BRAND.primary);
        doc.text(sanitize(block.text), MARGIN, y);
        doc.setFont(PDF_FONT, "normal");
        y += 5.5;
        break;

      case "p": {
        doc.setFontSize(9);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...BRAND.text);
        const lines = doc.splitTextToSize(sanitize(block.text), CONTENT_W);
        for (const line of lines) {
          ensureSpace(5);
          doc.text(line, MARGIN, y);
          y += 4.5;
        }
        y += 2;
        break;
      }

      case "list": {
        doc.setFontSize(9);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...BRAND.text);
        block.items.forEach((item, i) => {
          const bullet = block.ordered ? `${i + 1}.` : "•";
          const lines = doc.splitTextToSize(sanitize(item), CONTENT_W - 8);
          ensureSpace(lines.length * 4.5 + 1);
          doc.setTextColor(...BRAND.accent);
          doc.text(bullet, MARGIN + 1, y);
          doc.setTextColor(...BRAND.text);
          doc.text(lines, MARGIN + 7, y);
          y += lines.length * 4.5 + 1;
        });
        y += 2;
        break;
      }

      case "kv": {
        ensureSpace(9);
        doc.setFontSize(9);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...BRAND.muted);
        doc.text(sanitize(block.label), MARGIN, y);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...BRAND.primary);
        const valLines = doc.splitTextToSize(sanitize(block.value || "–"), CONTENT_W - 60);
        doc.text(valLines, MARGIN + 60, y);
        const rowH = Math.max(5, valLines.length * 4.5);
        // Trennlinie mittig im Abstand zur nächsten Zeile
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.15);
        doc.line(MARGIN, y + 3, MARGIN + CONTENT_W, y + 3);
        y += rowH + 4.5;
        break;
      }

      case "checkbox": {
        ensureSpace(6);
        doc.setDrawColor(...BRAND.primary);
        doc.setLineWidth(0.3);
        doc.rect(MARGIN, y - 3, 3.5, 3.5, "S");
        if (block.checked) {
          doc.setLineWidth(0.5);
          doc.line(MARGIN + 0.6, y - 1.6, MARGIN + 1.5, y - 0.4);
          doc.line(MARGIN + 1.5, y - 0.4, MARGIN + 3, y - 2.6);
        }
        doc.setFontSize(9);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...BRAND.text);
        const lines = doc.splitTextToSize(sanitize(block.text), CONTENT_W - 8);
        doc.text(lines, MARGIN + 6, y);
        y += Math.max(5, lines.length * 4.5);
        break;
      }

      case "table": {
        // Spaltenbreiten: entweder gleich verteilt oder nach den relativen
        // Gewichten aus `spalten`.
        const gewichte =
          block.spalten && block.spalten.length === block.head.length
            ? block.spalten
            : block.head.map(() => 1);
        const summe = gewichte.reduce((a, b) => a + b, 0);
        const breiten = gewichte.map((g) => (g / summe) * CONTENT_W);
        const startX = (i: number) => MARGIN + breiten.slice(0, i).reduce((a, b) => a + b, 0);

        // Kopfzeile. Wird nach jedem Seitenumbruch wiederholt, sonst stünden
        // auf der Folgeseite Zahlen ohne Spaltenbeschriftung. Lange
        // Überschriften werden umbrochen, statt in die Nachbarspalte zu laufen.
        const zeichneKopf = () => {
          doc.setFontSize(8.5);
          doc.setFont(PDF_FONT, "bold");
          const kopfZellen = block.head.map((h, i) =>
            doc.splitTextToSize(sanitize(h), breiten[i] - 4),
          );
          const kopfZeilen = Math.max(...kopfZellen.map((c) => c.length));
          const kopfH = kopfZeilen * 4.2 + 3;
          doc.setFillColor(...BRAND.light);
          doc.rect(MARGIN, y - 4.5, CONTENT_W, kopfH, "F");
          doc.setTextColor(...BRAND.primary);
          kopfZellen.forEach((zelle, i) => {
            doc.text(zelle, startX(i) + 2, y);
          });
          y += kopfH - 1.5;
          doc.setDrawColor(...BRAND.separator);
          doc.setLineWidth(0.2);
          doc.line(MARGIN, y, MARGIN + CONTENT_W, y);
          y += 5;
          doc.setFont(PDF_FONT, "normal");
          doc.setTextColor(...BRAND.text);
        };

        ensureSpace(22);
        zeichneKopf();

        for (const row of block.rows) {
          // Zeilenhöhe aus dem umbrochenen Text bestimmen
          const wrappedCells = row.map((c, i) => doc.splitTextToSize(sanitize(c), breiten[i] - 4));
          const textH = Math.max(...wrappedCells.map((c) => c.length)) * 4.5;
          const rowH = textH + 6; // großzügiger vertikaler Abstand
          if (ensureSpace(rowH + 2)) zeichneKopf();
          doc.setFontSize(8.5);
          doc.setFont(PDF_FONT, "normal");
          doc.setTextColor(...BRAND.text);
          wrappedCells.forEach((cell, i) => {
            doc.text(cell, startX(i) + 2, y);
          });
          // Trennlinie mittig zwischen dieser und der nächsten Zeile
          const lineY = y + textH - 4.5 + (rowH - textH) / 2 + 1.5;
          doc.setDrawColor(...BRAND.separator);
          doc.setLineWidth(0.15);
          doc.line(MARGIN, lineY, MARGIN + CONTENT_W, lineY);
          y += rowH;
        }
        y += 2;
        break;
      }

      case "callout": {
        const lines = doc.splitTextToSize(sanitize(block.text), CONTENT_W - 8);
        const h = lines.length * 4.5 + 5;
        ensureSpace(h + 2);
        const bg: [number, number, number] =
          block.variant === "warn" ? [255, 245, 230]
          : block.variant === "success" ? [235, 248, 240]
          : [245, 245, 250];
        const accent: [number, number, number] =
          block.variant === "warn" ? [220, 130, 30]
          : block.variant === "success" ? [40, 140, 90]
          : BRAND.accent;
        doc.setFillColor(...bg);
        doc.roundedRect(MARGIN, y - 3, CONTENT_W, h, 1.5, 1.5, "F");
        doc.setFillColor(...accent);
        doc.rect(MARGIN, y - 3, 1.5, h, "F");
        doc.setFontSize(8.5);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(...BRAND.text);
        doc.text(lines, MARGIN + 5, y + 0.5);
        y += h + 2;
        break;
      }

      case "spacer":
        y += block.size ?? 4;
        break;

      case "pageBreak":
        doc.addPage();
        y = kopf();
        break;

      case "karte": {
        // Rahmen mit optionaler Nummer, Überschrift und Fließtext.
        const innenX = MARGIN + (block.nummer ? 16 : 6);
        const innenW = CONTENT_W - (block.nummer ? 22 : 12);
        doc.setFontSize(9);
        const kText = doc.splitTextToSize(sanitize(block.text), innenW);
        const kH = 8 + 5 + kText.length * 4.4 + 4;
        ensureSpace(kH + 3);

        doc.setFillColor(...(block.akzent ? BRAND.light : BRAND.white));
        doc.setDrawColor(...(block.akzent ? BRAND.accent : BRAND.separator));
        doc.setLineWidth(block.akzent ? 0.5 : 0.3);
        doc.roundedRect(MARGIN, y - 4, CONTENT_W, kH, 2, 2, "FD");

        if (block.nummer) {
          doc.setFontSize(13);
          doc.setFont(PDF_FONT, "bold");
          doc.setTextColor(...BRAND.accent);
          doc.text(sanitize(block.nummer), MARGIN + 6, y + 4.5);
        }

        doc.setFontSize(10);
        doc.setFont(PDF_FONT, "bold");
        doc.setTextColor(...BRAND.primary);
        doc.text(sanitize(block.titel), innenX, y + 3);

        doc.setFontSize(9);
        doc.setFont(PDF_FONT, "normal");
        doc.setTextColor(70, 70, 70);
        doc.text(kText, innenX, y + 9.5);

        doc.setTextColor(0, 0, 0);
        y += kH + 3;
        break;
      }

      case "poster": {
        // Eigene Seite: ein Satz groß in einem gerahmten Kasten, mittig auf
        // der Seite. Zum Ausdrucken und Aufhängen. Danach beginnt der
        // nächste Block auf einer frischen Seite.
        doc.addPage();
        kopf();

        const text = sanitize(block.text);
        const feldOben = 72;
        const feldUnten = BOTTOM_LIMIT - 6;
        const kastenBreite = CONTENT_W;
        const textBreite = kastenBreite - 34;

        // Größte Schrift wählen, bei der der Satz in höchstens fünf Zeilen passt.
        let groesse = 30;
        let zeilen: string[] = [];
        doc.setFont(PDF_FONT, "bold");
        for (const kandidat of [30, 26, 23, 20, 17]) {
          doc.setFontSize(kandidat);
          const versuch = doc.splitTextToSize(text, textBreite) as string[];
          if (versuch.length <= 5) {
            groesse = kandidat;
            zeilen = versuch;
            break;
          }
          groesse = kandidat;
          zeilen = versuch;
        }
        const zeilenHoehe = groesse * 0.46;
        const textHoehe = zeilen.length * zeilenHoehe;
        const kastenHoehe = Math.max(
          120,
          Math.min(feldUnten - feldOben, textHoehe + 78),
        );
        const kastenY = feldOben + (feldUnten - feldOben - kastenHoehe) / 2;

        // Kasten: heller Grund, kräftiger Akzentrahmen, Akzentbalken oben.
        doc.setFillColor(...BRAND.light);
        doc.setDrawColor(...BRAND.accent);
        doc.setLineWidth(0.9);
        doc.roundedRect(MARGIN, kastenY, kastenBreite, kastenHoehe, 4, 4, "FD");
        doc.setFillColor(...BRAND.accent);
        doc.roundedRect(MARGIN + 24, kastenY - 1.2, kastenBreite - 48, 2.4, 1.2, 1.2, "F");

        // Blasse Nummer oben rechts im Kasten.
        if (block.nummer) {
          doc.setFont(PDF_FONT, "bold");
          doc.setFontSize(26);
          doc.setTextColor(206, 224, 238);
          doc.text(sanitize(block.nummer), MARGIN + kastenBreite - 12, kastenY + 21, {
            align: "right",
          });
        }

        // Der Satz selbst, zentriert, mit kurzer Akzentlinie als Auftakt.
        const textStart = kastenY + (kastenHoehe - textHoehe) / 2 + zeilenHoehe * 0.72;
        doc.setDrawColor(...BRAND.accent);
        doc.setLineWidth(1.4);
        doc.line(PAGE_W / 2 - 9, textStart - zeilenHoehe - 6, PAGE_W / 2 + 9, textStart - zeilenHoehe - 6);

        doc.setFont(PDF_FONT, "bold");
        doc.setFontSize(groesse);
        doc.setTextColor(...BRAND.primary);
        zeilen.forEach((zeile, i) => {
          doc.text(zeile, PAGE_W / 2, textStart + i * zeilenHoehe, { align: "center" });
        });

        // Feine Linie und Fußzeile im Kasten.
        const linieY = kastenY + kastenHoehe - 16;
        doc.setDrawColor(...BRAND.separator);
        doc.setLineWidth(0.3);
        doc.line(MARGIN + 34, linieY, MARGIN + kastenBreite - 34, linieY);

        if (block.untertitel) {
          doc.setFont(PDF_FONT, "normal");
          doc.setFontSize(9);
          doc.setTextColor(...BRAND.muted);
          doc.text(sanitize(block.untertitel), PAGE_W / 2, linieY + 7, { align: "center" });
        }

        doc.setTextColor(0, 0, 0);
        // Nächster Block auf neuer Seite
        y = BOTTOM_LIMIT + 1;
        break;
      }
    }
  }

  // Footer auf alle Seiten
  const total = doc.getNumberOfPages();
  const ersteInhaltsseite = config.deckblatt ? 2 : 1;
  for (let i = ersteInhaltsseite; i <= total; i++) {
    doc.setPage(i);
    // Auf dem Deckblatt stoert eine Fusszeile, dort steht die Firmenzeile schon.
    addBrandedFooter(doc, i - ersteInhaltsseite + 1, total - ersteInhaltsseite + 1);
  }

  doc.save(config.filename);
}
