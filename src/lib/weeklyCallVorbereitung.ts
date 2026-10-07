import { CALL_WOCHENTAG } from "@/lib/weeklyCallZeit";

/**
 * Wann erinnert das CRM daran, Punkte für den Weekly Sales Call einzutragen.
 *
 * Nicht zu verwechseln mit `WeeklyCallReminderBanner`: Der erinnert eine
 * Stunde vorher ans Einwählen. Hier geht es um die Vorbereitung, also darum,
 * dass die Leitung am Montag weiß, worüber gesprochen werden soll.
 *
 * **Zwei Fenster statt eines Dauerbanners.** Freitag ab 09:00 Uhr die
 * Einladung, Montag bis 17:00 Uhr die letzte Gelegenheit. Dazwischen liegt das
 * Wochenende, und ein Hinweis, der drei Tage unverändert stehen bleibt, wird
 * zur Tapete. Danach klickt man ihn reflexhaft weg, und das trifft dann auch
 * die Erinnerungen, die zählen.
 *
 * **Der Redaktionsschluss um 17:00 Uhr** ist eine Annahme, keine Vorgabe von
 * Christian: Sie lässt der Leitung zwei Stunden zum Sortieren, bevor um 19:00
 * die erste Runde beginnt. Steht hier eine andere Zahl, ändert sich nur diese
 * Datei.
 *
 * Die Zeitrechnung selbst liegt in `weeklyCallZeit.ts` und wird von dort
 * übernommen, damit ein verlegter Call nicht an zwei Stellen gepflegt werden
 * muss.
 */

/** Ab wann am Freitag die Einladung erscheint. */
export const EINLADUNG_AB_STUNDE = 9;

/** Bis wann am Montag noch etwas eingetragen werden kann. */
export const REDAKTIONSSCHLUSS_STUNDE = 17;

/** Wie viele Tage vor dem Call die Einladung erscheint. Freitag zu Montag. */
const EINLADUNG_TAGE_VORHER = 3;

export type VorbereitungsFenster = "einladung" | "letzte";

export interface VorbereitungsStand {
  /** Welches der beiden Fenster gerade offen ist, oder null. */
  fenster: VorbereitungsFenster | null;
  /**
   * Der Schlüssel zum Wegklicken, etwa "2026-09-14:einladung".
   *
   * Er trägt Termin UND Fenster, damit ein Wegklicken am Freitag den Hinweis
   * am Montag nicht mit verschluckt. Dasselbe Muster benutzt schon der
   * Einwahl-Banner.
   */
  schluessel: string;
  /** Der Montag, um den es geht, auf Mitternacht gesetzt. */
  callTag: Date;
}

/** Der nächste Call-Montag, gerechnet ab `jetzt`, auf Mitternacht gesetzt. */
function naechsterCallTag(jetzt: Date): Date {
  const d = new Date(jetzt);
  const abstand = (CALL_WOCHENTAG - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + abstand);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** "2026-09-14" aus einem Datum, in Ortszeit und nicht über die Zeitzone. */
function tagesSchluessel(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Welches Erinnerungsfenster gerade offen ist.
 *
 * Gibt `fenster: null` zurück, wenn gerade keines offen ist. Das ist der
 * Normalfall: An fünf von sieben Tagen erscheint nichts.
 *
 * Ein Sonderfall ist der Montag nach Redaktionsschluss. Dann ist das zweite
 * Fenster zu, und der nächste Call ist immer noch derselbe Abend. Es wäre
 * falsch, ab 17:01 Uhr schon für den Montag der Folgewoche zu werben, während
 * der heutige Call noch bevorsteht. Deshalb schweigt der Banner dann ganz;
 * ab 18:00 Uhr übernimmt ohnehin der Einwahl-Banner.
 */
export function vorbereitungsStand(jetzt: Date = new Date()): VorbereitungsStand {
  const callTag = naechsterCallTag(jetzt);

  const einladungStart = new Date(callTag);
  einladungStart.setDate(callTag.getDate() - EINLADUNG_TAGE_VORHER);
  einladungStart.setHours(EINLADUNG_AB_STUNDE, 0, 0, 0);

  // Ende des Freitags, also Samstag null Uhr.
  const einladungEnde = new Date(callTag);
  einladungEnde.setDate(callTag.getDate() - (EINLADUNG_TAGE_VORHER - 1));

  const letzteEnde = new Date(callTag);
  letzteEnde.setHours(REDAKTIONSSCHLUSS_STUNDE, 0, 0, 0);

  const t = jetzt.getTime();
  let fenster: VorbereitungsFenster | null = null;
  if (t >= einladungStart.getTime() && t < einladungEnde.getTime()) {
    fenster = "einladung";
  } else if (t >= callTag.getTime() && t < letzteEnde.getTime()) {
    fenster = "letzte";
  }

  return { fenster, schluessel: `${tagesSchluessel(callTag)}:${fenster ?? "zu"}`, callTag };
}

/**
 * Der Satz im Banner.
 *
 * Beim zweiten Fenster steht bewusst eine Zahl statt einer Bitte. „7 Themen
 * stehen schon auf der Liste" wirkt anders als „bitte trag etwas ein": Es
 * zeigt, dass der Call vorbereitet wird, und macht neugierig auf die Liste.
 * Ohne Punkte fällt der Halbsatz weg, denn „0 Themen stehen schon auf der
 * Liste" wäre eine Ohrfeige für die Leitung.
 */
export function vorbereitungsTitel(
  fenster: VorbereitungsFenster,
  uhrzeitText: string,
  anzahlPunkte: number,
): string {
  if (fenster === "einladung") {
    return `Weekly Sales Call am Montag, ${uhrzeitText} Uhr`;
  }
  if (anzahlPunkte > 0) {
    const themen = anzahlPunkte === 1 ? "1 Thema steht" : `${anzahlPunkte} Themen stehen`;
    return `Heute Abend ist Sales Call, ${themen} schon auf der Liste`;
  }
  return `Heute Abend ist Sales Call, ${uhrzeitText} Uhr`;
}

/** Die erklärende Zeile darunter. */
export function vorbereitungsText(fenster: VorbereitungsFenster): string {
  if (fenster === "einladung") {
    return "Hast du ein Thema? Trag es bis Montagmittag ein, dann können wir den Call darauf ausrichten.";
  }
  return `Bis ${REDAKTIONSSCHLUSS_STUNDE}:00 Uhr kannst du noch etwas ergänzen. Danach geht die Liste an die Leitung.`;
}
