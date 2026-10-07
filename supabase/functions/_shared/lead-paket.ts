/**
 * Das Lead-Paket im Bewerberprozess: die eine Regel, ob ein Vertrag ein
 * Lead-Paket enthält, und was daraus für den Statusweg folgt.
 *
 * ## Warum es diese Datei gibt (23.09.2026)
 *
 * Eine Onboardinggebühr gibt es im heutigen Vertrag nicht mehr. Zu zahlen ist
 * im Bewerberprozess nur noch das optionale Lead-Paket, und an ihm hängt jetzt
 * alles, was mit der Rechnung zu tun hat:
 *
 *   1. der Status nach dem vollständig unterschriebenen Vertrag,
 *   2. die HR-Glocke „Rechnung erstellen" und die Rechnungsmail an Christian,
 *   3. der Sprung aus „Rechnung" nach der Zahlung samt Folgemail,
 *   4. die Sperre der Freischaltung, solange das Lead-Paket offen ist.
 *
 * Vorher prüfte jede dieser Stellen selbst, und zwar verschieden: der
 * Statussprung in `finalize-vertrag` nur den Betrag, die Mail Betrag und
 * Anzahl, die Reiter im Browser die Wahrheit des Feldes. Jetzt fragen alle
 * hier. Das Modul hat keine Importe und lässt sich aus Deno, aus dem Frontend
 * und aus dem Test lesen (`src/lib/leadPaketStatusweg.test.ts`).
 *
 * ## Woran das Lead-Paket erkannt wird
 *
 * Am Feld `leadPaket = { betrag, anzahl }` in `bewerbungen.meta`. Das Closing
 * setzt es, wenn ein Lead-Paket gebucht wird, und der Vertrag druckt genau
 * diese beiden Werte ins Konditionenblatt und in die Leadpaket-Anlage. Ein
 * Paketwechsel, zu dem kein Lead-Paket passt, löscht das Feld wieder
 * (`VertragsTab`, `speichern`). Gebucht ist es, wenn Betrag und Anzahl
 * positive Zahlen sind, dieselbe Prüfung wie beim Einlesen in
 * `src/lib/bewerbungStore.ts`. Aus Freitexten wird nichts abgeleitet.
 *
 * ## Der Statusweg
 *
 *     Vertrag ──(mit Lead-Paket)──> Rechnung ──(Zahlung bestätigt)──> Nutzer_anlegen
 *     Vertrag ──(ohne Lead-Paket)─────────────────────────────────────> Nutzer_anlegen
 *
 * Jeder Sprung geht nur nach vorn. Wer schon weiter ist oder ausgeschieden,
 * bleibt, wo er ist. Das zählt vor allem beim Hochladen eines unterschriebenen
 * PDFs: Das kann auch bei einem längst aktiven Partner noch einmal passieren,
 * etwa für einen besseren Scan, und darf ihn nicht zurückholen.
 *
 * Die Statuswerte sind die aus `BewerberStatus` in `bewerbungStore.ts`. Der
 * Test hält `STUFEN` an `PIPELINE_STUFEN` fest.
 */

/** Ein im Vertrag gebuchtes Lead-Paket. */
export interface GebuchtesLeadPaket {
  /** Betrag in Euro netto, so wie er im Vertrag steht. */
  betrag: number
  /** Anzahl qualifizierter Leads. */
  anzahl: number
}

/**
 * Liest das Lead-Paket aus dem Rohwert `meta.leadPaket` beziehungsweise
 * `Bewerber.leadPaket`. `null`, wenn keins gebucht ist oder der Wert
 * unbrauchbar ist.
 */
export function gebuchtesLeadPaket(roh: unknown): GebuchtesLeadPaket | null {
  if (!roh || typeof roh !== 'object') return null
  const { betrag, anzahl } = roh as { betrag?: unknown; anzahl?: unknown }
  if (typeof betrag !== 'number' || !Number.isFinite(betrag) || betrag <= 0) return null
  if (typeof anzahl !== 'number' || !Number.isFinite(anzahl) || anzahl <= 0) return null
  return { betrag, anzahl }
}

/** Enthält der Vertrag ein Lead-Paket? */
export function hatLeadPaket(roh: unknown): boolean {
  return gebuchtesLeadPaket(roh) !== null
}

/** Dieselbe Schreibweise wie `formatPreis` in `src/lib/lizenzPakete.ts`, zum Beispiel „2.500 €". */
export function formatiereLeadPaketBetrag(betrag: number): string {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(betrag)
}

// ─── Statusweg ───

/** Die Stufen des Bewerberwegs in ihrer Reihenfolge, wie `PIPELINE_STUFEN`. */
export const STUFEN = [
  'Eingang',
  'Erstgespraech',
  'Closing',
  'FollowUp',
  'Bedenkzeit',
  'Paketwahl',
  'Vertrag',
  'Rechnung',
  'Nutzer_anlegen',
  'Aktiv',
] as const

export type StufeNachVertrag = 'Rechnung' | 'Nutzer_anlegen'

/**
 * Liefert das Ziel, wenn es vor dem aktuellen Stand liegt, sonst `null`.
 * Ausgeschiedene (`Abgelehnt`, `KeinInteresse`) und unbekannte Werte stehen
 * nicht in `STUFEN` und werden damit nie bewegt.
 */
function nurNachVorn<T extends StufeNachVertrag>(aktuellerStatus: unknown, ziel: T): T | null {
  const jetzt = STUFEN.indexOf(aktuellerStatus as (typeof STUFEN)[number])
  if (jetzt < 0) return null
  return jetzt < STUFEN.indexOf(ziel) ? ziel : null
}

/**
 * Wohin ein Bewerber geht, sobald der Vertrag vollständig unterschrieben ist:
 * mit Lead-Paket nach „Rechnung", ohne direkt nach „Nutzer_anlegen". `null`
 * heißt: Der Status bleibt, wie er ist.
 */
export function stufeNachVollstaendigemVertrag(
  leadPaket: unknown,
  aktuellerStatus: unknown,
): StufeNachVertrag | null {
  return nurNachVorn(aktuellerStatus, hatLeadPaket(leadPaket) ? 'Rechnung' : 'Nutzer_anlegen')
}

/**
 * Wohin ein Bewerber geht, wenn die Zahlung für das Lead-Paket bestätigt
 * wird: aus „Rechnung" nach „Nutzer_anlegen". In jedem anderen Fall `null`,
 * und nur bei einem Sprung geht die Folgemail „Zahlung eingegangen" an
 * Christian hinaus.
 */
export function stufeNachZahlung(leadPaket: unknown, aktuellerStatus: unknown): 'Nutzer_anlegen' | null {
  return hatLeadPaket(leadPaket) && aktuellerStatus === 'Rechnung' ? 'Nutzer_anlegen' : null
}

/**
 * Liegt der Bewerber mit offenem Lead-Paket in „Rechnung"? Dann schiebt ihn
 * auch ein eingetragener Onboarding-Termin nicht weiter. Weiter geht es erst
 * mit der bestätigten Zahlung, sonst ginge die Folgemail an Christian nie
 * hinaus und „Rechnung" ließe sich per Termin überspringen.
 */
export function wartetAufLeadPaketZahlung(
  leadPaket: unknown,
  aktuellerStatus: unknown,
  bezahlt: boolean,
): boolean {
  return hatLeadPaket(leadPaket) && aktuellerStatus === 'Rechnung' && !bezahlt
}
