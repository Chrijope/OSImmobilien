import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  sprache?: MailSprache
  kundeAnrede?: string
}

/**
 * Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4).
 *
 * Die Sprache muss der Aufrufer mitgeben: Nach der Loeschung gibt es den
 * Kontakt nicht mehr, aus dem der Server sie lesen koennte.
 */
const DE = {
  betreff: 'Bestätigung: Ihre Daten wurden gelöscht',
  augenbraue: 'Bestätigung',
  titel: 'Ihre Daten wurden gelöscht',
  vorschau: 'Ihre personenbezogenen Daten wurden vollständig und unwiderruflich gelöscht.',
  fuss: 'Diese Bestätigung dient Ihrer Dokumentation. Bewahren Sie sie auf.',
  bestaetigung:
    'hiermit bestätigen wir Ihnen, dass Ihre personenbezogenen Daten nach Artikel 17 DSGVO vollständig und unwiderruflich aus unseren Systemen gelöscht wurden.',
  ausnahme:
    'Davon ausgenommen sind ausschließlich Unterlagen, die wir aufgrund gesetzlicher Aufbewahrungspflichten weiter vorhalten müssen, etwa steuerlich relevante Belege. Diese werden gesperrt und ausschließlich zu diesem Zweck aufbewahrt.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Confirmation: your data has been deleted',
    augenbraue: 'Confirmation',
    titel: 'Your data has been deleted',
    vorschau: 'Your personal data has been deleted completely and irreversibly.',
    fuss: 'This confirmation is for your records. Please keep it.',
    bestaetigung:
      'We hereby confirm that your personal data has been deleted completely and irreversibly from our systems in accordance with Article 17 GDPR.',
    ausnahme:
      'The only exceptions are documents that we are required to retain due to statutory retention obligations, such as records relevant for tax purposes. These are blocked and retained solely for this purpose.',
  },
}

const Mail = ({ name, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={foermlich(name, sprache, kundeAnrede)}
      fussHinweis={t.fuss}
      ohneUnterschrift
    >
      <Absatz>{t.bestaetigung}</Absatz>
      <Absatz letzter>{t.ausnahme}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'DSGVO-Löschbestätigung',
  sprachen: DE_EN,
  previewData: {
    name: 'Herr Mustermann',
  },
} satisfies TemplateEntry
