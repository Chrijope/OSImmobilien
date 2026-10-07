import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Luft, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { antwortAn, antwortLink, betreffMitAbsender, istTeam, partnerVorname } from './_nicht-erreicht.ts'

/**
 * Mail 3 von 3 an einen nicht erreichten Lead: nach dem zehnten verpassten
 * Anruf. Die letzte.
 *
 * Ein ehrlicher Abschluss statt eines weiteren Anrufs. Der Lead bekommt die
 * Erlaubnis, Nein zu sagen, und genau das bringt viele zum Antworten. Zwei
 * fertige Antworten als mailto-Link, damit ein Klick und Senden genügt:
 * "später gern" als Knopf, "kein Interesse" leiser darunter. Beide gehen an
 * den zuständigen Partner, der die Antwort im CRM einträgt.
 */

interface Props {
  name?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (vorname: string) => betreffMitAbsender(vorname, 'soll ich das Thema schließen?', 'de'),
  betreffTeam: 'OS Immobilien: sollen wir das Thema schließen?',
  augenbraue: 'Kurze Frage',
  titel: (team: boolean) => (team ? 'Sollen wir das Thema schließen?' : 'Soll ich das Thema schließen?'),
  vorschau: (team: boolean) => `Ein Klick genügt, dann ${team ? 'wissen wir' : 'weiß ich'} Bescheid.`,
  ehrlich: (team: boolean) =>
    team
      ? 'wir haben dich jetzt mehrmals nicht erreicht und wollen dich nicht weiter anrufen. Das ist völlig in Ordnung, vielleicht passt das Thema gerade einfach nicht.'
      : 'ich habe dich jetzt mehrmals nicht erreicht und will dich nicht weiter anrufen. Das ist völlig in Ordnung, vielleicht passt das Thema gerade einfach nicht.',
  frage: (team: boolean) =>
    team
      ? 'Damit wir wissen, woran wir sind: Sollen wir das Thema schließen, oder passt es später besser?'
      : 'Damit ich weiß, woran ich bin: Soll ich das Thema schließen, oder passt es später besser?',
  knopfSpaeter: (team: boolean) => (team ? 'Später gern, meldet euch in drei Monaten' : 'Später gern, meld dich in drei Monaten'),
  hinweisSpaeter: 'Öffnet eine fertige Antwort, du musst nur noch senden',
  betreffSpaeter: 'Später gern',
  textSpaeter: (team: boolean) =>
    team
      ? 'Später gern, meldet euch bitte in drei Monaten noch einmal bei mir.'
      : 'Später gern, meld dich bitte in drei Monaten noch einmal bei mir.',
  knopfSchliessen: 'Kein Interesse, bitte schließen',
  betreffSchliessen: 'Bitte schließen',
  textSchliessen: 'Ich habe aktuell kein Interesse, bitte schließ das Thema.',
  schluss: (team: boolean) =>
    team
      ? 'Und falls du doch sprechen möchtest: Antworte einfach kurz auf diese Mail, dann melden wir uns.'
      : 'Und falls du doch sprechen möchtest: Antworte einfach kurz auf diese Mail, dann melde ich mich.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (vorname: string) => betreffMitAbsender(vorname, 'shall I close this?', 'en'),
    betreffTeam: 'OS Immobilien: shall we close this?',
    augenbraue: 'Quick question',
    titel: (team: boolean) => (team ? 'Shall we close this?' : 'Shall I close this?'),
    vorschau: (team: boolean) => `One click is enough and ${team ? 'we' : 'I'} will know where we stand.`,
    ehrlich: (team: boolean) =>
      team
        ? 'We have not been able to reach you several times now and do not want to keep calling you. That is completely fine, perhaps the topic just does not suit you right now.'
        : 'I have not been able to reach you several times now and do not want to keep calling you. That is completely fine, perhaps the topic just does not suit you right now.',
    frage: (team: boolean) =>
      `So ${team ? 'we know' : 'I know'} where we stand: shall ${team ? 'we' : 'I'} close this, or would a later time suit you better?`,
    knopfSpaeter: (_team: boolean) => 'Later is fine, get back to me in three months',
    hinweisSpaeter: 'Opens a ready-made reply, you just need to send it',
    betreffSpaeter: 'Later is fine',
    textSpaeter: (_team: boolean) => 'Later is fine, please get back to me in three months.',
    knopfSchliessen: 'Not interested, please close it',
    betreffSchliessen: 'Please close it',
    textSchliessen: 'I am not interested at the moment, please close the topic.',
    schluss: (team: boolean) =>
      team
        ? 'And if you would like to talk after all, simply reply to this email and we will get back to you.'
        : 'And if you would like to talk after all, simply reply to this email and I will get back to you.',
  },
}

const Mail = ({ name, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const team = istTeam(berater)
  const an = antwortAn(berater)

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(team)}
      vorschau={t.vorschau(team)}
      anrede={hallo(name, sprache)}
      person={berater}
    >
      <Absatz>{t.ehrlich(team)}</Absatz>

      <Absatz letzter>{t.frage(team)}</Absatz>

      <Handlung
        sprache={sprache}
        href={antwortLink(an, t.betreffSpaeter, t.textSpaeter(team))}
        text={t.knopfSpaeter(team)}
        hinweis={t.hinweisSpaeter}
      />
      <Nebenhandlung href={antwortLink(an, t.betreffSchliessen, t.textSchliessen)} text={t.knopfSchliessen} />

      <Luft hoehe={28} />
      <Absatz letzter>{t.schluss(team)}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const t = texteFuer(TEXTE, data?.sprache)
    const vorname = partnerVorname(data?.berater)
    return vorname ? t.betreff(vorname) : t.betreffTeam
  },
  displayName: 'Lead nicht erreicht: Mail 3 (nach dem 10. Anruf, Abschluss)',
  sprachen: DE_EN,
  absender: 'zustaendiger-partner',
  previewData: {
    name: 'Max Mustermann',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '+49 151 00000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
