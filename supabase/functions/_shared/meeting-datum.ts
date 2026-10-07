/**
 * Datum und Uhrzeit eines Meetings so, wie ein Mensch sie liest.
 *
 * Anlass: Die Aenderungsmail reichte durch, was in der Datenbank steht, also
 * "2026-09-19" und "2026-09-19 09:30". Der Kunde las damit in einer Zeile
 * "Bisher: 2026-09-19 09:30". Die Ersteinladung schreibt an derselben Stelle
 * den Wochentag aus, die Aenderungsmail nicht, und ausgerechnet sie ist die,
 * bei der es auf den Unterschied zwischen zwei Terminen ankommt.
 *
 * Der Wochentag steht bewusst mit dabei. "Freitag, 19. September" verhindert
 * den haeufigsten Irrtum beim Verschieben, naemlich dass jemand das Datum
 * liest und den Wochentag aus dem Kopf dazu erfindet.
 */

import { datumLangText } from './sprach-format.ts'

const ZONE = 'Europe/Berlin'

/**
 * Nimmt "2026-09-19", "2026-09-19 09:30" oder einen ISO-Zeitpunkt.
 *
 * Das Format mit Leerzeichen kommt aus der Datenbank (`alteZeit`) und ist
 * kein gueltiger ISO-Wert; ohne das Ersetzen liest Safari es gar nicht.
 */
function lies(wert?: string): Date | null {
  const roh = (wert || '').trim()
  if (!roh) return null
  const d = new Date(roh.includes(' ') ? roh.replace(' ', 'T') : roh)
  return isNaN(d.getTime()) ? null : d
}

/**
 * "Freitag, 19. September 2026", oder der Rohwert, wenn er unlesbar ist.
 * Englisch (Kundensprache): "Friday, 19 September 2026".
 */
export function meetingDatum(wert?: string, sprache?: string): string {
  const d = lies(wert)
  if (!d) return (wert || '').trim()
  if (sprache === 'en') return datumLangText(d, 'en', { wochentag: true, zeitzone: ZONE })
  return d.toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: ZONE,
  })
}

/**
 * "Freitag, 19. September 2026 um 09:30 Uhr".
 *
 * Mit einer getrennt uebergebenen Uhrzeit ("09:30") wird diese genommen, sonst
 * die aus dem Wert selbst. Traegt der Wert gar keine Uhrzeit, bleibt es beim
 * Datum allein; eine erfundene Uhrzeit waere schlimmer als keine.
 */
export function meetingZeitpunkt(wert?: string, uhrzeit?: string, sprache?: string): string {
  const datum = meetingDatum(wert, sprache)
  if (!datum) return ''
  const um = (zeit: string) => (sprache === 'en' ? `${datum} at ${zeit}` : `${datum} um ${zeit} Uhr`)

  const eigene = (uhrzeit || '').trim()
  if (eigene) return um(eigene)

  const d = lies(wert)
  const hatZeit = !!d && /[T ]\d{1,2}:\d{2}/.test((wert || '').trim())
  if (!d || !hatZeit) return datum

  const zeit = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: ZONE })
  return um(zeit)
}
