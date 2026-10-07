/**
 * Deno-Test: Jede Kundenvorlage rendert auf Englisch ohne deutsche Reste.
 *
 * Ergänzt den Vitest-Wächter `src/lib/mailSpracheWaechter.test.ts`. Vitest kann
 * die Vorlagen nicht laden (sie holen React über `npm:`), deshalb prüft er nur
 * den Quelltext. Dieser Test rendert wirklich, mit den Vorschaudaten jeder
 * Vorlage, in beiden Sprachen:
 *
 *   deno test -A --no-lock supabase/functions/_shared/transactional-email-templates/sprache_test.ts
 *
 * Aus dem gerenderten Text werden alle Werte der Vorschaudaten entfernt, denn
 * Namen, Adressen und Dokumentnamen aus dem CRM bleiben bewusst, wie sie sind.
 * Was danach noch nach Deutsch aussieht, ist ein vergessener Vorlagentext.
 */
import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { TEMPLATES } from './registry.ts'
import { KUNDENVORLAGEN_OHNE_EN, VORLAGEN_ZIELGRUPPE } from './_zielgruppe.ts'

/** Wörter, die in einem englischen Mailtext nicht vorkommen dürfen. */
const DEUTSCH = /\b(Hallo|Guten Tag|Sehr geehrte|Uhr|Ihre?|Ihnen|Sie|dein|deine|deinen|deinem|dich|dir|bitte|Bitte|und|oder|für|nicht|Termin|Impressum|Datenschutz|Abmelden|Ansprechpartner|Unterschrift|Unterlagen|Minuten|Stunden|Kundenportal|Nachricht|gültig|Wohnung)\b/

function werte(obj: unknown, sammlung: string[] = []): string[] {
  // Mehrzeilige Werte bricht die Vorlage um (etwa die Terminbeschreibung), deshalb auch Zeile fuer Zeile.
  if (typeof obj === 'string') sammlung.push(obj, ...obj.split(/\n+/).map((z) => z.trim()).filter(Boolean))
  else if (Array.isArray(obj)) obj.forEach((o) => werte(o, sammlung))
  else if (obj && typeof obj === 'object') Object.values(obj).forEach((o) => werte(o, sammlung))
  return sammlung
}

const kundenvorlagen = Object.keys(VORLAGEN_ZIELGRUPPE).filter(
  (name) => VORLAGEN_ZIELGRUPPE[name] === 'kunde' && !(name in KUNDENVORLAGEN_OHNE_EN),
)

for (const name of kundenvorlagen) {
  Deno.test(`${name}: Englisch ohne deutsche Reste`, async () => {
    const eintrag = TEMPLATES[name]
    if (!eintrag) throw new Error(`${name} fehlt in der Registry`)
    if (!eintrag.sprachen?.includes('en')) throw new Error(`${name} meldet kein Englisch`)
    if (!eintrag.previewData) throw new Error(`${name} hat keine Vorschaudaten`)
    const daten = { ...eintrag.previewData, sprache: 'en' }
    const html = await renderAsync(React.createElement(eintrag.component, daten))
    if (!/<html[^>]*\slang="en"/.test(html)) throw new Error(`${name}: <html lang="en"> fehlt`)
    let text = await renderAsync(React.createElement(eintrag.component, daten), { plainText: true })
    const betreff = typeof eintrag.subject === 'function' ? eintrag.subject(daten) : eintrag.subject
    // Der Textwandler bricht bei 80 Zeichen um; Leerraum zählt deshalb nicht.
    const eng = (t: string) => t.replace(/\s+/g, ' ')
    text = eng(`${betreff}\n${text}`)
    // Daten aus dem CRM bleiben deutsch, sie zählen nicht.
    for (const w of werte(eintrag.previewData).map(eng).sort((a, b) => b.length - a.length)) {
      if (w.length > 2) text = text.split(w).join(' ')
    }
    // Die feste Anschrift im Fuß ist ein Eigenname.
    text = text.replace(/Wendelsteinstraße 19, 83075 Bad Feilnbach/g, '')
    const treffer = text.match(new RegExp(DEUTSCH, 'g'))
    if (treffer) throw new Error(`${name}: deutsche Wörter im Englischen: ${[...new Set(treffer)].join(', ')}\n${text}`)
  })

  Deno.test(`${name}: Deutsch unverändert mit <html lang="de">`, async () => {
    const eintrag = TEMPLATES[name]
    const html = await renderAsync(React.createElement(eintrag.component, eintrag.previewData ?? {}))
    if (!/<html[^>]*\slang="de"/.test(html)) throw new Error(`${name}: <html lang="de"> fehlt`)
  })
}
