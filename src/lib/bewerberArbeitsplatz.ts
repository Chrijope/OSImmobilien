import { STATUS_LABELS, type Bewerber, type BewerberStatus } from "./bewerbungStore";
import {
  istImNeuenProzess,
  nurAlterProzess,
  PROZESS_NEU,
} from "./bewerberprozessZuordnung";

/**
 * Die beiden Abläufe des Bewerbermanagements.
 *
 * ## Warum es diese Datei gibt
 *
 * Das bestehende Bewerbungsmanagement und der neue Bewerberprozess sind
 * **dieselbe Seite**. Gleiche Stufenübersicht, gleiche Tabelle, gleicher Knopf
 * zum Erfassen, gleiches Bewerberprofil mit denselben sieben Reitern. Der
 * Unterschied liegt allein im Ablauf, nicht in der Oberfläche.
 *
 * Ein zweiter, eigener Aufbau war der Fehler der ersten Fassung: Der neue
 * Bereich zeigte eine schmale Suchliste und eine Spalte „acht Momente". Damit
 * ließ sich nichts vergleichen und nichts erproben, weil die Ansicht mit dem
 * Arbeitsplatz der HR-Managerin nichts gemein hatte.
 *
 * Deshalb gibt es die Seite genau einmal, als `BewerberArbeitsplatz` in
 * `src/pages/BewerberArbeitsplatz.tsx`, und sie bekommt eine dieser beiden
 * Beschreibungen mit. Was eine Änderung an der Oberfläche betrifft, wirkt so
 * zwangsläufig in beiden Abläufen. Auseinanderlaufen können sie nicht mehr.
 *
 * ## Was sich zwischen den beiden wirklich unterscheidet
 *
 * Erstaunlich wenig, und das ist das Ergebnis der Abstimmungsfassung vom
 * 05.09.2026 (Teil 5.1 und 5.2):
 *
 * - **Die zwölf Stufen bleiben dieselben.** Zehn in der Pipeline, zwei
 *   daneben. Es kommt keine hinzu und es fällt keine weg. Nur eine heißt
 *   anders: Aus „Erstgespräch" wird „Videocall", weil es im neuen Ablauf nur
 *   noch einen regulären Termin gibt.
 * - **Die sieben Reiter der Akte bleiben dieselben**, und derselbe wird
 *   umbenannt. Vier davon (Dokumente, Vertrag, Rechnung, Aktivierung) hängen
 *   ohnehin am Vertrag und nicht am Gespräch.
 * - **Die Liste ist getrennt.** Wer in welcher steht, regelt allein
 *   `bewerberprozessZuordnung.ts`.
 *
 * ## Warum kein neuer Statuswert
 *
 * `bewerbungen.status` ist beiden Abläufen gemeinsam. Ein zusätzlicher Wert
 * wirkte sofort auch im bestehenden Bewerbungsmanagement, in dessen Filtern,
 * Zählungen, Auswertungen und in den drei Zeitplänen, die im Hintergrund
 * laufen. Die Umbenennung ist deshalb bewusst eine reine **Anzeigeschicht**:
 * In der Datenbank steht weiterhin `Erstgespraech`, nur die Beschriftung
 * lautet im neuen Ablauf „Videocall". Damit braucht der neue Bereich keine
 * Migration und kann nichts am alten verstellen.
 */

export type BewerberAblaufId = "alt" | "neu";

export type BewerberAblauf = {
  /** Kurzname, um die wenigen Stellen zu unterscheiden, die es müssen. */
  id: BewerberAblaufId;
  /** Überschrift im Seitenkopf. */
  titel: string;
  /** Zeile unter der Überschrift. */
  untertitel: string;
  /**
   * Welche Bewerber diese Liste zeigt.
   *
   * Die eine Zusage, auf die es ankommt: Ein Bewerber steht in genau einer der
   * beiden Listen. Sonst stünde ein Übungsbewerber aus dem neuen Ablauf in der
   * Liste der HR-Managerin, und sie würde ihn anrufen.
   */
  liste: <T extends Pick<Bewerber, "prozess">>(alle: readonly T[]) => T[];
  /**
   * Das Kennzeichen, das ein hier von Hand erfasster Bewerber bekommt.
   *
   * Leer heißt: bestehender Ablauf. So bleibt ein Bewerber dort, wo er
   * erfasst wurde, und wechselt die Liste nicht von allein.
   */
  prozessKennzeichen: string;
  /** Beschriftung des zweiten Reiters der Akte und der Terminspalte. */
  gespraechLabel: string;
  /**
   * Was der Bewerber bekommt, wenn beim Erfassen das Häkchen gesetzt bleibt.
   *
   * Der Unterschied steht hier und nicht im Dialog, aus demselben Grund wie
   * alles andere in dieser Datei: Beide Bereiche zeigen denselben Knopf
   * „Bewerber erfassen", und der Dialog dahinter ist eine einzige Komponente.
   * Ohne diesen Eintrag verschickte er in beiden Abläufen dieselbe Mail, und
   * das war er bis zum 06.09.2026 auch: Wer im neuen Bereich einen Bewerber
   * anlegte, schickte ihm den alten Vorabbogen mit dreizehn Fragen. Genau die
   * falsche Mail bekam der Geschäftsführer, als er den neuen Ablauf erproben
   * wollte.
   */
  einladung: BewerberEinladung;
};

/** Die Einladungsmail eines Ablaufs, samt Beschriftung des Häkchens. */
export type BewerberEinladung = {
  /** Die Edge Function, die die Mail wirklich verschickt. */
  funktion: "send-bewerber-formular" | "send-bewerber-kennenlernen";
  /** Beschriftung des Häkchens. Sie muss sagen, was tatsächlich hinausgeht. */
  titel: string;
  /** Die erklärende Zeile darunter. */
  erklaerung: string;
  /** Wie die Mail in der Rückmeldung nach dem Erfassen heißt. */
  kurz: string;
  /** Wo sich der Versand nachholen lässt, wenn er fehlschlägt. */
  nachholen: string;
};

/** Die Beschriftung einer Stufe in diesem Ablauf. */
export function stufenLabel(ablauf: BewerberAblauf, stufe: BewerberStatus): string {
  if (ablauf.id === "neu" && stufe === "Erstgespraech") return ablauf.gespraechLabel;
  return STATUS_LABELS[stufe];
}

/**
 * Auf welche Stelle sich jemand beworben hat, wenn im Profil keine steht.
 *
 * Wer über den Bewerberprozess hereinkommt, bewirbt sich auf genau eine
 * Stelle: Vertriebspartner. Im Datensatz steht trotzdem oft nichts, und das
 * Profil zeigte dann „Nicht hinterlegt". Christian hat am 17.09.2026 gesagt,
 * dass dort in diesem Fall immer „Vertriebspartner" stehen soll.
 *
 * ## Warum das hier steht und nicht in der Datenbank
 *
 * Nachzutragen wäre ein Schreibvorgang über alle Altbestände, also eine
 * Migration. Die wird hier ausdrücklich nicht geschrieben; die Lücke ist eine
 * reine Anzeigefrage, und eine Anzeige darf sie auch beantworten. Trägt jemand
 * später eine echte Stelle ein, gewinnt sie, denn der Rückfall greift nur bei
 * leerem Feld.
 *
 * Ein Strich zählt als leer. Der Erfassungsdialog schreibt „–", wenn keine
 * Stellenanzeige gewählt ist, und ein Strich beantwortet die Frage „welche
 * Stelle" genauso wenig wie gar nichts.
 */
export const STELLE_RUECKFALL = "Vertriebspartner";

export function stelleAnzeige(stelleTitel: string | undefined | null): string {
  const wert = (stelleTitel || "").trim();
  // "-", "–" und "—" sind die drei Striche, die im Bestand wirklich vorkommen.
  if (!wert || /^[-–—]+$/.test(wert)) return STELLE_RUECKFALL;
  return wert;
}

/**
 * Der abgeloeste Ablauf des Bewerbungsmanagements.
 *
 * Seine Seite gibt es nicht mehr, seine Liste rendert niemand. Er bleibt als
 * **Rueckfall je Bewerber**: Wer sein Kennzeichen noch nicht gesetzt bekommen
 * hat, sieht damit weiterhin sein bisheriges Erstgespraech und sein bisheriges
 * Closing statt einer leeren Seite. Sobald
 * `20260910120100_bewerber_in_den_bewerberprozess.sql` gelaufen ist, trifft
 * das auf niemanden mehr zu.
 */
export const ABLAUF_ALT: BewerberAblauf = {
  id: "alt",
  titel: "Bewerbungsmanagement",
  untertitel: "Bewerber verwalten, Stellenprofile erstellen & als Nutzer freischalten",
  liste: nurAlterProzess,
  prozessKennzeichen: "",
  gespraechLabel: "Erstgespräch",
  einladung: {
    funktion: "send-bewerber-formular",
    titel: "Fragebogen direkt verschicken",
    erklaerung:
      "Der Bewerber bekommt sofort die Mail mit den 13 kurzen Fragen, wie bei einer " +
      "Bewerbung über die Website. Abwählen, wenn du nur einen Eintrag anlegen willst.",
    kurz: "Fragebogen",
    nachholen: "Im Reiter Erstgespräch lässt sich der Link erneut senden.",
  },
};

/**
 * Der Bewerberprozess. Seit dem 10.09.2026 der einzige Bereich, das
 * Bewerbungsmanagement ist entfallen.
 *
 * `liste` zeigt deshalb **alle** Bewerber und filtert nicht mehr nach dem
 * Kennzeichen. Das Kennzeichen trennte zwei Bereiche voneinander; mit nur noch
 * einem hat es dafuer keinen Zweck. Wichtiger noch: Wuerde hier weiter
 * gefiltert, waeren nach dem Aufspielen alle Bewerber verschwunden, bis jemand
 * die Migration im SQL-Editor ausfuehrt. Das saehe aus wie Datenverlust.
 *
 * Gesetzt wird das Kennzeichen trotzdem weiterhin, siehe
 * `20260910120100_bewerber_in_den_bewerberprozess.sql`: Der Erinnerungsdienst
 * des alten Vorabbogens liest es und ueberspringt damit die Uebernommenen.
 */
export const ABLAUF_NEU: BewerberAblauf = {
  id: "neu",
  titel: "Bewerberprozess",
  untertitel:
    "Bewerber verwalten, Stellenprofile erstellen und als Nutzer freischalten: " +
    "Kennenlernen statt Vorabbogen, ein Videocall statt zwei Terminen.",
  liste: (alle) => [...alle],
  prozessKennzeichen: PROZESS_NEU,
  gespraechLabel: "Videocall",
  einladung: {
    funktion: "send-bewerber-kennenlernen",
    titel: "Einladung zum Kennenlernen direkt verschicken",
    erklaerung:
      "Der Bewerber bekommt sofort die Mail „Lass uns kennenlernen“ mit seinem " +
      "persönlichen Link. Am Ende schickt er seine Antworten ab, einen Termin sucht " +
      "er sich erst nach eurer Einladung aus. Abwählen, wenn du nur einen Eintrag " +
      "anlegen willst.",
    kurz: "Einladung zum Kennenlernen",
    nachholen: "In der Karte Kennenlernen lässt sich die Einladung erneut senden.",
  },
};

/**
 * Der Ablauf eines einzelnen Bewerbers.
 *
 * Die Reiter der Akte bekommen keinen Ablauf von der Seite mitgegeben, sie
 * bekommen den Bewerber. Trotzdem müssen einige Stellen wissen, welcher der
 * beiden Abläufe gilt: der Reiter Videocall und der Reiter Closing öffnen im
 * neuen Prozess eine andere Präsentation, und der Dialog zum Erfassen
 * verschickt eine andere Mail.
 *
 * Damit diese Ableitung nicht an jeder dieser Stellen neu geschrieben wird
 * (und beim nächsten Mal an einer davon vergessen), steht sie hier einmal.
 *
 * Massgeblich bleibt allein das Kennzeichen am Bewerber, siehe
 * `bewerberprozessZuordnung.ts`. Seit dem 10.09.2026 gibt es zwar nur noch
 * **eine Seite**, aber weiterhin zwei Abläufe je Bewerber: Wer sein
 * Kennzeichen noch nicht gesetzt bekommen hat, arbeitet in seinem bisherigen
 * Erstgespraech weiter, statt vor einer leeren Karte zu stehen. Das ist ein
 * Rueckfall, kein Dauerzustand, siehe
 * `20260910120100_bewerber_in_den_bewerberprozess.sql`.
 */
export function ablaufFuerBewerber(
  b: Pick<Bewerber, "prozess"> | undefined | null,
): BewerberAblauf {
  return istImNeuenProzess(b) ? ABLAUF_NEU : ABLAUF_ALT;
}
