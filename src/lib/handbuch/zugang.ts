/**
 * Wer die Verwaltung der Handbuch-Seite sehen und öffnen darf.
 *
 * DER SCHALTER FÜR DIE FREISCHALTUNG
 *
 * Seit dem 26.09.2026 ist die Verwaltung (`/handbuch-seite`) nur für Admin,
 * Inhaber und (seit dem Auftrag vom selben Abend) die Vertriebsleitung
 * sichtbar und erreichbar, mit dem Badge „Admin“ in der Seitenleiste. Diese
 * drei Rollen haben die Gesamtsicht: Firmenlink, Kampagnen-Baukasten,
 * Umschalter Alle, Nur mein Link, Nur Firmenlink. Serverseitig gilt dasselbe
 * in `handbuch_kennzahlen` (Migration 20260926180000).
 *
 * Seit HB-008 (26.09.2026) steht der Schalter in der Datenbank, damit auch
 * der Server ihn kennt: `app_config` unter `handbuch_partner_freigeschaltet`
 * mit `{"aktiv": false}` (Migration 20260926220000). Zeilensicherheit auf
 * `handbuch_anforderungen` und `handbuch_kennzahlen` lassen Partner erst
 * durch, wenn dort `aktiv` true ist; der Browser liest denselben Eintrag.
 * Freischalten ist eine SQL-Zeile:
 *
 *   update public.app_config set wert = '{"aktiv": true}'::jsonb
 *    where schluessel = 'handbuch_partner_freigeschaltet';
 *
 * Fehlt der Eintrag (Migration noch nicht gelaufen), gilt die Konstante
 * `HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET` unten. Ist sie freigeschaltet,
 * dann
 *
 *   - erscheint der Menüpunkt unter „Tools“ auch für Vertriebspartner, ohne
 *     Admin-Badge,
 *   - lässt der Routenschutz sie auf die Seite,
 *   - sieht jeder dort seinen persönlichen Link und seine eigenen Zahlen.
 *
 * Eine Freigabe in `role_permissions` braucht es dafür nicht. Die Datenbank
 * schützt die Zahlen zusätzlich je Partner. Der Stand je Lead im Kundenprofil
 * (`handbuch_lead_staende`) bleibt für eigene Kontakte immer lesbar, er hängt
 * nicht am Schalter.
 *
 * Die öffentliche Seite `/handbuch/<kürzel>` ist davon unabhängig: Sie ist
 * für jeden erreichbar, und jeder Partner mit Beraterrolle hat schon heute
 * ein gültiges Kürzel. Der Schalter regelt nur, wer die Verwaltung sieht.
 */

import { getAppConfig } from "@/lib/appConfigStore";

export const HANDBUCH_SEITE_ROUTE = "/handbuch-seite";

/**
 * Rückfall, solange `app_config` keinen Eintrag hat. Seit dem 27.09.2026
 * `true`: Christian hat die Handbuch-Seite für alle Vertriebspartner
 * freigeschaltet, jeder sieht seinen Link und seine eigenen Zahlen.
 */
export const HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET = true;

/** Der Schlüssel in `app_config`, derselbe wie in der Datenbank. */
export const HANDBUCH_PARTNER_SCHALTER = "handbuch_partner_freigeschaltet";

/** `{"aktiv": true|false}` aus `app_config`; ohne gültigen Eintrag die Konstante. */
export function partnerFreigabeAusWert(wert: unknown): boolean {
  const aktiv = wert && typeof wert === "object" ? (wert as { aktiv?: unknown }).aktiv : undefined;
  return typeof aktiv === "boolean" ? aktiv : HANDBUCH_SEITE_FUER_PARTNER_FREIGESCHALTET;
}

/** Der Schalter, wie er gerade im Zwischenspeicher steht. */
export function handbuchPartnerFreigeschaltet(): boolean {
  return partnerFreigabeAusWert(getAppConfig<unknown>(HANDBUCH_PARTNER_SCHALTER, null));
}

/** Rollen mit Gesamtsicht, die heute schon dürfen. `vertriebsleiter` ist die Rolle der Vertriebsleitung. */
export const HANDBUCH_SEITE_ADMIN_ROLLEN = ["admin", "inhaber", "vertriebsleiter"] as const;

/** Rollen, die nach der Freischaltung zusätzlich dürfen, mit eigener Sicht. */
export const HANDBUCH_SEITE_PARTNER_ROLLEN = ["vertriebspartner"] as const;

/** Sieht diese Rolle alle Zahlen und den Firmenlink? */
export function hatHandbuchGesamtsicht(rolle: string | null | undefined): boolean {
  return (HANDBUCH_SEITE_ADMIN_ROLLEN as readonly string[]).includes(rolle || "");
}

export function darfHandbuchSeite(
  rolle: string | null | undefined,
  freigeschaltet: boolean = handbuchPartnerFreigeschaltet(),
): boolean {
  const r = rolle || "";
  if ((HANDBUCH_SEITE_ADMIN_ROLLEN as readonly string[]).includes(r)) return true;
  return freigeschaltet && (HANDBUCH_SEITE_PARTNER_ROLLEN as readonly string[]).includes(r);
}

/** Ist die Adresse die Verwaltung der Handbuch-Seite? */
export function istHandbuchSeiteRoute(url: string): boolean {
  const sauber = url.split("?")[0].split("#")[0].replace(/\/+$/, "");
  return sauber === HANDBUCH_SEITE_ROUTE;
}
