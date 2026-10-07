import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Nicht eingeplant, Kundenerinnerungen sind seit 15.09.2026 abgeschaltet.
 *
 * Frueher Tag 2, 5 und 10 nach dem Unterschriftslink zur Reservierung.
 * Die Vorlage bleibt fuer Historie und Vorschau liegen und wird von keiner
 * Function mehr aufgerufen.
 */

/**
 * Erinnerung an die noch offene Reservierungsvereinbarung.
 *
 * Bisher bekam der Kunde hier gar nichts. Die vorhandene Signatur-Erinnerung
 * ist ausdrücklich auf Selbstauskünfte beschränkt, weil sie sonst die falsche
 * Überschrift trägt und das falsche Dokument verlinkt. Für Reservierungen
 * blieb damit die stillste Stelle im ganzen Verkaufsprozess: Der Kunde hat
 * sich für ein Objekt entschieden, der Link liegt in seinem Postfach, und
 * niemand hakt nach.
 *
 * Der Ton wird über die Stufen ruhiger als drängender: Wer ein Objekt
 * reserviert hat, will meistens kaufen. Es hakt an einer Frage, nicht am
 * Willen.
 *
 * Gruppe F (Reservierung ist ein Vertrag): Deutsch in der Sie-Form, Englisch
 * förmlich, wie `reservierung-signatur`. Bis zum 26.09.2026 duzte die Mail.
 */

interface Props {
  name?: string
  signUrl?: string
  objektTitel?: string
  /** 1, 2 oder 3. Steuert Überschrift und Text. */
  stufe?: number
  trackingPixelUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

const DE = {
  betreff: {
    1: 'Ihre Reservierungsvereinbarung wartet auf die Unterschrift',
    2: 'Ihre Reservierung ist noch offen',
    3: 'Sollen wir Ihre Reservierung so lassen?',
  } as Record<number, string>,
  augenbraue: 'Ihre Reservierung',
  titel: {
    1: 'Ihre Reservierung wartet noch auf die Unterschrift',
    2: 'Kurze Erinnerung an Ihre Reservierung',
    3: 'Sollen wir die Reservierung so lassen?',
  } as Record<number, string>,
  text: {
    1: 'wir haben Ihnen die Reservierungsvereinbarung geschickt, unterschrieben ist sie noch nicht. Meistens ist sie einfach im Posteingang untergegangen. Ein Klick genügt, das dauert keine zwei Minuten.',
    2: 'Ihre Reservierungsvereinbarung liegt weiterhin offen. Solange sie nicht unterschrieben ist, ist die Einheit für Sie nicht verbindlich vorgemerkt, und wir können sie Ihnen nicht dauerhaft freihalten.',
    3: 'wir wollen Sie nicht drängen, aber auch nicht im Unklaren lassen. Wenn Sie sich unsicher sind oder eine Frage offen ist, rufen Sie uns einfach an. Wenn es Ihnen grundsätzlich nicht mehr passt, sagen Sie uns auch das gerne, dann geben wir die Einheit wieder frei.',
  } as Record<number, string>,
  vorschauObjekt: (objekt: string) => `${objekt} ist noch nicht verbindlich vorgemerkt.`,
  vorschau: 'Ihre Reservierungsvereinbarung ist noch nicht unterschrieben.',
  esGehtUm: 'Es geht um:',
  knopf: 'Reservierung jetzt unterschreiben',
  hinweis: 'Dauert keine zwei Minuten  ·  Der Link bleibt gültig',
  schluss:
    'Wenn etwas unklar ist, antworten Sie einfach auf diese Mail oder rufen Sie an. Wir klären das in zwei Minuten am Telefon.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: {
      1: 'Your reservation agreement is awaiting your signature',
      2: 'Your reservation is still open',
      3: 'Shall we leave your reservation as it is?',
    },
    augenbraue: 'Your reservation',
    titel: {
      1: 'Your reservation is still awaiting your signature',
      2: 'A brief reminder about your reservation',
      3: 'Shall we leave the reservation as it is?',
    },
    text: {
      1: 'We have sent you the reservation agreement, but it has not been signed yet. More often than not it has simply been overlooked in the inbox. One click is all it takes, and it will take less than two minutes.',
      2: 'Your reservation agreement is still open. Until it has been signed, the unit is not bindingly reserved for you, and we are unable to hold it for you indefinitely.',
      3: 'We do not wish to rush you, nor to leave you uncertain. Should you have any doubts or an open question, please do not hesitate to call us. Should it no longer suit you, please let us know as well, and we will release the unit.',
    },
    vorschauObjekt: (objekt: string) => `${objekt} is not yet bindingly reserved.`,
    vorschau: 'Your reservation agreement has not been signed yet.',
    esGehtUm: 'This concerns:',
    knopf: 'Sign the reservation now',
    hinweis: 'Takes less than two minutes  ·  The link remains valid',
    schluss:
      'If anything is unclear, simply reply to this email or give us a call. We can clarify it in two minutes on the phone.',
  },
}

function stufeAus(wert: unknown): number {
  return Math.min(Math.max(Number(wert) || 1, 1), 3)
}

const Mail = ({ name, signUrl, objektTitel, stufe = 1, trackingPixelUrl, berater, sprache, kundeAnrede }: Props) => {
  const s = stufeAus(stufe)
  const t = texteFuer(TEXTE, sprache)

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel[s]}
      vorschau={objektTitel ? t.vorschauObjekt(objektTitel) : t.vorschau}
      anrede={foermlich(name, sprache, kundeAnrede)}
      person={berater}
      pixelUrl={trackingPixelUrl}
    >
      <Absatz letzter>{t.text[s]}</Absatz>

      {objektTitel && (
        <Absatz letzter>
          {t.esGehtUm} <strong>{objektTitel}</strong>
        </Absatz>
      )}

      {/* Ohne Ziel kein Knopf, sonst verweist die Mail auf sich selbst. */}
      {signUrl && (
        <Handlung
          sprache={sprache}
          href={signUrl}
          text={t.knopf}
          hinweis={t.hinweis}
        />
      )}

      <Absatz letzter>{t.schluss}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, unknown>) => texteFuer(TEXTE, data?.sprache).betreff[stufeAus(data?.stufe)],
  displayName: 'Reservierung: Erinnerung an die Unterschrift (1 bis 3)',
  sprachen: DE_EN,
  previewData: {
    name: 'Herr Mustermann',
    signUrl: 'https://portal.more.immo/signatur?token=beispiel&type=reservierung',
    objektTitel: 'Musterstraße 12, WE 4',
    stufe: 1,
  },
} satisfies TemplateEntry
