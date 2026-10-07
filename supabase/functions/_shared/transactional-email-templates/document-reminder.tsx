import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Schritte, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  kundeName?: string
  /** Deutscher Betreff vom Aufrufer. Englisch baut die Vorlage ihn selbst. */
  subject?: string
  portalUrl?: string
  fehlend?: string[]
  /** Die wievielte Erinnerung, 1 oder 2. Bestimmt den englischen Betreff. */
  reminderNumber?: number
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (vomAufrufer: string, _nummer: number) => vomAufrufer || 'Es fehlen noch Unterlagen',
  augenbraue: 'Noch offen',
  titel: 'Es fehlen noch Unterlagen',
  vorschau: 'Ohne die fehlenden Unterlagen kann die Bank nicht weiterarbeiten.',
  text:
    'für deine Finanzierungsanfrage fehlen noch Unterlagen. Solange sie nicht vollständig sind, kann die Bank die Prüfung nicht abschließen, und der Ablauf bleibt stehen.',
  knopf: 'Unterlagen hochladen',
  hinweis: 'Direkt im Kundenportal, ohne Anmeldung per Post',
  fehltTitel: 'Das fehlt noch',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    // Der deutsche Betreff des Aufrufers taugt hier nicht. Die Nummer sagt,
    // ob es die erste oder die letzte Erinnerung ist.
    betreff: (_vomAufrufer: string, nummer: number) =>
      nummer >= 2 ? 'Final reminder: please upload your documents' : 'Reminder: your documents are still missing',
    augenbraue: 'Still outstanding',
    titel: 'Some documents are still missing',
    vorschau: 'Without the missing documents, the bank cannot continue.',
    text:
      'Some documents for your financing request are still missing. Until they are complete, the bank cannot finish its review and the process is on hold.',
    knopf: 'Upload documents',
    hinweis: 'Directly in the customer portal, no need to send anything by post',
    fehltTitel: 'Still missing',
  },
}

const Mail = ({ kundeName, portalUrl, fehlend = [], berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz letzter>{t.text}</Absatz>

      <Handlung sprache={sprache} href={portalUrl || ''} text={t.knopf} hinweis={t.hinweis} />

      {/* Die Dokumentnamen kommen aus dem CRM und bleiben, wie sie dort heissen. */}
      {fehlend.length > 0 && <Schritte titel={t.fehltTitel} punkte={fehlend} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) =>
    texteFuer(TEXTE, d?.sprache).betreff(String(d?.subject || ''), Number(d?.reminderNumber) || 1),
  displayName: 'Unterlagen-Erinnerung',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max',
    portalUrl: 'https://portal.more.immo/kunde/unterlagen',
    fehlend: ['Gehaltsnachweise der letzten drei Monate', 'Schufa-Selbstauskunft', 'Kopie des Personalausweises'],
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei MOREImmo',
      telefon: '08061 000000',
      email: 'christian@more.immo',
    },
  },
} satisfies TemplateEntry
