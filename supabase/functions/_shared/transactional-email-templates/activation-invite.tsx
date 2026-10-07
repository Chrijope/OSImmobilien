import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung } from './_layout.tsx'
import { normalisiereSprache, type Sprache } from '../kunden-sprache.ts'
import { DE_EN } from './_sprache.ts'
import { hallo } from './_anrede.ts'

/*
 * Die Einladung ins Kundenportal (M29), Deutsch und Englisch.
 *
 * Plan Kundensprache vom 25.09.2026, Etappe 1: `invite-user` gibt die
 * Sprache aus dem Kundenprofil als `sprache` mit. Fehlt sie (Partner,
 * Mitarbeiter, ältere Aufrufer), bleibt die Mail deutsch wie bisher.
 *
 * Kopf, Fuss und Unterschrift kommen aus `_layout.tsx`. Die übersetzt
 * Etappe 2; bis dahin stehen dort Impressum und Datenschutz noch deutsch.
 */

interface Props {
  name?: string
  activationUrl?: string
  gueltigBis?: string
  sprache?: Sprache | string
}

const TEXTE = {
  de: {
    betreff: 'Dein Zugang zu MOREImmo',
    augenbraue: 'Willkommen',
    titel: 'Dein Zugang zu MOREImmo',
    vorschau: 'Richte deinen Zugang ein, es dauert zwei Minuten.',
    absatz:
      'du wurdest zu MOREImmo eingeladen. Über den Knopf unten richtest du dein Passwort ein und kannst sofort loslegen.',
    knopf: 'Zugang einrichten',
    hinweis: (gueltigBis?: string) =>
      `Etwa 2 Minuten${gueltigBis ? `  ·  Link gültig bis ${gueltigBis}` : '  ·  Link 7 Tage gültig'}`,
  },
  en: {
    betreff: 'Your access to MOREImmo',
    augenbraue: 'Welcome',
    titel: 'Your access to MOREImmo',
    vorschau: 'Set up your access, it only takes two minutes.',
    absatz:
      "you've been invited to MOREImmo. Use the button below to set your password, and you can get started straight away.",
    knopf: 'Set up access',
    hinweis: (gueltigBis?: string) =>
      `About 2 minutes${gueltigBis ? `  ·  Link valid until ${gueltigBis}` : '  ·  Link valid for 7 days'}`,
  },
} as const

const texteFuer = (sprache: unknown) => TEXTE[normalisiereSprache(sprache) ?? 'de']

const Mail = ({ name, activationUrl, gueltigBis, sprache: spracheEingabe }: Props) => {
  const sprache = normalisiereSprache(spracheEingabe) ?? 'de'
  const t = texteFuer(sprache)
  return (
    <EmailLayout
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      // Nur der Vorname, wie in allen Du-Mails ("Hallo Julian,").
      anrede={hallo(name, sprache)}
      intern
      sprache={sprache}
    >
      <Absatz letzter>{t.absatz}</Absatz>

      <Handlung href={activationUrl || ''} text={t.knopf} hinweis={t.hinweis(gueltigBis)} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(data?.sprache).betreff,
  displayName: 'Konto-Aktivierung',
  // Etappe 1 und 2 zusammengeführt: die Einladung folgt der Kundensprache.
  sprachen: DE_EN,
  previewData: {
    name: 'Julian Meyer',
    activationUrl: 'https://portal.more.immo/activate/example',
    gueltigBis: '5. August 2026',
  },
} satisfies TemplateEntry
