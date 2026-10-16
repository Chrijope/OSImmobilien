/**
 * Die Termindaten der Vorlagen `termin-beratungspraesentation` und
 * `einladung-objektvorstellung` (seit 16.10.2026).
 *
 * Beide Vorlagen bekommen ihre Felder auf zwei Wegen: aus dem Meeting-Dialog
 * im CRM (`src/lib/meetingEinladung.ts`, Felder wie `zoom-meeting-einladung`)
 * und aus der Buchung über den Buchungslink (`send-buchung-bestaetigung`,
 * Felder wie `buchung-bestaetigung`). Diese Datei liest beide Formen an einer
 * Stelle, damit die Vorlagen nicht zweimal dieselbe Auswahl treffen.
 */
import type { Ansprechpartner } from './_layout.tsx'
import { datumFuer, uhrzeitFuer } from './_sprache.ts'

export type TerminArt = 'video' | 'vor_ort' | 'telefon'

export interface TerminFelder {
  // Meeting-Dialog
  kundeName?: string
  kundeAnrede?: string
  zoomJoinUrl?: string
  terminModus?: TerminArt
  treffpunkt?: string
  kundeTelefon?: string
  beraterName?: string
  beraterBild?: string
  beraterEmail?: string
  beraterTelefon?: string
  beraterPosition?: string
  // Buchung
  anrede?: string
  vorname?: string
  nachname?: string
  zugangUrl?: string
  verwaltenUrl?: string
  // Beide
  terminDatum?: string
  terminUhrzeit?: string
  terminDauer?: number
  icsUrl?: string
  googleCalendarUrl?: string
  berater?: Ansprechpartner
}

export interface TerminAnsicht {
  person: Ansprechpartner
  art: TerminArt
  datum: string
  uhr: string
  /** Link zum Videoraum, leer bei Büro oder Telefon. */
  zugang: string
  kalender: Array<{ text: string; href: string }>
}

export function terminAnsicht(
  f: TerminFelder,
  sprache: unknown,
  kalenderTexte: { ics: string; google: string },
): TerminAnsicht {
  const person: Ansprechpartner = {
    name: f.berater?.name || f.beraterName,
    rolle: f.berater?.rolle || f.beraterPosition,
    telefon: f.berater?.telefon || f.beraterTelefon,
    email: f.berater?.email || f.beraterEmail,
    bildUrl: f.berater?.bildUrl || f.beraterBild,
  }
  const zugang = (f.zoomJoinUrl || f.zugangUrl || '').trim()
  // Ohne Angabe: mit Link ein Videotermin, ohne Link ein Termin im Büro.
  const art: TerminArt = f.terminModus ?? (zugang ? 'video' : 'vor_ort')
  const kalender: Array<{ text: string; href: string }> = []
  if (f.icsUrl) kalender.push({ text: kalenderTexte.ics, href: f.icsUrl })
  if (f.googleCalendarUrl) kalender.push({ text: kalenderTexte.google, href: f.googleCalendarUrl })
  return {
    person,
    art,
    datum: datumFuer(f.terminDatum, sprache),
    uhr: uhrzeitFuer(f.terminUhrzeit, sprache),
    zugang: art === 'video' ? zugang : '',
    kalender,
  }
}
