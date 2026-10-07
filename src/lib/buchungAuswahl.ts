/**
 * Rechen- und Beschriftungslogik der öffentlichen Buchungsseite.
 *
 * Reine Funktionen ohne Datenbank und ohne React, damit sie prüfbar bleiben.
 * Die freien Zeiten selbst kommen aus `buchungStore.ladeFreieZeiten`, hier
 * werden sie nur nach Tagen sortiert, begrenzt und beschriftet.
 *
 * Zur Zeitzone: Der Buchende sitzt möglicherweise in einer anderen Zone als
 * der Berater. Maßgeblich ist immer die Zone des Beraters, sonst steht auf der
 * Seite eine andere Uhrzeit als in seinem Kalender. Deshalb bekommt jede
 * Funktion die Zone ausdrücklich mit und keine verlässt sich auf die
 * Einstellung des Browsers.
 *
 * Die Namen der Monate und Wochentage stehen fest im Code und kommen nicht aus
 * `Intl`. Sonst hinge die Beschriftung an der Sprachtabelle des Geräts, und die
 * Tests würden je nach Rechner etwas anderes sehen.
 *
 * Sprache (Kundensprache, Etappe 3): Die Beschriftungen nehmen optional
 * `sprache` an, Vorgabe Deutsch. Das CRM und die Bewerberseiten rufen sie
 * ohne auf und bleiben deutsch. Die Texte stehen in `buchungAuswahlTexte.ts`.
 */

import { wochentagVon } from "@/lib/buchungZeitfenster";
import { datumLangText } from "@/lib/sprachFormat";
import type { Sprache } from "@/lib/seitenSprache";
import { BUCHUNG_AUSWAHL_TEXTE, type BuchungAuswahlTexte } from "@/lib/buchungAuswahlTexte";

const WOCHENTAGE = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
const MONATE = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

/** Die Texte zur Sprache, ohne Laufzeitimport aus `seitenSprache.ts` (dort hängt der Supabase-Client). */
function texte(sprache: Sprache): BuchungAuswahlTexte {
  return BUCHUNG_AUSWAHL_TEXTE[sprache] ?? BUCHUNG_AUSWAHL_TEXTE.de;
}

/** Standardbreite einer Seite in der Zeitauswahl: eine Woche. */
export const TAGE_PRO_SEITE = 7;

function alsDatum(wert: Date | string): Date {
  return wert instanceof Date ? wert : new Date(wert);
}

/** Datum und Uhrzeit eines Zeitpunkts, gelesen in einer bestimmten Zeitzone. */
function teileInZone(zeitpunkt: Date, zeitzone: string): Record<string, string> {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: zeitzone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(zeitpunkt);

  const wert: Record<string, string> = {};
  for (const teil of teile) {
    if (teil.type !== "literal") wert[teil.type] = teil.value;
  }
  return wert;
}

/** Der Kalendertag eines Zeitpunkts als "YYYY-MM-DD", in der Zone des Beraters. */
export function tagInZone(zeitpunkt: Date | string, zeitzone: string): string {
  const w = teileInZone(alsDatum(zeitpunkt), zeitzone);
  return `${w.year}-${w.month}-${w.day}`;
}

/** Die Uhrzeit eines Zeitpunkts als "HH:MM", in der Zone des Beraters. */
export function uhrzeitInZone(zeitpunkt: Date | string, zeitzone: string): string {
  const w = teileInZone(alsDatum(zeitpunkt), zeitzone);
  // Manche Umgebungen geben Mitternacht als "24" zurück, obwohl h23 gefordert ist.
  const stunde = w.hour === "24" ? "00" : w.hour;
  return `${stunde}:${w.minute}`;
}

/** Einen Tag "YYYY-MM-DD" um ganze Tage verschieben. */
export function tagPlus(tag: string, tage: number): string {
  const [jahr, monat, t] = tag.split("-").map(Number);
  return new Date(Date.UTC(jahr, monat - 1, t + tage)).toISOString().slice(0, 10);
}

export interface Tagesgruppe {
  /** "YYYY-MM-DD" in der Zone des Beraters. */
  tag: string;
  /** Die freien Startzeiten dieses Tages, aufsteigend, als ISO-Zeitpunkte. */
  zeiten: string[];
}

/**
 * Die flache Liste freier Zeitpunkte nach Kalendertagen ordnen.
 *
 * Die Datenbank liefert eine einzige aufsteigende Liste über den ganzen
 * Zeitraum. Für die Anzeige braucht die Seite Spalten je Tag.
 */
export function gruppiereNachTag(zeiten: string[], zeitzone: string): Tagesgruppe[] {
  const nachTag = new Map<string, string[]>();
  // Doppelte Zeitpunkte fallen weg. Überlappen sich zwei Fenster desselben
  // Tages, bietet `buchung_freie_zeiten` dieselbe Startzeit zweimal an. In der
  // Auswahl stünde derselbe Knopf dann doppelt, und React bekäme zweimal
  // denselben Schlüssel. `berechneZeitfenster` entfernt Doppelte bereits.
  const gesehen = new Set<string>();
  for (const zeit of zeiten) {
    const zeitpunkt = new Date(zeit);
    if (Number.isNaN(zeitpunkt.getTime())) continue;
    // Über die Zeit selbst vergleichen und nicht über die Schreibweise: Die
    // Datenbank liefert "…Z", ein Vergleichswert könnte "+00:00" tragen.
    const schluessel = String(zeitpunkt.getTime());
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    const tag = tagInZone(zeitpunkt, zeitzone);
    const liste = nachTag.get(tag);
    if (liste) liste.push(zeit);
    else nachTag.set(tag, [zeit]);
  }

  return Array.from(nachTag.entries())
    .map(([tag, liste]) => ({
      tag,
      zeiten: liste.slice().sort((a, b) => new Date(a).getTime() - new Date(b).getTime()),
    }))
    .sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
}

/**
 * Der erste und der letzte Tag, an dem überhaupt gebucht werden darf.
 *
 * Vor heute geht nichts, und weiter als die Vorausschau der Terminart auch
 * nicht. Beides in der Zone des Beraters gerechnet, denn dort liegt der Termin.
 */
export function vorausschauGrenzen(
  jetzt: Date | string,
  zeitzone: string,
  vorausschauTage: number,
): { ersterTag: string; letzterTag: string } {
  const ersterTag = tagInZone(jetzt, zeitzone);
  const tage = Math.max(0, Math.floor(Number.isFinite(vorausschauTage) ? vorausschauTage : 0));
  return { ersterTag, letzterTag: tagPlus(ersterTag, tage) };
}

/** Die Tage einer Seite, abgeschnitten am Ende der Vorausschau. */
export function fensterTage(startTag: string, anzahl: number, letzterTag: string): string[] {
  const tage: string[] = [];
  for (let i = 0; i < Math.max(0, anzahl); i += 1) {
    const tag = tagPlus(startTag, i);
    if (tag > letzterTag) break;
    tage.push(tag);
  }
  return tage;
}

/** Gibt es vor der aktuellen Seite noch buchbare Tage? */
export function kannZurueck(startTag: string, ersterTag: string): boolean {
  return startTag > ersterTag;
}

/** Gibt es hinter der aktuellen Seite noch buchbare Tage? */
export function kannVor(startTag: string, tageProSeite: number, letzterTag: string): boolean {
  return tagPlus(startTag, Math.max(1, tageProSeite)) <= letzterTag;
}

/**
 * Eine Seite vor oder zurück blättern, ohne die Vorausschau zu verlassen.
 *
 * Rückwärts wird auf den ersten buchbaren Tag begrenzt, vorwärts bleibt die
 * Seite stehen, wenn dahinter ohnehin nichts mehr kommt.
 */
export function blaettere(
  startTag: string,
  schritt: number,
  ersterTag: string,
  letzterTag: string,
): string {
  const neu = tagPlus(startTag, schritt);
  if (neu < ersterTag) return ersterTag;
  if (neu > letzterTag) return startTag;
  return neu;
}

/** Kurze Beschriftung einer Tagesspalte, etwa "Mo" und "4. Aug.". */
/**
 * Zeiten eines Tages in Tageszeiten teilen.
 *
 * Bei einem Viertelstundenraster und acht Stunden Verfuegbarkeit stehen sonst
 * ueber dreissig Knoepfe untereinander in einer Spalte. Wer "irgendwann
 * nachmittags" sucht, muss die Liste durchgehen, statt hinzuspringen. Leere
 * Abschnitte entfallen, damit kein Tag kuenstlich lang wird.
 */
export interface Tageszeit {
  /** Kurze Beschriftung, etwa "Vormittag". */
  name: string;
  zeiten: string[];
}

export function teileNachTageszeit(zeiten: string[], zeitzone: string, sprache: Sprache = "de"): Tageszeit[] {
  const vormittag: string[] = [];
  const nachmittag: string[] = [];
  const abend: string[] = [];

  for (const zeit of zeiten) {
    // Ein einziger krummer Wert darf nicht die ganze Zeitauswahl lahmlegen.
    // `uhrzeitInZone` wirft bei einem unlesbaren Zeitpunkt.
    if (Number.isNaN(new Date(zeit).getTime())) continue;
    const stunde = Number(uhrzeitInZone(zeit, zeitzone).slice(0, 2));
    if (!Number.isFinite(stunde)) continue;
    if (stunde < 12) vormittag.push(zeit);
    else if (stunde < 17) nachmittag.push(zeit);
    else abend.push(zeit);
  }

  const namen = texte(sprache).tageszeiten;
  return [
    { name: namen.vormittag, zeiten: vormittag },
    { name: namen.nachmittag, zeiten: nachmittag },
    { name: namen.abend, zeiten: abend },
  ].filter((abschnitt) => abschnitt.zeiten.length > 0);
}

export function beschriftungTag(tag: string, sprache: Sprache = "de"): { wochentag: string; datum: string } {
  const [, monat, t] = tag.split("-").map(Number);
  const tx = texte(sprache);
  return {
    wochentag: tx.wochentageKurz[wochentagVon(tag)] ?? "",
    datum: tx.tagesdatum(t, tx.monateKurz[monat - 1] ?? ""),
  };
}

/** Ausgeschriebenes Datum, etwa "Montag, 4. August 2026" oder "Monday, 4 August 2026". */
export function beschriftungDatumLang(tag: string, sprache: Sprache = "de"): string {
  if (sprache === "en") return datumLangText(tag, "en", { wochentag: true });
  const [jahr, monat, t] = tag.split("-").map(Number);
  return `${WOCHENTAGE[wochentagVon(tag)] ?? ""}, ${t}. ${MONATE[monat - 1] ?? ""} ${jahr}`;
}

/** Die Spanne eines Termins, etwa "Montag, 4. August 2026, 09:30 bis 10:30 Uhr". */
export function beschriftungZeitraum(
  startISO: string,
  dauerMinuten: number,
  zeitzone: string,
  sprache: Sprache = "de",
): string {
  const start = new Date(startISO);
  if (Number.isNaN(start.getTime())) return "";
  const ende = new Date(start.getTime() + Math.max(0, dauerMinuten) * 60_000);
  const tag = tagInZone(start, zeitzone);
  return texte(sprache).zeitraum(
    beschriftungDatumLang(tag, sprache),
    uhrzeitInZone(start, zeitzone),
    uhrzeitInZone(ende, zeitzone),
  );
}

/** Vorlesbare Beschriftung eines Zeitknopfes, für Bildschirmleser. */
export function beschriftungZeitKnopf(startISO: string, zeitzone: string, sprache: Sprache = "de"): string {
  const tag = tagInZone(startISO, zeitzone);
  return texte(sprache).zeitpunkt(beschriftungDatumLang(tag, sprache), uhrzeitInZone(startISO, zeitzone));
}

/** "60 Minuten", "1 Stunde", "1 Stunde 30 Minuten"; englisch "1 hour 30 minutes". */
export function beschriftungDauer(minuten: number, sprache: Sprache = "de"): string {
  return texte(sprache).dauer(Math.max(0, Math.round(minuten)));
}

export interface TerminartKurz {
  id: string;
  bezeichnung: string;
  dauer_minuten: number;
}

/**
 * Die Terminart einer bestehenden Buchung bestimmen.
 *
 * Maßgeblich ist die Kennung aus `buchung_ansicht`. Nur wenn sie fehlt, wird
 * geraten: Sie fehlt bei Buchungen, deren Terminart inzwischen gelöscht wurde,
 * und bei allen Buchungen, solange die Migration 20260804180000 nicht gelaufen
 * ist.
 *
 * Das Raten allein reichte nicht: Wurde die Terminart umbenannt, fand
 * `passendeTerminart` sie nicht mehr, und der Kunde stand vor einem gesperrten
 * Knopf "Termin verschieben", ohne zu erfahren warum.
 */
export function waehleTerminart<T extends TerminartKurz>(
  arten: T[],
  gesucht: { id?: string | null; bezeichnung?: string | null; dauerMinuten?: number | null },
): T | null {
  if (gesucht.id) {
    const treffer = arten.find((a) => a.id === gesucht.id);
    if (treffer) return treffer;
  }
  return passendeTerminart(arten, gesucht);
}

/**
 * Die Terminart einer bestehenden Buchung wiederfinden.
 *
 * Beim Verschieben braucht die Zeitauswahl eine Terminart, `buchung_ansicht`
 * gibt aber nur Bezeichnung und Dauer heraus und nicht deren Kennung. Deshalb
 * wird zuerst über die Bezeichnung gesucht, dann über die Dauer, und wenn es
 * ohnehin nur eine gibt, ist es diese. Findet sich nichts Eindeutiges, gibt es
 * lieber gar keine Auswahl als eine falsche.
 */
export function passendeTerminart<T extends TerminartKurz>(
  arten: T[],
  gesucht: { bezeichnung?: string | null; dauerMinuten?: number | null },
): T | null {
  if (arten.length === 0) return null;

  const bezeichnung = gesucht.bezeichnung?.trim().toLowerCase();
  if (bezeichnung) {
    const treffer = arten.filter((a) => a.bezeichnung.trim().toLowerCase() === bezeichnung);
    if (treffer.length === 1) return treffer[0];
  }

  if (typeof gesucht.dauerMinuten === "number") {
    const treffer = arten.filter((a) => a.dauer_minuten === gesucht.dauerMinuten);
    if (treffer.length === 1) return treffer[0];
  }

  return arten.length === 1 ? arten[0] : null;
}

/** Grobe Prüfung einer E-Mail-Adresse, dieselbe Form wie in der Datenbank. */
export function istEmail(wert: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wert.trim());
}

/**
 * Den lesbaren Text aus einem Fehler holen, gleich in welcher Form er kommt.
 *
 * Supabase wirft heute eine echte `Error`-Klasse, hat den Fehler in früheren
 * Fassungen aber als schlichtes Objekt `{ message, code, hint }` geliefert.
 * Fiele so eines auf `String(...)`, stünde dort `[object Object]` und jede
 * Meldung der Datenbank ginge verloren. Der Kunde bekäme dann selbst bei
 * "diese Zeit ist vergeben" nur den allgemeinen Satz zu sehen.
 */
function fehlertext(meldung: unknown): string {
  if (meldung instanceof Error) return meldung.message;
  if (typeof meldung === "string") return meldung;
  if (meldung && typeof meldung === "object") {
    const felder = meldung as { message?: unknown; error_description?: unknown; details?: unknown };
    for (const wert of [felder.message, felder.error_description, felder.details]) {
      if (typeof wert === "string" && wert.trim()) return wert;
    }
    return "";
  }
  return String(meldung ?? "");
}

/**
 * Die Fehlermeldung der Datenbank in einen Satz übersetzen, den ein Kunde
 * versteht, und dabei sagen, ob die Zeiten neu geholt werden müssen.
 *
 * Zwei Kunden können im selben Augenblick auf dieselbe Zeit klicken. Wer dann
 * verliert, soll nicht in einer Sackgasse stehen, sondern die aktualisierte
 * Auswahl sehen.
 */
export function deuteBuchungsfehler(
  meldung: unknown,
  sprache: Sprache = "de",
): { text: string; neuLaden: boolean } {
  const roh = fehlertext(meldung).toLowerCase();
  // Die Datenbank meldet immer deutsch. Erkannt wird am deutschen Wortlaut,
  // angezeigt der Satz in der Sprache des Kunden. Unbekanntes bekommt den
  // allgemeinen Satz, nie die Rohmeldung.
  const f = texte(sprache).fehler;

  if (roh.includes("vergeben")) {
    return { text: f.vergeben, neuLaden: true };
  }
  if (roh.includes("kein termin moeglich") || roh.includes("kein termin möglich")) {
    return { text: f.keinTerminMoeglich, neuLaden: true };
  }
  if (roh.includes("kurzfristig")) {
    return { text: f.kurzfristig, neuLaden: true };
  }
  if (roh.includes("weit in der zukunft")) {
    return { text: f.zuWeit, neuLaden: true };
  }
  if (roh.includes("nicht mehr gueltig") || roh.includes("nicht mehr gültig")) {
    return { text: f.linkUngueltig, neuLaden: false };
  }
  if (roh.includes("terminart")) {
    return { text: f.terminart, neuLaden: false };
  }
  if (roh.includes("e-mail") || roh.includes("gueltige e-mail")) {
    return { text: f.email, neuLaden: false };
  }
  if (roh.includes("namen")) {
    return { text: f.name, neuLaden: false };
  }
  if (roh.includes("zu viele buchungen")) {
    return { text: f.zuViele, neuLaden: false };
  }
  if (roh.includes("absagen")) {
    return { text: f.absagen, neuLaden: false };
  }
  if (roh.includes("verschieben")) {
    return { text: f.verschieben, neuLaden: false };
  }

  return { text: f.allgemein, neuLaden: true };
}

/**
 * Ein Baustein einer Terminart-Beschreibung: entweder ein Absatz mit seinen
 * Zeilen oder eine Aufzählung mit ihren Punkten.
 */
export type BeschreibungsBlock =
  | { art: "absatz"; zeilen: string[] }
  | { art: "liste"; punkte: string[] };

/** Ein Aufzählungszeichen am Zeilenanfang. */
const AUFZAEHLUNG = /^[-*•]\s*/;

/**
 * Die Beschreibung einer Terminart in Absätze und Aufzählungen gliedern.
 *
 * Die Berater schreiben mehrzeilig, mit Leerzeilen und Spiegelstrichen. In
 * einem einzigen zusammengeschobenen Textblock ist das unlesbar. Deshalb
 * zerlegt diese Funktion den Text in wenige einfache Bausteine, die die Seite
 * dann darstellt.
 *
 * Bewusst kein Markdown-Werkzeug: Gebraucht werden genau zwei Formen, Absatz
 * und Aufzählung. Der Text kommt außerdem von Menschen und nicht aus einer
 * Auszeichnungssprache, ein Sternchen ist dort eher ein Punkt als eine
 * Betonung.
 *
 * Leerzeilen trennen Absätze, einfache Umbrüche innerhalb eines Absatzes
 * bleiben als eigene Zeilen erhalten.
 */
export function gliedereBeschreibung(text: string | null | undefined): BeschreibungsBlock[] {
  if (!text) return [];

  const bloecke: BeschreibungsBlock[] = [];

  for (const absatz of text.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    let zeilen: string[] = [];
    let punkte: string[] = [];

    const schliesseAbsatz = () => {
      if (zeilen.length > 0) bloecke.push({ art: "absatz", zeilen });
      zeilen = [];
    };
    const schliesseListe = () => {
      if (punkte.length > 0) bloecke.push({ art: "liste", punkte });
      punkte = [];
    };

    for (const roh of absatz.split("\n")) {
      const zeile = roh.trim();
      if (!zeile) continue;

      if (AUFZAEHLUNG.test(zeile)) {
        // Eine Aufzählung unterbricht den laufenden Absatz.
        schliesseAbsatz();
        const punkt = zeile.replace(AUFZAEHLUNG, "").trim();
        if (punkt) punkte.push(punkt);
      } else {
        schliesseListe();
        zeilen.push(zeile);
      }
    }

    schliesseAbsatz();
    schliesseListe();
  }

  return bloecke;
}
