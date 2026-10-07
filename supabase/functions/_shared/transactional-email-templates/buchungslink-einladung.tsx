import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import {
  EmailLayout, Absatz, Handlung, Angaben, Hinweis, type Ansprechpartner,
} from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, mailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Der persoenliche Buchungslink aus dem Kundenprofil, per Mail an den Kunden.
 *
 * Bisher gab es an den vergebenen Links nur einen mailto-Knopf mit einem
 * generischen Zweizeiler. Jetzt geht eine richtige Mail hinaus, und ihr Text
 * passt zum Anlass der Terminart: Ein Erstgespraech wird anders angekuendigt
 * als ein Finanzierungsgespraech.
 *
 * Die Texte je Anlass stehen zentral in ANLASS_TEXTE, je Sprache. Unbekannte
 * oder fehlende Anlaesse fallen auf "sonstiges" zurueck, damit nie eine leere
 * Mail entsteht.
 */

interface AnlassText {
  betreff: string
  titel: string
  vorschau: string
  /** Deutsch klein, denn er folgt direkt auf "Hallo …,". Englisch gross. */
  absatz: string
}

export const ANLASS_TEXTE: Record<MailSprache, Record<string, AnlassText>> = {
  de: {
    erstgespraech: {
      betreff: 'Dein persönlicher Link zum Erstgespräch',
      titel: 'Dein Erstgespräch',
      vorschau: 'Such dir einfach einen Termin für unser Kennenlernen aus.',
      absatz:
        'vielen Dank für dein Interesse. Gerne lade ich dich zu einem unverbindlichen ' +
        'Erstgespräch ein. In 15 bis 30 Minuten lernen wir uns kennen und schauen, ' +
        'wie wir dich bei deinem Immobilieninvestment bestmöglich begleiten können. ' +
        'Such dir über den Buchungskalender-Button einfach den Termin aus, ' +
        'der zeitlich am besten zu dir passt.',
    },
    beratung: {
      betreff: 'Dein persönlicher Link zum Beratungsgespräch',
      titel: 'Dein Beratungsgespräch',
      vorschau: 'Such dir einfach einen Termin für dein Beratungsgespräch aus.',
      absatz:
        'schön, dass wir gemeinsam den nächsten Schritt gehen. Im Beratungsgespräch ' +
        'stellen wir uns dir noch einmal im Detail vor und klären ausführlich, ' +
        'was in deiner Situation möglich ist. Such dir über den ' +
        'Buchungskalender-Button einfach den Termin aus, der zeitlich am besten ' +
        'zu dir passt.',
    },
    objektvorstellung: {
      betreff: 'Dein persönlicher Link zur Objektvorstellung',
      titel: 'Deine Objektvorstellung',
      vorschau: 'Such dir einfach einen Termin für deine Objektvorstellung aus.',
      absatz:
        'es ist so weit: Wir stellen dir deine passende Immobilie im Detail vor, ' +
        'mit Lage, Zahlen und einer persönlichen Berechnung, die wir für dich ' +
        'bereits vorbereitet haben. Such dir über den Buchungskalender-Button ' +
        'einfach den Termin aus, der zeitlich am besten zu dir passt.',
    },
    finanzierungsgespraech: {
      betreff: 'Dein persönlicher Link zum Finanzierungsgespräch',
      titel: 'Dein Finanzierungsgespräch',
      vorschau: 'Such dir einfach einen Termin für dein Finanzierungsgespräch aus.',
      absatz:
        'im Finanzierungsgespräch besprechen wir den Rahmen und die Konditionen ' +
        'deiner Finanzierung und gehen die nächsten Schritte bis zur Bankzusage ' +
        'durch. Such dir über den Buchungskalender-Button einfach den ' +
        'Termin aus, der zeitlich am besten zu dir passt.',
    },
    sonstiges: {
      betreff: 'Dein persönlicher Terminlink',
      titel: 'Dein Termin',
      vorschau: 'Such dir einfach die Zeit aus, die dir am besten passt.',
      absatz:
        'gerne möchte ich den nächsten Termin mit dir vereinbaren. Such dir ' +
        'über den Buchungskalender-Button einfach die Zeit aus, die dir ' +
        'am besten passt.',
    },
  },
  en: {
    erstgespraech: {
      betreff: 'Your personal link for an initial consultation',
      titel: 'Your initial consultation',
      vorschau: 'Simply pick a time for us to get to know each other.',
      absatz:
        'Thank you for your interest. I would like to invite you to an initial ' +
        'consultation with no obligation. In 15 to 30 minutes we get to know each other ' +
        'and look at how we can best support you with your property investment. ' +
        'Simply use the booking button to choose the time that suits you best.',
    },
    beratung: {
      betreff: 'Your personal link for a consultation',
      titel: 'Your consultation',
      vorschau: 'Simply pick a time for your consultation.',
      absatz:
        'Great that we are taking the next step together. In the consultation we ' +
        'introduce ourselves to you in detail once more and discuss thoroughly ' +
        'what is possible in your situation. Simply use the booking button to ' +
        'choose the time that suits you best.',
    },
    objektvorstellung: {
      betreff: 'Your personal link for the property presentation',
      titel: 'Your property presentation',
      vorschau: 'Simply pick a time for your property presentation.',
      absatz:
        'The time has come: we will present the property that suits you in detail, ' +
        'with its location, the figures and a personal calculation that we have ' +
        'already prepared for you. Simply use the booking button to choose the ' +
        'time that suits you best.',
    },
    finanzierungsgespraech: {
      betreff: 'Your personal link for the financing consultation',
      titel: 'Your financing consultation',
      vorschau: 'Simply pick a time for your financing consultation.',
      absatz:
        'In the financing consultation we discuss the framework and the terms of ' +
        'your financing and go through the next steps up to the bank’s approval. ' +
        'Simply use the booking button to choose the time that suits you best.',
    },
    sonstiges: {
      betreff: 'Your personal appointment link',
      titel: 'Your appointment',
      vorschau: 'Simply pick the time that suits you best.',
      absatz:
        'I would like to arrange our next appointment with you. Simply use the ' +
        'booking button to choose the time that suits you best.',
    },
  },
}

function textFuer(anlass: string | undefined, sprache: unknown): AnlassText {
  const tabelle = ANLASS_TEXTE[mailSprache(sprache)]
  return tabelle[(anlass || '').trim()] ?? tabelle.sonstiges
}

const DE = {
  augenbraue: 'Terminbuchung',
  terminart: 'Terminart',
  dauer: 'Dauer',
  etwaMinuten: (n: number) => `etwa ${n} Minuten`,
  gueltigBis: 'Link gültig bis',
  ansprechpartner: 'Dein Ansprechpartner',
  knopf: 'Termin aussuchen',
  hinweisDauer: (n: number) => `Etwa ${n} Minuten`,
  hinweisGueltig: (bis: string) => `Gültig bis ${bis}`,
  blick: 'Auf einen Blick',
  online:
    'Der Termin findet online als Videogespräch statt. Den Zugangslink bekommst du automatisch mit deiner Buchungsbestätigung per E-Mail.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    augenbraue: 'Book an appointment',
    terminart: 'Type of appointment',
    dauer: 'Duration',
    etwaMinuten: (n: number) => `about ${n} minutes`,
    gueltigBis: 'Link valid until',
    ansprechpartner: 'Your contact person',
    knopf: 'Pick an appointment',
    hinweisDauer: (n: number) => `About ${n} minutes`,
    hinweisGueltig: (bis: string) => `Valid until ${bis}`,
    blick: 'At a glance',
    online:
      'The appointment takes place online as a video call. You will automatically receive the access link by email with your booking confirmation.',
  },
}

interface Props {
  kundeName?: string
  /** erstgespraech, beratung, objektvorstellung, finanzierungsgespraech, sonstiges. */
  anlass?: string
  /** Bezeichnung der Terminart, etwa "Telefonisches Erstgespräch". */
  terminartName?: string
  dauerMinuten?: number
  /** Der persoenliche Buchungslink, das Ziel des Knopfes. */
  buchungUrl?: string
  /** Ausgeschriebenes Datum, bis zu dem der Link gilt. Fehlt bei unbegrenzten Links. */
  gueltigBis?: string
  beraterName?: string
  /* Das Profilbild kam flach herein, die Vorlage las aber nur
     berater.bildUrl. Deshalb fehlte es in der Mail. */
  beraterBild?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const Mail = ({
  kundeName,
  anlass,
  terminartName,
  dauerMinuten,
  buchungUrl,
  gueltigBis,
  beraterName,
  beraterBild,
  berater,
  sprache,
}: Props) => {
  const text = textFuer(anlass, sprache)
  const t = texteFuer(TEXTE, sprache)
  const bis = datumFuer(gueltigBis, sprache)
  const person: Ansprechpartner = {
    name: berater?.name || beraterName,
    rolle: berater?.rolle,
    telefon: berater?.telefon,
    email: berater?.email,
    bildUrl: berater?.bildUrl || beraterBild,
  }

  // Die Terminart ist ein Name aus dem CRM und bleibt, wie sie gepflegt ist.
  const zeilen: Array<[string, string]> = []
  if (terminartName) zeilen.push([t.terminart, terminartName])
  if (dauerMinuten) zeilen.push([t.dauer, t.etwaMinuten(dauerMinuten)])
  if (bis) zeilen.push([t.gueltigBis, bis])
  if (person.name) zeilen.push([t.ansprechpartner, person.name])

  const hinweisTeile: string[] = []
  if (dauerMinuten) hinweisTeile.push(t.hinweisDauer(dauerMinuten))
  if (bis) hinweisTeile.push(t.hinweisGueltig(bis))

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={text.titel}
      vorschau={text.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={person.name ? person : undefined}
    >
      <Absatz letzter>{text.absatz}</Absatz>

      {buchungUrl && (
        <Handlung
          sprache={sprache}
          href={buchungUrl}
          text={t.knopf}
          hinweis={hinweisTeile.join(' · ') || undefined}
        />
      )}

      {zeilen.length > 0 && <Angaben titel={t.blick} zeilen={zeilen} />}

      <Hinweis text={t.online} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => textFuer(data?.anlass, data?.sprache).betreff,
  displayName: 'Buchungslink an den Kunden',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    anlass: 'erstgespraech',
    terminartName: 'Telefonisches Erstgespräch',
    dauerMinuten: 30,
    buchungUrl: 'https://osimmobilien.netlify.app/termin/abc123',
    gueltigBis: '30. September 2026',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Senior Berater',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
