import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const RUECKFALL_MAIL = 'os@os-immobilien.com'

interface Props {
  kundeName?: string
  telefon?: string
  ansprechpartnerName?: string
  ansprechpartnerEmail?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (ap: string) =>
    ap ? `${ap} konnte dich nicht erreichen, stimmt deine Rufnummer?` : 'Deine Rufnummer scheint nicht korrekt zu sein',
  augenbraue: 'Rufnummer prüfen',
  titel: 'Deine Nummer scheint nicht zu stimmen',
  vorschau: 'Der Anruf kam nicht durch. Schick kurz deine richtige Rufnummer.',
  keineNummer: '(keine Nummer hinterlegt)',
  text: (ap: string) =>
    `${ap ? `dein persönlicher Ansprechpartner ${ap} hat` : 'wir haben'} mehrfach versucht, dich telefonisch zu erreichen. Die bei uns hinterlegte Nummer scheint nicht korrekt zu sein.`,
  mailBetreff: 'Meine korrekte Rufnummer',
  knopf: 'Richtige Rufnummer senden',
  hinweis: (vorname: string) => (vorname ? `${vorname} meldet sich dann persönlich bei dir` : 'Wir melden uns zeitnah'),
  versuchtTitel: 'Versucht wurde',
  rufnummer: 'Rufnummer',
  interesse:
    'Wenn du weiterhin Interesse an einem Immobilien-Investment hast, sei es zum Vermögensaufbau, zur Steueroptimierung oder für andere Ziele, genügt eine kurze Antwort mit deiner richtigen Nummer.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (ap: string) =>
      ap ? `${ap} could not reach you: is your phone number correct?` : 'Your phone number does not seem to be correct',
    augenbraue: 'Please check your number',
    titel: 'Your number does not seem to be right',
    vorschau: 'The call did not get through. Please send us your correct phone number.',
    keineNummer: '(no number on file)',
    text: (ap: string) =>
      `${ap ? `Your personal contact person ${ap} has` : 'We have'} tried several times to reach you by phone. The number we have on file does not seem to be correct.`,
    mailBetreff: 'My correct phone number',
    knopf: 'Send the correct number',
    hinweis: (vorname: string) => (vorname ? `${vorname} will then get in touch with you personally` : 'We will get back to you soon'),
    versuchtTitel: 'The number we tried',
    rufnummer: 'Phone number',
    interesse:
      'If you are still interested in a property investment, whether to build wealth, to reduce your tax burden or for other goals, a short reply with your correct number is all it takes.',
  },
}

const Mail = ({ kundeName, telefon, ansprechpartnerName, ansprechpartnerEmail, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const tel = telefon?.trim() || t.keineNummer
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
      <Absatz letzter>{t.text(apName)}</Absatz>

      <Handlung
        sprache={sprache}
        href={`mailto:${apMail}?subject=${encodeURIComponent(t.mailBetreff)}`}
        text={t.knopf}
        hinweis={t.hinweis(apVorname)}
      />

      <Angaben titel={t.versuchtTitel} zeilen={[[t.rufnummer, tel]]} />

      <Absatz>{t.interesse}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff((data?.ansprechpartnerName || '').toString().trim()),
  displayName: 'VP: Daten falsch (personalisiert)',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    telefon: '+49 89 0000000',
    ansprechpartnerName: 'Anna Berater',
    ansprechpartnerEmail: 'os@os-immobilien.com',
    berater: {
      name: 'Anna Berater',
      rolle: 'Deine Ansprechpartnerin bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
