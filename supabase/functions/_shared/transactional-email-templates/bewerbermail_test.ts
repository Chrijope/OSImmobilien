/**
 * Deno-Test: Jede Mail an Bewerber rendert ohne Spam-Auslöser (26.09.2026).
 *
 *   deno test -A --no-lock supabase/functions/_shared/transactional-email-templates/bewerbermail_test.ts
 *
 * Ergänzt die Vitest-Prüfungen in `src/lib/bewerberAbsender.test.ts` und
 * `src/lib/bewerberMailTexte.test.ts`, die nur den Quelltext lesen können.
 * Hier wird jede Vorlage an Bewerber mit ihren Vorschaudaten gerendert und
 * geprüft:
 *
 *   - kein eigener Abmeldelink, den setzt Lovable selbst
 *   - keine Geldwörter wie „verdienen"
 *   - Links nur auf osimmobilien.netlify.app, bis auf die ausdrücklich erlaubten Ausnahmen
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './registry.ts'
import { istBewerbermail } from '../bewerber-absender.ts'

const GELDWOERTER = /verdien|geld verdienen|bis zur ersten provision/i

/**
 * Adressen außerhalb von osimmobilien.netlify.app, die in Bewerbermails noch stehen dürfen,
 * jeweils mit Grund. Wer hier etwas ergänzt, schreibt den Grund dazu.
 */
const ERLAUBTE_FREMDADRESSEN: Array<{ muster: RegExp; grund: string }> = [
  // Die Klickweiterleitung zum Startfahrplan-PDF. Ein Zählpixel gibt es seit
  // dem 26.09.2026 nicht mehr (Paragraf 25 TDDDG), siehe
  // src/lib/mailVorschauOhneZaehlpixel.test.ts.
  { muster: /\.supabase\.co\/functions\/v1\/track-bewerber-mail\?.*mode=click/, grund: 'Linkzählung Startfahrplan' },
  // Die Kalenderdatei kommt aus der Function get-ics. Lovable-Hosting kann
  // Pfade unter osimmobilien.netlify.app nicht an eine Function weiterreichen.
  { muster: /\.supabase\.co\/functions\/v1\/get-ics/, grund: 'Kalenderdatei' },
  // Profilbild der Ansprechpartnerin aus dem öffentlichen Speicher, aus
  // demselben Grund nicht über osimmobilien.netlify.app auslieferbar.
  { muster: /\.supabase\.co\/storage\/v1\/object\/public\/avatars\//, grund: 'Profilbild' },
  // Der Buchungskalender der HR-Managerin im alten Ablauf. Eine Buchungsseite
  // ohne persönlichen Link gibt es unter osimmobilien.netlify.app noch nicht.
  { muster: /^https:\/\/calendly\.com\/sarah-kaiser-thom-more\//, grund: 'Buchungskalender alter Ablauf' },
  // Platzhalter in den Vorschaudaten, geht nie hinaus.
  { muster: /^https:\/\/example\.com\//, grund: 'Vorschaudaten' },
]

function istMoreImmo(url: string): boolean {
  try {
    const host = new URL(url).hostname
    return host === 'osimmobilien.netlify.app' || host.endsWith('.osimmobilien.netlify.app')
  } catch {
    return false
  }
}

function adressen(html: string): string[] {
  return [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((t) => t[1].replace(/&amp;/g, '&'))
}

const bewerbermails = Object.keys(TEMPLATES).filter(istBewerbermail)

Deno.test('es gibt Bewerbermails zu prüfen', () => {
  if (bewerbermails.length < 15) throw new Error(`nur ${bewerbermails.length} Bewerbermails gefunden`)
})

for (const name of bewerbermails) {
  Deno.test(`${name}: ohne eigenen Abmeldelink, ohne Geldwörter, Links auf osimmobilien.netlify.app`, async () => {
    const eintrag = TEMPLATES[name]
    const daten = { ...(eintrag.previewData || {}), sprache: 'de' }
    const html = await renderAsync(React.createElement(eintrag.component, daten))
    const text = await renderAsync(React.createElement(eintrag.component, daten), { plainText: true })
    const betreff = typeof eintrag.subject === 'function' ? eintrag.subject(daten) : eintrag.subject

    if (html.includes('{{unsubscribe_url}}')) throw new Error(`${name}: eigener Abmeldelink im HTML`)
    if (/\bAbmelden\b/.test(text)) throw new Error(`${name}: „Abmelden" im Fuß`)

    const treffer = `${betreff}\n${text}`.match(GELDWOERTER)
    if (treffer) throw new Error(`${name}: Geldwort „${treffer[0]}" im Text`)

    for (const url of adressen(html)) {
      if (!/^https?:/.test(url)) continue // mailto:, tel:, Platzhalter
      if (istMoreImmo(url)) continue
      if (ERLAUBTE_FREMDADRESSEN.some((a) => a.muster.test(url))) continue
      throw new Error(`${name}: Link außerhalb von osimmobilien.netlify.app: ${url}`)
    }
  })
}

Deno.test('bewerber-nicht-erreicht: unterschreibt die HR-Ansprechpartnerin aus hrKontakt', async () => {
  const eintrag = TEMPLATES['bewerber-nicht-erreicht']
  const daten = {
    bewerberName: 'Max Mustermann',
    versuch: 5,
    // So kommt es von send-transactional-email, ermittelt über die Kennung.
    hrKontakt: { name: 'Sarah Kaiser-Thom', rolle: 'HR-Managerin', email: 'os@os-immobilien.com' },
    // Was ein alter Aufrufer mitschickt, verliert gegen hrKontakt.
    beraterName: 'Jana Anruferin',
  }
  // Der Textwandler bricht bei 80 Zeichen um; Leerraum zählt deshalb nicht.
  const text = (await renderAsync(React.createElement(eintrag.component, daten), { plainText: true }))
    .replace(/\s+/g, ' ')
  if (!text.includes('Sarah Kaiser-Thom')) throw new Error('Sarah fehlt in der Unterschrift')
  if (text.includes('Jana Anruferin')) throw new Error('Die anrufende Person steht in der Unterschrift')
  if (!text.includes('schreiben dir dazu aber nicht mehr')) throw new Error('Text der letzten Mail fehlt')
})
