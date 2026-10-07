import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Schritte } from './_layout.tsx'
import {
  LEAD_PAKET_RECHNUNG_ANZEIGENAME,
  LEAD_PAKET_RECHNUNG_AUGENBRAUE,
  LEAD_PAKET_RECHNUNG_BLOCK,
  LEAD_PAKET_RECHNUNG_SCHRITTE,
  LEAD_PAKET_RECHNUNG_TITEL,
  LEAD_PAKET_RECHNUNG_ZEILE_BETRAG,
  LEAD_PAKET_RECHNUNG_ZEILE_LEADS,
  VORSCHAU_LEAD_PAKET,
  leadPaketRechnungBetreff,
  leadPaketRechnungLeads,
  leadPaketRechnungText,
  leadPaketRechnungVorschau,
} from '../lead-paket-rechnung-mail.ts'
import { formatiereLeadPaketBetrag } from '../lead-paket.ts'

/*
 * Rechnung über das Lead-Paket. Seit dem 23.09.2026 geht diese Mail nur noch
 * hinaus, wenn der Vertrag ein Lead-Paket enthält; vorher kam sie nach jedem
 * unterschriebenen Vertrag und nannte eine Onboardinggebühr. Die Regel steht in
 * `../lead-paket.ts`, der Wortlaut in `../lead-paket-rechnung-mail.ts`.
 *
 * Zahlungsweise und Raten sind entfallen: Sie gehörten zur Onboardinggebühr
 * der Altpakete. Das Lead-Paket ist laut Vertrag in einem Betrag nach
 * Rechnung per Überweisung zu zahlen.
 */

interface Props {
  bewerberName?: string
  bewerberEmail?: string
  bewerberTelefon?: string
  rechnungsAdresse?: string
  privatAdresse?: string
  ort?: string
  leadPaketBetragFormatiert?: string
  leadAnzahl?: number
  signedAt?: string
  bewerberLink?: string
}

const Mail = ({
  bewerberName,
  bewerberEmail,
  bewerberTelefon,
  rechnungsAdresse,
  privatAdresse,
  ort,
  leadPaketBetragFormatiert,
  leadAnzahl,
  signedAt,
  bewerberLink,
}: Props) => {
  const wer = bewerberName || 'Ein Bewerber'
  const empfaenger: Array<[string, string]> = []
  if (bewerberName) empfaenger.push(['Name', bewerberName])
  const adresse = rechnungsAdresse || privatAdresse
  if (adresse) empfaenger.push(['Adresse', adresse])
  if (ort) empfaenger.push(['Ort', ort])
  if (bewerberEmail) empfaenger.push(['E-Mail', bewerberEmail])
  if (bewerberTelefon) empfaenger.push(['Telefon', bewerberTelefon])

  const gebuehr: Array<[string, string]> = []
  if (leadPaketBetragFormatiert) gebuehr.push([LEAD_PAKET_RECHNUNG_ZEILE_BETRAG, leadPaketBetragFormatiert])
  if (typeof leadAnzahl === 'number' && leadAnzahl > 0) {
    gebuehr.push([LEAD_PAKET_RECHNUNG_ZEILE_LEADS, leadPaketRechnungLeads(leadAnzahl)])
  }
  if (signedAt) gebuehr.push(['Unterschrieben am', signedAt])

  return (
    <EmailLayout
      augenbraue={LEAD_PAKET_RECHNUNG_AUGENBRAUE}
      titel={LEAD_PAKET_RECHNUNG_TITEL}
      vorschau={leadPaketRechnungVorschau(wer)}
      anrede="Hallo Christian,"
      intern
      ohneUnterschrift
    >
      <Absatz letzter>{leadPaketRechnungText(wer)}</Absatz>

      {bewerberLink && <Handlung href={bewerberLink} text="Bewerberprofil öffnen" />}

      {empfaenger.length > 0 && <Angaben titel="Rechnungsempfänger" zeilen={empfaenger} />}

      {gebuehr.length > 0 && <Angaben titel={LEAD_PAKET_RECHNUNG_BLOCK} zeilen={gebuehr} />}

      <Schritte titel="Nächste Schritte" punkte={[...LEAD_PAKET_RECHNUNG_SCHRITTE]} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => leadPaketRechnungBetreff(d?.bewerberName),
  displayName: LEAD_PAKET_RECHNUNG_ANZEIGENAME,
  previewData: {
    bewerberName: 'Max Mustermann',
    bewerberEmail: 'max@example.com',
    bewerberTelefon: '+49 170 1234567',
    rechnungsAdresse: 'Musterstraße 12',
    ort: '80331 München',
    leadPaketBetragFormatiert: formatiereLeadPaketBetrag(VORSCHAU_LEAD_PAKET.betrag),
    leadAnzahl: VORSCHAU_LEAD_PAKET.anzahl,
    signedAt: '31.05.2026 14:22',
    bewerberLink: 'https://osimmobilien.netlify.app/bewerberprozess?bewerber=example-id',
  },
} satisfies TemplateEntry
