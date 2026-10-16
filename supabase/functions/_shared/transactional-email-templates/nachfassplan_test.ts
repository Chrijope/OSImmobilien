/**
 * Deno-Test: die Vorlagen des Nachfassplans (seit 16.10.2026).
 *
 *   deno test -A --no-lock supabase/functions/_shared/transactional-email-templates/nachfassplan_test.ts
 *
 * Du-Form wie alle Kundenmails (seit 16.10.2026), kein Sie, keine Gedankenstriche, und die Inhalte, die der
 * Drive-Prozessstandard verlangt.
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './registry.ts'

async function text(name: string, daten: Record<string, unknown> = {}): Promise<string> {
  const eintrag = TEMPLATES[name]
  if (!eintrag) throw new Error(`${name} fehlt in der Registry`)
  const alle = { ...eintrag.previewData, ...daten, sprache: 'de' }
  const t = await renderAsync(React.createElement(eintrag.component, alle), { plainText: true })
  const betreff = typeof eintrag.subject === 'function' ? eintrag.subject(alle) : eintrag.subject
  return `${betreff}\n${t}`.replace(/\s+/g, ' ')
}

function erwarte(inhalt: string, teile: string[]) {
  for (const teil of teile) if (!inhalt.includes(teil)) throw new Error(`fehlt: ${teil}\n${inhalt}`)
}

const SIE = /\b(Sie|Ihnen|Ihr|Ihre|Ihrem|Ihren|Ihrer|Ihres)\b|Guten Tag/

for (const name of ['termin-beratungspraesentation', 'einladung-objektvorstellung', 'erinnerung-unterlagen-objektvorstellung', 'nachfass-zusammenfassung', 'letzte-nachricht']) {
  Deno.test(`${name}: duzt, ohne Sie und ohne Gedankenstrich`, async () => {
    const t = await text(name)
    erwarte(t, ['Hallo Max,'])
    const sie = t.match(SIE)
    if (sie) throw new Error(`${name}: Sie-Form gefunden: ${sie[0]}`)
    if (/[–—]/.test(t)) throw new Error(`${name}: Gedankenstrich gefunden`)
  })
}

Deno.test('termin-beratungspraesentation: eine Stunde, nichts unterschreiben, Mitentscheider, Renteninformation', async () => {
  erwarte(await text('termin-beratungspraesentation'), [
    'etwa eine Stunde', 'Es wird nichts unterschrieben.', 'herzlich willkommen', 'Renteninformation', 'freiwillig', 'Zum Videogespräch',
  ])
  // Aus der Buchung: Anrede und Namensteile einzeln, Zugang als zugangUrl.
  const buchung = await text('termin-beratungspraesentation', {
    kundeName: undefined, kundeAnrede: undefined, zoomJoinUrl: undefined, terminModus: undefined,
    anrede: 'Frau', vorname: 'Erika', nachname: 'Musterfrau', zugangUrl: 'https://example.com/raum/x',
    verwaltenUrl: 'https://example.com/verwalten',
  })
  erwarte(buchung, ['Hallo Erika,', 'Zum Videogespräch', 'Termin verschieben oder absagen'])
  // Im Büro: kein Videoknopf.
  const buero = await text('termin-beratungspraesentation', { terminModus: 'vor_ort', treffpunkt: 'Musterstraße 1' })
  erwarte(buero, ['Unser Büro', 'Musterstraße 1'])
  if (buero.includes('Zum Videogespräch')) throw new Error('Büro-Termin mit Videoknopf')
})

Deno.test('einladung-objektvorstellung: Datum, Ausweis vorne und hinten, Gehaltsabrechnung, Upload-Link', async () => {
  erwarte(await text('einladung-objektvorstellung'), [
    'Einladung zur Objektvorstellung am', 'Personalausweis, Vorder- und Rückseite', 'letzte Gehaltsabrechnung', 'Kundenportal', 'Unterlagen hochladen',
  ])
})

Deno.test('erinnerung-unterlagen-objektvorstellung: nennt nur, was fehlt', async () => {
  const nurAusweis = await text('erinnerung-unterlagen-objektvorstellung', { fehlend: ['Personalausweis'] })
  erwarte(nurAusweis, ['Personalausweis, Vorder- und Rückseite', 'Unterlagen hochladen', 'in zwei Tagen'])
  if (nurAusweis.includes('Gehaltsabrechnung')) throw new Error('Gehaltsabrechnung genannt, obwohl sie da ist')
})

Deno.test('nachfass-zusammenfassung: vier Felder, leere fallen weg', async () => {
  erwarte(await text('nachfass-zusammenfassung'), [
    'Dein Ziel, in deinen Worten', 'Was dir wichtig ist', 'Offene Fragen', 'Die nächsten Schritte',
  ])
  const nurZiel = await text('nachfass-zusammenfassung', { wichtig: '', offeneFragen: '', naechsteSchritte: '' })
  if (nurZiel.includes('Offene Fragen')) throw new Error('leeres Feld erscheint')
})

Deno.test('letzte-nachricht: nicht aufdringlich, Vorgang ruht', async () => {
  erwarte(await text('letzte-nachricht'), ['Ich möchte nicht aufdringlich sein', 'lasse ich deinen Vorgang vorerst ruhen'])
  erwarte(await text('letzte-nachricht', { berater: {} }), ['Wir möchten nicht aufdringlich sein'])
})
