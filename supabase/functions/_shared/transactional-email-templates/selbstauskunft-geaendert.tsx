import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  signUrl?: string
  geaendertVon?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

/** Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). */
const DE = {
  betreff: 'Ihre Selbstauskunft wurde geändert: bitte erneut unterschreiben',
  augenbraue: 'Aktualisierte Fassung',
  titel: 'Ihre Selbstauskunft wurde geändert',
  vorschau: 'Die Selbstauskunft wurde vor der Unterschrift korrigiert. Bitte prüfen und erneut unterschreiben.',
  fuss: 'Ihre frühere Unterschrift bezieht sich auf die alte Fassung und wurde deshalb zurückgesetzt.',
  text: (von: string) =>
    `${von ? `${von} hat ` : 'Es wurden '}Angaben in der Selbstauskunft korrigiert. Weil sich der Inhalt des Dokuments geändert hat, benötigen wir Ihre Unterschrift noch einmal. Bitte prüfen Sie die aktualisierte Fassung und unterschreiben Sie erneut.`,
  knopf: 'Geänderte Fassung prüfen und unterschreiben',
  hinweis: 'Etwa 3 Minuten',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your self-disclosure has been changed: please sign again',
    augenbraue: 'Updated version',
    titel: 'Your self-disclosure has been changed',
    vorschau: 'The self-disclosure was corrected before signing. Please review it and sign again.',
    fuss: 'Your earlier signature refers to the previous version and has therefore been reset.',
    text: (von: string) =>
      `${von ? `${von} has corrected` : 'Corrections have been made to'} details in your self-disclosure (Selbstauskunft). As the content of the document has changed, we need your signature once more. Please review the updated version and sign it again.`,
    knopf: 'Review and sign the updated version',
    hinweis: 'About 3 minutes',
  },
}

const Mail = ({ name, signUrl, geaendertVon, berater, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={foermlich(name, sprache, kundeAnrede)}
      person={berater}
      fussHinweis={t.fuss}
    >
      <Absatz letzter>{t.text(geaendertVon || '')}</Absatz>

      <Handlung sprache={sprache} href={signUrl || ''} text={t.knopf} hinweis={t.hinweis} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Selbstauskunft geändert (erneute Unterschrift)',
  sprachen: DE_EN,
  previewData: {
    name: 'Herr Mustermann',
    signUrl: 'https://portal.more.immo/signatur?token=example',
    geaendertVon: 'Frau Mustermann',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
