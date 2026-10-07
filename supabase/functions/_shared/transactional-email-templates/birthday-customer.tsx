import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, type Ansprechpartner } from './_layout.tsx'
import { hallo, vornameAus } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  /** Der Vorname. Die Aufrufer schicken ihn bereits einzeln. */
  name?: string
  /** Kommen vom Aufrufer weiter mit, seit dem Du aber ohne Verwendung. */
  anrede?: string
  nachname?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  // Frueher stand hier "Herr Mustermann". Zum Du passt nur der Vorname.
  betreff: (vorname: string) =>
    vorname ? `Herzlichen Glückwunsch zum Geburtstag, ${vorname}` : 'Herzlichen Glückwunsch zum Geburtstag',
  augenbraue: 'Von uns allen',
  titel: 'Herzlichen Glückwunsch zum Geburtstag',
  vorschau: 'Alles Gute zu deinem Geburtstag von OS Immobilien.',
  heute: 'heute ist dein Geburtstag, und wir möchten die Gelegenheit nutzen, dir persönlich zu gratulieren.',
  wunsch:
    'Wir wünschen dir ein gutes neues Lebensjahr, Gesundheit und Zeit für die Dinge, die dir wichtig sind. Vielen Dank für dein Vertrauen.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (vorname: string) => (vorname ? `Happy birthday, ${vorname}` : 'Happy birthday'),
    augenbraue: 'From all of us',
    titel: 'Happy birthday',
    vorschau: 'Best wishes on your birthday from OS Immobilien.',
    heute: 'Today is your birthday, and we would like to take this opportunity to congratulate you personally.',
    wunsch:
      'We wish you a wonderful year ahead, good health and time for the things that matter to you. Thank you for your trust.',
  },
}

const Mail = ({ name, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(name, sprache)}
      person={berater}
    >
      <Absatz>{t.heute}</Absatz>
      <Absatz letzter>{t.wunsch}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff(vornameAus(data?.name)),
  displayName: 'Geburtstagsgruß (Kunde)',
  sprachen: DE_EN,
  previewData: {
    name: 'Max',
    anrede: 'Herr',
    nachname: 'Mustermann',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
