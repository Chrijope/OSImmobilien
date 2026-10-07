/**
 * Notar und Kundensprache (Plan Kundensprache vom 25.09.2026, Abschnitt 4.3).
 *
 * Die Kaufvertragsurkunde wird deutsch errichtet (§ 5 BeurkG). Spricht ein
 * Beteiligter nicht ausreichend Deutsch, wird die Urkunde mündlich übersetzt,
 * in der Regel durch einen Dolmetscher (§ 16 BeurkG). Ohne frühen Hinweis
 * platzt sonst ein Termin, weil der Dolmetscher fehlt.
 *
 * Deshalb an drei Stellen:
 *   - ein Hinweis für englische Kunden (`NOTAR_SPRACHHINWEIS`), auf der
 *     Unterschriftsseite der Reservierung und zur Nutzung in den Notarmails
 *     (die übersetzt Etappe 2);
 *   - das Kennzeichen „Dolmetscher nötig“ im Notar-Aufnahmebogen, siehe
 *     `dolmetscherKennzeichen`;
 *   - eine Aufgabe fürs Backoffice, siehe `dolmetscherAufgabe`.
 *
 * Maßgeblich ist immer die Sprache aus dem Kundenprofil, nie der Browser.
 */
import type { Sprache } from "./kundenSprache";

/** Der Hinweis für den Kunden. Deutsch nur zur Vollständigkeit, er gilt Englischsprachigen. */
export const NOTAR_SPRACHHINWEIS: Record<Sprache, { titel: string; text: string }> = {
  de: {
    titel: "Hinweis zum Notartermin",
    text: "Die notarielle Kaufvertragsurkunde wird in deutscher Sprache errichtet. Wenn Sie nicht ausreichend Deutsch sprechen, muss die Urkunde beim Termin übersetzt werden; dafür wird in der Regel ein Dolmetscher hinzugezogen. Bitte sagen Sie uns frühzeitig Bescheid, damit wir das mit dem Notariat vor der Terminplanung klären können.",
  },
  en: {
    titel: "Please note regarding the notary appointment",
    text: "The notarial purchase contract (Kaufvertragsurkunde) is drawn up in German. If you do not speak sufficient German, the deed must be translated at the appointment; as a rule, an interpreter is engaged for this purpose. Please let us know at an early stage so that we can arrange this with the notary's office before the appointment is scheduled.",
  },
};

/** Ein Kennzeichen im Notar-Aufnahmebogen, wenn die Kundensprache Englisch ist. */
export interface DolmetscherKennzeichen {
  /** Kurz, für die Überschrift oder das Etikett im Bogen. */
  titel: string;
  /** Der Satz für das Notariat. */
  text: string;
}

/**
 * Das Kennzeichen „Dolmetscher nötig“ für den Notar-Aufnahmebogen.
 *
 * Automatisch bei Kundensprache Englisch, damit das Notariat es vor der
 * Terminplanung weiß. Hat die Reservierung schon eine Dolmetschersprache
 * erfasst, wird sie genannt. Bei Deutsch gibt es kein Kennzeichen; ein von
 * Hand gesetzter Dolmetscher in der Reservierung steht dort ohnehin.
 *
 * @param sprache           die Kundensprache aus dem Profil
 * @param dolmetscherSprache die Sprache aus der Reservierung, falls erfasst
 */
export function dolmetscherKennzeichen(
  sprache: Sprache,
  dolmetscherSprache?: string | null,
): DolmetscherKennzeichen | null {
  if (sprache !== "en") return null;
  const erfasst = (dolmetscherSprache ?? "").trim();
  return {
    titel: "Dolmetscher nötig",
    text: erfasst
      ? `Käufer spricht Englisch. In der Reservierung ist ein Dolmetscher für ${erfasst} vermerkt. Bitte Dolmetscher bzw. Übersetzung der Urkunde vor der Terminplanung klären (§ 16 BeurkG).`
      : "Käufer spricht Englisch, Dolmetscher bzw. Übersetzung der Urkunde vor der Terminplanung klären (§ 16 BeurkG).",
  };
}

/** Die Aufgabe fürs Backoffice, in der Form des vorhandenen Aufgabenmechanismus. */
export const DOLMETSCHER_AUFGABE_TITEL = "Dolmetscher für Notartermin klären";

export function dolmetscherAufgabeBeschreibung(kundeName: string): string {
  const name = kundeName.trim() || "Der Kunde";
  return `${name} hat Englisch als Sprache. Die Notarurkunde ist deutsch. Bitte vor der Terminplanung mit dem Kunden und dem Notariat klären, ob ein Dolmetscher hinzugezogen wird und wer ihn bestellt.`;
}
