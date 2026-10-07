import jsPDF from "jspdf";
import { getLizenzPaket, type LizenzPaketId, type Zahlungsweise } from "./lizenzPakete";
import type { Bewerber } from "./bewerbungStore";
import {
  AKZEPTANZ_HINWEIS,
  LEAD_KLAUSELN,
  akzeptanzHinweisText,
  anlageKopf,
  erstelleVertragsKontext,
  paketOhneCrmGebuehr,
  renderAnlageNachNummer,
  renderHauptvertrag,
  hatLeadpaketAnlage,
  vertragsAnlagen,
  vertragsAnschriftZeilen,
  type VereinbarteSaetze,
} from "./vertragKlauseln";

// Die Normalisierung und die Lead-Klauseln liegen in vertragKlauseln.ts
// (ohne jsPDF-Abhängigkeit). Re-Export, damit bestehende Aufrufer weiter von
// hier importieren können.
export { paketOhneCrmGebuehr, LEAD_KLAUSELN };
import { supabase } from "@/integrations/supabase/client";
import {
  BRAND,
  loadLogo,
  loadIcon,
  addCoverPage,
  addBrandedHeader,
  addBrandedFooter,
  brandedSectionTitle,
  sanitizePdfText,
  PDF_FONT,
  ensureUnicodeFont,
} from "./pdfBranding";

export interface VertragInput {
  bewerber: Bewerber;
  paketId: LizenzPaketId;
  zahlungsweise: Zahlungsweise;
  hrName: string;
  version: number;
  /**
   * Individuell im Closing vereinbarte Provisionssätze. Wenn gesetzt,
   * überschreiben sie den Standardsatz aus `paket.provisionssatz` im
   * Hauptvertrag (§ 8) sowie in Anlage 2 (§ 4) und Anlage 4. Jeder gesetzte
   * Satz wird gedruckt, siehe provisionsSaetze().
   */
  saetze?: VereinbarteSaetze;
}

/**
 * Sanitiert Umlaute/Sonderzeichen, die in jsPDF Standard-Helvetica nicht korrekt rendern.
 */
const sRoh = (t: string) => (t ?? "")
  .replace(/„/g, '"').replace(/"/g, '"').replace(/'/g, "'").replace(/'/g, "'")
  .replace(/–/g, "-").replace(/—/g, "-")
  .replace(/€/g, "EUR")
  .replace(/§/g, "§");

/**
 * Der Textfilter, den alle Zeichenfunktionen dieses Dokuments benutzen.
 *
 * Zusaetzlich zu den Ersetzungen oben laeuft `sanitizePdfText` aus dem
 * gemeinsamen Gestaltungsmodul. Damit werden Emoji und andere Zeichen ohne
 * Glyphe hier genauso behandelt wie in allen uebrigen Dokumenten des Hauses.
 */
const s = (t: string) => sanitizePdfText(sRoh(t));

const GESELLSCHAFT = {
  name: "MOREImmo",
  rechtsform: "Einzelunternehmen",
  zusatz: "ehemals Immosparplan",
  adresse: "Wendelsteinstraße 19, 83075 Bad Feilnbach",
  vertretenDurch: "Christian Kurz, Inhaber (Einzelunternehmen)",
};

/**
 * Erzeugt den vollständigen Handelsvertretervertrag (inkl. Anlagen) als
 * Branded PDF. Inhalt richtet sich dynamisch nach gewähltem Paket
 * und Zahlungsweise (einmal / 2 Raten). Der Text selbst kommt komplett aus
 * vertragKlauseln.ts, dieselbe Quelle wie die Einzeldokumente.
 */
export async function buildVertragPdf({ bewerber, paketId, zahlungsweise, hrName, version, saetze }: VertragInput): Promise<Blob> {
  const rawPaket = getLizenzPaket(paketId);
  if (!rawPaket) throw new Error("Ungültiges Paket");
  if (rawPaket.istTippgeber) {
    const { buildTippgeberVertragPdf } = await import("./tippgeberVertragPdf");
    return buildTippgeberVertragPdf({ bewerber, hrName, version });
  }
  const ctx = erstelleVertragsKontext({ bewerber, paket: rawPaket, zahlungsweise, saetze });
  const { paket } = ctx;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await ensureUnicodeFont(doc);
  const W = 210;
  const H = 297;
  const M = 20;
  const CW = W - 2 * M;
  /**
   * Unterste Zeile, die Text noch belegen darf. Der Markenfuss beginnt bei
   * H - 20, damit bleiben zwoelf Millimeter Luft und kein Satz laeuft in die
   * Fusszeile hinein.
   */
  const BOTTOM = H - 32;
  const logo = await loadLogo();

  const heute = new Date().toLocaleDateString("de-DE");

  // Angaben zum Vertriebspartner. Stehen weiter unten in der Parteienbox und
  // schon oben auf dem Deckblatt, deshalb werden sie hier einmal ermittelt.
  const vpNameEcht = [bewerber.vorname, bewerber.nachname].filter(Boolean).join(" ");
  const vpName = vpNameEcht || "[Vertriebspartner]";
  // Immer die Vertragsanschrift, nie die Rechnungsadresse (Details siehe
  // vertragsAnschriftZeilen).
  const vpAdrLines = vertragsAnschriftZeilen(bewerber);
  const vpKontakt = [
    bewerber.email ? bewerber.email : "",
    bewerber.telefon ? `Tel.: ${bewerber.telefon}` : "",
  ].filter(Boolean);

  const dokumentTitel = "Handelsvertretervertrag";

  /**
   * Der laufende Kopf nennt nur den Dokumentteil, also "Hauptvertrag" oder
   * "Anlage 3", nicht den vollen Namen.
   *
   * Zwei Gruende: Beim Blaettern will man wissen, in welchem Teil man gerade
   * ist, und der Markenkopf setzt den Titel gesperrt in Versalien und richtet
   * ihn rechts aus. jsPDF rechnet die Sperrung bei der Ausrichtung nicht mit,
   * ein langer Titel liefe deshalb ueber den rechten Rand hinaus. Der volle
   * Name steht in der Zeile darunter.
   */
  let currentTitle = "Hauptvertrag";
  let currentSubtitle = paket.partnerHonorar
    ? `Vertriebspartner Kapitalanlageimmobilien · ${paket.titel}`
    : `Vertriebspartner Kapitalanlageimmobilien · Vertragsdokument "${paket.titel}"`;

  // Deckblatt wie in den uebrigen Dokumenten des Hauses. Es traegt bewusst
  // keine Fusszeile und zaehlt bei der Seitenzaehlung nicht mit.
  addCoverPage(doc, await loadIcon(), {
    kennung: "Vertrag",
    titel: dokumentTitel,
    untertitel: s(currentSubtitle),
    empfaenger: vpNameEcht || undefined,
    datum: heute,
    nummer: `Version ${version}`,
  });
  doc.addPage();

  let y = addBrandedHeader(doc, logo, currentTitle, currentSubtitle);

  const ensure = (need: number) => {
    if (y + need > BOTTOM) {
      doc.addPage();
      y = addBrandedHeader(doc, logo, currentTitle, currentSubtitle);
    }
  };

  /* ── Typografie ────────────────────────────────────────────────
   * Zwei Groessenstufen fuer den Fliesstext, eine fuer Zwischentitel, die
   * Abschnittstitel kommen aus dem gemeinsamen Modul. Vertraege werden
   * gelesen, deshalb ist der Fliesstext bewusst etwas groesser als in den
   * Uebersichtsdokumenten und der Zeilenabstand grosszuegig.
   * -------------------------------------------------------------- */
  // Die kompakte Fassung ist auf zwölf bis dreizehn Seiten ausgelegt und
  // steht eine Stufe enger; die Altfassung behaelt ihr bisheriges Satzbild.
  const kompakt = ctx.fassung !== "alt";
  /** Groesse des Fliesstextes in Punkt. */
  const TEXT = kompakt ? 9 : 9.5;
  /** Zeilenabstand des Fliesstextes in Millimetern. */
  const ZEILE = kompakt ? 4.5 : 5;
  /** Abstand nach einem Absatz in Millimetern. */
  const ABSATZ = kompakt ? 2.2 : 3;

  const h1 = (text: string) => {
    // Ein Abschnittstitel darf nie allein am Seitenende stehen. Deshalb muss
    // neben dem Titel selbst noch Platz fuer rund drei Textzeilen frei sein.
    ensure(32);
    spacer(kompakt ? 2 : 3);
    y = brandedSectionTitle(doc, s(text), y, M, CW);
  };

  const p = (text: string, opts: { size?: number; gap?: number } = {}) => {
    const size = opts.size ?? TEXT;
    // Der Zeilenabstand waechst mit der Schriftgroesse, damit abweichende
    // Groessen nicht enger stehen als der uebrige Text.
    const zeile = (size / TEXT) * ZEILE;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(size);
    doc.setTextColor(...BRAND.text);
    const lines = doc.splitTextToSize(s(text), CW);
    for (const ln of lines) {
      ensure(zeile + 1);
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(size);
      doc.setTextColor(...BRAND.text);
      doc.text(ln, M, y);
      y += zeile;
    }
    y += opts.gap ?? ABSATZ;
    doc.setTextColor(0, 0, 0);
  };

  const bullet = (items: string[]) => {
    for (const it of items) {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(TEXT);
      const lines = doc.splitTextToSize(s(it), CW - 9) as string[];
      ensure(lines.length * ZEILE + 1);
      doc.setTextColor(...BRAND.accent);
      doc.text("•", M + 1, y);
      // Zeile fuer Zeile setzen, damit der Abstand derselbe ist wie im Fliesstext.
      doc.setTextColor(...BRAND.text);
      lines.forEach((ln, i) => doc.text(ln, M + 7, y + i * ZEILE));
      y += lines.length * ZEILE + (kompakt ? 0.5 : 1);
    }
    y += kompakt ? 1.5 : 2.5;
    doc.setTextColor(0, 0, 0);
  };

  const spacer = (n = 3) => { y += n; };

  const infoBox = (titel: string, untertitel: string) => {
    const boxH = 19;
    ensure(boxH + 6);
    doc.setFillColor(...BRAND.white);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, boxH, 2, 2, "FD");
    // Akzentbalken innerhalb des Rahmens, damit die abgerundeten Ecken
    // nicht durchscheinen.
    doc.setFillColor(...BRAND.accent);
    doc.rect(M + 0.4, y + 2, 1.6, boxH - 4, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND.primary);
    doc.text(s(titel), M + 6, y + 7.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(untertitel), M + 6, y + 13.5);
    doc.setTextColor(0, 0, 0);
    y += boxH + 5;
  };

  /**
   * Eine Zeile des Konditionenblatts: Bezeichnung links in Fettschrift, Wert
   * rechts, darüber eine feine Trennlinie. Beide Teile laufen durch
   * splitTextToSize, damit die Einzeldokumente dieselben Absätze erzeugen.
   */
  const LABEL_W = 40;
  const zeile = (label: string, wert: string) => {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8.5);
    const labelLines = doc.splitTextToSize(s(label), LABEL_W - 3) as string[];
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(TEXT);
    const wertLines = doc.splitTextToSize(s(wert), CW - LABEL_W) as string[];
    const n = Math.max(labelLines.length, wertLines.length);
    ensure(n * ZEILE + 3);
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.2);
    doc.line(M, y - 3, M + CW, y - 3);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...BRAND.muted);
    labelLines.forEach((ln, i) => doc.text(ln, M, y + i * ZEILE));
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(TEXT);
    doc.setTextColor(...BRAND.text);
    wertLines.forEach((ln, i) => doc.text(ln, M + LABEL_W, y + i * ZEILE));
    doc.setTextColor(0, 0, 0);
    y += n * ZEILE + 1.2;
  };

  const tools = { h1, p, bullet, spacer, ensure, infoBox, zeile };

  // ─── Vertragsparteien als luftiger zweispaltiger Block ───
  y = brandedSectionTitle(doc, "Vertragsparteien", y, M, CW);

  const boxY = y;
  const colGap = 6;
  const colW = (CW - colGap) / 2;
  const leftX = M + 6;
  const rightX = M + colW + colGap + 6;

  const leftLines = [
    `${GESELLSCHAFT.rechtsform} (${GESELLSCHAFT.zusatz})`,
    GESELLSCHAFT.adresse,
    `Inhaber: ${GESELLSCHAFT.vertretenDurch}`,
    '— nachfolgend "Gesellschaft" genannt —',
  ];
  const rightLines = [
    ...vpAdrLines,
    ...vpKontakt,
    '— nachfolgend "Vertriebspartner" genannt —',
  ];

  // Dynamische Box-Höhe. Gemessen wird in genau der Schrift, in der die Zeilen
  // spaeter auch gesetzt werden, sonst faellt der Kasten zu hoch oder zu flach aus.
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  const measure = (lines: string[]) => {
    let n = 0;
    for (const ln of lines) n += doc.splitTextToSize(s(ln), colW - 8).length;
    return n;
  };
  const maxLines = Math.max(measure(leftLines), measure(rightLines));
  /** Zeilenabstand in der Parteienbox. */
  const boxZeile = 4.4;
  const boxH = 21 + maxLines * boxZeile + 5;

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(M, boxY, CW, boxH, 2.5, 2.5, "F");
  // Akzentbalken leicht eingerueckt, damit die abgerundeten Ecken erhalten bleiben.
  doc.setFillColor(...BRAND.accent);
  doc.rect(M, boxY + 1.8, 2.5, boxH - 3.6, "F");
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.2);
  doc.line(M + colW + colGap / 2 + 1, boxY + 5, M + colW + colGap / 2 + 1, boxY + boxH - 5);

  // Labels
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(s("VERANTWORTLICHER / GESELLSCHAFT"), leftX, boxY + 7);
  doc.text(s("VERTRIEBSPARTNER"), rightX, boxY + 7);

  // Namen
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...BRAND.primary);
  doc.text(s(GESELLSCHAFT.name), leftX, boxY + 15);
  doc.text(s(vpName), rightX, boxY + 15);

  // Details
  const writeCol = (lines: string[], x: number) => {
    let yy = boxY + 23;
    for (const ln of lines) {
      const wrapped = doc.splitTextToSize(s(ln), colW - 8);
      for (const w of wrapped) { doc.text(w, x, yy); yy += boxZeile; }
    }
  };
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.text);
  writeCol(leftLines, leftX);
  writeCol(rightLines, rightX);
  doc.setTextColor(0, 0, 0);

  y = boxY + boxH + 2;

  // Stand & Version dezent unter der Box
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.muted);
  // Die Konditionen stehen in der kompakten Fassung in Anlage 1, in der
  // Altfassung in Anlage 2.
  const konditionenAnlage = ctx.fassung === "alt" ? "Details in Anlage 2" : "Konditionen in Anlage 1";
  doc.text(
    s(`Stand: ${heute} · ${paket.partnerHonorar ? `Vertragstyp: ${paket.titel}` : `Paket: ${paket.titel}`} (${konditionenAnlage}) · Version ${version}${hrName ? " · HR: " + hrName : ""}`),
    W / 2,
    y + 3,
    { align: "center" },
  );
  doc.setTextColor(0, 0, 0);
  y += 8;

  // Der Vertragstext liegt in vertragKlauseln.ts, damit die Signaturseite und
  // die per Mail versandten Dokumente denselben Stand verwenden.
  renderHauptvertrag(tools, ctx);

  // ─── Hinweis und Unterschriften ───
  // Beides bildet den Abschluss des Hauptvertrages und wird deshalb zusammen
  // umbrochen. Ein Unterschriftenfeld, das ueber zwei Seiten laeuft, oder ein
  // Hinweis ohne die zugehoerige Unterschrift waere ein sichtbarer Mangel.
  // Der Anlagenbereich ("1-6 & 9") kommt aus derselben Quelle wie § 18.
  const akzHinweis = akzeptanzHinweisText(ctx);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  const akzLines = doc.splitTextToSize(s(akzHinweis), CW - 14) as string[];
  const hinweisH = 13 + akzLines.length * 4.4 + 4;
  /** Hoehe der Unterschriftenzone ohne den Abschnittstitel. */
  const sigH = kompakt ? 48 : 52;

  spacer(kompakt ? 3 : 5);
  ensure(hinweisH + 8 + 14 + sigH);

  doc.setFillColor(...BRAND.light);
  doc.roundedRect(M, y, CW, hinweisH, 2.5, 2.5, "F");
  doc.setFillColor(...BRAND.accent);
  doc.rect(M, y + 1.8, 2.5, hinweisH - 3.6, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND.primary);
  doc.text(s("Wichtig: Unterschrift bestätigt auch alle Anlagen"), M + 7, y + 7.5);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...BRAND.text);
  let aly = y + 14;
  for (const ln of akzLines) { doc.text(ln, M + 7, aly); aly += 4.4; }
  doc.setTextColor(0, 0, 0);
  y += hinweisH + 8;

  y = brandedSectionTitle(doc, "Unterschriften", y, M, CW);

  const sigGap = 14;
  const sigW = (CW - sigGap) / 2;
  const sigSpalten = [
    {
      x: M,
      kennung: "GESELLSCHAFT",
      name: GESELLSCHAFT.name,
      rolle: GESELLSCHAFT.vertretenDurch,
    },
    {
      x: M + sigW + sigGap,
      kennung: "VERTRIEBSPARTNER",
      name: vpName,
      rolle: "Vertriebspartner",
    },
  ];
  const sigOrtY = y + 12;
  const sigLinieY = sigOrtY + 26;
  for (const sp of sigSpalten) {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(sp.kennung), sp.x, y);

    // Ort und Datum
    doc.setDrawColor(...BRAND.separator);
    doc.setLineWidth(0.3);
    doc.line(sp.x, sigOrtY, sp.x + sigW, sigOrtY);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(s("Ort, Datum"), sp.x, sigOrtY + 4);

    // Unterschrift
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.4);
    doc.line(sp.x, sigLinieY, sp.x + sigW, sigLinieY);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.primary);
    doc.text(s(sp.name), sp.x, sigLinieY + 5.5);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...BRAND.muted);
    doc.text(s(sp.rolle), sp.x, sigLinieY + 10);
  }
  doc.setTextColor(0, 0, 0);
  y = sigLinieY + 14;

  // ─── KEINE ANLAGEN MEHR IN DIESEM PDF ───
  // Bis zum 04.09.2026 hingen alle Anlagen hinten an diesem Dokument. In der
  // Akte und beim Versand zeigte deshalb jeder Anlagenname auf dieselbe Datei,
  // und wer "Anlage 1, Konditionenblatt" anklickte, bekam den ganzen Vertrag.
  //
  // Seither ist jede Anlage ein eigenes Dokument mit eigenem Deckblatt
  // (buildEinzelDokumentPdf in einzelDokumentePdf.ts). Dieses PDF enthaelt nur
  // den Hauptvertrag; das Anlagenverzeichnis in § 14 verweist auf die
  // gesondert vorliegenden Dokumente.

  // Fusszeile auf alle Inhaltsseiten.
  // Das Deckblatt bekommt keine Fusszeile und zaehlt nicht mit, dort steht die
  // Firmenzeile bereits.
  const total = doc.getNumberOfPages();
  for (let i = 2; i <= total; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, total - 1);
  }

  return doc.output("blob");
}

/**
 * Pfad in der Ablage `bewerbungen` aus einem signierten Link, etwa
 * ".../storage/v1/object/sign/bewerbungen/vertrag/<id>/draft-....pdf?token=...".
 * null, wenn der Link nicht so aussieht.
 */
export function vertragPdfPfadAusLink(link: string): string | null {
  const treffer = /\/object\/sign\/bewerbungen\/([^?#]+)/.exec(link || "");
  if (!treffer) return null;
  try {
    return decodeURIComponent(treffer[1]);
  } catch {
    return null;
  }
}

/**
 * Erneuert einen abgelaufenen signierten Link auf ein hinterlegtes
 * Vertrags-PDF (seit 27.09.2026, Codex-Pruefung A4-06). Beim Wiederversand
 * bleibt so dieselbe Datei in derselben Fassung, statt still einen neuen
 * Vertrag in der aktuellen Fassung zu bauen. null, wenn es nicht geht.
 */
export async function erneuereVertragPdfLink(link: string): Promise<string | null> {
  const pfad = vertragPdfPfadAusLink(link);
  if (!pfad) return null;
  const { data, error } = await supabase.storage.from("bewerbungen").createSignedUrl(pfad, 60 * 60 * 24 * 365);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function uploadVertragPdf(
  bewerberId: string,
  blob: Blob,
  variant: "draft" | "signed",
  /**
   * Kennung des Dokuments im Dateinamen, etwa "anlage_3". Seit dem 04.09.2026
   * wird jede Anlage einzeln abgelegt; ohne eigene Kennung ueberschrieben sich
   * die Dateien gegenseitig, und in der Akte zeigte jeder Anlagenname auf
   * dieselbe Datei.
   */
  dokumentKey?: string,
): Promise<string> {
  // Sicherstellen, dass die Supabase-Auth-Session vollständig hydriert ist,
  // bevor der erste Storage-Call abgesetzt wird. Ohne dies scheiterte der
  // erste Klick auf „Vertrag neu erstellen" häufig mit einem Auth-Fehler
  // und funktionierte erst beim zweiten Versuch.
  try { await supabase.auth.getSession(); } catch { /* ignore */ }

  const doUpload = async (): Promise<string> => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const teil = dokumentKey ? `${dokumentKey.replace(/[^a-z0-9_-]/gi, "")}-` : "";
    const path = `vertrag/${bewerberId}/${variant}-${teil}${stamp}.pdf`;
    const { error } = await supabase.storage.from("bewerbungen").upload(path, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (error) throw error;
    const { data } = await supabase.storage.from("bewerbungen").createSignedUrl(path, 60 * 60 * 24 * 365);
    return data?.signedUrl ?? path;
  };

  try {
    return await doUpload();
  } catch (e) {
    // Einmaliger, transparenter Retry nach kurzer Wartezeit – fängt Race
    // Conditions bei frisch geladener Seite oder gerade rotiertem Token ab.
    console.warn("[uploadVertragPdf] erster Versuch fehlgeschlagen, retry in 400 ms:", e);
    await new Promise((r) => setTimeout(r, 400));
    try { await supabase.auth.getSession(); } catch { /* ignore */ }
    return await doUpload();
  }
}

/**
 * Lädt einen anonymisierten Mustervertrag (für Vorab-Versand an Interessenten)
 * in einen separaten Storage-Pfad hoch und gibt eine 90-Tage-Signed-URL zurück.
 * Bewusst getrennt von `uploadVertragPdf`, damit Muster nicht mit echten
 * Draft/Signed-Verträgen vermischt werden.
 */
export async function uploadMusterVertragPdf(bewerberId: string, paketId: string, blob: Blob): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = `muster-vertrag/${bewerberId}/muster-${paketId}-${stamp}.pdf`;
  const { error } = await supabase.storage.from("bewerbungen").upload(path, blob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw error;
  const { data } = await supabase.storage.from("bewerbungen").createSignedUrl(path, 60 * 60 * 24 * 90);
  return data?.signedUrl ?? path;
}
