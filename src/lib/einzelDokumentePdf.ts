import jsPDF from "jspdf";
import { getLizenzPaket, type LizenzPaketId, type Zahlungsweise } from "./lizenzPakete";
import type { Bewerber } from "./bewerbungStore";
import {
  AKZEPTANZ_HINWEIS,
  akzeptanzHinweisText,
  anlageKopf,
  anlageVollTitel,
  erstelleVertragsKontext,
  renderAnlageNachNummer,
  renderHauptvertrag,
  VERTRAGS_FASSUNG,
  VERTRAGS_FASSUNG_ALT,
  vertragsAnschriftZeilen,
  type KlauselKontext,
} from "./vertragKlauseln";
import { BRAND, loadLogo, loadIcon, addCoverPage, addBrandedHeader, addBrandedFooter, PDF_FONT, ensureUnicodeFont, sanitizePdfText } from "./pdfBranding";

/**
 * Erzeugt jede Anlage sowie den Vertragsentwurf selbst als eigenständiges,
 * vollständig OS Immobilien-gebrandetes PDF, jeweils mit eigenem Kopf, Fußzeile
 * und (beim Hauptvertrag) Unterschriftsblock.
 *
 * Der Text kommt ausschließlich aus vertragKlauseln.ts, aus denselben
 * Funktionen wie das Gesamt-PDF im Bewerberprofil. Vorher standen hier eigene,
 * ältere Fassungen der Anlagen mit anderen Vertragsstrafen, ohne individuelle
 * Provisionssätze und mit einer anderen Anlage 8; der Bewerber unterschrieb
 * auf der Signaturseite etwas anderes, als im Profil erzeugt wurde.
 */

export type EinzelDokumentKey =
  | "vertrag"
  | "anlage_1"
  | "anlage_2"
  | "anlage_3"
  | "anlage_4"
  | "anlage_5"
  | "anlage_6"
  | "anlage_7"
  | "anlage_8"
  | "anlage_9";

export interface EinzelDokumentCtx {
  bewerber: Bewerber;
  paketId: LizenzPaketId | "";
  zahlungsweise: Zahlungsweise;
  /** Optional: Bewerber-Unterschrift (PNG-DataURL) – wird im Hauptvertrag eingebettet. */
  bewerberSignatureDataUrl?: string;
  /** ISO-Zeitstempel der Bewerber-Unterschrift. */
  bewerberSignedAt?: string;
  /** Ort der Bewerber-Unterschrift (fällt zurück auf Bewerber.ort). */
  bewerberSignedOrt?: string;
  /** Optional: Christian-Kurz-Unterschrift (PNG-DataURL). */
  kurzSignatureDataUrl?: string;
  /** ISO-Zeitstempel der Kurz-Unterschrift. */
  kurzSignedAt?: string;
  /** Ort der Kurz-Unterschrift (fällt zurück auf "Mittenwalde"). */
  kurzSignedOrt?: string;
}

const GESELLSCHAFT = {
  name: "OS Immobilien Holding GmbH",
  rechtsform: "GmbH",
  zusatz: "",
  adresse: "Am Ostbahnhof 1, 15749 Mittenwalde",
  vertretenDurch: "die Geschäftsführung",
};

// Derselbe Textfilter wie im Gesamt-PDF, damit beide Dokumente Zeichen für
// Zeichen dasselbe drucken.
const s = (t: string) =>
  sanitizePdfText((t ?? "")
    .replace(/„/g, '"').replace(/"/g, '"').replace(/'/g, "'").replace(/'/g, "'")
    .replace(/–/g, "-").replace(/—/g, "-")
    .replace(/€/g, "EUR")
    .replace(/§/g, "§"));

interface Tools {
  doc: jsPDF;
  h1: (t: string) => void;
  p: (t: string, opts?: { size?: number; gap?: number }) => void;
  bullet: (items: string[]) => void;
  spacer: (n?: number) => void;
  signatures: (parties: {
    hinweis: string;
    left?: string; right?: string; leftRole?: string; rightRole?: string;
    leftSignatureDataUrl?: string; rightSignatureDataUrl?: string;
    leftOrtDatum?: string; rightOrtDatum?: string;
  }) => void;
  ensure: (needed: number) => void;
  infoBox: (titel: string, untertitel: string) => void;
  zeile: (label: string, wert: string) => void;
  setY: (next: number) => void;
  getY: () => number;
}

function makeTools(doc: jsPDF, logo: string | null, title: string, subtitle: string, kompakt = false): Tools {
  const W = 210;
  const H = 297;
  const M = 20;
  const CW = W - 2 * M;
  // Kopf- und Untertitel laufen durch denselben Filter wie der Fließtext,
  // sonst steht im Dokument einmal "150 EUR" und in der Zeile darüber "150 €".
  const kopfTitel = s(title);
  const kopfUnter = s(subtitle);
  let y = addBrandedHeader(doc, logo, kopfTitel, kopfUnter);

  const ensure = (need: number) => {
    if (y + need > H - 30) {
      doc.addPage();
      y = addBrandedHeader(doc, logo, kopfTitel, kopfUnter);
    }
  };

  const h1 = (text: string) => {
    // Mindestens Header + ~3 Textzeilen Platz, sonst Seitenumbruch — vermeidet Heading-Orphans
    ensure(36);
    spacer(2);
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(M, y - 4, CW, 9, 1.5, 1.5, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(M, y - 4, 2, 9, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...BRAND.primary);
    doc.text(s(text), M + 5, y + 1.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(0, 0, 0);
    y += 12;
  };

  const p = (text: string, opts: { size?: number; gap?: number } = {}) => {
    const size = opts.size ?? 9;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(size);
    doc.setTextColor(0, 0, 0);
    const lines = doc.splitTextToSize(s(text), CW);
    for (const ln of lines) {
      ensure(5);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(size);
      doc.setTextColor(0, 0, 0);
      doc.text(ln, M, y);
      // Die kompakte Fassung steht wie im Gesamt-PDF eine Stufe enger.
      y += size * (kompakt ? 0.5 : 0.55);
    }
    y += opts.gap ?? (kompakt ? 2 : 2.5);
    doc.setTextColor(0, 0, 0);
  };

  const bullet = (items: string[]) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    for (const it of items) {
      const lines = doc.splitTextToSize(s(it), CW - 8);
      ensure(lines.length * 4.5 + 1);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(9);
      doc.setTextColor(...BRAND.accent);
      doc.text("•", M + 1, y);
      doc.setTextColor(0, 0, 0);
      doc.text(lines, M + 6, y);
      y += lines.length * 4.5 + 0.5;
    }
    y += 2;
    doc.setTextColor(0, 0, 0);
  };

  const spacer = (n = 3) => { y += n; };

  const signatures: Tools["signatures"] = (parties) => {
    // Hinweiskasten mit dem dynamischen Anlagenbereich, danach die
    // Unterschriften. Beides zusammen umbrechen.
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    const lns = doc.splitTextToSize(s(parties.hinweis), CW - 12) as string[];
    const kastenH = 12 + lns.length * 4 + 4;
    ensure(kastenH + 6 + 16 + 20);
    spacer(6);
    doc.setFillColor(...BRAND.light);
    doc.roundedRect(M, y, CW, kastenH, 2.5, 2.5, "F");
    doc.setFillColor(...BRAND.accent);
    doc.rect(M, y, 2.5, kastenH, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.primary);
    doc.text(s("Wichtig: Unterschrift bestätigt auch alle Anlagen"), M + 7, y + 6.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    let hy = y + 12;
    for (const ln of lns) { doc.text(ln, M + 7, hy); hy += 4; }
    doc.setTextColor(0, 0, 0);
    y += kastenH + 6;

    // Ort/Datum-Zeile (pro Partei, falls vorhanden)
    const leftOrt = parties.leftOrtDatum ?? "";
    const rightOrt = parties.rightOrtDatum ?? "";
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(`Ort, Datum: ${leftOrt || "____________________________"}`), M, y);
    doc.text(s(`Ort, Datum: ${rightOrt || "____________________________"}`), W - M - 70, y);
    y += 16;

    // Unterschriftsbilder (über der Linie), wenn vorhanden
    try {
      if (parties.leftSignatureDataUrl) {
        doc.addImage(parties.leftSignatureDataUrl, "PNG", M, y - 14, 60, 16, undefined, "FAST");
      }
      if (parties.rightSignatureDataUrl) {
        doc.addImage(parties.rightSignatureDataUrl, "PNG", W - M - 70, y - 14, 60, 16, undefined, "FAST");
      }
    } catch (e) {
      // Bilder optional – Fehler nicht eskalieren, Linie zeigt sich trotzdem
      // eslint-disable-next-line no-console
      console.warn("Signatur konnte nicht eingebettet werden:", e);
    }

    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.4);
    doc.line(M, y, M + 70, y);
    doc.line(W - M - 70, y, W - M, y);
    y += 5;
    doc.setTextColor(...BRAND.primary);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9);
    doc.text(s(parties.left ?? GESELLSCHAFT.name), M, y);
    doc.text(s(parties.right ?? "Vertriebspartner"), W - M - 70, y);
    y += 4;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(parties.leftRole ?? GESELLSCHAFT.vertretenDurch), M, y);
    doc.text(s(parties.rightRole ?? "Vertriebspartner"), W - M - 70, y);
    doc.setTextColor(0, 0, 0);
  };

  const infoBox = (titel: string, untertitel: string) => {
    const boxH = 18;
    ensure(boxH + 6);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, boxH, 2, 2, "FD");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(40, 40, 40);
    doc.text(s(titel), M + 5, y + 7);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(untertitel), M + 5, y + 13);
    doc.setTextColor(0, 0, 0);
    y += boxH + 4;
  };

  // Zeile des Konditionenblatts, gleiche Aufteilung wie im Gesamt-PDF.
  const LABEL_W = 40;
  const zeile = (label: string, wert: string) => {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8.5);
    const labelLines = doc.splitTextToSize(s(label), LABEL_W - 3) as string[];
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    const wertLines = doc.splitTextToSize(s(wert), CW - LABEL_W) as string[];
    const n = Math.max(labelLines.length, wertLines.length);
    ensure(n * 4.5 + 3);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.2);
    doc.line(M, y - 3, M + CW, y - 3);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.muted);
    labelLines.forEach((ln, i) => doc.text(ln, M, y + i * 4.5));
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(9);
    doc.setTextColor(0, 0, 0);
    wertLines.forEach((ln, i) => doc.text(ln, M + LABEL_W, y + i * 4.5));
    y += n * 4.5 + 1.2;
  };

  return {
    doc, h1, p, bullet, spacer, signatures, ensure, infoBox, zeile,
    setY: (next: number) => { y = next; },
    getY: () => y,
  };
}

function renderMetaBlock(t: Tools, bewerber: Bewerber, paket: ReturnType<typeof getLizenzPaket> | null, kompakt = false) {
  const doc = t.doc;
  const W = 210;
  const M = 20;
  const CW = W - 2 * M;
  const heute = new Date().toLocaleDateString("de-DE");
  const vpName = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ") || "[Vertriebspartner]";

  // Vertragsparteien-Box, gleiche Angaben wie im Gesamt-PDF: Vertragsanschrift,
  // nie die Rechnungsadresse.
  const boxY = t.getY() + 6;
  const colGap = 6;
  const colW = (CW - colGap) / 2;
  const leftX = M + 6;
  const rightX = M + colW + colGap + 6;

  const leftLines = [
    GESELLSCHAFT.zusatz ? `${GESELLSCHAFT.rechtsform} (${GESELLSCHAFT.zusatz})` : GESELLSCHAFT.rechtsform,
    GESELLSCHAFT.adresse,
    `vertreten durch ${GESELLSCHAFT.vertretenDurch}`,
  ];
  const rightLines = [
    ...vertragsAnschriftZeilen(bewerber),
    bewerber.email || "",
    bewerber.telefon ? `Tel.: ${bewerber.telefon}` : "",
  ].filter(Boolean);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  const measure = (lines: string[]) => lines.reduce((n, l) => n + doc.splitTextToSize(s(l), colW - 8).length, 0);
  const maxLines = Math.max(measure(leftLines), measure(rightLines));
  const boxH = 22 + maxLines * 4 + 4;

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(M, boxY, CW, boxH, 2.5, 2.5, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(M, boxY, 2.5, boxH, "F");

  // Vertikaler Trenner zwischen den Spalten
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.2);
  doc.line(M + colW + colGap / 2 + 1, boxY + 5, M + colW + colGap / 2 + 1, boxY + boxH - 5);

  // Spalten-Labels
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(s("VERANTWORTLICHER / GESELLSCHAFT"), leftX, boxY + 7);
  doc.text(s("VERTRIEBSPARTNER"), rightX, boxY + 7);

  // Namen (groß, primary)
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.primary);
  doc.text(s(GESELLSCHAFT.name), leftX, boxY + 15);
  doc.text(s(vpName), rightX, boxY + 15);

  // Detail-Zeilen
  const writeLines = (lines: string[], x: number, startY: number) => {
    let yy = startY;
    for (const ln of lines) {
      const wrapped = doc.splitTextToSize(s(ln), colW - 8);
      for (const w of wrapped) {
        doc.text(w, x, yy);
        yy += 4;
      }
    }
  };

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  writeLines(leftLines, leftX, boxY + 22);
  writeLines(rightLines, rightX, boxY + 22);

  // Stand & Paket – unterhalb der Box, dezent
  doc.setTextColor(...BRAND.muted);
  doc.setFontSize(7.5);
  doc.setFont(PDF_FONT, "normal");
  doc.text(
    s(`Stand: ${heute}${paket ? " · Paket: " + paket.titel : ""}`),
    W / 2,
    boxY + boxH + 5,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);
  // Cursor sauber unterhalb der Stand-Zeile setzen (kleiner, ruhiger Abstand
  // zum ersten Paragraphen; die kompakte Fassung steht enger).
  t.setY(boxY + boxH + (kompakt ? 8 : 12));
}

/**
 * Fusszeilen setzen und das PDF abschliessen.
 *
 * Genau wie im Gesamt-PDF traegt das Deckblatt keine Fusszeile und zaehlt bei
 * der Seitenzaehlung nicht mit; dort steht die Firmenzeile bereits. Die erste
 * Inhaltsseite ist also "1 / n".
 */
function finalize(doc: jsPDF, mitDeckblatt = true): Blob {
  const total = doc.getNumberOfPages();
  const erste = mitDeckblatt ? 2 : 1;
  const inhaltsseiten = total - (erste - 1);
  for (let i = erste; i <= total; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - (erste - 1), inhaltsseiten);
  }
  return doc.output("blob");
}

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Überschrift am Anfang der ersten Inhaltsseite einer Anlage.
 *
 * Die Anlagennummer als Kennung und darunter der Titel, in derselben
 * Formensprache wie die Paragrafen des Hauptvertrags. Die generische Kopfzeile
 * setzt den Titel nur klein und grau; als eigenständiges Dokument braucht die
 * Anlage eine echte Überschrift.
 *
 * Die Zuordnung (Parteien, Paket, Fassung, Stand) steht vollständig auf dem
 * Deckblatt und wird hier nicht wiederholt.
 */
function renderAnlagenTitel(
  t: Tools,
  kennung: string,
  titel: string,
  /**
   * Zuordnungszeile. Leer, seit das Deckblatt die vollständige Angabe trägt:
   * beides zu zeigen wäre dieselbe Auskunft zweimal auf zwei Seiten.
   */
  zuordnung: string,
): void {
  const doc = t.doc;
  const M = 20;
  const CW = 210 - 2 * M;
  const y0 = t.getY();

  // Kennung, klein und in der Akzentfarbe: "ANLAGE 3"
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.accent);
  doc.text(sanitizePdfText(kennung.toUpperCase()), M, y0, { charSpace: 0.8 });

  // Titel als eigentliche Überschrift des Dokuments.
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(15);
  doc.setTextColor(...BRAND.primary);
  const zeilen = doc.splitTextToSize(sanitizePdfText(titel), CW) as string[];
  let y = y0 + 7;
  for (const z of zeilen) { doc.text(z, M, y); y += 6.5; }

  // Zuordnung: zu welchem Vertrag, welche Parteien, welche Fassung.
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8);
  doc.setTextColor(...BRAND.muted);
  const zZeilen = zuordnung ? (doc.splitTextToSize(sanitizePdfText(zuordnung), CW) as string[]) : [];
  if (zZeilen.length) y += 0.5;
  for (const z of zZeilen) { doc.text(z, M, y); y += 4; }

  // Trennlinie mit Akzent, wie unter der Kopfzeile.
  y += 2;
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.3);
  doc.line(M, y, 210 - M, y);
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.8);
  doc.line(M, y, M + 14, y);

  doc.setTextColor(0, 0, 0);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  t.setY(y + 6);
}

export async function buildEinzelDokumentPdf(
  key: EinzelDokumentKey,
  ctx: EinzelDokumentCtx,
): Promise<Blob> {
  const rohPaket = ctx.paketId ? getLizenzPaket(ctx.paketId as LizenzPaketId) : null;
  if (!rohPaket) throw new Error("Bitte zuerst ein Paket wählen.");

  // Sonderfall Tippgeber: eigene, stark reduzierte Dokumente (Vertrag + 2 Anlagen).
  if (rohPaket.istTippgeber) {
    if (key !== "vertrag" && key !== "anlage_1" && key !== "anlage_2") {
      throw new Error("Für Tippgeber gibt es nur Vertrag, Anlage 1 und Anlage 2.");
    }
    const { buildTippgeberEinzelPdf } = await import("./tippgeberVertragPdf");
    return buildTippgeberEinzelPdf(key as "vertrag" | "anlage_1" | "anlage_2", {
      bewerber: ctx.bewerber,
      bewerberSignatureDataUrl: ctx.bewerberSignatureDataUrl,
      bewerberSignedAt: ctx.bewerberSignedAt,
      bewerberSignedOrt: ctx.bewerberSignedOrt,
      kurzSignatureDataUrl: ctx.kurzSignatureDataUrl,
      kurzSignedAt: ctx.kurzSignedAt,
      kurzSignedOrt: ctx.kurzSignedOrt,
    });
  }

  // Derselbe Kontext wie im Gesamt-PDF (Schalter, Sätze, Leistungsliste).
  const klauselCtx: KlauselKontext = erstelleVertragsKontext({
    bewerber: ctx.bewerber,
    paket: rohPaket,
    zahlungsweise: ctx.zahlungsweise,
  });
  const { paket } = klauselCtx;
  const logo = await loadLogo();
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);

  const vpNameFuerDeckblatt = [ctx.bewerber.vorname, ctx.bewerber.nachname].filter(Boolean).join(" ");
  const heuteText = new Date().toLocaleDateString("de-DE");

  if (key === "vertrag") {
    // Dasselbe Deckblatt wie im Gesamt-PDF (vertragGenerator.ts). Jedes
    // Dokument dieses Vertragswerks beginnt mit einem Deckblatt, der
    // Hauptvertrag wie jede Anlage.
    const hauptUntertitel = `Vertriebspartner Kapitalanlageimmobilien · Vertragsdokument "${paket.titel}"`;
    addCoverPage(doc, await loadIcon(), {
      kennung: "Vertrag",
      titel: "Handelsvertretervertrag",
      untertitel: s(hauptUntertitel),
      empfaenger: vpNameFuerDeckblatt || undefined,
      datum: heuteText,
      // Die Kennung dieses Dokuments, damit ein älterer Vertrag beim Neuaufbau
      // zur Gegenzeichnung nicht die aktuelle Fassung trägt.
      nummer: `Fassung ${klauselCtx.konditionen?.fassungKennung ?? (klauselCtx.konditionen?.fassung === "alt" ? VERTRAGS_FASSUNG_ALT : VERTRAGS_FASSUNG)}`,
    });
    doc.addPage();
    const t = makeTools(
      doc,
      logo,
      "Handelsvertretervertrag",
      `Vertriebspartner Kapitalanlageimmobilien · "${paket.titel}"`,
      klauselCtx.fassung !== "alt",
    );
    renderMetaBlock(t, ctx.bewerber, paket, klauselCtx.fassung !== "alt");
    renderHauptvertrag(t, klauselCtx);
    const vpName = [ctx.bewerber.vorname, ctx.bewerber.nachname].filter(Boolean).join(" ") || "Vertriebspartner";
    const fmtDate = (iso?: string) => {
      if (!iso) return "";
      try { return new Date(iso).toLocaleDateString("de-DE"); } catch { return ""; }
    };
    const kurzOrt = ctx.kurzSignedOrt || "Mittenwalde";
    const bewOrt = ctx.bewerberSignedOrt || ctx.bewerber.ort || "";
    t.signatures({
      hinweis: akzeptanzHinweisText(klauselCtx),
      right: vpName,
      leftSignatureDataUrl: ctx.kurzSignatureDataUrl,
      rightSignatureDataUrl: ctx.bewerberSignatureDataUrl,
      leftOrtDatum: ctx.kurzSignedAt ? `${kurzOrt}, ${fmtDate(ctx.kurzSignedAt)}` : "",
      rightOrtDatum: ctx.bewerberSignedAt ? `${bewOrt}, ${fmtDate(ctx.bewerberSignedAt)}` : "",
    });
    return finalize(doc);
  }

  const nummer = Number(key.replace("anlage_", ""));
  const kopf = anlageKopf(nummer, klauselCtx);
  // Der Titel der Anlage ohne den Zusatz nach dem Mittelpunkt: "Anlage 1" plus
  // "Konditionenblatt" ergeben zusammen die Ueberschrift, der Rest ist Beiwerk.
  const anlagenTitel = kopf.untertitel.split(" · ")[0];
  // Die Kopfzeile ist gesperrt gesetzt und läuft sonst bis an das Logo. Lange
  // Titel werden dort auf ihren Kern gekürzt, die Überschrift bleibt vollständig.
  const kopfzeilenTitel = anlagenTitel.length > 30
    ? anlagenTitel.split(/ (?:über|gemäß|inkl\.|für) /)[0]
    : anlagenTitel;
  // Deckblatt der Anlage, im selben Aufbau wie das des Hauptvertrags. Die
  // Kennung ("Anlage 3") und der volle Titel stammen aus dem Anlagenverzeichnis
  // des Vertrages, nicht aus einer zweiten Liste: Ein Deckblatt mit einer
  // anderen Nummer als das Verzeichnis in § 14 waere schlimmer als keines.
  const gesellschaftKurz = GESELLSCHAFT.name;
  const fassungText = klauselCtx.konditionen?.fassungKennung
    ?? (klauselCtx.konditionen?.fassung === "alt" ? VERTRAGS_FASSUNG_ALT : VERTRAGS_FASSUNG);
  addCoverPage(doc, await loadIcon(), {
    kennung: kopf.titel,
    titel: s(anlageVollTitel(nummer, klauselCtx)),
    untertitel: s(
      `Anlage zum Handelsvertretervertrag zwischen ${gesellschaftKurz} und `
      + `${vpNameFuerDeckblatt || "[Vertriebspartner]"} · Paket ${paket.titel}`,
    ),
    empfaenger: vpNameFuerDeckblatt || undefined,
    datum: heuteText,
    nummer: `Fassung ${fassungText}`,
    fusszeile: "Verbindlicher Bestandteil des Handelsvertretervertrages · Eine gesonderte Unterschrift ist nicht erforderlich",
  });
  doc.addPage();
  const t = makeTools(doc, logo, `${kopf.titel} – ${kopfzeilenTitel}`, kopf.untertitel, klauselCtx.fassung !== "alt");
  // Die Zuordnung steht vollstaendig auf dem Deckblatt; die Inhaltsseite
  // beginnt deshalb direkt mit der Ueberschrift der Anlage.
  renderAnlagenTitel(t, kopf.titel, anlagenTitel, "");
  // Gleicher Hinweis am Anfang wie im Gesamt-PDF; ein Kasten am Ende rutschte
  // regelmäßig allein auf eine leere Seite.
  t.p(AKZEPTANZ_HINWEIS, { size: 8, gap: 4 });
  renderAnlageNachNummer(nummer, t, klauselCtx);
  return finalize(doc);
}

/** Öffnet ein generiertes PDF in einem neuen Tab. */
export function openPdfBlob(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const win = window.open(url, "_blank", "noopener,noreferrer");
  if (!win) {
    // Fallback: download
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
