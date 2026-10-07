import { getAppConfig, setAppConfig } from "./appConfigStore";

/**
 * Wer Unterlagen für Kunden freigeben darf (Dokumenten-Ampel).
 *
 * Christian, 23.09.2026: Admin und Inhaber dürfen immer, dazu die Rollen, die
 * in der Nutzerverwaltung unter „Rollen & Berechtigungen" gewählt sind.
 * Solange dort nichts gespeichert ist, gelten Vertriebsleiter und
 * Objektpartner. Die Wahl liegt in `app_config` unter
 * `dokument_freigabe_rollen` als `{ "rollen": [...] }`, wie andere
 * unternehmensweite Einstellungen auch.
 *
 * Maßgeblich ist die Datenbankfunktion `darf_dokument_freigeben` (Migration
 * 20260923170000). Sie liest denselben Eintrag und kennt dieselben Listen.
 * Hier wird nur entschieden, ob der Schalter erscheint; ein Test prüft, dass
 * beide Stellen dieselben Rollen nennen.
 */

export const FREIGABE_ROLLEN_SCHLUESSEL = "dokument_freigabe_rollen";

/** Dürfen immer, lassen sich nicht abwählen. */
export const FREIGABE_ROLLEN_IMMER = ["admin", "inhaber"] as const;

/** Lassen sich zuschalten. Jede andere Rolle zählt nie, auch wenn sie im Eintrag stünde. */
export const FREIGABE_ROLLEN_WAEHLBAR = ["vertriebsleiter", "objektpartner", "backoffice", "vertriebspartner"] as const;

export type WaehlbareFreigabeRolle = (typeof FREIGABE_ROLLEN_WAEHLBAR)[number];

/** Gilt, solange nichts gespeichert ist. */
export const FREIGABE_ROLLEN_STANDARD: readonly WaehlbareFreigabeRolle[] = ["vertriebsleiter", "objektpartner"];

function istWaehlbar(rolle: string): rolle is WaehlbareFreigabeRolle {
  return (FREIGABE_ROLLEN_WAEHLBAR as readonly string[]).includes(rolle);
}

/**
 * Die zugeschalteten Rollen aus dem gespeicherten Wert.
 *
 * Eine leere Liste ist eine Entscheidung (nur Admin und Inhaber) und bleibt
 * leer. Fehlt der Eintrag oder hat er keine Liste, gilt die Voreinstellung.
 * Unbekannte Rollen fallen weg. Genau so liest es auch die Datenbank.
 */
export function freigabeRollenAusWert(wert: unknown): WaehlbareFreigabeRolle[] {
  const rollen = wert && typeof wert === "object" && !Array.isArray(wert)
    ? (wert as { rollen?: unknown }).rollen
    : undefined;
  if (!Array.isArray(rollen)) return [...FREIGABE_ROLLEN_STANDARD];
  return FREIGABE_ROLLEN_WAEHLBAR.filter((r) => rollen.includes(r));
}

/** Die zugeschalteten Rollen, wie sie gerade im Zwischenspeicher stehen. */
export function gespeicherteFreigabeRollen(): WaehlbareFreigabeRolle[] {
  return freigabeRollenAusWert(getAppConfig<unknown>(FREIGABE_ROLLEN_SCHLUESSEL, null));
}

/**
 * Darf diese Rolle den Schalter „Für Kunden: frei / gesperrt" bedienen?
 *
 * `zugeschaltet` ist ohne Angabe die gespeicherte Einstellung. Wer die Seite
 * bei einer Änderung neu zeichnen will, hängt `useLiveVersion(["app_config"])`
 * davor.
 */
export function darfDokumentFreigeben(
  rolle: string | null | undefined,
  zugeschaltet: readonly string[] = gespeicherteFreigabeRollen(),
): boolean {
  if (!rolle) return false;
  if ((FREIGABE_ROLLEN_IMMER as readonly string[]).includes(rolle)) return true;
  return istWaehlbar(rolle) && zugeschaltet.includes(rolle);
}

/**
 * Speichert die zugeschalteten Rollen. Schreiben dürfen nur Admin und Inhaber,
 * das erzwingt die Zugriffsregel von `app_config`. `true` heißt gespeichert,
 * einen Fehlschlag meldet `setAppConfig` selbst.
 */
export function speichereFreigabeRollen(rollen: readonly string[]): Promise<boolean> {
  return setAppConfig(FREIGABE_ROLLEN_SCHLUESSEL, {
    rollen: FREIGABE_ROLLEN_WAEHLBAR.filter((r) => rollen.includes(r)),
  });
}
