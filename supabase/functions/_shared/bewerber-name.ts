/**
 * Anzeigename eines Bewerbers aus einer Zeile der Tabelle `bewerbungen`.
 *
 * Vorname und Nachname stehen in eigenen Spalten. Das CRM schreibt sie nie in
 * das `meta`-Feld (siehe `bewerberToDb` in src/lib/bewerbungStore.ts). Eine
 * Function, die den Namen nur aus `meta` liest, sieht deshalb bei jedem
 * Bewerber einen leeren Namen und landet im Rueckfall "Ein Bewerber". Genau
 * das stand in der HR-Aufgabe und in der Mail an Christian Kurz.
 *
 * Reihenfolge: Spalten zuerst, `meta` nur als Rueckfall fuer Altbestand, dann
 * die neutrale Anrede.
 */

export interface BewerberNamensquelle {
  vorname?: string | null
  nachname?: string | null
  meta?: { vorname?: string | null; nachname?: string | null } | null
}

export const BEWERBER_NAME_RUECKFALL = 'Ein Bewerber'

export function bewerberAnzeigename(b: BewerberNamensquelle | null | undefined): string {
  if (!b) return BEWERBER_NAME_RUECKFALL
  const meta = b.meta || {}
  const vorname = (b.vorname || meta.vorname || '').trim()
  const nachname = (b.nachname || meta.nachname || '').trim()
  return `${vorname} ${nachname}`.trim() || BEWERBER_NAME_RUECKFALL
}

/**
 * Ausloeser-Schluessel der HR-Aufgabe nach der Unterschrift.
 *
 * Die Tabelle `aufgaben` kennt nur `kontakt_id` (Kunde) und `investment_id`,
 * keinen Bewerber. Der Bezug liegt deshalb im Schluessel: Alles vor dem
 * Doppelpunkt nennt den Grund, alles danach die Bewerbungs-ID. Die Inbox
 * liest ihn ueber `bewerbungIdAusAusloeser` in src/lib/aufgabenStore.ts
 * zurueck. Beide Seiten muessen dieselbe Form benutzen.
 */
export const BEWERBER_VERTRAG_AUSLOESER = 'bewerber_vertrag_unterschrieben'

export function bewerberVertragAusloeser(bewerbungId: string): string {
  return `${BEWERBER_VERTRAG_AUSLOESER}:${bewerbungId}`
}
