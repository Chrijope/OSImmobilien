import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Schritte, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, mitSprache, texteFuer, uhrzeitFuer, zeitraumFuer, type Zweisprachig } from './_sprache.ts'

const ANALYSE_BASIS_URL = 'https://portal.more.immo/analyse'

export interface ErinnerungProps {
  kundeName?: string
  /** Aeltere Felder, bevor es den gemeinsamen Ansprechpartner gab. */
  beraterName?: string
  /* Das Profilbild kam flach herein, die Vorlage las aber nur
     berater.bildUrl. Deshalb fehlte es in der Mail. */
  beraterBild?: string
  beraterEmail?: string
  beraterTelefon?: string
  beraterPosition?: string
  terminDatum?: string
  terminUhrzeit?: string
  /** "in 24 Stunden", "in 6 Stunden", "in einer Stunde". Englisch uebersetzt die Vorlage. */
  vorText?: string
  analyseUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

/**
 * Die Texte fuer alle drei Erinnerungen. Die 24h- und 6h-Vorlage leihen sich
 * Inhalt und Betreff von hier, die 1h-Vorlage hat einen eigenen, kuerzeren
 * Inhalt, aber dieselben Betreffzeilen und Beschriftungen.
 */
const DE = {
  betreff: (wann: string) => `Dein Erstgespräch ${wann || 'steht bevor'}`,
  betreff1h: 'Gleich geht es los, wir freuen uns auf dich',
  wannRueckfall: 'in Kürze',
  augenbraue: 'Dein Termin',
  augenbraue1h: 'Gleich geht es los',
  titel: (wann: string) => `Dein Erstgespräch ${wann}`,
  vorschau: (wann: string) => `Dein Erstgespräch ${wann}. Fünf Minuten Vorbereitung genügen.`,
  vorschau1h: 'Gleich geht es los. Wir freuen uns auf dich.',
  text: (wann: string) =>
    `${wann} sprechen wir gemeinsam über deinen Vermögensaufbau. Wenn du möchtest, bereite dich in fünf Minuten vor: die kurze Analyse zeigt dir selbst, welche Möglichkeiten du hast.`,
  text1h: (berater: string, wann: string) =>
    `${berater ? `${berater} freut sich` : 'wir freuen uns'} auf das Gespräch mit dir. ${wann} sprechen wir gemeinsam über deinen Vermögensaufbau, entspannt per Videogespräch.`,
  knopf: 'Analyse ausfüllen',
  knopf1h: 'Analyse noch schnell ausfüllen',
  hinweisKnopf: 'Etwa 5 Minuten  ·  Die Angaben bleiben bei dir',
  hinweisKnopf1h: 'Etwa 5 Minuten  ·  Freiwillig, die Angaben bleiben bei dir',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  berater: 'Dein Berater',
  terminTitel: 'Dein Termin',
  zugang:
    'Den Zugangslink zum Gespräch bekommst du separat von deinem Berater. Wenn du verschieben musst, genügt eine kurze Nachricht, wir finden einen neuen Termin.',
  zugang1h: 'Den Zugangslink zum Gespräch bekommst du separat von deinem Berater.',
  schritteTitel: 'Das erwartet dich im Gespräch',
  schritte: [
    'Etwa 30 bis 45 Minuten, entspannt per Videogespräch',
    'Wir hören zu: deine Ziele, deine Situation, deine Fragen',
    'Du bekommst Klarheit, ob und wie ein Immobilien-Investment zu dir passt',
    'Echte Zahlen statt Verkaufsshow',
    'Du entscheidest in deinem Tempo, ohne Druck und ohne Verpflichtung',
  ],
}

export const ERINNERUNG_TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (wann: string) => `Your initial consultation ${wann || 'is coming up'}`,
    betreff1h: 'Almost time, we look forward to speaking with you',
    wannRueckfall: 'shortly',
    augenbraue: 'Your appointment',
    augenbraue1h: 'Almost time',
    titel: (wann: string) => `Your initial consultation ${wann}`,
    vorschau: (wann: string) => `Your initial consultation ${wann}. Five minutes of preparation are enough.`,
    vorschau1h: 'Almost time. We look forward to speaking with you.',
    text: (wann: string) =>
      `${wann.charAt(0).toUpperCase()}${wann.slice(1)}, we will talk together about building your wealth. If you like, you can prepare in five minutes: the short analysis shows you for yourself what options you have.`,
    text1h: (berater: string, wann: string) =>
      `${berater ? `${berater} is` : 'We are'} looking forward to talking with you. ${wann.charAt(0).toUpperCase()}${wann.slice(1)}, we will talk together about building your wealth, in a relaxed video call.`,
    knopf: 'Complete the analysis',
    knopf1h: 'Quickly complete the analysis',
    hinweisKnopf: 'About 5 minutes  ·  Your details stay with you',
    hinweisKnopf1h: 'About 5 minutes  ·  Optional, your details stay with you',
    datum: 'Date',
    uhrzeit: 'Time',
    berater: 'Your contact person',
    terminTitel: 'Your appointment',
    zugang:
      'You will receive the access link to the meeting separately from your contact person. If you need to reschedule, a short message is enough and we will find a new time.',
    zugang1h: 'You will receive the access link to the meeting separately from your contact person.',
    schritteTitel: 'What to expect in the meeting',
    schritte: [
      'About 30 to 45 minutes, in a relaxed video call',
      'We listen: your goals, your situation, your questions',
      'You gain clarity on whether and how a property investment suits you',
      'Real figures instead of a sales pitch',
      'You decide at your own pace, without pressure and without obligation',
    ],
  },
}

/** Datum, Uhrzeit und Ansprechpartner als Zeilen, in beiden Erinnerungsvorlagen gleich. */
export function erinnerungZeilen(
  { terminDatum, terminUhrzeit, sprache }: Pick<ErinnerungProps, 'terminDatum' | 'terminUhrzeit' | 'sprache'>,
  beraterName: string | undefined,
): Array<[string, string]> {
  const t = texteFuer(ERINNERUNG_TEXTE, sprache)
  const zeilen: Array<[string, string]> = []
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)
  if (datum) zeilen.push([t.datum, datum])
  if (uhr) zeilen.push([t.uhrzeit, uhr])
  if (beraterName) zeilen.push([t.berater, beraterName])
  return zeilen
}

/** Der Betreff der 24h- und 6h-Vorlage, mit eigenem Rueckfall je Stufe. */
export function erinnerungBetreff(data: Record<string, any>, rueckfallDe: string): string {
  const t = texteFuer(ERINNERUNG_TEXTE, data?.sprache)
  return t.betreff(zeitraumFuer(String(data?.vorText || rueckfallDe), data?.sprache))
}

/**
 * Eine Vorlage fuer alle drei Erinnerungen. Frueher lagen 24h und 6h als eigene
 * Dateien daneben und unterschieden sich nur in der Betreffzeile; das ist
 * geblieben, aber der Inhalt kommt jetzt von hier.
 */
export const ErstgespraechErinnerung = ({
  kundeName,
  beraterName,
  beraterBild,
  beraterEmail,
  beraterTelefon,
  beraterPosition,
  terminDatum,
  terminUhrzeit,
  vorText,
  analyseUrl,
  berater,
  sprache,
}: ErinnerungProps) => {
  const t = texteFuer(ERINNERUNG_TEXTE, sprache)
  const wann = zeitraumFuer(vorText, sprache) || t.wannRueckfall
  const person: Ansprechpartner = {
    name: berater?.name || beraterName,
    rolle: berater?.rolle || beraterPosition,
    telefon: berater?.telefon || beraterTelefon,
    email: berater?.email || beraterEmail,
    bildUrl: berater?.bildUrl || beraterBild,
  }
  const zeilen = erinnerungZeilen({ terminDatum, terminUhrzeit, sprache }, person.name)

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(wann)}
      vorschau={t.vorschau(wann)}
      anrede={hallo(kundeName, sprache)}
      person={person.name ? person : undefined}
    >
      <Absatz letzter>{t.text(wann)}</Absatz>

      <Handlung
        sprache={sprache}
        href={mitSprache(analyseUrl || `${ANALYSE_BASIS_URL}?source=reminder`, sprache)}
        text={t.knopf}
        hinweis={t.hinweisKnopf}
      />

      {zeilen.length > 0 && <Angaben titel={t.terminTitel} zeilen={zeilen} />}

      <Hinweis text={t.zugang} />

      <Schritte titel={t.schritteTitel} punkte={t.schritte} />
    </EmailLayout>
  )
}

export const template = {
  component: ErstgespraechErinnerung,
  subject: (data: Record<string, any>) => {
    const t = texteFuer(ERINNERUNG_TEXTE, data?.sprache)
    return t.betreff(zeitraumFuer(String(data?.vorText || ''), data?.sprache))
  },
  displayName: 'Erstgespräch-Erinnerung',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    vorText: 'in 24 Stunden',
    analyseUrl: 'https://portal.more.immo/analyse?source=reminder',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 89 123456',
      email: 'c.peetz@more.immo',
    },
  },
} satisfies TemplateEntry
