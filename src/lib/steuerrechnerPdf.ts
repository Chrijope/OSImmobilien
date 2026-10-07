/**
 * Die Auswertung des Steuerrechners als PDF.
 *
 * Sie wird im Browser des Interessenten gebaut, aber NICHT mehr dort
 * heruntergeladen. Sie geht als Blob an `steuerrechnerVersand.ts`, wird von
 * einer Edge Function abgelegt und kommt PER MAIL IM ANHANG. Der Grund ist
 * kaufmaennisch: Die Auswertung gibt es gegen die Kontaktdaten, und eine Mail
 * ist der Beleg dafuer, dass die Adresse stimmt.
 *
 * SEIT DEM 17.09.2026 IST DIESES PDF DAS EINZIGE ERGEBNIS, das der Interessent
 * bekommt. Die oeffentliche Seite zeigt die Zahlen nicht mehr auf dem
 * Bildschirm. Was hier fehlt oder abgeschnitten ist, fehlt ihm ganz.
 *
 * Aufbau im Haus-Design aus `pdfBranding.ts`, vier Abschnitte:
 *   1  Deckblatt mit den Kennzahlen
 *   2  Deine Steuerlast heute und die Spanne, die daran haengt
 *   3  Warum eine Immobilie ueberhaupt Steuervorteile schafft
 *   4  Der Verlauf ueber zehn Jahre und der Weg zum Erstgespraech
 *
 * Es sind mindestens vier Seiten. Reicht ein Abschnitt ueber die Seite hinaus,
 * bricht er selbst um, siehe `platz` weiter unten.
 *
 * Gerechnet wird hier nichts. Alle Zahlen kommen aus `steuerRechner.ts`. Ein
 * Immobilientyp kommt nicht vor, das Objekt ist typisiert und steht offen im
 * Kleingedruckten.
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
import { BETRACHTUNG_JAHRE, spannenverlauf, type Ergebnis } from "@/lib/steuerRechner";
import type { SteuerAntworten } from "@/lib/steuerrechnerStrecke";
import type { FormatSprache } from "@/lib/sprachFormat";
import { STEUER_PDF_TEXTE } from "@/lib/steuerrechnerPdfTexte";
import { STEUER_KENNUNG_TEXTE } from "@/lib/steuerrechnerKennungTexte";
import type { BeraterInfo } from "@/pages/AnalysePublic";

const W = 210;
const H = 297;
const MARGIN = 20;
const CONTENT_W = W - 2 * MARGIN;

const setColor = (doc: jsPDF, c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
const setFill = (doc: jsPDF, c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
const setDraw = (doc: jsPDF, c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

/* ── Der Seitenumbruch ──────────────────────────────────────────────────────
   Bis zum 17.09.2026 hat dieses Dokument einfach von oben nach unten
   geschrieben und nie geprueft, ob noch Platz ist. Nachgemessen an einer
   Auswertung mit Zusammenveranlagung und Kirchensteuer: Auf Seite zwei liefen
   die beiden letzten Posten („Deine Zuzahlung über 10 Jahre“ und „Unter dem
   Strich nach 10 Jahren“) unter den Seitenrand und fehlten im fertigen PDF
   vollstaendig. Auf Seite drei schob sich der letzte Absatz ueber die
   Fusszeile.

   Das faellt nicht immer auf, weil die Laenge an den Antworten haengt: Ohne
   Kirchensteuer entfaellt ein Posten, bei Einzelveranlagung ist der
   Einleitungssatz kuerzer. Genau deshalb reicht es nicht, an ein paar Stellen
   von Hand eine Seite einzufuegen.

   Seither prueft jeder Block selbst, ob er noch passt, und beginnt sonst eine
   neue Seite mit demselben Kopf. Der laufende Stand steht in `seitenlauf`.
   Modulweit, und das ist hier vertretbar: Zwischen `seitenlaufStarten` und dem
   fertigen Dokument liegt kein einziges `await`, es kann sich also kein
   zweiter Aufbau dazwischenschieben. */

/** Unterkante des Satzspiegels. Darunter beginnt die Fusszeile. */
const SEITENENDE = H - 26;

let seitenlauf: { logo: string | null; titel: string; unterzeile: string } | null = null;

function seitenlaufStarten(logo: string | null, titel: string, unterzeile: string) {
  seitenlauf = { logo, titel, unterzeile };
}

/**
 * Platz fuer den naechsten Block schaffen.
 *
 * Passt er noch, bleibt `y` unveraendert. Passt er nicht, beginnt eine neue
 * Seite und `y` steht unter deren Kopf.
 */
function platz(doc: jsPDF, y: number, brauchtMm: number): number {
  if (!seitenlauf) return y;
  if (y + brauchtMm <= SEITENENDE) return y;
  doc.addPage();
  return addBrandedHeader(doc, seitenlauf.logo, seitenlauf.titel, seitenlauf.unterzeile);
}

/**
 * Einen Abschnitt oben auf einer Seite beginnen.
 *
 * Ohne das traegt eine Seite den Rest des vorigen Abschnitts und bleibt darunter
 * zu drei Vierteln leer, waehrend der naechste Abschnitt schon wieder oben
 * anfaengt. Nachgemessen am Beispiel vom 17.09.2026. Mit dem Umbruch traegt
 * jede Seite genau einen Gedanken, und das ist auch beim Lesen die ruhigere
 * Ordnung.
 */
function neuerAbschnitt(doc: jsPDF, y: number): number {
  if (!seitenlauf) return y;
  return platz(doc, y, SEITENENDE);
}

/** Fliesstext mit Umbruch. Gibt das neue y zurueck. */
function absatz(doc: jsPDF, text: string, y: number, groesse = 9.5, breite = CONTENT_W): number {
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(groesse);
  setColor(doc, BRAND.text);
  const zeilen = doc.splitTextToSize(sanitizePdfText(text), breite) as string[];
  /* Ein Absatz wird nicht mitten im Satz getrennt: Er wandert ganz auf die
     naechste Seite. Bei Absaetzen dieser Laenge ist das die ruhigere Loesung
     als zwei Zeilen unten und der Rest oben. */
  y = platz(doc, y, zeilen.length * groesse * 0.48 + 3);
  for (const zeile of zeilen) {
    doc.text(zeile, MARGIN, y);
    y += groesse * 0.48;
  }
  return y + 3;
}

/** Eine Zeile aus Titel, Erklaerung und Betrag. */
function posten(
  doc: jsPDF,
  titel: string,
  erklaerung: string,
  betrag: string,
  y: number,
  hervorgehoben = false,
): number {
  const hoehe = erklaerung ? 15 : 11;
  /* Eine Zeile aus Titel, Erklaerung und Betrag wird nie geteilt. Die 5,5
     Millimeter sind der Rand, den der hervorgehobene Kasten oberhalb von `y`
     zeichnet, sie gehoeren zur Hoehe dazu. */
  y = platz(doc, y, hoehe + 5.5);
  if (hervorgehoben) {
    setFill(doc, BRAND.light);
    doc.roundedRect(MARGIN, y - 5.5, CONTENT_W, hoehe, 1.5, 1.5, "F");
  }

  doc.setFont(PDF_FONT, hervorgehoben ? "bold" : "normal");
  doc.setFontSize(9.5);
  setColor(doc, BRAND.primary);
  doc.text(sanitizePdfText(titel), MARGIN + 3, y);

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(hervorgehoben ? 11.5 : 10);
  setColor(doc, hervorgehoben ? BRAND.accent : BRAND.primary);
  doc.text(sanitizePdfText(betrag), W - MARGIN - 3, y, { align: "right" });

  if (erklaerung) {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7.5);
    setColor(doc, BRAND.muted);
    const zeilen = doc.splitTextToSize(sanitizePdfText(erklaerung), CONTENT_W - 60) as string[];
    doc.text(zeilen[0] ?? "", MARGIN + 3, y + 4.5);
  }

  if (!hervorgehoben) {
    setDraw(doc, BRAND.separator);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + hoehe - 5, W - MARGIN, y + hoehe - 5);
  }
  return y + hoehe + 2;
}

export interface SteuerPdfEmpfaenger {
  vorname: string;
  nachname: string;
}

export interface SteuerAuswertungPdf {
  blob: Blob;
  dateiname: string;
}

/**
 * Baut die Auswertung und gibt sie als Blob zurueck.
 *
 * Kein `doc.save` mehr: Der Download im Browser ist durch den Mailversand
 * ersetzt. Wer die Datei doch direkt braucht, etwa weil die Mail nicht
 * ankommt, bekommt sie aus diesem Blob.
 */
export async function baueSteuerAuswertungPdf(
  ergebnis: Ergebnis,
  antworten: SteuerAntworten,
  empfaenger: SteuerPdfEmpfaenger,
  berater?: BeraterInfo,
  /* Die Sprache der oeffentlichen Seite (Plan Kundensprache, D20). Standard
     "de", damit bestehende Aufrufer unveraendert bleiben. Alle Woerter stehen
     in `steuerrechnerPdfTexte.ts`, die Anzeige der Auswahlwerte in
     `steuerrechnerKennungTexte.ts`. */
  sprache: FormatSprache = "de",
): Promise<SteuerAuswertungPdf> {
  const spr: FormatSprache = sprache === "en" ? "en" : "de";
  const t = STEUER_PDF_TEXTE[spr];
  const kennung = STEUER_KENNUNG_TEXTE[spr];
  const eur = t.betrag;
  const spanneText = t.spanne;
  const z = t.seiteZahlen;
  const w = t.seiteWarum;
  const v = t.seiteVerlauf;

  const doc = new jsPDF("p", "mm", "a4");
  await ensureUnicodeFont(doc);
  const logo = await loadLogo();
  const icon = await loadIcon();

  const name = `${empfaenger.vorname} ${empfaenger.nachname}`.trim();
  const s = ergebnis.spanne;
  const verlauf = spannenverlauf(s);

  /* ── Seite 1: Deckblatt ────────────────────────────────────────────────── */
  addCoverPage(doc, icon, {
    sprache: spr,
    kennung: t.deckblatt.kennung,
    titel: t.deckblatt.titel,
    untertitel: t.deckblatt.untertitel,
    empfaenger: name || undefined,
    fusszeile: t.deckblatt.fusszeile,
  });

  // Die Kennzahlen in das freie Band zwischen Wortmarke und Titel.
  const kennzahlen: Array<{ label: string; wert: string }> = [
    { label: t.kennzahlen.ersparnisJahr1, wert: eur(s.jahr1.bis) },
    { label: t.kennzahlen.ersparnisJahre(BETRACHTUNG_JAHRE), wert: eur(s.zehnJahre.bis) },
    { label: t.kennzahlen.vermoegenJahre(BETRACHTUNG_JAHRE), wert: eur(s.vermoegen.aufbau) },
  ];
  let bandY = 74;
  kennzahlen.forEach((k) => {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(7);
    setColor(doc, BRAND.muted);
    doc.text(sanitizePdfText(k.label.toUpperCase()), MARGIN, bandY, { charSpace: 0.8 });
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(13);
    setColor(doc, BRAND.accentLight);
    doc.text(sanitizePdfText(k.wert), MARGIN, bandY + 7);
    bandY += 15;
  });

  /* ── Seite 2: Die Zahlen ───────────────────────────────────────────────── */
  doc.addPage();
  seitenlaufStarten(logo, t.kopfTitel, z.unterzeile);
  let y = addBrandedHeader(doc, logo, t.kopfTitel, z.unterzeile);

  /* Entscheidung 13: Auf Englisch steht vor allen Zahlen, dass der Rechner auf
     deutschem Steuerrecht beruht. Auf Deutsch ist der Text leer und der Absatz
     entfaellt, die deutsche Auswertung bleibt unveraendert. */
  if (t.steuerrechtHinweis) {
    y = absatz(doc, t.steuerrechtHinweis, y);
  }

  y = brandedSectionTitle(doc, z.heuteTitel, platz(doc, y, 34), MARGIN, CONTENT_W);
  y = absatz(
    doc,
    ergebnis.veranlagung === "splitting"
      ? z.einleitungSplitting(ergebnis.brutto, ergebnis.partnerBrutto, ergebnis.zvE, ergebnis.grenzsteuersatz * 100)
      : z.einleitungEinzeln(ergebnis.brutto, ergebnis.zvE, ergebnis.grenzsteuersatz * 100),
    y,
  );

  y = posten(doc, z.est.titel, z.est.erklaerung, eur(ergebnis.vorher.est), y);
  y = posten(doc, z.soli.titel, z.soli.erklaerung, eur(ergebnis.vorher.soli), y);
  if (ergebnis.vorher.kirche > 0) {
    y = posten(doc, z.kirche.titel, z.kirche.erklaerung, eur(ergebnis.vorher.kirche), y);
  }
  y = posten(doc, z.steuerlast, "", eur(ergebnis.vorher.summe), y, true);
  y = posten(doc, z.inJahren(BETRACHTUNG_JAHRE), z.inJahrenErklaerung, eur(ergebnis.steuer10J), y);

  y = brandedSectionTitle(doc, z.wohnungTitel, neuerAbschnitt(doc, y + 6), MARGIN, CONTENT_W);
  y = absatz(
    doc,
    z.objektAbsatz(s.objekt.preis, Math.round(s.objekt.gebaeudeanteil * 100), s.objekt.gebaeudewert),
    y,
  );
  y = absatz(doc, z.spanneAbsatz(s.regulaer.satz, s.nutzungsdauerGesetzlich, s.erhoeht.satz), y);

  y = posten(
    doc,
    z.angesetzt.titel,
    z.angesetzt.erklaerung(s.erhoeht.satz, s.erhoeht.restnutzungsdauer, s.nutzungsdauerGesetzlich),
    eur(s.erhoeht.ersparnisJahr),
    y,
    true,
  );
  y = posten(
    doc,
    z.gesetzlich.titel,
    z.gesetzlich.erklaerung(s.regulaer.satz, kennung.afaGrund(s.regulaer.grund), s.regulaer.paragraf),
    eur(s.regulaer.ersparnisJahr),
    y,
  );
  y = posten(doc, z.spanneJahr, "", spanneText(s.jahr1.von, s.jahr1.bis), y, true);
  y = posten(
    doc,
    z.spanneJahre(BETRACHTUNG_JAHRE),
    z.spanneJahreErklaerung,
    spanneText(s.zehnJahre.von, s.zehnJahre.bis),
    y,
  );
  y = posten(doc, z.erhaltung.titel, z.erhaltung.erklaerung, z.erhaltung.betrag(s.erhaltung.ersparnisEinmalig), y);
  y = posten(
    doc,
    z.vermoegen.titel(BETRACHTUNG_JAHRE),
    z.vermoegen.erklaerung(s.vermoegen.tilgung, s.vermoegen.wertsteigerung),
    eur(s.vermoegen.aufbau),
    y,
    true,
  );
  y = posten(
    doc,
    s.vermoegen.liquiditaet < 0 ? z.zuzahlung(BETRACHTUNG_JAHRE) : z.ueberschuss(BETRACHTUNG_JAHRE),
    z.liquiditaetErklaerung,
    `${s.vermoegen.liquiditaet < 0 ? "-" : "+"} ${eur(Math.abs(s.vermoegen.liquiditaet))}`,
    y,
  );
  y = posten(doc, z.netto.titel(BETRACHTUNG_JAHRE), z.netto.erklaerung, eur(s.vermoegen.netto), y);

  /* ── Seite 3: Warum das so ist ─────────────────────────────────────────── */
  doc.addPage();
  seitenlaufStarten(logo, t.kopfTitel, w.unterzeile);
  y = addBrandedHeader(doc, logo, t.kopfTitel, w.unterzeile);

  y = brandedSectionTitle(doc, w.grundgedankeTitel, platz(doc, y, 34), MARGIN, CONTENT_W);
  y = absatz(doc, w.grundgedanke1, y);
  y = absatz(doc, w.grundgedanke2, y);

  y += 4;
  y = brandedSectionTitle(doc, w.bausteineTitel, platz(doc, y, 34), MARGIN, CONTENT_W);
  y = posten(
    doc,
    w.afaRegulaer.titel,
    w.afaRegulaer.erklaerung(s.regulaer.satz, s.objekt.gebaeudewert),
    eur(s.regulaer.afaJahr),
    y,
  );
  y = posten(doc, w.afaErhoeht.titel, w.afaErhoeht.erklaerung(s.erhoeht.satz), eur(s.erhoeht.afaJahr), y);
  y = posten(
    doc,
    w.zinsen.titel,
    w.zinsen.erklaerung(s.objekt.zins * 100),
    eur(s.objekt.preis * s.objekt.zins),
    y,
  );
  y = posten(
    doc,
    w.miete.titel,
    w.miete.erklaerung(s.objekt.mietrendite * 100),
    eur(s.objekt.preis * s.objekt.mietrendite),
    y,
  );

  y = brandedSectionTitle(doc, w.ehrlichTitel, neuerAbschnitt(doc, y + 6), MARGIN, CONTENT_W);
  y = absatz(
    doc,
    w.ehrlichAfa(
      s.erhoeht.satz,
      s.erhoeht.restnutzungsdauer,
      s.regulaer.satz,
      s.nutzungsdauerGesetzlich,
      s.jahr1.von,
      s.jahr1.bis,
    ),
    y,
  );
  y = absatz(
    doc,
    w.ehrlichErhaltung(BETRACHTUNG_JAHRE, s.erhaltung.grenzeNetto, s.erhaltung.bruttoAufwand),
    y,
  );
  y = absatz(
    doc,
    w.ehrlichZuzahlung(BETRACHTUNG_JAHRE, Math.abs(s.vermoegen.liquiditaet), ergebnis.nebenkostenProzent),
    y,
  );
  /* Die Einschaetzung der Bank kommt ueber die Kennung, nicht ueber den
     deutschen Text aus dem Rechenkern. */
  const beschaeftigung = kennung.beschaeftigung[ergebnis.beschaeftigung.id];
  y = absatz(
    doc,
    w.beschaeftigung(
      beschaeftigung?.einschaetzung ?? ergebnis.beschaeftigung.einschaetzung,
      beschaeftigung?.unterlagen ?? ergebnis.beschaeftigung.unterlagen,
    ),
    y,
  );

  /* ── Seite 4: Verlauf und Weg ──────────────────────────────────────────── */
  doc.addPage();
  seitenlaufStarten(logo, t.kopfTitel, v.unterzeile);
  y = addBrandedHeader(doc, logo, t.kopfTitel, v.unterzeile);

  y = brandedSectionTitle(doc, v.titel(BETRACHTUNG_JAHRE), platz(doc, y, 34), MARGIN, CONTENT_W);

  // Tabellenkopf
  const spalten = [MARGIN + 2, MARGIN + 24, MARGIN + 72, MARGIN + 120];
  setFill(doc, BRAND.light);
  doc.rect(MARGIN, y - 4.5, CONTENT_W, 7, "F");
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  setColor(doc, BRAND.muted);
  doc.text(v.spalten.jahr, spalten[0], y);
  doc.text(v.spalten.imJahr, spalten[1], y);
  doc.text(v.spalten.gesamtUnten, spalten[2], y);
  doc.text(v.spalten.gesamtOben, spalten[3], y);
  y += 8;

  for (const zeile of verlauf) {
    doc.setFont(PDF_FONT, "normal");
    doc.setFontSize(8.5);
    setColor(doc, BRAND.primary);
    doc.text(String(zeile.jahr), spalten[0], y);
    doc.text(spanneText(zeile.von, zeile.bis), spalten[1], y);
    doc.text(eur(zeile.vonKumuliert), spalten[2], y);
    doc.setFont(PDF_FONT, "bold");
    setColor(doc, BRAND.accent);
    doc.text(eur(zeile.bisKumuliert), spalten[3], y);
    setDraw(doc, BRAND.separator);
    doc.setLineWidth(0.2);
    doc.line(MARGIN, y + 2.5, W - MARGIN, y + 2.5);
    y += 7.5;
  }

  y += 3;
  y = absatz(doc, v.absatz(BETRACHTUNG_JAHRE), y, 8);

  // Der Weg zum Erstgespraech
  y += 4;
  const kastenHoehe = 50;
  setFill(doc, BRAND.primary);
  doc.roundedRect(MARGIN, y, CONTENT_W, kastenHoehe, 2.5, 2.5, "F");

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7);
  setColor(doc, BRAND.accentLight);
  doc.text(v.naechsterSchritt, MARGIN + 8, y + 10, { charSpace: 1.2 });

  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(13);
  setColor(doc, BRAND.white);
  doc.text(sanitizePdfText(berater?.name || "MOREImmo"), MARGIN + 8, y + 19);

  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  doc.setTextColor(212, 220, 232);
  const kontakt = [berater?.telefon, berater?.email].filter(Boolean).join("   ·   ");
  doc.text(sanitizePdfText(kontakt || "kontakt@more.immo"), MARGIN + 8, y + 27);
  doc.setFontSize(8);
  const start = antworten.startzeitpunkt ? kennung.startzeitpunkt[antworten.startzeitpunkt]?.titel : "";
  const schluss = doc.splitTextToSize(
    sanitizePdfText(`${v.schluss}${start ? v.startWunsch(start) : ""}`),
    CONTENT_W - 16,
  ) as string[];
  let schlussY = y + 35;
  for (const zeile of schluss) {
    doc.text(zeile, MARGIN + 8, schlussY);
    schlussY += 4;
  }
  y += kastenHoehe + 8;

  // Das Kleingedruckte
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(7.5);
  setColor(doc, BRAND.primary);
  doc.text(v.kleinTitel, MARGIN, y);
  y += 4.5;
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(7);
  setColor(doc, BRAND.muted);
  const klein = doc.splitTextToSize(
    sanitizePdfText(
      v.klein(
        s.objekt.preis,
        s.objekt.baujahr,
        Math.round(s.objekt.gebaeudeanteil * 100),
        s.objekt.zins * 100,
        s.objekt.mietrendite * 100,
        BETRACHTUNG_JAHRE,
      ),
    ),
    CONTENT_W,
  ) as string[];
  for (const zeile of klein) {
    doc.text(zeile, MARGIN, y);
    y += 3.2;
  }

  /* Der Seitenlauf ist zu Ende. Ab hier darf nichts mehr von allein umbrechen,
     die Fusszeilen kommen auf die fertigen Seiten. */
  seitenlauf = null;

  // Fusszeilen auf allen Innenseiten
  const seiten = doc.getNumberOfPages();
  for (let seite = 2; seite <= seiten; seite++) {
    doc.setPage(seite);
    addBrandedFooter(doc, seite, seiten);
  }

  const datum = new Date().toISOString().slice(0, 10);
  return {
    blob: doc.output("blob") as Blob,
    dateiname: t.dateiname(datum),
  };
}
