import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const RUECKFALL_MAIL = 'info@more.immo'

interface Props {
  kundeName?: string
  ansprechpartnerName?: string
  ansprechpartnerEmail?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (ap: string) =>
    ap
      ? `Vielleicht passt es jetzt nicht, ${ap.split(' ')[0]} bleibt für dich da`
      : 'Vielleicht passt es jetzt nicht, wir bleiben für dich da',
  augenbraue: 'Danke für deine Rückmeldung',
  titel: 'Dann bleiben wir für dich da',
  vorschau: 'Aktuell passt es nicht. Wenn sich das ändert, sind wir da.',
  danke: (ap: string) =>
    `danke für deine ehrliche Rückmeldung${ap ? ` an ${ap}` : ''}. Aktuell ist ein Immobilien-Investment für dich kein Thema, und das ist völlig in Ordnung.`,
  aendern:
    'Lebenssituationen ändern sich. Vermögensaufbau und Steueroptimierung gewinnen oft plötzlich wieder an Priorität. Sollte das bei dir so sein, genügt eine kurze Nachricht.',
  knopf: (vorname: string) => (vorname ? `${vorname} schreiben` : 'Uns schreiben'),
  hinweis: 'Ganz unverbindlich und ohne Druck',
  gruss:
    'Wir wünschen dir alles Gute auf deinem Weg und freuen uns, wenn wir irgendwann wieder voneinander hören.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (ap: string) =>
      ap
        ? `Perhaps now is not the right time, ${ap.split(' ')[0]} is still here for you`
        : 'Perhaps now is not the right time, we are still here for you',
    augenbraue: 'Thank you for letting us know',
    titel: 'We are still here for you',
    vorschau: 'It is not the right time at the moment. If that changes, we are here.',
    danke: (ap: string) =>
      `Thank you for your honest feedback${ap ? ` to ${ap}` : ''}. A property investment is not on your agenda at the moment, and that is completely fine.`,
    aendern:
      'Circumstances change. Building wealth and reducing your tax burden often suddenly become a priority again. If that happens to you, a short message is all it takes.',
    knopf: (vorname: string) => (vorname ? `Write to ${vorname}` : 'Write to us'),
    hinweis: 'With no obligation and no pressure',
    gruss: 'We wish you all the best and would be glad to hear from you again one day.',
  },
}

const Mail = ({ kundeName, ansprechpartnerName, ansprechpartnerEmail, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const apName = ansprechpartnerName?.trim() || berater?.name?.trim() || ''
  const apMail = ansprechpartnerEmail?.trim() || berater?.email?.trim() || RUECKFALL_MAIL
  const apVorname = apName ? apName.split(' ')[0] : ''
  const person: Ansprechpartner = {
    ...(berater || {}),
    name: apName || berater?.name,
    email: apMail,
  }

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={person}
    >
      <Absatz>{t.danke(apName)}</Absatz>

      <Absatz letzter>{t.aendern}</Absatz>

      <Handlung sprache={sprache} href={`mailto:${apMail}`} text={t.knopf(apVorname)} hinweis={t.hinweis} />

      <Absatz>{t.gruss}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff((data?.ansprechpartnerName || '').toString().trim()),
  displayName: 'VP: Kein Interesse (personalisiert)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    ansprechpartnerName: 'Anna Berater',
    ansprechpartnerEmail: 'anna@more.immo',
    berater: {
      name: 'Anna Berater',
      rolle: 'Deine Ansprechpartnerin bei MOREImmo',
      telefon: '08061 000000',
      email: 'anna@more.immo',
    },
  },
} satisfies TemplateEntry
