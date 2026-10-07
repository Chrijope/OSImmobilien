import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const RUECKFALL_MAIL = 'os@os-immobilien.com'

interface Props {
  kundeName?: string
  telefon?: string
  ansprechpartnerEmail?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Deine Rufnummer scheint nicht korrekt zu sein',
  augenbraue: 'Rufnummer prüfen',
  titel: 'Deine Nummer scheint nicht zu stimmen',
  vorschau: 'Wir konnten dich nicht erreichen. Schick uns kurz deine richtige Rufnummer.',
  keineNummer: '(keine Nummer hinterlegt)',
  text: 'wir haben mehrfach versucht, dich telefonisch zu erreichen. Die bei uns hinterlegte Nummer scheint nicht korrekt zu sein.',
  mailBetreff: 'Meine korrekte Rufnummer',
  knopf: 'Richtige Rufnummer senden',
  hinweis: 'Eine kurze Antwort genügt, wir melden uns zeitnah',
  versuchtTitel: 'Versucht haben wir',
  rufnummer: 'Rufnummer',
  interesse:
    'Wenn du weiterhin Interesse an einem Immobilien-Investment hast, sei es zum Vermögensaufbau, zur Steueroptimierung oder für andere Ziele, nehmen wir mit deiner richtigen Nummer gerne wieder Kontakt auf.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your phone number does not seem to be correct',
    augenbraue: 'Please check your number',
    titel: 'Your number does not seem to be right',
    vorschau: 'We were unable to reach you. Please send us your correct phone number.',
    keineNummer: '(no number on file)',
    text: 'We have tried several times to reach you by phone. The number we have on file does not seem to be correct.',
    mailBetreff: 'My correct phone number',
    knopf: 'Send the correct number',
    hinweis: 'A short reply is enough, we will get back to you soon',
    versuchtTitel: 'The number we tried',
    rufnummer: 'Phone number',
    interesse:
      'If you are still interested in a property investment, whether to build wealth, to reduce your tax burden or for other goals, we will be glad to get back in touch using your correct number.',
  },
}

const Mail = ({ kundeName, telefon, ansprechpartnerEmail, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const tel = telefon?.trim() || t.keineNummer
  const antwortMail = ansprechpartnerEmail?.trim() || berater?.email?.trim() || RUECKFALL_MAIL

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz letzter>{t.text}</Absatz>

      <Handlung
        sprache={sprache}
        href={`mailto:${antwortMail}?subject=${encodeURIComponent(t.mailBetreff)}`}
        text={t.knopf}
        hinweis={t.hinweis}
      />

      <Angaben titel={t.versuchtTitel} zeilen={[[t.rufnummer, tel]]} />

      <Absatz>{t.interesse}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Setter: Daten falsch',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    telefon: '+49 89 0000000',
    ansprechpartnerEmail: 'beraterin@os-immobilien.com',
    berater: {
      name: 'Anna Berater',
      rolle: 'Deine Ansprechpartnerin bei OS Immobilien',
      telefon: '08061 000000',
      email: 'beraterin@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
