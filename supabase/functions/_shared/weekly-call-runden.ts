/**
 * Wer die Punkte-Mail zum Weekly Sales Call bekommen darf, für Edge Functions.
 *
 * Die Mail um 17 Uhr enthält die Punkte BEIDER Calls (19:00 Lead-Berater,
 * 19:30 Vertriebspartner). Sie geht deshalb nur an die Leitung, die beide
 * Calls betreut: Admin, Inhaber, Vertriebsleitung. Dieselbe Rollenliste wie
 * `callRundenFuer()` in src/lib/weeklyCallZeit.ts und `weekly_call_runden()`
 * in der Datenbank (Migration 20261005160000) für "beide Calls".
 *
 * Gezählt werden alle zugewiesenen Rollen: Ein Server kennt keine aktive Rolle.
 */

const LEITUNG = ['admin', 'inhaber', 'vertriebsleiter']

export function istWeeklyCallLeitung(rollen: string[]): boolean {
  return rollen.some((r) => LEITUNG.includes(r))
}
