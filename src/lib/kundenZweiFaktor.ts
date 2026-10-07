/**
 * Zwei-Faktor-Anmeldung für Kunden: freiwillig, aber verbindlich, wenn aktiv.
 *
 * Entscheidung Christian vom 25.09.2026. Bis dahin war die Zwei-Faktor-
 * Anmeldung für die Rolle Kunde Pflicht: sieben Tage Frist nach dem ersten
 * Login, danach sperrte `KundenMfaGuard` das Portal bis zur Einrichtung.
 * Jetzt entscheidet jeder Kunde selbst:
 *
 *   - Ohne Zwei-Faktor kommt er nach dem Passwort ins Portal. Ein Hinweis
 *     empfiehlt die Einrichtung, sperrt aber nichts.
 *   - Mit Zwei-Faktor muss er nach dem Passwort den Code eingeben, sonst
 *     sieht er nichts. Das prüft `KundenMfaGuard` in der Oberfläche und, sobald
 *     die Migration `20260925200000_kunden_zwei_faktor_freiwillig.sql` gelaufen
 *     ist, auch die Datenbank.
 *
 * Diese Datei hält die Regeln ohne React, damit sie sich testen lassen.
 */
import type { MfaZustand } from "./mfaZustand";

/**
 * Nach „Später“ oder dem Schließen erscheint der Hinweis erst nach so vielen
 * Tagen wieder.
 *
 * Warum 30 Tage: Kunden kommen nicht täglich ins Portal, sondern in Wellen,
 * etwa zur Reservierung, zur Finanzierung und zum Notartermin. Nach 7 Tagen
 * sähe ein Kunde den Hinweis bei fast jedem Besuch wieder, das wirkt wie eine
 * Pflicht durch die Hintertür. Nach 90 Tagen wäre die ganze Kaufphase mit
 * Selbstauskunft und Bankunterlagen oft schon vorbei, also genau die Zeit, in
 * der der Schutz am meisten zählt. 30 Tage heißen: etwa einmal je Phase.
 */
export const HINWEIS_PAUSE_TAGE = 30;

const TAG_MS = 24 * 60 * 60 * 1000;

/** Der spätere von zwei Zeitpunkten (ISO-Text), unlesbare zählen nicht. */
export function spaeterZeitpunkt(a?: string | null, b?: string | null): string | null {
  const zeitA = a ? new Date(a).getTime() : NaN;
  const zeitB = b ? new Date(b).getTime() : NaN;
  if (Number.isNaN(zeitA) && Number.isNaN(zeitB)) return null;
  if (Number.isNaN(zeitB) || (!Number.isNaN(zeitA) && zeitA >= zeitB)) return a as string;
  return b as string;
}

/**
 * Soll der Hinweis „Schütze dein Konto …“ erscheinen?
 *
 * Nie, wenn die Zwei-Faktor-Anmeldung aktiv ist oder der Zustand unklar ist
 * (dann lieber schweigen als einem geschützten Kunden die Einrichtung
 * anzubieten). Sonst, wenn er noch nie geschlossen wurde oder das Schließen
 * mindestens `HINWEIS_PAUSE_TAGE` her ist.
 */
export function hinweisZeigen(
  zustand: MfaZustand,
  geschlossenAm: string | null | undefined,
  jetzt: Date = new Date(),
): boolean {
  if (zustand.art !== "keiner" && zustand.art !== "halbfertig") return false;
  if (!geschlossenAm) return true;
  const geschlossen = new Date(geschlossenAm).getTime();
  if (Number.isNaN(geschlossen)) return true;
  return jetzt.getTime() - geschlossen >= HINWEIS_PAUSE_TAGE * TAG_MS;
}

/** Was der Kundenwächter tut. */
export type KundenMfaSchritt =
  /** Ins Portal, ohne Hinweis. */
  | "ok"
  /** Ins Portal, mit Hinweis zur Einrichtung. */
  | "ok_mit_hinweis"
  /** Code abfragen, vorher nichts zeigen. */
  | "challenge";

/**
 * Nächster Schritt für einen angemeldeten Kunden.
 *
 * `sessionAal2` sagt, ob die Sitzung den zweiten Faktor schon benutzt hat.
 * Ein unklarer Zustand (Faktorliste nicht abrufbar) lässt den Kunden hinein,
 * wie bisher. Die Sperre für Kunden mit Zwei-Faktor sitzt dann in der
 * Datenbank, siehe Kopf dieser Datei.
 */
export function kundenMfaSchritt(
  zustand: MfaZustand,
  sessionAal2: boolean,
  hinweisFaellig: boolean,
): KundenMfaSchritt {
  if (zustand.art === "verifiziert") return sessionAal2 ? "ok" : "challenge";
  if ((zustand.art === "keiner" || zustand.art === "halbfertig") && hinweisFaellig) return "ok_mit_hinweis";
  return "ok";
}

/** Schlüssel im Browser, damit der geschlossene Hinweis sofort weg bleibt. */
export function hinweisSpeicherSchluessel(userId: string): string {
  return `mi_kunde_2fa_hinweis_${userId}`;
}

/** Schlüssel in `user_settings`, damit das Schließen auf allen Geräten gilt. */
export const HINWEIS_EINSTELLUNG = "kunde_2fa_hinweis_geschlossen_am";
