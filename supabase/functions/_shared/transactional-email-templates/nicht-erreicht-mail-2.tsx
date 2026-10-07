import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { antwortAn, antwortLink, betreffMitAbsender, istTeam, partnerVorname } from './_nicht-erreicht.ts'

/**
 * Mail 2 von 3 an einen nicht erreichten Lead: nach dem vierten verpassten
 * Anruf.
 *
 * Bewusst kurz und bewusst anders als Mail 1. Keine Vorstellung mehr, kein
 * zweites Mal derselbe Text, nur ein Satz Erinnerung und der Termin als
 * bequemere Alternative zum Anruf. Wer dieselbe Mail zweimal bekommt, fühlt
 * sich abgearbeitet.
 */

interface Props {
  name?: string
  buchungsLink?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (vorname: string) => betreffMitAbsender(vorname, 'noch einmal kurz', 'de'),
  augenbraue: 'Kurze Erinnerung',
  titel: (team: boolean) => (team ? 'Wir melden uns noch einmal' : 'Ich melde mich noch einmal'),
  vorschau: 'Wenn dir ein fester Termin lieber ist als ein Anruf, such ihn dir einfach aus.',
  text: (team: boolean) =>
    team
      ? 'wir haben noch ein paar Mal versucht, dich zu erreichen. Vielleicht ist ein fester Termin für dich einfacher als ein Anruf zu irgendeiner Zeit.'
      : 'ich habe noch ein paar Mal versucht, dich zu erreichen. Vielleicht ist ein fester Termin für dich einfacher als ein Anruf zu irgendeiner Zeit.',
  mitLink: 'Wenn es dir lieber ist, such dir hier einen aus, der in deine Woche passt.',
  ohneLink: (team: boolean) =>
    `Schreib ${team ? 'uns' : 'mir'} kurz, wann es dir passt, dann ${team ? 'rufen wir' : 'rufe ich'} genau dann an.`,
  knopfTermin: 'Termin aussuchen',
  hinweisTermin: '15 bis 30 Minuten, du wählst Tag und Uhrzeit',
  knopfZeitfenster: 'Zeitfenster nennen',
  antwortBetreff: 'Mein Wunschtermin für den Rückruf',
  antwortText: (team: boolean) => (team ? 'Am besten erreicht ihr mich am ' : 'Am besten erreichst du mich am '),
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (vorname: string) => betreffMitAbsender(vorname, 'one more try', 'en'),
    augenbraue: 'Quick reminder',
    titel: (_team: boolean) => 'Getting in touch once more',
    vorschau: 'If a fixed appointment suits you better than a call, simply pick one.',
    text: (team: boolean) =>
      team
        ? 'We have tried to reach you a few more times. Perhaps a fixed appointment is easier for you than a call at a random time.'
        : 'I have tried to reach you a few more times. Perhaps a fixed appointment is easier for you than a call at a random time.',
    mitLink: 'If you prefer, pick one here that fits into your week.',
    ohneLink: (team: boolean) =>
      `Drop ${team ? 'us' : 'me'} a line saying when suits you and ${team ? 'we' : 'I'} will call you exactly then.`,
    knopfTermin: 'Pick a time',
    hinweisTermin: '15 to 30 minutes, you choose the day and time',
    knopfZeitfenster: 'Suggest a time',
    antwortBetreff: 'My preferred time for a call back',
    antwortText: (_team: boolean) => 'The best time to reach me is ',
  },
}

const Mail = ({ name, buchungsLink, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const team = istTeam(berater)
  const link = (buchungsLink || '').trim()

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(team)}
      vorschau={t.vorschau}
      anrede={hallo(name, sprache)}
      person={berater}
    >
      <Absatz letzter>{`${t.text(team)} ${link ? t.mitLink : t.ohneLink(team)}`}</Absatz>

      {link ? (
        <Handlung sprache={sprache} href={link} text={t.knopfTermin} hinweis={t.hinweisTermin} />
      ) : (
        <Handlung
          sprache={sprache}
          href={antwortLink(antwortAn(berater), t.antwortBetreff, t.antwortText(team))}
          text={t.knopfZeitfenster}
        />
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(partnerVorname(data?.berater)),
  displayName: 'Lead nicht erreicht: Mail 2 (nach dem 4. Anruf)',
  sprachen: DE_EN,
  absender: 'zustaendiger-partner',
  previewData: {
    name: 'Max Mustermann',
    buchungsLink: 'https://portal.more.immo/buchen/beispiel',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei MOREImmo',
      telefon: '+49 151 00000000',
      email: 'office@more.immo',
    },
  },
} satisfies TemplateEntry
