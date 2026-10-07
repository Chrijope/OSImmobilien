import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Liste, Hinweis, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

const PORTAL_URL = 'https://osimmobilien.netlify.app/login'

interface DocResult {
  name: string
  status: 'approved' | 'rejected'
  reason?: string
}

interface Props {
  kundeName?: string
  bonitaetDocs?: DocResult[]
  bankDocs?: DocResult[]
  portalUrl?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

/**
 * Dokumentnamen und Ablehnungsgruende kommen aus dem CRM und bleiben, wie sie
 * dort stehen. Uebersetzt werden nur die Texte der Mail selbst.
 */
const DE = {
  betreff: (offen: number) =>
    offen > 0
      ? `Unterlagenprüfung: ${offen} Dokument${offen === 1 ? '' : 'e'} zur Nachreichung`
      : 'Unterlagenprüfung abgeschlossen, alle Dokumente freigegeben',
  augenbraue: 'Unterlagenprüfung',
  titel: (offen: boolean) => (offen ? 'Bitte einmal nachreichen' : 'Alles freigegeben'),
  vorschau: (offen: number) =>
    offen > 0
      ? `${offen} Dokument${offen === 1 ? '' : 'e'} müssen wir nochmal sehen.`
      : 'Deine Unterlagen sind vollständig geprüft und freigegeben.',
  text: (offen: number) =>
    offen > 0
      ? `deine Unterlagen sind geprüft. ${offen} davon konnten wir nicht annehmen, meist liegt es an der Lesbarkeit. Lade diese bitte erneut als sauberes PDF hoch.`
      : 'deine Unterlagen sind vollständig geprüft und alle Dokumente wurden freigegeben. Vielen Dank für deine Mithilfe.',
  knopf: 'Im Kundenportal hochladen',
  hinweisKnopf: (offen: number) => `${offen} Dokument${offen === 1 ? '' : 'e'} offen`,
  fehltTitel: 'Das fehlt noch',
  freigegeben: 'Freigegeben',
  abgelehnt: 'Abgelehnt',
  bonitaet: 'Bonitätscheck',
  bank: 'Bankprüfung',
  bilanz: (frei: number, offen: number) =>
    offen > 0
      ? `${frei} freigegeben, ${offen} offen. Bitte achte darauf, dass die Dokumente gut leserlich, vollständig und sauber gescannt sind.`
      : `${frei} Dokumente freigegeben.`,
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (offen: number) =>
      offen > 0
        ? `Document review: ${offen} document${offen === 1 ? '' : 's'} to resubmit`
        : 'Document review complete, all documents approved',
    augenbraue: 'Document review',
    titel: (offen: boolean) => (offen ? 'Please resubmit' : 'Everything approved'),
    vorschau: (offen: number) =>
      offen > 0
        ? `We need to see ${offen} document${offen === 1 ? '' : 's'} again.`
        : 'Your documents have been fully reviewed and approved.',
    text: (offen: number) =>
      offen > 0
        ? `Your documents have been reviewed. We were unable to accept ${offen} of them, usually because they were hard to read. Please upload ${offen === 1 ? 'it' : 'these'} again as a clean PDF.`
        : 'Your documents have been fully reviewed and all of them have been approved. Thank you for your help.',
    knopf: 'Upload in the customer portal',
    hinweisKnopf: (offen: number) => `${offen} document${offen === 1 ? '' : 's'} outstanding`,
    fehltTitel: 'Still missing',
    freigegeben: 'Approved',
    abgelehnt: 'Rejected',
    bonitaet: 'Credit check',
    bank: 'Bank review',
    bilanz: (frei: number, offen: number) =>
      offen > 0
        ? `${frei} approved, ${offen} outstanding. Please make sure the documents are clearly legible, complete and cleanly scanned.`
        : `${frei} documents approved.`,
  },
}

const Mail = ({ kundeName, bonitaetDocs = [], bankDocs = [], portalUrl, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const alle = [...bonitaetDocs, ...bankDocs]
  const abgelehnt = alle.filter((d) => d.status === 'rejected')
  const freigegeben = alle.length - abgelehnt.length
  const gibtAbgelehnte = abgelehnt.length > 0
  const zeilenAus = (docs: DocResult[]): Array<[string, string]> =>
    docs.map((d) => [d.name, d.status === 'approved' ? t.freigegeben : t.abgelehnt])

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(gibtAbgelehnte)}
      vorschau={t.vorschau(abgelehnt.length)}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz letzter>{t.text(abgelehnt.length)}</Absatz>

      {gibtAbgelehnte && (
        <Handlung
          sprache={sprache}
          href={portalUrl || PORTAL_URL}
          text={t.knopf}
          hinweis={t.hinweisKnopf(abgelehnt.length)}
        />
      )}

      {gibtAbgelehnte && (
        <Liste
          titel={t.fehltTitel}
          punkte={abgelehnt.map((d) => ({
            text: d.reason ? `${d.name}: ${d.reason}` : d.name,
          }))}
        />
      )}

      {bonitaetDocs.length > 0 && <Angaben titel={t.bonitaet} zeilen={zeilenAus(bonitaetDocs)} />}

      {bankDocs.length > 0 && <Angaben titel={t.bank} zeilen={zeilenAus(bankDocs)} />}

      <Hinweis text={t.bilanz(freigegeben, abgelehnt.length)} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const alle = [...((data?.bonitaetDocs || []) as DocResult[]), ...((data?.bankDocs || []) as DocResult[])]
    const offen = alle.filter((d) => d.status === 'rejected').length
    return texteFuer(TEXTE, data?.sprache).betreff(offen)
  },
  displayName: 'Unterlagenprüfung Ergebnis',
  sprachen: DE_EN,
  previewData: {
    kundeName: 'Max Mustermann',
    bonitaetDocs: [
      { name: 'Selbstauskunft', status: 'approved' },
      { name: 'Personalausweis', status: 'approved' },
      { name: 'Letzter Gehaltsnachweis', status: 'rejected', reason: 'Schlecht lesbar' },
      { name: 'Schufa-Bonitätsauskunft', status: 'approved' },
    ],
    bankDocs: [
      { name: 'Lohnsteuerbescheinigung des Vorjahrs', status: 'approved' },
      { name: 'Arbeitsvertrag', status: 'approved' },
      { name: 'Eigenkapitalnachweis', status: 'approved' },
    ],
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '+49 30 863289210',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
