import jsPDF from "jspdf";
import type { ReservierungData } from "@/components/reservierung/ReservierungsForm";
import { BRAND, loadLogo, loadIcon, addCoverPage, addBrandedHeader, addBrandedFooter, brandedSectionTitle, brandedRow, PDF_FONT, ensureUnicodeFont, sanitizePdfText } from "./pdfBranding";
import { zahlAusText } from "./zahlAusText";
import {
  AUFTEILUNG_TEXT,
  KAUFGEGENSTAND_GESAMTOBJEKT,
  NOTAR_HINWEIS,
  VEREINBARUNG_EINLEITUNG,
  DATENSCHUTZ_EINVERSTAENDNIS,
  WIDERRUFSBELEHRUNG,
  WIDERRUF_WAHL_TITEL,
  WIDERRUF_WAHL_EINLEITUNG,
  beschriftungEn,
  fassungsVermerk,
  gebuehrAbschnitt,
  kaeuferZeilenGesellschaft,
  objektEinleitung,
  objektZeilenGesamtobjekt,
  preisBeschriftung,
  reservierungTexte,
  unterschriftBestaetigung,
  unterschriftZeileGesellschaft,
  vertragsAufbau,
  vertragsOptionenAus,
  vertragsSpracheAus,
} from "./reservierungErklaerung";
import {
  AUFTEILUNG_TEXT_EN,
  KAUFGEGENSTAND_GESAMTOBJEKT_EN,
  UNTERSCHRIFT_WOERTER_EN,
  WERT_EN,
} from "./reservierungErklaerungEn";
import { ZWEISPRACHIG_EINLEITUNG } from "./zweisprachig";
import { ZWEITSPRACHE_FARBE, zweisprachigeZeile, zweisprachigerAbschnitt } from "./pdfZweisprachig";

const fmt = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);

/** Eine Unterschrift, wie `finalize-reservierung` sie liefert. `ort` ist freiwillig. */
export interface ReservierungUnterschrift {
  signatureData?: string;
  signedAt?: string;
  name?: string;
  ort?: string;
}

/**
 * Setzt eine Unterschrift ins PDF und meldet zurueck, ob das geklappt hat.
 *
 * Die Reservierungsvereinbarung entsteht ausdruecklich auch dann, wenn das Bild
 * nicht eingesetzt werden konnte. Ein Dokument mit leerer Unterschriftszeile ist
 * brauchbarer als gar keines. Damit daraus aber keine falsche Behauptung wird,
 * darf der Hinweis "Digital bestaetigt am ..." in diesem Fall NICHT gedruckt
 * werden, siehe die Aufrufstellen.
 */
function unterschriftEinsetzen(
  doc: jsPDF,
  bild: string,
  x: number,
  y: number,
  breite: number,
  hoehe: number,
  wer: string,
): boolean {
  try {
    doc.addImage(bild, "PNG", x, y, breite, hoehe);
    return true;
  } catch (fehler) {
    console.error(`Unterschrift ${wer} konnte nicht in das PDF eingesetzt werden:`, fehler);
    return false;
  }
}

/** „15.09.2026, 14:32 Uhr", so wie der Rechtsentwurf es für die Unterschrift verlangt. */
function datumMitUhrzeit(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const gueltig = isNaN(d.getTime()) ? new Date() : d;
  // Ausdrücklich zweistellig: ohne Angabe schreibt der Browser „5.9.2026",
  // und das sieht in einem Vertrag nach Tippfehler aus. Die Zeitzone steht
  // fest auf deutscher Zeit: Unterschreibt ein Kunde im Ausland, stand sonst
  // seine Ortszeit im Vertrag, womöglich mit einem anderen Tag.
  const datum = gueltig.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const zeit = gueltig.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  return `${datum}, ${zeit} Uhr`;
}

/**
 * Die englische Fassung eines Werts, den das Dokument selbst schreibt.
 *
 * Nur feste Texte des Dokuments (Kaufgegenstand, Aufteilung, „8 Einheiten“,
 * Güterstand). Was der Kunde oder der Berater eingetippt hat, bleibt, wie es
 * ist, und bekommt keine Übersetzung.
 */
export function reservierungWertEn(de: string): string | null {
  if (de === KAUFGEGENSTAND_GESAMTOBJEKT) return KAUFGEGENSTAND_GESAMTOBJEKT_EN;
  if (de === AUFTEILUNG_TEXT.aufgeteilt) return AUFTEILUNG_TEXT_EN.aufgeteilt;
  if (de === AUFTEILUNG_TEXT.nicht_aufgeteilt) return AUFTEILUNG_TEXT_EN.nicht_aufgeteilt;
  const einheiten = /^(\d+) Einheiten$/.exec(de);
  if (einheiten) return `${einheiten[1]} ${WERT_EN.einheiten}`;
  return WERT_EN.gueterstand[de] ?? null;
}

/**
 * Die Reservierungsvereinbarung als PDF.
 *
 * Seit dem 25.09.2026 zweisprachig, wenn der Datensatz `vertragssprache: "en"`
 * trägt (Plan Kundensprache, Entscheidung 6): Oben steht die Vorrangklausel in
 * beiden Sprachen, danach jeder Abschnitt zuerst deutsch und darunter, kleiner
 * und heller, englisch. Beträge und Daten bleiben im deutschen Format
 * (Entscheidung 9). Jeder ältere Datensatz kennt das Feld nicht und bleibt
 * genau das deutsche Dokument von vorher.
 */
export async function generateReservierungPDF(
  data: ReservierungData,
  signatures?: Record<string, ReservierungUnterschrift>
): Promise<jsPDF> {
  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const W = 210;
  const H = 297;
  const margin = 20;
  const contentW = W - 2 * margin;
  const textX = margin + 3;
  const textW = contentW - 6;
  /*
   * Die Fassung des Vertragstextes, die unterschrieben wurde. Sie steht im
   * Datensatz, seit das Formular sie beim Versand mitgibt. Fehlt sie, etwa bei
   * einem Datensatz von vor dem 15.09.2026, gilt die heutige, und die Fußzeile
   * sagt das nicht anders. Ältere Datensätze tragen ohnehin nicht die neuen
   * Abschnitte, ihr PDF sieht deshalb anders aus als das damals unterschriebene.
   */
  /*
   * Der Aufbau dieses Dokuments: mit oder ohne Reservierungsgebühr, und seit
   * dem 23.09.2026 für eine Einzelwohnung oder ein ganzes Haus
   * (Globalobjekt), dort mit Privatpersonen oder einer Gesellschaft.
   *
   * Ein fehlendes `gebuehrEntfaellt`, wie es jede Reservierung von vor dem
   * 22.09.2026 hat, heißt „mit Gebühr"; ein fehlendes `gesamtobjekt` heißt
   * Einzelwohnung. Aus dem Aufbau kommen auch die Abschnittsnummern; sie
   * stehen deshalb nirgends mehr als fester Text.
   */
  const optionen = vertragsOptionenAus(data);
  const aufbau = vertragsAufbau(optionen);
  /** Zweisprachig? Dann der englische Aufbau mit denselben Nummern daneben. */
  const zwei = vertragsSpracheAus(data) === "en";
  const aufbauEn = zwei ? vertragsAufbau(optionen, "en") : null;
  const textEn = reservierungTexte("en");
  const fassung = zwei ? fassungsVermerk(data) : (data.textFassung || aufbau.textFassung);

  const logo = await loadLogo();

  // Deckblatt. Ohne Dokumentnummer, die Reservierungsvereinbarung traegt keine.
  addCoverPage(doc, await loadIcon(), {
    kennung: zwei ? "Vereinbarung / Agreement" : "Vereinbarung",
    titel: "Reservierungsvereinbarung",
    untertitel: zwei
      ? "Verbindliche Reservierung der nachstehend bezeichneten Immobilie. Reservation agreement: binding reservation of the property described below."
      : "Verbindliche Reservierung der nachstehend bezeichneten Immobilie.",
    empfaenger: (aufbau.gesellschaft ? (data.firma || "").trim() : "")
      || [data.vorname, data.nachname].filter(Boolean).join(" ") || undefined,
  });
  doc.addPage();

  let y = addBrandedHeader(
    doc,
    logo,
    zwei ? "RESERVIERUNGSVEREINBARUNG · RESERVATION AGREEMENT" : "RESERVIERUNGSVEREINBARUNG",
    `Erstellt am: ${new Date().toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}`,
  );

  /*
   * Seitenumbruch. Die Fußzeilen entstehen erst ganz am Ende für alle Seiten
   * auf einmal, weil erst dann die Gesamtzahl feststeht. Vorher wurde hier
   * schon eine Fußzeile mit „1 / 0" gezeichnet, die die Schlussschleife dann
   * mit „1 / 5" übermalte; beide Zahlen lagen übereinander.
   */
  const checkPage = (needed: number) => {
    if (y + needed > H - 30) {
      doc.addPage();
      y = 18;
    }
  };

  /** Abschnittsüberschrift; bei Englisch mit der englischen Überschrift desselben Abschnitts. */
  const abschnitt = (kennung: Parameters<typeof aufbau.ueberschrift>[0]) => {
    checkPage(zwei ? 18 : 14);
    y += 2;
    y = aufbauEn
      // Die Nummer steht nur einmal, vor dem deutschen Titel.
      ? zweisprachigerAbschnitt(doc, aufbau.ueberschrift(kennung), aufbauEn.abschnitt(kennung)?.titel || "", y, margin, contentW)
      : brandedSectionTitle(doc, aufbau.ueberschrift(kennung), y, margin, contentW);
  };

  /** Eine Zeile über die halbe Breite. Bei Englisch mit englischer Beschriftung und gegebenenfalls Wert. */
  const row = (label: string, value: string, valueEn?: string | null) => {
    if (!zwei) {
      checkPage(6);
      y = brandedRow(doc, label, value, textX, y, 55);
      return;
    }
    checkPage(9);
    const wert = valueEn && valueEn !== value ? `${value} / ${valueEn}` : value;
    y = zweisprachigeZeile(doc, label, beschriftungEn(label), wert, textX, y, 55);
  };

  /** Fließtext in der Textfarbe des Dokuments, Zeile für Zeile mit Seitenumbruch. */
  const absatz = (text: string, opts: { fett?: boolean; groesse?: number; abstand?: number; x?: number; breite?: number; zweitsprache?: boolean } = {}) => {
    const groesse = opts.groesse ?? (opts.zweitsprache ? 7.5 : 8);
    const zeilenhoehe = groesse * 0.5;
    doc.setFont(PDF_FONT, opts.fett ? "bold" : "normal");
    doc.setFontSize(groesse);
    doc.setTextColor(...(opts.zweitsprache ? ZWEITSPRACHE_FARBE : opts.fett ? BRAND.primary : BRAND.text));
    for (const zeile of doc.splitTextToSize(sanitizePdfText(text), opts.breite ?? textW) as string[]) {
      checkPage(zeilenhoehe + 1);
      doc.text(zeile, opts.x ?? textX, y);
      y += zeilenhoehe;
    }
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(0, 0, 0);
    y += opts.abstand ?? 2;
  };

  /**
   * Ein Absatz, bei Englisch gefolgt von seiner Übersetzung. Der Abstand
   * zwischen beiden ist kleiner als zum nächsten Absatz, damit sie als Paar
   * gelesen werden.
   */
  const absatzPaar = (de: string, en: string | null | undefined, opts: { fett?: boolean; groesse?: number; abstand?: number } = {}) => {
    if (!zwei || !en) {
      absatz(de, opts);
      return;
    }
    absatz(de, { ...opts, abstand: 1 });
    absatz(en, { fett: opts.fett, groesse: opts.groesse ? opts.groesse - 0.5 : undefined, abstand: opts.abstand, zweitsprache: true });
  };

  /**
   * Ein Punkt der Vereinbarung: Nummer fett, der Text daneben in derselben
   * Zeile weiterlaufend. jsPDF kennt keinen gemischten Absatz, deshalb wird
   * der fette Teil gesetzt und der Text ab der Breite des fetten Teils
   * umbrochen: erste Zeile schmaler, die folgenden voll breit.
   *
   * `zweitsprache` setzt den Punkt kleiner und heller, für die englische
   * Fassung direkt unter der deutschen.
   */
  const ziffer = (nummer: string, text: string, punkte?: string[], zweitsprache = false) => {
    const groesse = zweitsprache ? 7.5 : 8;
    const zeilenHoehe = zweitsprache ? 3.7 : 4;
    const kopf = sanitizePdfText(nummer);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(groesse);
    const kopfBreite = doc.getTextWidth(kopf) + 1.5;
    doc.setFont(PDF_FONT, "normal");
    const worte = sanitizePdfText(text).split(" ");
    // Erste Zeile: so viele Wörter, wie neben den Kopf passen.
    const erste: string[] = [];
    const rest = [...worte];
    while (rest.length > 0 && doc.getTextWidth([...erste, rest[0]].join(" ")) <= textW - kopfBreite) {
      erste.push(rest.shift() as string);
    }
    const folgende = rest.length > 0 ? (doc.splitTextToSize(rest.join(" "), textW) as string[]) : [];
    checkPage(zeilenHoehe * (1 + folgende.length) + 1);
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...(zweitsprache ? ZWEITSPRACHE_FARBE : BRAND.primary));
    doc.text(kopf, textX, y);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...(zweitsprache ? ZWEITSPRACHE_FARBE : BRAND.text));
    if (erste.length > 0) doc.text(erste.join(" "), textX + kopfBreite, y);
    y += zeilenHoehe;
    for (const zeile of folgende) {
      checkPage(5);
      doc.text(zeile, textX, y);
      y += zeilenHoehe;
    }
    for (const punkt of punkte ?? []) {
      for (const zeile of doc.splitTextToSize(sanitizePdfText(punkt), textW - 6) as string[]) {
        checkPage(5);
        doc.text(zeile, textX + 6, y);
        y += zeilenHoehe;
      }
    }
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    y += 2;
  };

  /**
   * Ein Ankreuzkästchen, gefüllt oder leer, mit Text daneben. Der erste Satz
   * kann fett gesetzt werden, so wie im Rechtsentwurf die Wahlsätze. Bei
   * Englisch steht die Übersetzung beider Sätze darunter, im selben Einzug.
   */
  const kaestchen = (gefuellt: boolean, satz: string, erlaeuterung?: string, satzEn?: string, erlaeuterungEn?: string) => {
    const kante = 3.4;
    const textStart = textX + kante + 3;
    const breite = W - margin - textStart;
    doc.setFontSize(7.5);
    const enZeilen = zwei && satzEn
      ? (doc.splitTextToSize(sanitizePdfText(`${satzEn}${erlaeuterungEn ? ` ${erlaeuterungEn}` : ""}`), breite) as string[])
      : [];
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, erlaeuterung ? "bold" : "normal");
    const satzZeilen = doc.splitTextToSize(sanitizePdfText(satz), breite) as string[];
    doc.setFont(PDF_FONT, "normal");
    const erlZeilen = erlaeuterung ? (doc.splitTextToSize(sanitizePdfText(erlaeuterung), breite) as string[]) : [];
    checkPage((satzZeilen.length + erlZeilen.length) * 4 + enZeilen.length * 3.7 + 3);

    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.35);
    doc.rect(textX, y - kante + 0.9, kante, kante, "S");
    if (gefuellt) {
      doc.setFillColor(...BRAND.primary);
      doc.rect(textX + 0.7, y - kante + 1.6, kante - 1.4, kante - 1.4, "F");
    }

    doc.setFont(PDF_FONT, erlaeuterung ? "bold" : "normal");
    doc.setTextColor(...BRAND.primary);
    for (const zeile of satzZeilen) {
      doc.text(zeile, textStart, y);
      y += 4;
    }
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...BRAND.text);
    for (const zeile of erlZeilen) {
      checkPage(5);
      doc.text(zeile, textStart, y);
      y += 4;
    }
    if (enZeilen.length > 0) {
      y += 0.5;
      doc.setFontSize(7.5);
      doc.setTextColor(...ZWEITSPRACHE_FARBE);
      for (const zeile of enZeilen) {
        checkPage(5);
        doc.text(zeile, textStart, y);
        y += 3.7;
      }
      doc.setFontSize(8);
    }
    doc.setTextColor(0, 0, 0);
    y += 2;
  };

  /*
   * Die Vorrangklausel, bei Englisch ganz oben und in beiden Sprachen
   * (Plan Kundensprache 4.1). Sie steht vor dem ersten Abschnitt, damit
   * niemand einen Absatz liest, bevor er weiß, welche Fassung gilt.
   */
  if (zwei) {
    doc.setFontSize(8);
    doc.setFont(PDF_FONT, "bold");
    const zeilenDe = doc.splitTextToSize(sanitizePdfText(ZWEISPRACHIG_EINLEITUNG.de), textW - 6) as string[];
    doc.setFont(PDF_FONT, "normal");
    const zeilenEn = doc.splitTextToSize(sanitizePdfText(ZWEISPRACHIG_EINLEITUNG.en), textW - 6) as string[];
    const hoehe = (zeilenDe.length + zeilenEn.length) * 4 + 4;
    doc.setFillColor(...BRAND.light);
    doc.setDrawColor(...BRAND.accent);
    doc.setLineWidth(0.4);
    doc.rect(textX - 1, y - 4, textW + 2, hoehe, "FD");
    let ky = y + 0.5;
    doc.setFont(PDF_FONT, "bold");
    doc.setTextColor(...BRAND.primary);
    for (const z of zeilenDe) { doc.text(z, textX + 2, ky); ky += 4; }
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...ZWEITSPRACHE_FARBE);
    for (const z of zeilenEn) { doc.text(z, textX + 2, ky); ky += 4; }
    doc.setTextColor(0, 0, 0);
    y += hoehe + 2;
  }

  /*
   * Zwei Käufer stehen nebeneinander, nicht untereinander.
   *
   * Vorher bekam der zweite einen eigenen Abschnitt „1b", und dieselben zehn
   * Beschriftungen standen ein zweites Mal darunter. Das kostete eine halbe
   * Seite und machte den Vergleich schwer: Wer zwei Geburtsdaten nebeneinander
   * sehen will, musste blättern.
   *
   * Das Muster ist dasselbe wie in der Selbstauskunft, samt der beiden Dinge,
   * die dort schon schiefgegangen sind: Beide Spalten beginnen auf derselben
   * Grundlinie, und der Platzbedarf wird VOR dem Zeichnen ermittelt, denn ein
   * umgebrochener Wert macht seine Spalte höher als die andere.
   */
  // Eine Gesellschaft unterschreibt durch ihren Vertreter, einen zweiten Käufer gibt es dort nicht.
  const hatP2 = !!(data.hatPerson2 && data.p2Vorname) && !aufbau.gesellschaft;
  const kCol1 = margin + 3;
  const kCol2 = W / 2 + 5;
  const rechteBreite = W - margin - kCol2;
  // Zweisprachig braucht die Beschriftung mehr Platz, etwa „Staatsangehörigkeit“ und „Nationality“.
  const kLabel = hatP2 ? (zwei ? 36 : 30) : 55;
  const linkeBreite = hatP2 ? kCol2 - kCol1 - 6 : kLabel + 40;

  const zeilenAnzahl = (wert: string, breite: number): number => {
    doc.setFontSize(8);
    return Math.max(1, (doc.splitTextToSize(String(wert || "–"), breite) as string[]).length);
  };

  /** Eine Zeile über beide Käufer. Ohne zweiten Käufer wie bisher einspaltig. */
  const kRow = (label: string, val1: string, val2?: string) => {
    const n1 = zeilenAnzahl(val1, linkeBreite - kLabel);
    const n2 = hatP2 ? zeilenAnzahl(val2 || "–", rechteBreite - kLabel) : 1;
    checkPage(6 + Math.max(n1, n2) * 3.6 + (zwei ? 2 : 0));
    const start = y;
    if (zwei) {
      const labelEn = beschriftungEn(label);
      const unten1 = zweisprachigeZeile(doc, label, labelEn, val1, kCol1, start, kLabel, linkeBreite);
      const unten2 = hatP2 ? zweisprachigeZeile(doc, label, labelEn, val2 || "–", kCol2, start, kLabel, rechteBreite) : unten1;
      y = Math.max(unten1, unten2);
      return;
    }
    const unten1 = brandedRow(doc, label, val1, kCol1, start, kLabel, linkeBreite);
    const unten2 = hatP2
      ? brandedRow(doc, label, val2 || "–", kCol2, start, kLabel, rechteBreite)
      : unten1;
    // Die tiefere Spalte bestimmt, wo es weitergeht.
    y = Math.max(unten1, unten2);
  };

  // ─── Käuferdaten ───
  abschnitt("kaeufer");

  if (hatP2) {
    checkPage(8);
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(8);
    doc.setTextColor(...BRAND.primary);
    doc.text(zwei ? `Käufer 1 / ${beschriftungEn("Käufer 1")}` : "Käufer 1", kCol1, y);
    doc.text(zwei ? `Käufer 2 / ${beschriftungEn("Käufer 2")}` : "Käufer 2", kCol2, y);
    doc.setTextColor(0, 0, 0);
    doc.setFont(PDF_FONT, "normal");
    y += 5;
  }

  if (aufbau.gesellschaft) {
    /*
     * Die Käuferin ist eine Gesellschaft (Tabelle B): Firma, Rechtsform, Sitz,
     * Register und Vertreter statt Geburtsdatum, Staatsangehörigkeit und
     * Güterstand.
     */
    for (const z of kaeuferZeilenGesellschaft(data, aufbau.mitGebuehr)) kRow(z.label, z.wert);
  } else {
  kRow("Vorname", data.vorname, data.p2Vorname);
  kRow("Nachname", data.nachname, data.p2Nachname);
  // Die Zeile nur, wenn wenigstens einer der beiden einen Geburtsnamen hat.
  if (data.geburtsname || data.p2Geburtsname) {
    kRow("Geburtsname", data.geburtsname || "", data.p2Geburtsname || "");
  }
  kRow("Geburtsdatum", data.geburtsdatum, data.p2Geburtsdatum);
  // Der Geburtsort ist freiwillig und erscheint nur, wenn ihn jemand hat.
  if (data.geburtsort || data.p2Geburtsort) {
    kRow("Geburtsort", data.geburtsort || "", data.p2Geburtsort || "");
  }
  kRow("Staatsangehörigkeit", data.staatsangehoerigkeit, data.p2Staatsangehoerigkeit);
  kRow("Straße / Nr.", `${data.strasse} ${data.hausnummer}`, `${data.p2Strasse} ${data.p2Hausnummer}`);
  kRow("PLZ / Ort", `${data.plz} ${data.ort}`, `${data.p2Plz} ${data.p2Ort}`);
  kRow("Telefon", data.telefon, data.p2Telefon);
  kRow("E-Mail", data.email, data.p2Email);
  /*
   * Die Steuer-ID ist am 22.09.2026 aus der Reservierung entfallen. Sie wird
   * hier nicht mehr erhoben und deshalb auch nicht mehr gedruckt, auch dann
   * nicht, wenn ein älterer Vorgang sie noch mitbringt. Nachgereicht wird sie
   * erst beim Notarbogen, falls die Selbstauskunft sie nicht trägt.
   */
  /*
   * Das Konto für die Rückzahlung der Gebühr. Auf dieses Konto verweist der
   * Punkt zur Rückzahlung; deshalb steht es hier bei den Käuferdaten und
   * nicht im Gebührenabschnitt, wo das Konto von OS Immobilien steht.
   *
   * Ohne Gebühr gibt es nichts zurückzuzahlen, dann fällt die Zeile weg. Seit
   * dem 22.09.2026 ist die IBAN außerdem freiwillig; bleibt sie leer, steht
   * hier der Gedankenstrich von `brandedRow`, nie ein technischer Wert.
   */
  if (aufbau.mitGebuehr) {
    kRow("IBAN für die Rückzahlung", data.iban || "", data.p2Iban || "");
  }
  /*
   * Der Güterstand gehört beiden gemeinsam, es gibt ihn im Formular nur
   * einmal. Deshalb steht er über die volle Breite und nicht in einer Spalte.
   * Gespeichert ist er als deutscher Klartext; bei Englisch steht die
   * Übersetzung nur daneben.
   */
  if (data.gueterstand) {
    checkPage(zwei ? 9 : 6);
    // Dieselbe Beschriftungsbreite wie die Spalten darüber, sonst sitzt der
    // Wert als einziger weiter rechts und die Spalte wirkt verrutscht.
    if (zwei) {
      const en = reservierungWertEn(data.gueterstand);
      y = zweisprachigeZeile(doc, "Güterstand", beschriftungEn("Güterstand"), en ? `${data.gueterstand} / ${en}` : data.gueterstand, kCol1, y, kLabel, linkeBreite);
    } else {
      y = brandedRow(doc, "Güterstand", data.gueterstand, kCol1, y, kLabel, linkeBreite);
    }
  }
  }
  y += 4;

  // ─── Objektdaten ───
  abschnitt("objekt");
  // Der Satz aus dem Papierformular, der die Felder darunter erst erklärt.
  absatzPaar(objektEinleitung(optionen), objektEinleitung(optionen, "en"), { abstand: 1 });

  if (aufbau.gesamtobjekt) {
    // Kaufgegenstand statt Wohneinheit, dazu Anzahl, Grundbuch, Aufteilung und Stellplätze (Tabelle A).
    for (const z of objektZeilenGesamtobjekt(data)) row(z.label, z.wert, reservierungWertEn(z.wert));
  } else {
  row("Wohneinheit", data.wohneinheit);
  /*
   * Stellplatz und Garage nur, wenn sie zur Einheit gehören. Eine leere Zeile
   * „Garage: –" liest sich wie eine Garage ohne Nummer.
   */
  if (data.stellplatz) row("Stellplatz / Nr.", data.stellplatz);
  if (data.garage) row("Garage / Nr.", data.garage);
  }
  row("Straße", data.objStrasse);
  row("PLZ / Ort", `${data.objPlz} ${data.objOrt}`);
  /*
   * Der Preis steht im Formular mit Tausenderpunkten, also „189.000“.
   * `Number` las daraus 189, bei siebenstelligen Beträgen gar keine Zahl.
   * Im unterschriebenen Dokument stand deshalb ein falscher Kaufpreis.
   * `zahlAusText` liest die deutsche Schreibweise richtig.
   */
  const gesamtpreis = zahlAusText(data.gesamtpreis);
  row(preisBeschriftung(optionen), gesamtpreis > 0 ? fmt(gesamtpreis) : "–");
  // Dolmetscher: „Nein" oder „Ja, Sprache: …", wie im Rechtsentwurf.
  row(
    "Dolmetscher benötigt",
    data.dolmetscher ? `Ja, Sprache: ${data.dolmetscherSprache || "–"}` : "Nein",
    data.dolmetscher ? `${WERT_EN.ja}, ${WERT_EN.sprache}: ${data.dolmetscherSprache || "–"}` : WERT_EN.nein,
  );
  y += 4;

  // ─── Notar und Abwicklung ───
  /*
   * Nur der Hinweis und der Freitext. Die Felder für ein vorgeschlagenes
   * Notariat sind am 15.09.2026 entfallen; ältere Datensätze tragen sie
   * noch, sie werden hier bewusst nicht mehr gedruckt.
   */
  checkPage(30);
  abschnitt("notar");
  absatz(zwei ? `Hinweis zur Beurkundung: / ${beschriftungEn("Hinweis zur Beurkundung:")}` : "Hinweis zur Beurkundung:", { fett: true, abstand: 0.5 });
  absatzPaar(NOTAR_HINWEIS, textEn.notarHinweis);
  absatz(zwei ? `Sonstige Informationen: / ${beschriftungEn("Sonstige Informationen:")}` : "Sonstige Informationen:", { fett: true, abstand: 0.5 });
  absatz(data.sonstigeInformationen?.trim() || (zwei ? `keine / ${WERT_EN.keine}` : "keine"));
  y += 2;

  // ─── Reservierungsgebühr und Kontoverbindung ───
  /*
   * Der Betrag richtet sich nach dem Kaufpreis und wird deshalb hier
   * ausgerechnet, nicht eingetippt. Steht kein lesbarer Kaufpreis im Formular,
   * zeigt das Dokument die Staffel statt eines Betrags: Lieber die Regel als
   * eine Zahl, die auf einer Annahme beruht. Die Rückzahlungsregel folgt
   * unmittelbar darunter in den Punkten zur Rückzahlung und zum Verfall.
   *
   * Der ganze Abschnitt entfällt, wenn für diese Reservierung keine Gebühr
   * erhoben wird.
   */
  if (aufbau.mitGebuehr) {
    checkPage(60);
    abschnitt("gebuehr");
    // Beim Globalobjekt fester Betrag ohne Staffel, im Verwendungszweck Nachname oder Firma.
    const gebuehr = gebuehrAbschnitt(
      data.gesamtpreis,
      data.objStrasse,
      data.wohneinheit,
      aufbau.gesellschaft ? (data.firma || "") : data.nachname,
      { gesamtobjekt: aufbau.gesamtobjekt },
    );
    absatzPaar(gebuehr.einleitung, textEn.gebuehrEinleitung, { abstand: 1 });

    /*
     * Die Staffel steht immer da, auch wenn der Kaufpreis den Betrag schon
     * festlegt: Sie ist der Vertragstext und gilt unabhängig von diesem Fall.
     */
    for (const stufe of gebuehr.staffel) {
      if (zwei) {
        checkPage(9);
        const stufeEn = stufe.bereich
          .replace(/^Kaufpreis unter /, `${WERT_EN.kaufpreisUnter} `)
          .replace(/^Kaufpreis ab /, `${WERT_EN.kaufpreisAb} `);
        y = zweisprachigeZeile(doc, stufe.bereich, stufeEn, stufe.betrag, textX, y, 55, textW);
      } else {
        checkPage(6);
        y = brandedRow(doc, stufe.bereich, stufe.betrag, textX, y, 55, textW);
      }
    }
    y += 1;

    /*
     * Diese Zeilen laufen über die ganze Blattbreite. Grund sind IBAN und
     * Verwendungszweck: In einer halbbreiten Spalte bricht die Kontonummer
     * mittendrin um, und eine umgebrochene IBAN liest sich wie zwei Zahlen.
     */
    for (const zeile of gebuehr.zeilen) {
      // Die betonte Zeile ist der Betrag fuer genau diesen Kaufpreis. Sie steht
      // komplett fett, damit der Kaeufer seine Zahl auf einen Blick findet und
      // nicht erst die Staffel darueber durchgeht.
      if (zwei) {
        checkPage(9);
        y = zweisprachigeZeile(doc, zeile.label, beschriftungEn(zeile.label), zeile.wert, textX, y, 55, textW, zeile.betont === true);
      } else {
        checkPage(6);
        y = brandedRow(doc, zeile.label, zeile.wert, textX, y, 55, textW, false, zeile.betont === true);
      }
    }
    y += 4;
  }

  // ─── Reservierungsvereinbarung ───
  checkPage(40);
  abschnitt("vereinbarung");
  absatzPaar(VEREINBARUNG_EINLEITUNG, textEn.vereinbarungEinleitung, { abstand: 3 });
  aufbau.ziffern.forEach((z, i) => {
    ziffer(z.nummer, z.text, z.punkte);
    // Die Übersetzung desselben Punktes direkt darunter, mit derselben Nummer.
    const en = aufbauEn?.ziffern[i];
    if (en) ziffer(en.nummer, en.text, en.punkte, true);
  });
  y += 2;

  // ─── Datenschutzerklärung ───
  /*
   * Ein Absatz ohne Kästchen: Das Einverständnis gilt mit der Unterschrift.
   * Die beiden Haken von früher (`datenschutzKenntnis`, `bankEinwilligung`)
   * stehen in älteren Datensätzen noch, werden aber nicht mehr gedruckt.
   */
  checkPage(30);
  abschnitt("datenschutz");
  absatzPaar(DATENSCHUTZ_EINVERSTAENDNIS, textEn.datenschutz);
  y += 2;

  // ─── Widerrufsbelehrung ───
  /*
   * Die Belehrung steht in einem abgesetzten Kasten. Seine Höhe wird vor dem
   * Zeichnen ermittelt, damit der Kasten geschlossen auf einer Seite steht;
   * ein Rahmen, der über den Seitenrand läuft, sieht aus wie abgeschnitten.
   * Passt er nicht mehr auf die laufende Seite, beginnt er auf der nächsten.
   *
   * Ohne Reservierungsgebühr entfällt die ganze Widerrufsthematik, siehe
   * `WIDERRUF_ENTFAELLT_OHNE_GEBUEHR`: Belehrung, Wahl zum Beginn und die
   * auflösende Bedingung.
   *
   * Bei Englisch folgt die Übersetzung als zweiter, eigener Kasten. Zwei
   * Kästen statt eines, weil beide zusammen nicht sicher auf eine Seite
   * passen; so bleibt jede Fassung für sich geschlossen.
   */
  if (aufbau.mitWiderruf) {
    const belehrungsKasten = (bloecke: { ueberschrift: string; absaetze: string[] }[], zweitsprache: boolean, mitUeberschrift: boolean) => {
      doc.setFont(PDF_FONT, "normal");
      doc.setFontSize(8);
      const kastenInnen = textW - 8;
      let kastenHoehe = 4;
      const belehrungZeilen: { fett: boolean; zeilen: string[] }[] = [];
      for (const block of bloecke) {
        belehrungZeilen.push({ fett: true, zeilen: [block.ueberschrift] });
        kastenHoehe += 5;
        for (const a of block.absaetze) {
          const zeilen = doc.splitTextToSize(sanitizePdfText(a), kastenInnen) as string[];
          belehrungZeilen.push({ fett: false, zeilen });
          kastenHoehe += zeilen.length * 3.8 + 2;
        }
        kastenHoehe += 1.5;
      }
      // Überschrift und Kasten gehören auf dieselbe Seite. Sonst steht die
      // Überschrift allein am Seitenende und der Kasten beginnt auf der nächsten.
      checkPage(kastenHoehe + (mitUeberschrift ? 22 : 6));
      if (mitUeberschrift) abschnitt("widerruf");
      doc.setFillColor(...BRAND.light);
      doc.setDrawColor(...BRAND.separator);
      doc.setLineWidth(0.4);
      doc.rect(textX - 1, y - 4, textW + 2, kastenHoehe, "FD");
      let ky = y + 1;
      for (const teil of belehrungZeilen) {
        doc.setFont(PDF_FONT, teil.fett ? "bold" : "normal");
        doc.setFontSize(teil.fett ? 8.5 : 8);
        doc.setTextColor(...(zweitsprache ? ZWEITSPRACHE_FARBE : teil.fett ? BRAND.primary : BRAND.text));
        for (const zeile of teil.zeilen) {
          doc.text(zeile, textX + 3, ky);
          ky += teil.fett ? 5 : 3.8;
        }
        ky += teil.fett ? 0 : 2;
      }
      doc.setFont(PDF_FONT, "normal");
      doc.setTextColor(0, 0, 0);
      y += kastenHoehe + 4;
    };
    belehrungsKasten(WIDERRUFSBELEHRUNG, false, true);
    if (zwei) belehrungsKasten(textEn.widerrufsbelehrung, true, false);

    // Die Wahl zum Beginn, außerhalb des Kastens. Genau ein Feld ist angekreuzt.
    checkPage(40);
    absatz(zwei ? `${WIDERRUF_WAHL_TITEL} / ${textEn.widerrufWahlTitel}` : WIDERRUF_WAHL_TITEL, { fett: true, groesse: 9, abstand: 1 });
    absatzPaar(WIDERRUF_WAHL_EINLEITUNG, textEn.widerrufWahlEinleitung);
    // Aus dem Aufbau, weil beim Globalobjekt die Nummern und ein Wort andere sind.
    aufbau.widerrufWahlen.forEach((wahl, i) => {
      const en = aufbauEn?.widerrufWahlen[i];
      kaestchen(data.widerrufWahl === wahl.wert, wahl.satz, wahl.erlaeuterung, en?.satz, en?.erlaeuterung);
    });
    absatzPaar(aufbau.aufloesendeBedingung, aufbauEn?.aufloesendeBedingung);
    y += 2;
  }

  // ─── Unterschriften ───
  /*
   * Eigene Platzprüfung statt `checkPage`. Dessen Fußzone von 30 mm ist für
   * Fließtext gedacht und schob den Block auf eine eigene Seite, obwohl er
   * noch aufs Blatt passte. Eine Seite mit nichts als Unterschriftslinien
   * sieht aus, als fehle der Vertrag dazu.
   *
   * Der Block braucht ab hier rund 60 mm: Titel, der Bestätigungssatz,
   * 18 mm Luft für das Unterschriftsbild, darunter vier Zeilen (Name, Rolle,
   * Ort, Datum). Reicht der Platz nicht, gehört der Block auf eine eigene
   * Seite; das ist bei Verträgen üblich und allemal besser als zwei Zeilen
   * übereinander. Zweisprachig kommt der englische Satz dazu.
   */
  if (y + (zwei ? 72 : 60) > H - 18) {
    doc.addPage();
    y = 18;
  }
  abschnitt("unterschriften");
  // Ohne Widerrufsbelehrung darf der Satz sie auch nicht bestätigen.
  absatzPaar(unterschriftBestaetigung(optionen), unterschriftBestaetigung(optionen, "en"), { abstand: 4 });

  const col1 = margin + 3;
  const col2 = margin + 3 + contentW / 2;
  const sigLineY = y + 18;
  const sigWidth = 60;
  const sigHeight = 18;

  const sig1 = signatures?.rv_kaeufer1 || signatures?.kaeufer1 || (signatures ? Object.values(signatures)[0] : undefined);
  const sig2 = signatures?.rv_kaeufer2 || signatures?.kaeufer2 || (signatures ? Object.values(signatures)[1] : undefined);

  /** Der Block unter der Linie: Name, Rolle, Ort und Datum. */
  const unterschriftBlock = (
    x: number,
    name: string,
    rolle: string,
    sig: ReservierungUnterschrift | undefined,
  ) => {
    doc.setDrawColor(...BRAND.primary);
    doc.setLineWidth(0.3);
    doc.line(x, sigLineY, x + 70, sigLineY);
    doc.setFontSize(7);
    doc.setFont(PDF_FONT, "normal");
    doc.setTextColor(...BRAND.primary);
    doc.text(sanitizePdfText(name), x, sigLineY + 4);
    // Bei Englisch bekommt die feste Rolle („Unterschrift Käufer 1“) ihre Übersetzung.
    const rolleEn = zwei ? beschriftungEn(rolle) : rolle;
    doc.text(zwei && rolleEn !== rolle ? sanitizePdfText(`${rolle} / ${rolleEn}`) : rolle, x, sigLineY + 8);

    const gesetzt = sig?.signatureData
      ? unterschriftEinsetzen(doc, sig.signatureData, x + 5, sigLineY - sigHeight, sigWidth, sigHeight, rolle)
      : false;

    doc.setFontSize(6.5);
    if (gesetzt) {
      doc.setTextColor(0, 128, 0);
      // Ort nur, wenn der Unterzeichner einen angegeben hat. Bei einer
      // Unterschrift im Browser kennt OS Immobilien den Ort sonst nicht.
      const ortWort = zwei ? `Ort / ${UNTERSCHRIFT_WOERTER_EN.ort}` : "Ort";
      doc.text(`${ortWort}: ${sanitizePdfText(sig?.ort?.trim() || "–")}`, x, sigLineY + 12);
      const bestaetigt = zwei ? `Digital bestätigt am / ${UNTERSCHRIFT_WOERTER_EN.bestaetigt} ` : "Digital bestätigt am ";
      doc.text(bestaetigt + datumMitUhrzeit(sig?.signedAt), x, sigLineY + 15.5);
    } else if (sig?.signatureData) {
      // Unterschrift liegt vor, liess sich aber nicht darstellen. Keine
      // Bestaetigung drucken, sonst behauptet das Dokument etwas Unbelegtes.
      doc.setTextColor(180, 0, 0);
      doc.text(zwei ? `Unterschrift konnte nicht dargestellt werden / ${UNTERSCHRIFT_WOERTER_EN.nichtDarstellbar}` : "Unterschrift konnte nicht dargestellt werden", x, sigLineY + 12);
    } else {
      doc.setTextColor(150, 150, 150);
      doc.text(zwei ? `Unterschrift ausstehend / ${UNTERSCHRIFT_WOERTER_EN.ausstehend}` : "Unterschrift ausstehend", x, sigLineY + 12);
    }
    doc.setTextColor(0);
  };

  if (aufbau.gesellschaft) {
    /*
     * Tabelle B: „Für die Käuferin: [Firma], [Name], [Funktion]“ an Stelle von
     * „Unterschrift Käufer 1“. Die Zeile darf über die ganze Breite laufen,
     * denn einen zweiten Käufer gibt es hier nicht; sie bricht höchstens
     * einmal um und belegt dann genau die Zeilen von Name und Rolle.
     */
    const zeileGesellschaft = unterschriftZeileGesellschaft(data);
    const zeileText = zwei
      ? zeileGesellschaft.replace(/^Für die Käuferin:/, `Für die Käuferin / ${WERT_EN.fuerDieKaeuferin}`)
      : zeileGesellschaft;
    const zeilenFuerKaeuferin = (doc.splitTextToSize(sanitizePdfText(zeileText), contentW - 6) as string[]).slice(0, 2);
    unterschriftBlock(col1, zeilenFuerKaeuferin[0] || "", zeilenFuerKaeuferin[1] || "", sig1);
  } else {
  unterschriftBlock(col1, `${data.vorname} ${data.nachname}`, "Unterschrift Käufer 1", sig1);
  }
  if (hatP2) {
    unterschriftBlock(col2, `${data.p2Vorname} ${data.p2Nachname}`, "Unterschrift Käufer 2", sig2);
  }

  y = sigLineY + 20;

  // ─── Fußzeilen auf allen Seiten ───
  // Das Deckblatt bekommt keine Fusszeile und zaehlt nicht mit. In der Mitte
  // steht die Fassung des Vertragstextes, damit sich jedes Exemplar seinem
  // Wortlaut zuordnen lässt. Zweisprachig sind es beide Fassungen; die Zeile
  // ist dann zu lang für die Mitte der Fußzeile und steht darunter.
  const totalPages = doc.getNumberOfPages();
  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);
    addBrandedFooter(doc, i - 1, totalPages - 1);
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(...BRAND.muted);
    if (zwei) doc.text(sanitizePdfText(`Fassung / Version ${fassung}`), W / 2, H - 11, { align: "center" });
    else doc.text(`Fassung ${fassung}`, W / 2, H - 15, { align: "center" });
    doc.setTextColor(0, 0, 0);
  }

  return doc;
}
