import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Haken, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, uhrzeitFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Kundenerinnerung zwei Tage vor der Objektvorstellung, wenn Ausweis oder
 * letzte Gehaltsabrechnung noch fehlen (Strategie Vertrieb, Abschnitt 8,
 * seit 16.10.2026).
 *
 * Verschickt von check-document-reminders, je Termin höchstens einmal. Welche
 * Unterlagen fehlen, bestimmt `fehlendeMindestunterlagenAusMeta` in
 * `_shared/reservierung-voraussetzungen.ts`; `fehlend` trägt deren Namen.
 */

interface Props {
  kundeName?: string
  kundeAnrede?: string
  terminDatum?: string
  terminUhrzeit?: string
  /** Namen aus `fehlendeMindestunterlagenAusMeta`, etwa "Personalausweis". */
  fehlend?: string[]
  uploadUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (datum: string) => (datum ? `Für deine Objektvorstellung am ${datum}: Unterlagen fehlen noch` : 'Für deine Objektvorstellung: Unterlagen fehlen noch'),
  augenbraue: 'Erinnerung',
  titel: 'Noch fehlende Unterlagen',
  vorschau: 'Bitte lade die fehlenden Unterlagen vor dem Termin hoch.',
  absatz: (datum: string, uhr: string) =>
    `in zwei Tagen${datum ? `, am ${datum}${uhr ? ` um ${uhr}` : ''},` : ''} ist deine Objektvorstellung. Damit wir im Termin alle nächsten Schritte direkt klären können, fehlen uns noch:`,
  namen: {
    Personalausweis: 'Personalausweis, Vorder- und Rückseite',
    'Letzter Gehaltsnachweis': 'Deine letzte Gehaltsabrechnung',
  } as Record<string, string>,
  knopf: 'Unterlagen hochladen',
  hinweis: 'Hast du die Unterlagen inzwischen hochgeladen, ist diese Mail damit erledigt.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (datum: string) => (datum ? `For your property presentation on ${datum}: documents still missing` : 'For your property presentation: documents still missing'),
    augenbraue: 'Reminder',
    titel: 'Documents still missing',
    vorschau: 'Please upload the missing documents before the appointment.',
    absatz: (datum: string, uhr: string) =>
      `Your property presentation is in two days${datum ? `, on ${datum}${uhr ? ` at ${uhr}` : ''}` : ''}. So that we can settle all next steps directly in the appointment, we still need:`,
    namen: {
      Personalausweis: 'ID card, front and back',
      'Letzter Gehaltsnachweis': 'Your latest payslip',
    } as Record<string, string>,
    knopf: 'Upload documents',
    hinweis: 'If you have uploaded the documents in the meantime, you can disregard this email.',
  },
}

const Mail = ({ kundeName, terminDatum, terminUhrzeit, fehlend, uploadUrl, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const datum = datumFuer(terminDatum, sprache)
  const uhr = uhrzeitFuer(terminUhrzeit, sprache)
  const punkte = (fehlend || []).map((name) => t.namen[name] || name)

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz letzter>{t.absatz(datum, uhr)}</Absatz>
      {punkte.length > 0 && <Haken punkte={punkte} />}
      {uploadUrl && <Handlung sprache={sprache} href={uploadUrl} text={t.knopf} />}
      <Hinweis text={t.hinweis} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, data?.sprache).betreff(datumFuer(data?.terminDatum, data?.sprache)),
  displayName: 'Erinnerung: Unterlagen vor der Objektvorstellung',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    terminDatum: '25.03.2026',
    terminUhrzeit: '15:00',
    fehlend: ['Personalausweis', 'Letzter Gehaltsnachweis'],
    uploadUrl: 'https://osimmobilien.netlify.app/kunde/investments?tab=osimmobilien&highlight=bonitaetsunterlagen',
    berater: {
      name: 'Vorname Nachname',
      rolle: 'Vertriebspartner',
      telefon: '+49 30 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
