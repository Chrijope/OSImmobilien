/**
 * Routen und Rollen der Gruppe „Objektdaten“ (17.10.2026). Eigene kleine
 * Datei, damit Seitenleiste und Rechteprüfung nicht die Objektverwaltung
 * mitladen. Die Listen selbst rechnet `objektdaten.ts`.
 */
export const OBJEKTDATEN_ROUTE = "/objektdaten";
export const OBJEKTDATEN_EINHEITEN_ROUTE = "/objektdaten/einheiten";
export const OBJEKTDATEN_VOLLSTAENDIGKEIT_ROUTE = "/objektdaten/vollstaendigkeit";

/**
 * Wer die Gruppe „Objektdaten“ sieht und ihre Seiten öffnen darf
 * (Christian, 17.10.2026). Bewusst eine feste Liste: auch Rollen mit
 * Vollzugriff wie „individuell“ oder „testaccount“ bleiben draußen.
 */
export const OBJEKTDATEN_ROLLEN: readonly string[] = ["admin", "inhaber", "backoffice", "objektpartner"];

export function istObjektdatenRoute(url: string): boolean {
  const clean = url.split("?")[0].split("#")[0];
  return clean === OBJEKTDATEN_ROUTE || clean.startsWith(OBJEKTDATEN_ROUTE + "/");
}

export function darfObjektdaten(rolle: string | undefined | null): boolean {
  return !!rolle && OBJEKTDATEN_ROLLEN.includes(rolle);
}
