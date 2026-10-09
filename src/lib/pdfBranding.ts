import jsPDF, { GState } from "jspdf";
import { COMPANY_LINE } from "./impressumKontakt";
import { datumText, type FormatSprache } from "./sprachFormat";

const LOGO_URL = "/images/moreimmo-logo.png";
/** Nur die Bildmarke in Weiß und Gold, für dunklen Grund (Deckblatt). */
const ICON_URL = "/images/os-bildmarke-hell.png";

// Active PDF font family. Defaults to built-in Helvetica (no Unicode support).
// Call ensureUnicodeFont(doc) to switch to embedded Noto Sans (full Unicode incl. Umlaute).
export let PDF_FONT: string = "helvetica";

let _fontCache: { regular: string; bold: string } | null = null;

async function _fetchTtfBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  let bin = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)) as any);
  }
  return btoa(bin);
}

/**
 * Registers Noto Sans (Regular + Bold) on the given jsPDF instance so that
 * Umlaute / Unicode characters render correctly (jsPDF Helvetica is WinAnsi only).
 * Sets the module-level PDF_FONT to "NotoSans" – pdfBranding helpers will use it.
 * Falls back silently to Helvetica if the CDN is unreachable.
 */
/**
 * Bettet die Hausschrift Plus Jakarta Sans in das PDF ein.
 *
 * Die Dateien liegen im eigenen Verzeichnis unter /fonts und nicht bei einem
 * fremden Anbieter. Eine Schrift, die beim Erzeugen erst aus dem Netz geholt
 * wird, fehlt genau dann, wenn die Verbindung klemmt, und dann sehen einzelne
 * Dokumente anders aus als der Rest. Genau das soll nicht passieren.
 *
 * Es ist dieselbe Schrift, die auch das CRM benutzt. Klappt das Laden doch
 * einmal nicht, faellt jsPDF still auf Helvetica zurueck und das Dokument
 * entsteht trotzdem.
 */
export async function ensureUnicodeFont(doc: jsPDF): Promise<boolean> {
  try {
    if (!_fontCache) {
      const [regular, bold] = await Promise.all([
        _fetchTtfBase64("/fonts/PlusJakartaSans-Regular.ttf"),
        _fetchTtfBase64("/fonts/PlusJakartaSans-Bold.ttf"),
      ]);
      _fontCache = { regular, bold };
    }
    doc.addFileToVFS("PlusJakartaSans-Regular.ttf", _fontCache.regular);
    doc.addFont("PlusJakartaSans-Regular.ttf", "PlusJakarta", "normal");
    doc.addFileToVFS("PlusJakartaSans-Bold.ttf", _fontCache.bold);
    doc.addFont("PlusJakartaSans-Bold.ttf", "PlusJakarta", "bold");
    PDF_FONT = "PlusJakarta";
    doc.setFont("PlusJakarta", "normal");
    return true;
  } catch (e) {
    console.warn("[pdfBranding] Hausschrift nicht ladbar, es bleibt bei Helvetica", e);
    PDF_FONT = "helvetica";
    return false;
  }
}

/**
 * Registriert die Hausschrift ohne Warten.
 *
 * Für Dokumente, deren Erzeuger keine asynchrone Funktion ist und deren
 * Aufrufer sich nicht ändern soll. Liegt die Schrift schon im Zwischenspeicher,
 * wird sie sofort gesetzt. Sonst wird sie im Hintergrund geholt, das Dokument
 * entsteht in Helvetica und das nächste hat die Hausschrift.
 */
export function applyPdfFontSync(doc: jsPDF): boolean {
  if (!_fontCache) {
    void _fetchTtfBase64("/fonts/PlusJakartaSans-Regular.ttf")
      .then(async (regular) => {
        const bold = await _fetchTtfBase64("/fonts/PlusJakartaSans-Bold.ttf");
        _fontCache = { regular, bold };
      })
      .catch(() => { /* dann bleibt es bei Helvetica */ });
    return false;
  }
  try {
    doc.addFileToVFS("PlusJakartaSans-Regular.ttf", _fontCache.regular);
    doc.addFont("PlusJakartaSans-Regular.ttf", "PlusJakarta", "normal");
    doc.addFileToVFS("PlusJakartaSans-Bold.ttf", _fontCache.bold);
    doc.addFont("PlusJakartaSans-Bold.ttf", "PlusJakarta", "bold");
    PDF_FONT = "PlusJakarta";
    doc.setFont("PlusJakarta", "normal");
    return true;
  } catch {
    return false;
  }
}

/**
 * Replaces emoji glyphs with safe text equivalents and strips remaining
 * pictographic characters. Use for jsPDF text input even with Noto Sans
 * (Noto Sans does not include color emoji glyphs).
 */
export function sanitizePdfText(s: string): string {
  if (!s) return "";
  return s
    .replace(/👉/g, "→")
    .replace(/🎉/g, "")
    .replace(/💰|📈|🛡️|🛡|🏖️|🏖|🔄|👨‍👩‍👧|🏡|✨|⚠️|⚠/g, "")
    .replace(/[\u{1F100}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\u200D/g, "")
    .replace(/\uFE0F/g, "")
    // Geschützte und schmale Leerzeichen druckt jsPDF nicht; aus "150 EUR brutto"
    // wurde sonst "150 EURbrutto". Intl.NumberFormat liefert genau solche Zeichen.
    .replace(/[\u00A0\u202F\u2007\u2009\u2060]/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trimEnd();
}

/* ── Farbwelt ───────────────────────────────────────────────────
 * Eine Palette für alle Dokumente. Tiefes Tintenblau für Überschriften und
 * Deckblätter, ein kräftiges Blau als einziger Akzent, dazu drei Grautöne.
 * Wer hier etwas ändert, ändert es in jedem PDF des Systems.
 * ------------------------------------------------------------- */
export const BRAND = {
  /** Überschriften und Deckblatt. Fast schwarz mit einem Stich ins Blaue. */
  primary: [15, 22, 33] as [number, number, number],
  /** Der einzige Akzent: Linien, Ziffern, Hervorhebungen. */
  accent: [24, 127, 88] as [number, number, number],
  /** Dunklere Variante für feine Unterstriche auf Weiß. */
  accentDark: [19, 102, 71] as [number, number, number],
  /**
   * Helles Blau, nur auf dunklem Grund. Das ist der gemessene Ton der
   * Bildmarke (#30E19E). Vorher stand hier #1ED28D, Farbton 210, der einzige
   * helle Blauton, der nicht auf der Linie des Logos lag. Auf der dunklen
   * Hausfläche erreicht er 10,73:1, auf Weiß wäre er unbrauchbar.
   */
  accentLight: [48, 225, 158] as [number, number, number],
  /** Beschriftungen, Fußzeilen, alles Zweitrangige. */
  muted: [122, 133, 148] as [number, number, number],
  /** Flächiger Hintergrund für Kästen und Tabellenköpfe. */
  light: [244, 247, 250] as [number, number, number],
  /** Haarlinie zwischen Zeilen. */
  separator: [227, 232, 238] as [number, number, number],
  /** Fließtext. Nicht reines Schwarz, das wirkt im Druck hart. */
  text: [43, 50, 60] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
};

// Firmenzeile, Telefon und E-Mail liegen in `impressumKontakt.ts`, damit
// Formulare und Exposé-Inhalt sie ohne jsPDF lesen können. Hier nur weitergereicht.
export { COMPANY_LINE, IMPRESSUM_TELEFON, IMPRESSUM_EMAIL } from "./impressumKontakt";

let _logoCache: string | null | undefined = undefined;

export async function loadLogo(): Promise<string | null> {
  if (_logoCache !== undefined) return _logoCache;
  try {
    const res = await fetch(LOGO_URL);
    if (!res.ok) { _logoCache = null; return null; }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => { _logoCache = reader.result as string; resolve(_logoCache); };
      reader.onerror = () => { _logoCache = null; resolve(null); };
      reader.readAsDataURL(blob);
    });
  } catch { _logoCache = null; return null; }
}

let _iconCache: string | null | undefined = undefined;

/** Lädt die Bildmarke für dunkle Flächen. */
export async function loadIcon(): Promise<string | null> {
  if (_iconCache !== undefined) return _iconCache;
  try {
    const res = await fetch(ICON_URL);
    if (!res.ok) { _iconCache = null; return null; }
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => { _iconCache = reader.result as string; resolve(_iconCache); };
      reader.onerror = () => { _iconCache = null; resolve(null); };
      reader.readAsDataURL(blob);
    });
  } catch { _iconCache = null; return null; }
}

const W = 210;
const H = 297;
const MARGIN = 20;

/** Zeichnet eine Wortmarke aus Text. Auf Dunkel gibt es kein passendes Logo. */
/** Zeichnet die Wortmarke und gibt ihre Gesamtbreite in Millimetern zurück. */
function wortmarke(doc: jsPDF, x: number, y: number, groesse: number, hell: boolean): number {
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(groesse);
  doc.setTextColor(...(hell ? BRAND.white : BRAND.primary));
  doc.text("OS", x, y);
  const breite = doc.getTextWidth("OS");
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...(hell ? BRAND.accentLight : BRAND.muted));
  doc.text("Immobilien", x + breite + 1.2, y);
  return breite + 1.2 + doc.getTextWidth("Immobilien");
}

/**
 * Breite eines gesperrt gesetzten Textes.
 *
 * jsPDF rechnet die Sperrung (`charSpace`) bei `getTextWidth` nicht mit. Wer
 * gesperrten Text rechtsbündig setzt, bekommt deshalb einen Überstand von
 * `(Zeichenzahl - 1) * charSpace` über den rechten Rand hinaus. Bei einem
 * Titel wie "RESERVIERUNGSVEREINBARUNG" sind das über 20 Millimeter, der Text
 * lief bisher aus dem Blatt. Deshalb rechnen wir die Breite selbst und setzen
 * linksbündig an der berechneten Stelle.
 */
function gesperrteBreite(doc: jsPDF, text: string, charSpace: number): number {
  if (!text) return 0;
  return doc.getTextWidth(text) + (text.length - 1) * charSpace;
}

/**
 * Die festen Wörter des Hausdesigns je Sprache (Plan Kundensprache, D21).
 *
 * Sprachgebunden ist nur das Deckblatt. Kopf und Fußzeile tragen keine
 * eigenen Wörter: den Titel reicht der Aufrufer schon in seiner Sprache
 * herein, die Firmenzeile ist eine Anschrift und die Seitenzahl steht als
 * „2 / 5“. Deshalb brauchen `addBrandedHeader` und `addBrandedFooter` keinen
 * Sprachparameter; wer einen englischen Titel will, übergibt ihn englisch.
 */
export const PDF_BRANDING_TEXTE: Record<FormatSprache, { erstelltFuer: string; datum: string; dokument: string }> = {
  de: { erstelltFuer: "Erstellt für", datum: "Datum", dokument: "Dokument" },
  en: { erstelltFuer: "Prepared for", datum: "Date", dokument: "Document" },
};

export interface DeckblattAngaben {
  /**
   * Sprache der festen Beschriftungen und des Standarddatums. Ohne Angabe
   * Deutsch, bestehende Aufrufer bleiben damit unverändert. Die Sprache des
   * Kunden liefert `kundenSprache` aus `src/lib/kundenSprache.ts`.
   */
  sprache?: FormatSprache;
  titel: string;
  untertitel?: string;
  /** Kurze Einordnung ganz oben, etwa "Vertriebsunterlage". */
  kennung?: string;
  /** Dokumentnummer. Bleibt bei Selbstauskunft und Reservierung bewusst leer. */
  nummer?: string;
  /** Für wen das Dokument erstellt wurde. */
  empfaenger?: string;
  /** Datum als fertiger Text. Ohne Angabe wird der heutige Tag gesetzt. */
  datum?: string;
  /** Zusatzzeile ganz unten, etwa ein rechtlicher Hinweis. */
  fusszeile?: string;
}

/**
 * Dunkles Deckblatt.
 *
 * Aufbau von oben nach unten: Bildmarke und Wortmarke, viel Luft, die
 * Kennung, der Titel, eine Akzentlinie, der Untertitel. Unten der Empfänger,
 * das Datum und die Dokumentnummer. Der weiche Schein oben entsteht aus
 * ineinandergelegten Ellipsen, jsPDF kennt keine Verläufe.
 */
export function addCoverPage(
  doc: jsPDF,
  icon: string | null,
  angaben: DeckblattAngaben,
): void {
  // Grundfläche
  doc.setFillColor(...BRAND.primary);
  doc.rect(0, 0, W, H, "F");

  // Weicher Schein oben. jsPDF kennt keine Verläufe, deshalb viele flache
  // Ellipsen von aussen nach innen, mit quadratisch abnehmendem Abstand zur
  // Grundfarbe. Weniger Schritte ergeben sichtbare Ringe.
  const schritte = 64;
  for (let i = schritte; i >= 1; i--) {
    const t = i / schritte;
    const staerke = Math.pow(1 - t, 2.2) * 0.5;
    const mix = (ziel: number, basis: number) => Math.round(basis + (ziel - basis) * staerke);
    doc.setFillColor(
      mix(BRAND.accent[0], BRAND.primary[0]),
      mix(BRAND.accent[1], BRAND.primary[1]),
      mix(BRAND.accent[2], BRAND.primary[2]),
    );
    const r = 16 + t * 86;
    doc.ellipse(W / 2, -6, r, r * 0.62, "F");
  }

  // Zweiter, deutlich schwächerer Schein unten rechts, im hellen Blau der
  // Bildmarke. Er nimmt der unteren Hälfte die Leere, ohne mit dem Fussbereich
  // zu konkurrieren. Gleiche Bauweise wie oben.
  for (let i = schritte; i >= 1; i--) {
    const t = i / schritte;
    const staerke = Math.pow(1 - t, 2.2) * 0.14;
    const mix = (ziel: number, basis: number) => Math.round(basis + (ziel - basis) * staerke);
    doc.setFillColor(
      mix(BRAND.accentLight[0], BRAND.primary[0]),
      mix(BRAND.accentLight[1], BRAND.primary[1]),
      mix(BRAND.accentLight[2], BRAND.primary[2]),
    );
    const r = 14 + t * 74;
    doc.ellipse(W + 12, H + 8, r, r * 0.8, "F");
  }

  // Feines Karo im Sechzehn-Millimeter-Raster, weisse Linien.
  //
  // Es steht am dichtesten dort, wo Kennung, Titel und Untertitel sitzen, und
  // laeuft nach aussen aus. Ein Raster, das bis an alle vier Kanten
  // durchlaeuft, legt sich wie ein Gitter ueber die Seite und macht sie flach.
  // Laeuft es aus, entsteht Tiefe: das Auge liest die Mitte als nah und die
  // Raender als fern.
  //
  // jsPDF kennt keine Masken. Der Verlauf entsteht deshalb aus kurzen
  // Teilstuecken, deren Deckkraft vom Abstand zum Mittelpunkt abhaengt. Damit
  // nicht fuer jedes Teilstueck ein eigener Grafikzustand gesetzt wird, kommen
  // sie in zehn Stufen und jede Stufe wird in einem Rutsch gezeichnet.
  //
  // Zur Deckkraft selbst: "opacity" wirkt in jsPDF nur auf Flaechen, Linien
  // brauchen zusaetzlich "stroke-opacity". Ohne diesen Zusatz zieht das Karo
  // als weisses Gitter quer durch den Titel. Am Ende wird beides ausdruecklich
  // auf eins zurueckgesetzt, sonst zeichnet alles Folgende durchscheinend.
  const KARO = 16;
  const SEGMENT = 8;
  const KARO_MAX = 0.10;
  const STUFEN = 10;
  const kx = W * 0.42;
  const ky = H * 0.5;
  const krx = W * 0.66;
  const kry = H * 0.48;

  const karoStaerke = (x: number, y: number): number => {
    const d = Math.hypot((x - kx) / krx, (y - ky) / kry);
    return d >= 1 ? 0 : Math.pow(1 - d, 1.5);
  };

  const eimer: Array<Array<[number, number, number, number]>> =
    Array.from({ length: STUFEN }, () => []);
  const einsortieren = (x1: number, y1: number, x2: number, y2: number) => {
    const s = karoStaerke((x1 + x2) / 2, (y1 + y2) / 2);
    if (s <= 0.02) return;
    eimer[Math.min(STUFEN - 1, Math.floor(s * STUFEN))].push([x1, y1, x2, y2]);
  };
  for (let x = 0; x <= W; x += KARO) {
    for (let y = 0; y < H; y += SEGMENT) einsortieren(x, y, x, Math.min(y + SEGMENT, H));
  }
  for (let y = 0; y <= H; y += KARO) {
    for (let x = 0; x < W; x += SEGMENT) einsortieren(x, y, Math.min(x + SEGMENT, W), y);
  }

  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.2);
  eimer.forEach((stuecke, stufe) => {
    if (stuecke.length === 0) return;
    const deckkraft = KARO_MAX * ((stufe + 0.5) / STUFEN);
    doc.setGState(new GState({ opacity: deckkraft, "stroke-opacity": deckkraft }));
    for (const [x1, y1, x2, y2] of stuecke) doc.line(x1, y1, x2, y2);
  });
  doc.setGState(new GState({ opacity: 1, "stroke-opacity": 1 }));

  // Bildmarke und Wortmarke.
  //
  // REGEL für alle Dokumente: Auf hellem Grund steht das Originallogo als Bild,
  // siehe addBrandedHeader. Auf DUNKLEM Grund gilt diese Fassung hier, also die
  // blaue Bildmarke plus den weiss gesetzten Schriftzug. Das Originallogo hat
  // schwarze Schrift und wuerde auf Dunkel verschwinden. Wer kuenftig ein Logo
  // auf dunkler Flaeche braucht, nimmt diese Kombination.
  let y = 38;
  if (icon) {
    try {
      // "FAST" packt die Bilddaten (Flate). Ohne Angabe legt jsPDF ein PNG
      // unkomprimiert ab, allein die Wortmarke wog so über drei Megabyte.
      const bild = doc.getImageProperties(icon);
      const iconB = (11 * bild.width) / bild.height;
      doc.addImage(icon, "PNG", MARGIN, y - 9, iconB, 11, undefined, "FAST");
      wortmarke(doc, MARGIN + iconB + 4, y, 17, true);
    } catch {
      wortmarke(doc, MARGIN, y, 17, true);
    }
  } else {
    wortmarke(doc, MARGIN, y, 17, true);
  }

  // Kennung
  y = 132;
  if (angaben.kennung) {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.accentLight);
    doc.text(sanitizePdfText(angaben.kennung.toUpperCase()), MARGIN, y, { charSpace: 1.6 });
    y += 12;
  }

  // Titel. Lange Titel werden stufenweise kleiner gesetzt, statt in den
  // Fussbereich zu laufen: "DSGVO-Auftragsverarbeitungsvereinbarung (AVV) inkl.
  // Verschwiegenheitserklaerung" braucht bei 30 pt vier Zeilen. Kurze Titel
  // bleiben unveraendert bei 30 pt, das Bild der bestehenden Deckblaetter
  // aendert sich also nicht.
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...BRAND.white);
  const titelBreite = W - 2 * MARGIN - 18;
  let titelGroesse = 30;
  doc.setFontSize(titelGroesse);
  let titelZeilen = doc.splitTextToSize(sanitizePdfText(angaben.titel), titelBreite) as string[];
  for (const kleiner of [24, 19, 16]) {
    if (titelZeilen.length <= 2) break;
    titelGroesse = kleiner;
    doc.setFontSize(titelGroesse);
    titelZeilen = doc.splitTextToSize(sanitizePdfText(angaben.titel), titelBreite) as string[];
  }
  doc.setFontSize(titelGroesse);
  // Bei 30 pt ergibt das die bisherigen 13 mm, exakt wie vorher.
  const titelZeilenAbstand = (titelGroesse * 13) / 30;
  for (const zeile of titelZeilen) {
    doc.text(zeile, MARGIN, y);
    y += titelZeilenAbstand;
  }

  // Akzentlinie
  y += 3;
  doc.setDrawColor(...BRAND.accentLight);
  doc.setLineWidth(1.2);
  doc.line(MARGIN, y, MARGIN + 26, y);
  y += 11;

  // Untertitel
  if (angaben.untertitel) {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(11);
    doc.setTextColor(212, 220, 232);
    const zeilen = doc.splitTextToSize(sanitizePdfText(angaben.untertitel), W - 2 * MARGIN - 30) as string[];
    for (const zeile of zeilen) {
      doc.text(zeile, MARGIN, y);
      y += 6;
    }
  }

  // Fussbereich: Empfänger, Datum, Nummer
  const fussY = H - 46;
  doc.setDrawColor(60, 72, 90);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, fussY - 10, W - MARGIN, fussY - 10);

  const sprache: FormatSprache = angaben.sprache === "en" ? "en" : "de";
  const texte = PDF_BRANDING_TEXTE[sprache];
  // Deutsch bleibt beim bisherigen Standarddatum („25.9.2026“), damit sich
  // kein bestehendes Dokument ändert. Englisch „25 Sep 2026“.
  const heute = sprache === "en" ? datumText(new Date(), "en") : new Date().toLocaleDateString("de-DE");
  const spalten: Array<{ label: string; wert: string }> = [];
  if (angaben.empfaenger) spalten.push({ label: texte.erstelltFuer, wert: angaben.empfaenger });
  spalten.push({ label: texte.datum, wert: angaben.datum || heute });
  if (angaben.nummer) spalten.push({ label: texte.dokument, wert: angaben.nummer });

  const spaltenBreite = (W - 2 * MARGIN) / Math.max(1, spalten.length);
  spalten.forEach((sp, i) => {
    const x = MARGIN + i * spaltenBreite;
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7);
    doc.setTextColor(...BRAND.muted);
    doc.text(sanitizePdfText(sp.label.toUpperCase()), x, fussY, { charSpace: 1 });
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...BRAND.white);
    doc.text(sanitizePdfText(sp.wert), x, fussY + 6);
  });

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(sanitizePdfText(angaben.fusszeile || COMPANY_LINE), W / 2, H - 14, { align: "center" });

  doc.setTextColor(0, 0, 0);
}

/**
 * Laufender Kopf der Innenseiten.
 *
 * Bewusst schmal: links die Wortmarke, rechts der Dokumenttitel in Versalien,
 * darunter eine Haarlinie. Der Titel steht dadurch auf jeder Seite, ohne dass
 * er jedes Mal wie eine neue Überschrift wirkt.
 */
export function addBrandedHeader(
  doc: jsPDF,
  logo: string | null,
  title: string,
  subtitle?: string,
): number {
  const { W } = seitenMasse(doc);
  let y = 16;

  // Oben links steht das Originallogo, nicht mehr der nachgebaute Schriftzug.
  // Der Schriftzug bleibt nur als Rueckfallebene, falls die Bilddatei nicht
  // geladen werden konnte, etwa in einem Testlauf ohne Netz.
  // Breite aus dem Seitenverhaeltnis der Datei, damit ein neues Logo nicht
  // verzerrt wird.
  const LOGO_H = 5;
  let markeBreite = 0;
  if (logo) {
    try {
      const bild = doc.getImageProperties(logo);
      const LOGO_B = (LOGO_H * bild.width) / bild.height;
      doc.addImage(logo, "PNG", MARGIN, y - 4.6, LOGO_B, LOGO_H, undefined, "FAST");
      markeBreite = LOGO_B;
    } catch {
      markeBreite = wortmarke(doc, MARGIN, y, 10, false);
    }
  } else {
    markeBreite = wortmarke(doc, MARGIN, y, 10, false);
  }

  // Der Titel steht rechts, gesperrt, und darf die Wortmarke nicht berühren.
  // Reicht der Platz nicht, wird zuerst die Sperrung verkleinert, dann die
  // Schrift, und erst zuletzt gekürzt. So bleibt der Titel lesbar, statt
  // stillschweigend am Blattrand abgeschnitten zu werden.
  const titelText = sanitizePdfText(title.toUpperCase());
  const platz = W - MARGIN - (MARGIN + markeBreite + 6);
  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(...BRAND.muted);

  let sperrung = 0.9;
  let groesse = 7;
  let gesetzt = titelText;
  doc.setFontSize(groesse);
  if (gesperrteBreite(doc, gesetzt, sperrung) > platz) {
    sperrung = 0.4;
    if (gesperrteBreite(doc, gesetzt, sperrung) > platz) {
      groesse = 6;
      doc.setFontSize(groesse);
      while (gesetzt.length > 4 && gesperrteBreite(doc, gesetzt, sperrung) > platz) {
        gesetzt = gesetzt.slice(0, -1);
      }
      if (gesetzt !== titelText) gesetzt = `${gesetzt.trimEnd()}…`;
    }
  }
  doc.setFontSize(groesse);
  doc.text(gesetzt, W - MARGIN - gesperrteBreite(doc, gesetzt, sperrung), y, {
    charSpace: sperrung,
  });
  doc.setFontSize(7);

  y += 3.5;
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, W - MARGIN, y);

  // Kurzer Akzent auf der Linie, damit der Kopf nicht nur grau ist
  doc.setDrawColor(...BRAND.accent);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, y, MARGIN + 14, y);

  y += 12;

  if (subtitle) {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.muted);
    doc.text(sanitizePdfText(subtitle), MARGIN, y);
    y += 7;
  }

  doc.setTextColor(0, 0, 0);
  return y;
}

/**
 * Seitengröße statt fester 210 × 297 mm, damit Kopf und Fuß auch im
 * Querformat passen (Kaufpreisliste). Ohne Angabe, etwa bei nachgebildetem
 * jsPDF in Tests, bleibt es bei A4 hoch.
 */
function seitenMasse(doc: jsPDF): { W: number; H: number } {
  const seite = doc.internal?.pageSize;
  return { W: seite?.getWidth?.() ?? W, H: seite?.getHeight?.() ?? H };
}

/** Fusszeile mit Firmenzeile und Seitenzahl. */
export function addBrandedFooter(doc: jsPDF, pageNum: number, totalPages: number) {
  const { W, H } = seitenMasse(doc);
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, H - 20, W - MARGIN, H - 20);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(...BRAND.muted);
  doc.text(sanitizePdfText(COMPANY_LINE), MARGIN, H - 15);

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...BRAND.primary);
  doc.text(`${pageNum} / ${totalPages}`, W - MARGIN, H - 15, { align: "right" });

  doc.setTextColor(0, 0, 0);
}

/** Abschnittsüberschrift: Akzentbalken, Versalien, Haarlinie darunter. */
export function brandedSectionTitle(
  doc: jsPDF,
  title: string,
  y: number,
  margin: number,
  contentW: number,
): number {
  doc.setFillColor(...BRAND.accent);
  doc.rect(margin, y - 3.6, 2.2, 6.4, "F");

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(11);
  doc.setTextColor(...BRAND.primary);
  doc.text(sanitizePdfText(title), margin + 6, y + 1);

  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.3);
  doc.line(margin, y + 6.5, margin + contentW, y + 6.5);

  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(0, 0, 0);
  return y + 14;
}

/** Branded data row with label + value */
/**
 * Setzt einen Text so, dass er in eine vorgegebene Breite passt: erst wird die
 * Schrift verkleinert, und nur wenn das nicht reicht, wird gekürzt.
 *
 * Ohne das lief in der Selbstauskunft eine lange Bezeichnung wie
 * "Lebensversicherung (Lebensversicherung)" quer durch den daneben stehenden
 * Betrag. Der Betrag war dann nicht mehr lesbar.
 */
export function textInBreite(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxBreite: number,
  basisGroesse: number,
  minGroesse = basisGroesse - 2,
): void {
  const sauber = sanitizePdfText(text ?? "");
  let groesse = basisGroesse;
  doc.setFontSize(groesse);
  while (doc.getTextWidth(sauber) > maxBreite && groesse > minGroesse) {
    groesse -= 0.25;
    doc.setFontSize(groesse);
  }
  let ausgabe = sauber;
  if (doc.getTextWidth(ausgabe) > maxBreite) {
    while (ausgabe.length > 1 && doc.getTextWidth(ausgabe + "…") > maxBreite) {
      ausgabe = ausgabe.slice(0, -1);
    }
    ausgabe = ausgabe.trimEnd() + "…";
  }
  doc.text(ausgabe, x, y);
  doc.setFontSize(basisGroesse);
}

export function brandedRow(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  labelOffset: number = 50,
  /** Breite der Trennlinie. Ohne Angabe Beschriftungsspalte plus 40 mm. */
  linienBreite?: number,
  /**
   * Wert am rechten Ende der Zeile ausrichten. Sinnvoll, wenn die Zeile über
   * die volle Blattbreite läuft: sonst klebt der Wert in der Blattmitte und
   * rechts bleibt eine leere Fläche.
   */
  wertRechts = false,
  /**
   * Auch die Beschriftung fett und in der Textfarbe des Werts setzen, statt
   * grau und normal. Für die eine Zeile eines Abschnitts, die der Leser
   * mitnehmen soll, etwa die Reservierungsgebühr für genau diesen Kaufpreis.
   */
  labelFett = false,
): number {
  const breite = linienBreite ?? labelOffset + 40;
  doc.setFontSize(8);
  doc.setFont(PDF_FONT, labelFett ? "bold" : "normal");
  doc.setTextColor(...(labelFett ? BRAND.primary : BRAND.muted));
  // Die Beschriftung darf nie in den Wert hineinlaufen. Zwei Millimeter Luft
  // bleiben zwischen beiden stehen.
  textInBreite(doc, label, x, y, (wertRechts ? breite - 45 : labelOffset) - 2, 8, 6);
  doc.setFont(PDF_FONT, "bold");
  doc.setTextColor(...BRAND.primary);

  /*
   * Lange Werte umbrechen statt über den Spaltenrand laufen lassen.
   *
   * Vorher wurde der Wert ohne jede Breitenbegrenzung gezeichnet. Die
   * Beschriftung links war begrenzt, der Wert daneben nicht. Bei zwei Personen
   * lief er dadurch quer über die Blattmitte in die Spalte der zweiten Person
   * hinein und überschrieb deren Angaben. Aufgefallen bei Kai Laube an der
   * Mailadresse und an "93155 Hohenschambach / Hemau".
   *
   * Ein einzelnes Wort, das für sich schon zu breit ist, etwa eine sehr lange
   * Mailadresse ohne Trennstelle, bricht jsPDF nicht um. Solche Werte werden
   * deshalb hart geteilt, statt weiterhin überzulaufen.
   */
  const sauber = sanitizePdfText(value || "–");
  const wertBreite = wertRechts ? breite : breite - labelOffset;
  let zeilen: string[] = doc.splitTextToSize(sauber, wertBreite);
  zeilen = zeilen.flatMap((z: string) => {
    if (doc.getTextWidth(z) <= wertBreite) return [z];
    const teile: string[] = [];
    let rest = z;
    while (rest.length > 0 && doc.getTextWidth(rest) > wertBreite) {
      let schnitt = rest.length;
      while (schnitt > 1 && doc.getTextWidth(rest.slice(0, schnitt)) > wertBreite) schnitt--;
      teile.push(rest.slice(0, schnitt));
      rest = rest.slice(schnitt);
    }
    if (rest) teile.push(rest);
    return teile;
  });

  zeilen.forEach((zeile, i) => {
    const zy = y + i * 3.6;
    if (wertRechts) doc.text(zeile, x + breite, zy, { align: "right" });
    else doc.text(zeile, x + labelOffset, zy);
  });

  doc.setFont(PDF_FONT, "normal");
  doc.setTextColor(0, 0, 0);

  // Die Trennlinie sitzt unter der letzten Zeile, nicht unter der ersten.
  const hoehe = Math.max(0, zeilen.length - 1) * 3.6;
  doc.setDrawColor(...BRAND.separator);
  doc.setLineWidth(0.15);
  doc.line(x, y + hoehe + 3.5, x + breite, y + hoehe + 3.5);

  return y + hoehe + 7;
}
