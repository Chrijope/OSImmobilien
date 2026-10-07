import * as React from 'npm:react@18.3.1'
import { Link } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Luft, T, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { antwortAn, antwortLink, betreffMitAbsender, istTeam, partnerVorname } from './_nicht-erreicht.ts'

/**
 * Mail 1 von 3 an einen nicht erreichten Lead: nach dem ersten verpassten
 * Anruf.
 *
 * Gesicht und Wahl statt Druck. Der zuständige Partner stellt sich vor, nennt
 * seine Nummer, damit der Lead den nächsten Anruf zuordnen kann, und bietet
 * zwei gleichwertige Wege an: selbst einen Termin buchen oder dem Partner
 * kurz ein Zeitfenster schreiben. Weil die Mail von noreply@ kommt, steht
 * seine Adresse ausdrücklich im Text, als mailto-Link mit fertigem Betreff
 * (Christian, 26.09.2026). Absender, Antwortadresse und Unterschrift setzt
 * send-transactional-email über `absender: 'zustaendiger-partner'`.
 *
 * Ist niemand zuständig, schreibt das Haus als "wir".
 */

interface Props {
  name?: string
  buchungsLink?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (vorname: string) => betreffMitAbsender(vorname, 'kurz verpasst', 'de'),
  augenbraue: 'Anruf verpasst',
  titel: (team: boolean) => (team ? 'Wir haben es gerade bei dir versucht' : 'Ich habe es gerade bei dir versucht'),
  vorschau: (team: boolean) =>
    `Such dir einen Termin aus oder schreib ${team ? 'uns' : 'mir'} kurz, wann es dir passt.`,
  vorstellung: (team: boolean, name: string) =>
    team
      ? 'wir haben gerade versucht, dich anzurufen. Du hattest dich bei uns gemeldet, und wir wollten uns kurz persönlich bei dir melden.'
      : `ich bin ${name} von MOREImmo und habe gerade versucht, dich anzurufen. Du hattest dich bei uns gemeldet, und ich wollte mich kurz persönlich bei dir vorstellen.`,
  nummer: (team: boolean, tel: string) =>
    team
      ? `Falls du zurückrufen magst: Du erreichst uns unter ${tel}.`
      : `Damit du meine Nummer beim nächsten Mal zuordnen kannst: Du erreichst mich direkt unter ${tel}.`,
  // Vor und nach der Adresse, die als mailto-Link dazwischen steht. Die Mail
  // kommt von noreply@, deshalb nennt sie ausdrücklich, wohin man schreibt.
  wahlMitLink: (team: boolean) =>
    team
      ? { vor: 'Mach es dir so einfach, wie es dir passt: Such dir direkt einen Termin aus, oder schreib uns kurz an ', nach: ', wann es dir passt, dann rufen wir genau dann an.' }
      : { vor: 'Mach es dir so einfach, wie es dir passt: Such dir direkt einen Termin in meinem Kalender aus, oder schreib mir kurz an ', nach: ', wann es dir passt, dann rufe ich genau dann an.' },
  wahlOhneLink: (team: boolean) =>
    team
      ? { vor: 'Schreib uns einfach kurz an ', nach: ', wann es dir passt, dann rufen wir genau dann an.' }
      : { vor: 'Schreib mir einfach kurz an ', nach: ', wann es dir passt, dann rufe ich genau dann an.' },
  knopfTermin: 'Termin aussuchen',
  hinweisTermin: '15 bis 30 Minuten, du wählst Tag und Uhrzeit',
  knopfZeitfenster: 'Zeitfenster nennen',
  hinweisZeitfenster: (team: boolean) => `Zwei Zeitfenster genügen, ${team ? 'wir richten uns' : 'ich richte mich'} nach dir`,
  nebenZeitfenster: 'Lieber ein Zeitfenster per Mail nennen',
  antwortBetreff: 'Mein Wunschtermin für den Rückruf',
  antwortText: (team: boolean) => (team ? 'Am besten erreicht ihr mich am ' : 'Am besten erreichst du mich am '),
  schluss: (team: boolean) =>
    team
      ? 'Und wenn es gerade gar nicht passt, ist das auch in Ordnung. Schreib uns kurz, dann melden wir uns zu einem besseren Zeitpunkt.'
      : 'Und wenn es gerade gar nicht passt, ist das auch in Ordnung. Schreib mir kurz, dann melde ich mich zu einem besseren Zeitpunkt.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (vorname: string) => betreffMitAbsender(vorname, 'just missed you', 'en'),
    augenbraue: 'Missed call',
    titel: (team: boolean) => (team ? 'We just tried to call you' : 'I just tried to call you'),
    vorschau: (team: boolean) =>
      `Pick a time that suits you or drop ${team ? 'us' : 'me'} a line saying when works for you.`,
    vorstellung: (team: boolean, name: string) =>
      team
        ? 'We just tried to call you. You got in touch with us, and we wanted to say hello in person.'
        : `I am ${name} from MOREImmo and I just tried to call you. You got in touch with us, and I wanted to introduce myself in person.`,
    nummer: (team: boolean, tel: string) =>
      team
        ? `If you would like to call back, you can reach us on ${tel}.`
        : `So you recognise my number next time: you can reach me directly on ${tel}.`,
    wahlMitLink: (team: boolean) =>
      team
        ? { vor: 'Do whatever is easiest for you: pick a time right away, or drop us a line at ', nach: ' saying when suits you and we will call you exactly then.' }
        : { vor: 'Do whatever is easiest for you: pick a time in my calendar right away, or drop me a line at ', nach: ' saying when suits you and I will call you exactly then.' },
    wahlOhneLink: (team: boolean) =>
      team
        ? { vor: 'Simply drop us a line at ', nach: ' saying when suits you and we will call you exactly then.' }
        : { vor: 'Simply drop me a line at ', nach: ' saying when suits you and I will call you exactly then.' },
    knopfTermin: 'Pick a time',
    hinweisTermin: '15 to 30 minutes, you choose the day and time',
    knopfZeitfenster: 'Suggest a time',
    hinweisZeitfenster: (team: boolean) => `Two time slots are enough, ${team ? 'we' : 'I'} will fit in with you`,
    nebenZeitfenster: 'Rather suggest a time by email',
    antwortBetreff: 'My preferred time for a call back',
    antwortText: (_team: boolean) => 'The best time to reach me is ',
    schluss: (team: boolean) =>
      team
        ? 'And if now is not a good time at all, that is fine too. Just let us know and we will get back to you at a better moment.'
        : 'And if now is not a good time at all, that is fine too. Just let me know and I will get back to you at a better moment.',
  },
}

const Mail = ({ name, buchungsLink, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const team = istTeam(berater)
  const partnerName = (berater?.name || '').trim()
  const tel = (berater?.telefon || '').trim()
  const link = (buchungsLink || '').trim()
  // Die Adresse des zuständigen Partners, ohne Partner office@. Alle Wege
  // zum Zeitfenster gehen per mailto dorthin, nicht als Antwort auf noreply@.
  const partnerAdresse = antwortAn(berater)
  const zeitfensterLink = antwortLink(partnerAdresse, t.antwortBetreff, t.antwortText(team))
  const wahl = link ? t.wahlMitLink(team) : t.wahlOhneLink(team)

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(team)}
      vorschau={t.vorschau(team)}
      anrede={hallo(name, sprache)}
      person={berater}
    >
      <Absatz>{t.vorstellung(team, partnerName)}</Absatz>

      {tel && <Absatz>{t.nummer(team, tel)}</Absatz>}

      <Absatz letzter>
        {wahl.vor}
        <Link href={zeitfensterLink} className="mi-link" style={{ color: T.blauLink, textDecoration: 'underline' }}>
          {partnerAdresse}
        </Link>
        {wahl.nach}
      </Absatz>

      {link ? (
        <>
          <Handlung sprache={sprache} href={link} text={t.knopfTermin} hinweis={t.hinweisTermin} />
          <Nebenhandlung href={zeitfensterLink} text={t.nebenZeitfenster} />
        </>
      ) : (
        <Handlung
          sprache={sprache}
          href={zeitfensterLink}
          text={t.knopfZeitfenster}
          hinweis={t.hinweisZeitfenster(team)}
        />
      )}

      <Luft hoehe={28} />
      <Absatz letzter>{t.schluss(team)}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(partnerVorname(data?.berater)),
  displayName: 'Lead nicht erreicht: Mail 1 (nach dem 1. Anruf)',
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
