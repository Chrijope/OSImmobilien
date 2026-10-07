import { BEWERBERPROZESS_FREIGABEN } from "./bewerberprozessFreigabe";
import { getAppConfig, setAppConfig } from "./appConfigStore";
import {
  pruefeNotizFreigaben, pruefeNotizUeberarbeitungen, type NotizBetrachter, type NotizFreigabe, type NotizFreigaben,
  type NotizUeberarbeitung, type NotizUeberarbeitungen,
} from "./versionsnotiz";

/**
 * Wer „Neu im CRM“ schon bekommt.
 *
 * DER SCHALTER FÜR DIE FREISCHALTUNG
 *
 * Die Testphase ist am 26.09.2026 beendet: „Neu im CRM“ gilt jetzt für alle.
 * Jede Rolle sieht auf der News-Seite die Filter und die Einträge aus
 * `public/versionsnotiz.json`, deren `zielrollen` zu ihr passen, und die
 * Seitenleiste zählt genau diese mit.
 *
 * Das Neuladen hing nie an diesem Schalter: Das stille Neuladen beim
 * Seitenwechsel und der Warnstreifen bei `kritisch` gelten für alle, siehe
 * `versionspruefung.ts`.
 *
 * Während der Testphase galt es nur für Christian Peetz, erkannt über Kennung
 * oder Anmeldeadresse, nie über den Namen (zwei Konten mit demselben Namen
 * hat es schon gegeben). Die Liste kommt aus seinem Eintrag in
 * `bewerberprozessFreigabe.ts`. Sie bleibt stehen, damit sich eine neue
 * Testphase wieder mit `false` starten lässt.
 */
export const NEU_IM_CRM_FUER_ALLE = true;

const TESTER = BEWERBERPROZESS_FREIGABEN.find((f) => f.name === "Christian Peetz");

/** Die Testkennungen während der Testphase. */
export const NEU_IM_CRM_TEST_KENNUNGEN: readonly string[] = TESTER?.userIds ?? [];

/** Die Anmeldeadressen des Testers, klein geschrieben. */
export const NEU_IM_CRM_TEST_ADRESSEN: readonly string[] = (TESTER?.emails ?? []).map((e) => e.toLowerCase());

/** Bekommt dieser Nutzer das neue Verhalten? Ohne Kennung und Adresse nie. */
export function hatNeuImCrm(benutzerId: string | null | undefined, email?: string | null): boolean {
  if (NEU_IM_CRM_FUER_ALLE) return true;
  if (benutzerId && NEU_IM_CRM_TEST_KENNUNGEN.includes(benutzerId)) return true;
  return !!email && NEU_IM_CRM_TEST_ADRESSEN.includes(email.trim().toLowerCase());
}

/**
 * Wer neue Einträge freigibt oder ablehnt: nur Christian Peetz, erkannt wie
 * oben über Kennung oder Anmeldeadresse. Unabhängig von `NEU_IM_CRM_FUER_ALLE`.
 */
export function istNeuImCrmFreigeber(benutzerId: string | null | undefined, email?: string | null): boolean {
  if (benutzerId && NEU_IM_CRM_TEST_KENNUNGEN.includes(benutzerId)) return true;
  return !!email && NEU_IM_CRM_TEST_ADRESSEN.includes(email.trim().toLowerCase());
}

/**
 * Der Freigabestand in `app_config`, gilt für alle Nutzer.
 *
 * Schreiben lässt die Datenbank dort nur Admin und Inhaber zu (Regeln
 * „Admins schreiben config“ und „Admins aktualisieren config“). Auf
 * Christian allein begrenzt nur die Oberfläche, eine eigene Datenbankregel
 * für einen einzelnen Schlüssel gibt es bewusst nicht.
 *
 * Fehlt der Eintrag (noch nie entschieden, Tabelle nicht geladen,
 * Testkonto), gilt: bis Nr. 24 frei, ab Nr. 25 nur für Christian.
 */
export const NEU_IM_CRM_FREIGABEN_SCHLUESSEL = "neu_im_crm_freigaben";

export function leseNotizFreigaben(): NotizFreigaben {
  return pruefeNotizFreigaben(getAppConfig<unknown>(NEU_IM_CRM_FREIGABEN_SCHLUESSEL, null));
}

/** Liest immer frisch, damit eine zweite Entscheidung die erste nicht überschreibt. */
export function setzeNotizFreigabe(nr: number, stand: NotizFreigabe): Promise<boolean> {
  return setAppConfig(NEU_IM_CRM_FREIGABEN_SCHLUESSEL, { ...leseNotizFreigaben(), [String(nr)]: stand });
}

/**
 * Christians Textänderungen an Einträgen, ebenfalls in `app_config` und mit
 * denselben Schreibregeln wie die Freigaben. Ohne Eintrag gilt der Text aus
 * der Datei.
 */
export const NEU_IM_CRM_UEBERARBEITUNGEN_SCHLUESSEL = "neu_im_crm_ueberarbeitungen";

export function leseNotizUeberarbeitungen(): NotizUeberarbeitungen {
  return pruefeNotizUeberarbeitungen(getAppConfig<unknown>(NEU_IM_CRM_UEBERARBEITUNGEN_SCHLUESSEL, null));
}

/** `null` stellt den Originaltext wieder her. Liest frisch wie `setzeNotizFreigabe`. */
export function setzeNotizUeberarbeitung(nr: number, text: NotizUeberarbeitung | null): Promise<boolean> {
  const { [String(nr)]: _alt, ...rest } = leseNotizUeberarbeitungen();
  return setAppConfig(NEU_IM_CRM_UEBERARBEITUNGEN_SCHLUESSEL, text ? { ...rest, [String(nr)]: text } : rest);
}

export function neuImCrmBetrachter(
  rolle: string | undefined,
  benutzerId: string | null | undefined,
  email?: string | null,
  freigaben: NotizFreigaben = leseNotizFreigaben(),
): NotizBetrachter {
  // Freigeben nur als Christian UND in der Admin-Rolle. Wechselt er über die
  // Seitenleiste in eine andere Rolle, sieht er die News wie diese Rolle.
  return { rolle, istFreigeber: rolle === "admin" && istNeuImCrmFreigeber(benutzerId, email), freigaben };
}
