/**
 * In welcher Gruppe des Verlaufs ein frisch angelegter Vorgang landet.
 *
 * Der Verlauf im Kundenprofil hat drei Gruppen: Notizen, "Aufgaben & Termine"
 * und System. Sichtbar ist immer nur eine davon. Wer also gerade die Aufgaben
 * offen hat und dann eine Notiz schreibt, sah die Notiz anschliessend nicht,
 * obwohl sie gespeichert war. Sie stand eine Gruppe weiter.
 *
 * Deshalb schaltet das Profil nach dem Speichern auf die Gruppe um, in der
 * der neue Eintrag steht. Die Zuordnung steht hier, damit sie sich pruefen
 * laesst und nicht von der Filterlogik im Profil abweicht.
 */
import type { AktivitaetEntry } from "./aktivitaetenStore";

export type VerlaufAnsicht = "notizen" | "manuell" | "system";

/**
 * Von Hand geschriebene Notizen stehen unter "Notizen", alles andere unter
 * "Aufgaben & Termine". Die Gruppe "System" kommt hier nie heraus: Dorthin
 * schreibt nur die Anwendung selbst, nie ein Klick des Nutzers.
 */
export function ansichtFuerArt(art: AktivitaetEntry["art"] | null | undefined): VerlaufAnsicht | null {
  if (!art) return null;
  return art === "notiz" ? "notizen" : "manuell";
}
