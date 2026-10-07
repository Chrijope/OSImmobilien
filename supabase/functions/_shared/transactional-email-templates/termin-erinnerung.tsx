import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, uhrzeitFuer, zeitraumFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Erinnerung an einen Termin, egal welcher Anlass.
 *
 * Bewusst allgemein gehalten: Die Vorlage weiss nicht, ob es ein Erstgespraech,
 * eine Bestandsberatung oder ein Rueckruf ist. Sie zeigt, was in jedem Fall
 * zaehlt, naemlich wann, wie lange, mit wem und wo.
 */

interface Props {
  /** Kommt vom Aufrufer weiter mit, die Anrede nutzt nur noch den Vornamen. */
  anrede?: string
  vorname?: string
  nachname?: string
  /** "in etwa 24 Stunden", "in weniger als einer Stunde". Englisch uebersetzt die Vorlage. */
  vorText?: string
  /** Deutsche Schreibweise, also 25.03.2026. */
  terminDatum?: string
  /** HH:MM ohne "Uhr", das ergaenzt die Vorlage. */
  terminUhrzeit?: string
  /** Minuten. */
  terminDauer?: number
  /** Ueberschrift des Termins, etwa "Beratungsgespraech". Bleibt, wie im CRM gepflegt. */
  terminTitel?: string
  /** Vollstaendige Adresse zum Videoraum oder Meeting, falls vorhanden. */
  zugangUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (wann: string) => (wann ? `Erinnerung: Dein Termin ${wann}` : 'Erinnerung an deinen Termin'),
  wannRueckfall: 'in Kürze',
  augenbraue: 'Dein Termin',
  titel: (wann: string) => `Dein Termin ${wann}`,
  vorschau: (wann: string, datum: string) => `Dein Termin ${wann}${datum ? `, am ${datum}` : ''}.`,
  text: (wann: string, mitZugang: boolean) =>
    `wir möchten dich kurz an unseren gemeinsamen Termin erinnern. Er findet ${wann} statt.${mitZugang ? ' Zum Termin genügt ein Klick auf den Knopf.' : ''}`,
  knopf: 'Zum Termin',
  anlass: 'Anlass',
  datum: 'Datum',
  uhrzeit: 'Uhrzeit',
  dauer: 'Dauer',
  etwaMinuten: (n: number) => `etwa ${n} Minuten`,
  ansprechpartner: 'Dein Ansprechpartner',
  terminTitel: 'Dein Termin',
  passtNicht:
    'Wenn es dir doch nicht passt, genügt eine kurze Nachricht oder ein Anruf. Wir finden gemeinsam einen neuen Termin.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (wann: string) => (wann ? `Reminder: your appointment ${wann}` : 'Reminder of your appointment'),
    wannRueckfall: 'shortly',
    augenbraue: 'Your appointment',
    titel: (wann: string) => `Your appointment ${wann}`,
    vorschau: (wann: string, datum: string) => `Your appointment ${wann}${datum ? `, on ${datum}` : ''}.`,
    text: (wann: string, mitZugang: boolean) =>
      `We would like to briefly remind you of our appointment. It takes place ${wann}.${mitZugang ? ' To join, simply click the button.' : ''}`,
    knopf: 'Join the appointment',
    anlass: 'Occasion',
    datum: 'Date',
    uhrzeit: 'Time',
    dauer: 'Duration',
    etwaMinuten: (n: number) => `about ${n} minutes`,
    ansprechpartner: 'Your contact person',
    terminTitel: 'Your appointment',
    passtNicht:
      'If the time no longer suits you, a short message or a call is enough. We will find a new appointment together.',
  },
}

const Mail = ({
  vorname,
  vorText,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  terminTitel,
  zugangUrl,
  berater,
  sprache,
}: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const wann = zeitraumFuer(vorText, sprache) || t.wannRueckfall
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)

  const zeilen: Array<[string, string]> = []
  if (terminTitel) zeilen.push([t.anlass, terminTitel])
  if (datum) zeilen.push([t.datum, datum])
  if (uhr) zeilen.push([t.uhrzeit, uhr])
  if (terminDauer) zeilen.push([t.dauer, t.etwaMinuten(terminDauer)])
  if (berater?.name) zeilen.push([t.ansprechpartner, berater.name])

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(wann)}
      vorschau={t.vorschau(wann, datum)}
      anrede={hallo(vorname, sprache)}
      person={berater?.name ? berater : undefined}
    >
      <Absatz letzter>{t.text(wann, Boolean(zugangUrl))}</Absatz>

      {zugangUrl && (
        <Handlung
          sprache={sprache}
          href={zugangUrl}
          text={t.knopf}
          hinweis={datum && uhr ? `${datum}, ${uhr}` : undefined}
        />
      )}

      {zeilen.length > 0 && <Angaben titel={t.terminTitel} zeilen={zeilen} />}

      <Hinweis text={t.passtNicht} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(zeitraumFuer(String(data?.vorText || ''), data?.sprache)),
  displayName: 'Terminerinnerung (24h, 6h, 1h)',
  sprachen: DE_EN,
  previewData: {
    anrede: 'Herr',
    vorname: 'Max',
    nachname: 'Mustermann',
    vorText: 'in etwa 24 Stunden',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    terminDauer: 45,
    terminTitel: 'Beratungsgespräch',
    zugangUrl: 'https://osimmobilien.netlify.app/raum/abc123',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
