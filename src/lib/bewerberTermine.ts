/**
 * Anstehende Termine aus den Bewerberdaten ableiten.
 *
 * Ersetzt die frühere Karte "Nächste Onboarding-Termine" im
 * Bewerbungsmanagement, die auf frei erfundenen localStorage-Terminen
 * beruhte. Hier zählen nur echte, am Bewerber gepflegte Termine:
 * Erstgespräch, Closing, Follow-Up und Onboarding.
 *
 * Zur Zeitzone: Datum und Uhrzeit am Bewerber sind deutsche Zeit, denn so
 * werden sie gebucht und gepflegt. Die Prüfung "ist der Termin vorbei?" muss
 * deshalb ebenfalls in deutscher Zeit rechnen, unabhängig davon, wo die
 * Nutzerin gerade sitzt. Vorher lief sie in der Zeitzone des Browsers: In
 * Thailand (sechs Stunden voraus) galt ein Termin um 10:00 Uhr schon ab
 * 04:00 Uhr deutscher Zeit als vergangen und trug den Badge "Vergangen".
 */
import type { Bewerber } from "./bewerbungStore";
import { alsZeitpunkt } from "./buchungZeitfenster";

/** Alle Bewerber-Termine sind deutsche Zeit, egal wo die Nutzerin sitzt. */
export const TERMIN_ZEITZONE = "Europe/Berlin";

export type BewerberTerminArt = "Erstgespräch" | "Closing" | "Follow-Up" | "Onboarding";

export interface BewerberTermin {
  bewerberId: string;
  name: string;
  art: BewerberTerminArt;
  /** Datum wie am Bewerber gepflegt (TT.MM.JJJJ oder JJJJ-MM-TT) */
  datum: string;
  /** Uhrzeit (HH:MM) oder leer */
  uhrzeit: string;
  /** Zeitpunkt in Millisekunden für Sortierung */
  ms: number;
}

type DatumTeile = { jahr: number; monat: number; tag: number };

/** TT.MM.JJJJ oder JJJJ-MM-TT in Jahr, Monat (1 bis 12) und Tag, sonst null. */
function datumTeile(d?: string): DatumTeile | null {
  if (!d) return null;
  const german = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (german) return { jahr: +german[3], monat: +german[2], tag: +german[1] };
  const iso = d.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return { jahr: +iso[1], monat: +iso[2], tag: +iso[3] };
  return null;
}

/**
 * Zeitpunkt (Millisekunden) von Datum plus Minuten ab Mitternacht in
 * deutscher Zeit. 1440 Minuten ergeben den Beginn des Folgetags.
 */
function deutscheZeitMs(teile: DatumTeile, minutenAbMitternacht: number): number {
  const pad = (n: number) => String(n).padStart(2, "0");
  const iso = `${teile.jahr}-${pad(teile.monat)}-${pad(teile.tag)}`;
  return alsZeitpunkt(iso, minutenAbMitternacht, TERMIN_ZEITZONE).getTime();
}

/** "09:30" zu 570 Minuten, unlesbare Angaben ergeben null. */
function minutenAusUhrzeit(uhrzeit?: string): number | null {
  const zeit = (uhrzeit || "").match(/^(\d{1,2}):(\d{2})/);
  if (!zeit) return null;
  return +zeit[1] * 60 + +zeit[2];
}

/** Tagesbeginn des Datums in deutscher Zeit, sonst 0. */
function parseDatumMs(d?: string): number {
  const teile = datumTeile(d);
  return teile ? deutscheZeitMs(teile, 0) : 0;
}

/**
 * Zeitpunkt eines Termins in Millisekunden, gerechnet in deutscher Zeit.
 *
 * 0 heisst „kein Termin": Das Datum fehlt oder ist unlesbar. Fehlt nur die
 * Uhrzeit, zaehlt der Tagesbeginn, damit zwei Termine am selben Tag nicht
 * zufaellig die Plaetze tauschen.
 *
 * Exportiert, damit die Bewerberliste nach genau dem Zeitpunkt sortieren
 * kann, den sie auch anzeigt.
 */
export function terminZeitpunktMs(datum?: string, uhrzeit?: string): number {
  const teile = datumTeile(datum);
  if (!teile) return 0;
  return deutscheZeitMs(teile, minutenAusUhrzeit(uhrzeit) ?? 0);
}

/** Das heutige Datum in deutscher Zeit, aus einem beliebigen Zeitpunkt. */
function heuteInDeutschland(jetzt: Date): DatumTeile {
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: TERMIN_ZEITZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(jetzt);
  const wert: Record<string, number> = {};
  for (const teil of teile) {
    if (teil.type !== "literal") wert[teil.type] = Number(teil.value);
  }
  return { jahr: wert.year, monat: wert.month, tag: wert.day };
}

/**
 * Ob ein Bewerber-Termin wirklich verstrichen ist, gerechnet in deutscher
 * Zeit (TERMIN_ZEITZONE), nicht in der Zeitzone des Browsers.
 *
 * Mit Uhrzeit zählt der genaue Zeitpunkt: Datum UND Uhrzeit müssen vorbei
 * sein. Ohne Uhrzeit (oder mit unlesbarer Angabe) ist der Termin erst nach
 * Ablauf des ganzen deutschen Tages vergangen.
 */
export function terminIstVergangen(datum?: string, uhrzeit?: string, jetzt: Date = new Date()): boolean {
  const teile = datumTeile(datum);
  if (!teile) return false;
  const minuten = minutenAusUhrzeit(uhrzeit);
  if (minuten !== null) {
    return deutscheZeitMs(teile, minuten) < jetzt.getTime();
  }
  // Ohne Uhrzeit: erst vergangen, wenn der Folgetag (deutsche Zeit) begonnen hat.
  return deutscheZeitMs(teile, 24 * 60) <= jetzt.getTime();
}

/**
 * Datum und Uhrzeit eines selbst gebuchten Termins, in deutscher Zeit.
 *
 * Ein gebuchter Termin steht als Zeitpunkt in der Datenbank (`start_at`) und
 * nicht als Datum und Uhrzeit am Bewerber. Er wird ausdrücklich in
 * `TERMIN_ZEITZONE` ausgegeben und nicht in der des Browsers: Wer aus dem
 * Ausland ins CRM sieht, soll dieselbe Uhrzeit lesen wie die HR-Managerin.
 *
 * Leer, wenn der Zeitpunkt unlesbar ist. Dann zeigt die Oberfläche lieber
 * nichts an, als eine erfundene Zeit.
 */
export function gebuchterTerminText(startAt: string | null | undefined): string {
  if (!startAt) return "";
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return "";
  const tag = d.toLocaleDateString("de-DE", { timeZone: TERMIN_ZEITZONE });
  const zeit = d.toLocaleTimeString("de-DE", {
    timeZone: TERMIN_ZEITZONE,
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${tag} um ${zeit} Uhr`;
}

/**
 * Datum (JJJJ-MM-TT) und Uhrzeit (HH:MM) eines Zeitpunkts in deutscher Zeit.
 *
 * Dasselbe Format, in dem `bewerber_termin_buchen` den Termin in die Akte
 * schreibt. Damit lässt sich ein Zeitpunkt aus `buchungen` überall dort
 * einsetzen, wo bisher die Felder am Bewerber standen, ohne dass die Anzeige
 * zwei Schreibweisen auseinanderhalten muss.
 *
 * Leer, wenn der Zeitpunkt unlesbar ist. Dann zeigt die Oberfläche lieber
 * nichts an, als eine erfundene Zeit.
 */
export function deutscheTerminTeile(startAt: string | null | undefined): { datum: string; uhrzeit: string } {
  if (!startAt) return { datum: "", uhrzeit: "" };
  const d = new Date(startAt);
  if (Number.isNaN(d.getTime())) return { datum: "", uhrzeit: "" };
  const teile = new Intl.DateTimeFormat("en-US", {
    timeZone: TERMIN_ZEITZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const wert: Record<string, string> = {};
  for (const teil of teile) {
    if (teil.type !== "literal") wert[teil.type] = teil.value;
  }
  // Mitternacht kommt je nach Umgebung als "24" zurück, gemeint ist "00".
  const stunde = wert.hour === "24" ? "00" : wert.hour;
  return {
    datum: `${wert.year}-${wert.month}-${wert.day}`,
    uhrzeit: `${stunde}:${wert.minute}`,
  };
}

/**
 * Der Stand der maßgeblichen Buchung eines Bewerbers, so weit die Anzeige des
 * Closing-Gesprächs ihn braucht. Kommt aus `buchungen`, siehe
 * `ladeBewerberBuchungen` in `bewerberTerminStore.ts`.
 */
export type BewerberBuchungStand = {
  /** Beginn des Termins als ISO-Zeitpunkt (`buchungen.start_at`). */
  startAt: string;
  /** Status der Buchung: "offen", "abgesagt" oder "wahrgenommen". */
  status: string;
};

/** Woher Datum und Uhrzeit des Closing-Gesprächs stammen. */
export type ClosingGespraechQuelle = "" | "buchung" | "closing" | "selbstGebucht";

export type ClosingGespraechTermin = {
  /** Datum wie gepflegt (TT.MM.JJJJ oder JJJJ-MM-TT), leer wenn keins steht. */
  datum: string;
  /** Uhrzeit (HH:MM) oder leer. */
  uhrzeit: string;
  quelle: ClosingGespraechQuelle;
  /**
   * Ob der Bewerber diesen Termin abgesagt hat.
   *
   * Die Stufe bleibt davon unberührt: Ein abgesagter Termin wirft niemanden
   * aus dem Closing, er bekommt nur ein Abzeichen. So ausdrücklich entschieden
   * am 16.09.2026.
   */
  abgesagt: boolean;
};

/**
 * Datum und Uhrzeit des Gesprächs, das die Stufe Closing meint.
 *
 * ## Warum drei Quellen
 *
 * Im heutigen Bewerberprozess gibt es **einen** regulären Termin, nicht zwei
 * (siehe `bewerberArbeitsplatz.ts`: „ein Videocall statt zwei Terminen"). Wo
 * er steht, hängt nur daran, wer ihn eingetragen hat:
 *
 *   - Setzt ihn HR im CRM, steht er in `closingTerminDatum` und
 *     `closingTerminUhrzeit`. Das tun die Termin-Karte der Übersicht und
 *     Punkt 10 des Erstgesprächsskripts.
 *   - Bucht ihn der Bewerber selbst über den Link aus der Einladung, schreibt
 *     `bewerber_termin_buchen` ihn nach `erstgespraechDatum` und
 *     `erstgespraechUhrzeit`.
 *
 * Die Spalte „Closing-Gespräch" las bisher nur die erste Quelle. Wer sich
 * seinen Termin selbst gebucht hatte, stand dort ohne Datum, obwohl der
 * Termin feststand.
 *
 * Und es gibt eine dritte Quelle, die eigentliche: die Zeile in `buchungen`.
 * Die Karte „Videocall Termin" im Bewerberprofil liest seit jeher von dort
 * (`useSelbstGebuchterTermin`), die Spalte in der Liste nicht. Deshalb konnte
 * die Akte am 16.09.2026 einen Termin zeigen, während in der Liste ein Strich
 * stand, aufgefallen an Berat Kilapia.
 *
 * ## Warum die Buchung gewinnt
 *
 * `meta.erstgespraechDatum` ist nur die **Kopie** dessen, was in `buchungen`
 * steht. Geschrieben wird sie von `bewerber_termin_buchen`. Sie kann aber
 * verloren gehen, ohne dass der Termin verloren geht: `bewerberToDb` in
 * `bewerbungStore.ts` baut `meta` bei jedem Speichern vollständig aus dem
 * Bewerberobjekt im Arbeitsspeicher neu auf. Wer die Akte geöffnet hatte,
 * bevor der Bewerber buchte, und danach irgendetwas speichert, schreibt seinen
 * älteren Stand zurück und räumt den Termin dabei still weg. Die Buchung
 * selbst bleibt unberührt.
 *
 * Deshalb die Rangfolge:
 *
 *   1. Eine **nicht abgesagte Buchung**. Sie ist die Tatsache, samt Videoraum,
 *      und nur über sie lässt sich verschieben und absagen.
 *   2. Der von Hand gepflegte Termin (`closingTerminDatum`). Solange eine
 *      Buchung steht, lässt die Termin-Karte gar keine Eingabe zu; steht hier
 *      trotzdem etwas, stammt es aus dem alten Ablauf mit zwei Terminen oder
 *      wurde nach einer Absage neu vereinbart. Beides schlägt eine abgesagte
 *      Buchung.
 *   3. Eine **abgesagte Buchung**. Datum und Uhrzeit des abgesagten Termins,
 *      dazu `abgesagt: true` für das Abzeichen.
 *   4. Die Kopie in `meta` (`erstgespraechDatum`). Rückfall für Altfälle und
 *      für den Fall, dass die Buchungszeile nicht gelesen werden konnte.
 *
 * ## Warum lesen statt doppelt schreiben
 *
 * Die Buchung könnte beide Feldpaare füllen. Dann stünde derselbe Termin
 * zweimal in der Akte, und die Erinnerungskette ginge zweimal hinaus: Der
 * Lauf `send-bewerber-erstgespraech-reminders` hängt an `erstgespraechDatum`,
 * `send-bewerber-closing-reminders` an `closingTerminDatum`. Gelesen wird
 * deshalb aus allen Quellen, geschrieben weiterhin nur in eine.
 */
export function closingGespraechTermin(
  b: {
    closingTerminDatum?: string;
    closingTerminUhrzeit?: string;
    erstgespraechDatum?: string;
    erstgespraechUhrzeit?: string;
  },
  buchung?: BewerberBuchungStand | null,
): ClosingGespraechTermin {
  const ausBuchung = deutscheTerminTeile(buchung?.startAt);
  const abgesagt = (buchung?.status || "") === "abgesagt";

  // 1. Die stehende Buchung schlägt alles.
  if (ausBuchung.datum && !abgesagt) {
    return { ...ausBuchung, quelle: "buchung", abgesagt: false };
  }

  // 2. Der von Hand gepflegte Termin.
  const gepflegt = (b.closingTerminDatum || "").trim();
  if (gepflegt) {
    return {
      datum: gepflegt,
      uhrzeit: (b.closingTerminUhrzeit || "").trim(),
      quelle: "closing",
      abgesagt: false,
    };
  }

  // 3. Die abgesagte Buchung. Sie bleibt sichtbar, damit in der Liste nicht
  //    aussieht wie nie gebucht, was in Wahrheit abgesagt wurde.
  if (ausBuchung.datum) {
    return { ...ausBuchung, quelle: "buchung", abgesagt: true };
  }

  // 4. Die Kopie in der Akte.
  const gebucht = (b.erstgespraechDatum || "").trim();
  if (gebucht) {
    return {
      datum: gebucht,
      uhrzeit: (b.erstgespraechUhrzeit || "").trim(),
      quelle: "selbstGebucht",
      abgesagt: false,
    };
  }

  return { datum: "", uhrzeit: "", quelle: "", abgesagt: false };
}

/** Nur Bewerber, die noch im Prozess sind, liefern Termine. */
const AUSGESCHIEDEN = new Set(["Abgelehnt", "KeinInteresse"]);

/**
 * Die nächsten anstehenden Termine über alle Bewerber, aufsteigend sortiert.
 * Ein Termin gilt als anstehend, wenn sein Datum heute (deutsche Zeit) oder
 * später liegt (Termine von heute bleiben auch nach ihrer Uhrzeit sichtbar).
 */
export function anstehendeTermine(
  bewerber: Bewerber[],
  max = 5,
  jetzt: Date = new Date(),
): BewerberTermin[] {
  const heuteStart = deutscheZeitMs(heuteInDeutschland(jetzt), 0);

  const alle: BewerberTermin[] = [];
  for (const b of bewerber) {
    if (AUSGESCHIEDEN.has(b.status)) continue;
    const name = [b.vorname, b.nachname].filter(Boolean).join(" ") || "(ohne Name)";
    const kandidaten: Array<[BewerberTerminArt, string | undefined, string | undefined]> = [
      ["Erstgespräch", b.erstgespraechDatum, b.erstgespraechUhrzeit],
      ["Closing", b.closingTerminDatum, b.closingTerminUhrzeit],
      ["Follow-Up", b.followUpDatum, b.followUpUhrzeit],
      ["Onboarding", b.onboardingTerminDatum, b.onboardingTerminUhrzeit],
    ];
    for (const [art, datum, uhrzeit] of kandidaten) {
      const tagMs = parseDatumMs(datum);
      if (!tagMs || tagMs < heuteStart) continue;
      alle.push({
        bewerberId: b.id,
        name,
        art,
        datum: datum || "",
        uhrzeit: uhrzeit || "",
        ms: terminZeitpunktMs(datum, uhrzeit),
      });
    }
  }

  alle.sort((a, b) => a.ms - b.ms);
  return alle.slice(0, max);
}
