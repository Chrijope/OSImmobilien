/**
 * Wer den OS Lotsen nutzen darf, gemeinsam für Browser und Server.
 *
 * Eine eigene kleine Datei ohne weitere Importe, weil
 * `src/lib/sidebarPermissions.ts` sie einbindet und damit in jedem Seitenaufruf
 * steckt. Die übrigen Regeln des Lotsen stehen in `lotse-regeln.ts`, das diese
 * Datei weiterreicht. Geprüft in `src/lib/lotseRegeln.test.ts`.
 */

/**
 * Die Rollen, die den Lotsen nutzen dürfen. Heute sehen die Einheitenseite
 * nur Admin und Inhaber (`ObjektseiteZugang`); schaltet Christian den
 * Objektbereich frei, gilt diese Liste ohne weiteren Umbau. Tippgeber nie.
 */
export const LOTSE_ROLLEN = [
  "admin", "inhaber", "vertriebsleiter", "vertriebspartner", "backoffice", "objektpartner", "finanzierungspartner",
] as const;

/**
 * Darf die aktive Rolle den Lotsen nutzen? Allein nach der Rollenliste.
 *
 * Die Karrierestufe spielt keine Rolle (Christians Entscheidung vom
 * 28.09.2026): Die Stufe mit der Kennung „tippgeber“ heißt „Vertriebspartner
 * (Alt)“, das sind Altpartner, und sie bekommen den Lotsen. Ausgeschlossen
 * ist nur die ROLLE `tippgeber` und jede Rolle, die nicht in der Liste steht.
 */
export function darfLotseNutzen(rolle: string | null | undefined): boolean {
  return !!rolle && (LOTSE_ROLLEN as readonly string[]).includes(rolle);
}
