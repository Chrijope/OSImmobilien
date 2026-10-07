import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, mitSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const VP_LANDING_URL = 'https://osimmobilien.netlify.app/vp/christian-peetz'

interface Props {
  kundeName?: string
  landingUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Vielleicht passt es jetzt nicht, wir bleiben für dich da',
  augenbraue: 'Danke für deine Rückmeldung',
  titel: 'Dann bleiben wir für dich da',
  vorschau: 'Aktuell passt es nicht. Wenn sich das ändert, sind wir da.',
  danke:
    'danke für deine ehrliche Rückmeldung. Aktuell ist ein Immobilien-Investment für dich kein Thema, und das ist völlig in Ordnung.',
  aendern:
    'Lebenssituationen ändern sich. Vermögensaufbau und Steueroptimierung gewinnen oft plötzlich wieder an Priorität. Sollte das bei dir so sein, kannst du dich jederzeit unverbindlich neu informieren.',
  knopf: 'Später unverbindlich informieren',
  hinweis: 'Kein Druck, keine Verpflichtung',
  gruss:
    'Wir wünschen dir alles Gute auf deinem Weg und freuen uns, wenn wir irgendwann wieder voneinander hören.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Perhaps now is not the right time, we are still here for you',
    augenbraue: 'Thank you for letting us know',
    titel: 'We are still here for you',
    vorschau: 'It is not the right time at the moment. If that changes, we are here.',
    danke:
      'Thank you for your honest feedback. A property investment is not on your agenda at the moment, and that is completely fine.',
    aendern:
      'Circumstances change. Building wealth and reducing your tax burden often suddenly become a priority again. If that happens to you, you are welcome to find out more at any time, with no obligation.',
    knopf: 'Find out more later, no obligation',
    hinweis: 'No pressure, no commitment',
    gruss: 'We wish you all the best and would be glad to hear from you again one day.',
  },
}

const Mail = ({ kundeName, landingUrl, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz>{t.danke}</Absatz>

      <Absatz letzter>{t.aendern}</Absatz>

      <Handlung
        sprache={sprache}
        href={mitSprache(landingUrl || VP_LANDING_URL, sprache)}
        text={t.knopf}
        hinweis={t.hinweis}
      />

      <Absatz>{t.gruss}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Setter: Kein Interesse',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    landingUrl: VP_LANDING_URL,
    berater: {
      name: 'Anna Berater',
      rolle: 'Deine Ansprechpartnerin bei OS Immobilien',
      telefon: '08061 000000',
      email: 'beraterin@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
