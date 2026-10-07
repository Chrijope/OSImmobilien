/**
 * Deno-Test: Die Vertragskopie nach der Reservierung verweist aufs
 * Kundenportal statt auf die Reservierungsgebuehr (05.10.2026).
 *
 *   deno test -A --no-lock supabase/functions/_shared/transactional-email-templates/reservierung-kopie_test.ts
 *
 * Rendert die Vorlage in Deutsch und Englisch, mit und ohne Portalzugang,
 * und prueft den Helfer, der den Zugang am Kontakt erkennt. Schickt nichts
 * ins Netz.
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { template, KUNDENPORTAL_INVESTMENTS_URL } from './reservierung-kopie.tsx'
import { portalZugangFuer } from '../portal-verknuepfung.ts'

function pruefe(bedingung: unknown, meldung: string): void {
  if (!bedingung) throw new Error(meldung)
}

const GRUND = { name: 'Erika Muster', objektTitel: 'Musterstraße 12, WE 6', widerrufWahl: 'sofort' }

async function text(daten: Record<string, unknown>): Promise<string> {
  return await renderAsync(React.createElement(template.component, daten), { plainText: true })
}

async function html(daten: Record<string, unknown>): Promise<string> {
  return await renderAsync(React.createElement(template.component, daten))
}

for (const sprache of ['de', 'en'] as const) {
  Deno.test(`${sprache}: mit Portalzugang Knopf und Link als Text, kein Gebührensatz`, async () => {
    const daten = { ...GRUND, sprache, portalZugang: true }
    const t = await text(daten)
    const h = await html(daten)
    pruefe(t.includes(sprache === 'de' ? 'im Abschnitt Reservierung als PDF zum Herunterladen' : 'in the Reservation section, as a PDF to download'), 'Portalsatz fehlt')
    pruefe(h.includes(sprache === 'de' ? 'Zum Kundenportal' : 'Go to the customer portal'), 'Knopf fehlt')
    pruefe((h.match(new RegExp(`href="${KUNDENPORTAL_INVESTMENTS_URL}"`, 'g')) || []).length >= 2, 'Knopf und Textlink zeigen nicht beide aufs Portal')
    pruefe(t.includes(KUNDENPORTAL_INVESTMENTS_URL), 'Link steht nicht als Text da')
    pruefe(!/Abschnitt 4|section 4|Eingang der Reservierungsgebühr|receipt of the reservation fee/.test(t), 'Gebührensatz steht noch da')
    pruefe(!t.includes(sprache === 'de' ? 'Zugangsdaten' : 'login details'), 'Zugangsdaten-Satz trotz Zugang')
  })

  Deno.test(`${sprache}: ohne Portalzugang kein Knopf, Zugangsdaten folgen`, async () => {
    const daten = { ...GRUND, sprache, portalZugang: false }
    const t = await text(daten)
    pruefe(t.includes(sprache === 'de' ? 'Ihre Zugangsdaten zum Kundenportal erhalten Sie gesondert.' : 'You will receive your login details for the customer portal separately.'), 'Zugangsdaten-Satz fehlt')
    pruefe(!t.includes(KUNDENPORTAL_INVESTMENTS_URL), 'Portallink trotz fehlendem Zugang')
  })

  Deno.test(`${sprache}: Anhang bleibt angekündigt, Sie-Form, keine Gedankenstriche`, async () => {
    for (const portalZugang of [true, false, undefined]) {
      for (const extra of [{}, { widerrufWahl: 'abwarten', reservierungAb: '30.09.2026' }, { einheitVergeben: true }, { ohneGebuehr: true }]) {
        const daten = { ...GRUND, ...extra, sprache, portalZugang }
        const t = await text(daten)
        const betreff = template.subject(daten)
        pruefe(!/[–—]/.test(t + betreff), `Gedankenstrich in ${JSON.stringify(daten)}`)
        pruefe(t.includes(sprache === 'de' ? 'anbei erhalten Sie Ihre Reservierungsvereinbarung' : 'Please find attached your reservation agreement'), 'Anhangsatz fehlt')
        if (sprache === 'de') pruefe(!/\b(du|dein|deine|dich|dir)\b/i.test(t), 'Du-Form in der Vertragskopie')
      }
    }
  })
}

Deno.test('ohne Angabe zum Portal (gesperrt) kein Portalabsatz', async () => {
  const t = await text({ ...GRUND, sprache: 'de' })
  pruefe(!t.includes('Kundenportal'), 'Portalabsatz trotz fehlender Angabe')
})

Deno.test('portalZugangFuer erkennt Person 1, Person 2 und die Sperre', () => {
  pruefe(portalZugangFuer({ authUserId: 'u1' }, 'kaeufer1') === true, 'Person 1 mit Konto')
  pruefe(portalZugangFuer({}, 'kaeufer1') === false, 'Person 1 ohne Konto')
  pruefe(portalZugangFuer({ authUserId: 'u1' }, 'kaeufer2') === false, 'Person 2 erbt das Konto von Person 1 nicht')
  pruefe(portalZugangFuer({ person2: { authUserId: 'u2' } }, 'kaeufer2') === true, 'Person 2 mit Konto')
  pruefe(portalZugangFuer({ authUserId: 'u1', portalGesperrt: true }, 'kaeufer1') === undefined, 'gesperrt')
  pruefe(portalZugangFuer(null, 'kaeufer1') === false, 'ohne Meta')
})
