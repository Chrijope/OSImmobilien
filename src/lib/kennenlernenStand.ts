import {
  juengsteNachfassMail,
  startTagNachPause,
  type KettenStand,
} from "@/lib/kennenlernenErinnerungen";
import type { Bewerber } from "@/lib/bewerbungStore";

/**
 * Der Kettenstand eines Bewerbers, gelesen aus der Zeile im Zwischenspeicher.
 *
 * **Warum es diese Datei gibt.** Die Regeln der Erinnerungskette stehen genau
 * einmal, nämlich in `supabase/functions/_shared/kennenlernen-erinnerungen.ts`.
 * Deren `kettenStand` liest aber die rohe Datenbankzeile mit ihrem `meta`-Feld,
 * und die hat das CRM nicht: `bewerbungStore` übersetzt jede Zeile beim Laden
 * in benannte Felder. Diese Datei ist die Brücke zwischen beiden, und sie ist
 * bewusst dumm. Sie kopiert Felder und rechnet selbst nichts aus. Der einzige
 * Rechenschritt, der Versatz nach einer Pause, kommt als `startTagNachPause`
 * aus derselben geteilten Datei wie alles andere.
 *
 * Vorher baute die Kennenlernen-Karte sich ihren Stand selbst zusammen und
 * ließ dabei die Pause und den Widerspruch gegen den Anruf einfach weg. Sie
 * zeigte deshalb „Tag 3 fällig" bei Bewerbern, an die der Zeitplan gar nichts
 * mehr schickt.
 */

/** Was der Stand von der Bewerberzeile braucht. */
export type StandBewerber = Pick<
  Bewerber,
  | "status"
  | "erstgespraechDatum"
  | "erstgespraechUhrzeit"
  | "nachfassMailAm"
  | "klNachfassMailAm"
  | "kennenlernenGesendetAm"
  | "kennenlernenErinnerungStufe"
  | "kennenlernenAnrufWidersprochen"
  | "kennenlernenPauseGesetztAm"
  | "kennenlernenPauseErinnerungAm"
>;

/**
 * Was der Stand vom Kennenlernbogen braucht, sofern er geladen ist.
 *
 * Die Liste lädt ihn nicht, die Akte schon. Fehlt er, bleiben die beiden
 * Angaben leer, und die Kette rechnet ohne sie weiter. Das ist richtig so:
 * Ohne Bogen gibt es weder einen abgeschickten Bogen noch einen abgelaufenen
 * Link, und beides sind nur zusätzliche Stopps.
 */
export type StandBogen = {
  /** Status der Zeile in `bewerber_formular`, oder „eingereicht". */
  status?: string | null;
  /** Ablauf des Links, ISO. */
  laeuftAbAm?: string | null;
  /** Anlagedatum des Bogens, ISO. Nur als Rückfall für den Versandtag. */
  erstelltAm?: string | null;
};

export function standAusBewerber(bewerber: StandBewerber, bogen?: StandBogen | null): KettenStand {
  const pausiertBis = bewerber.kennenlernenPauseErinnerungAm || null;
  /*
   * Der Rückfall auf das Anlagedatum des Bogens gilt nicht, wenn die
   * Sammelmail zum Kennenlernen hinausging. Sie legt den Bogen an, ist aber
   * seit dem 26.09.2026 keine Einladung mehr, die eine Kette startet (siehe
   * `metaNachNachfass`). Ohne diese Ausnahme zeigte die Karte bei einem nie
   * eingeladenen Bewerber „Erinnerung fällig", und der Zeitplan schickte nichts.
   */
  const bogenAlsEinladung = bewerber.klNachfassMailAm ? null : bogen?.erstelltAm || null;
  const eingeladenAm = bewerber.kennenlernenGesendetAm || bogenAlsEinladung;
  return {
    gesendetAm: startTagNachPause(eingeladenAm, pausiertBis),
    formularStatus: bogen?.status ?? null,
    laeuftAbAm: bogen?.laeuftAbAm ?? null,
    bewerberStatus: bewerber.status,
    erstgespraechLaeuft: !!(bewerber.erstgespraechDatum && bewerber.erstgespraechUhrzeit),
    anrufWidersprochen: !!bewerber.kennenlernenAnrufWidersprochen,
    pausiertBis,
    pauseGesetzt: !!bewerber.kennenlernenPauseGesetztAm,
    pauseGesetztAm: bewerber.kennenlernenPauseGesetztAm || null,
    // Beide Sammelmails, wie im Zeitplan. Sonst zeigte die Karte am Tag der
    // Sammelmail eine fällige Erinnerung, die der Zeitplan zurückhält.
    nachfassMailAm: juengsteNachfassMail(bewerber.nachfassMailAm, bewerber.klNachfassMailAm),
    // Die Stufe steht im Versandvermerk, den allein der Zeitplan schreibt.
    stufe: bewerber.kennenlernenErinnerungStufe ?? 0,
  };
}
