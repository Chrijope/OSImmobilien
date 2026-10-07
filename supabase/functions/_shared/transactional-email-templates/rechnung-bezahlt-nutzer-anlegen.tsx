import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'
import {
  LEAD_PAKET_BEZAHLT_ANZEIGENAME,
  LEAD_PAKET_BEZAHLT_AUGENBRAUE,
  LEAD_PAKET_BEZAHLT_BLOCK,
  LEAD_PAKET_BEZAHLT_TITEL,
  LEAD_PAKET_RECHNUNG_ZEILE_BETRAG,
  LEAD_PAKET_RECHNUNG_ZEILE_LEADS,
  VORSCHAU_LEAD_PAKET,
  leadPaketBezahltBetreff,
  leadPaketBezahltText,
  leadPaketBezahltVorschau,
  leadPaketRechnungLeads,
} from '../lead-paket-rechnung-mail.ts'
import { formatiereLeadPaketBetrag } from '../lead-paket.ts'

/*
 * Folgemail an Christian: Die Zahlung für das Lead-Paket ist eingegangen.
 *
 * Seit dem 23.09.2026 geht sie nur noch hinaus, wenn der Bewerber mit
 * Lead-Paket in "Rechnung" lag, dort als bezahlt vermerkt wurde und dadurch
 * nach "Nutzer anlegen" rückt (`RechnungsTab`, Regel in `../lead-paket.ts`).
 * Vorher hieß sie "Die Onboardinggebühr ist eingegangen" und kam auch über
 * "Weiter zur Aktivierung", also ohne jede Zahlung.
 *
 * Die Felder `paket` und `betrag` der alten Fassung hat der Aufrufer nie
 * geliefert; der Block zeigte deshalb nur den Namen. Jetzt stehen Betrag,
 * Leads und Karrierestufe darin, so wie der RechnungsTab sie übergibt.
 */

interface Props {
  bewerberName?: string
  leadPaketBetragFormatiert?: string
  leadAnzahl?: number
  karriereStufe?: string
  bewerberLink?: string
}

const Mail = ({ bewerberName, leadPaketBetragFormatiert, leadAnzahl, karriereStufe, bewerberLink }: Props) => {
  const vorgang: Array<[string, string]> = []
  if (bewerberName) vorgang.push(['Bewerber', bewerberName])
  if (leadPaketBetragFormatiert) vorgang.push([LEAD_PAKET_RECHNUNG_ZEILE_BETRAG, leadPaketBetragFormatiert])
  if (typeof leadAnzahl === 'number' && leadAnzahl > 0) {
    vorgang.push([LEAD_PAKET_RECHNUNG_ZEILE_LEADS, leadPaketRechnungLeads(leadAnzahl)])
  }
  if (karriereStufe) vorgang.push(['Karrierestufe', karriereStufe])

  return (
    <EmailLayout
      augenbraue={LEAD_PAKET_BEZAHLT_AUGENBRAUE}
      titel={LEAD_PAKET_BEZAHLT_TITEL}
      vorschau={leadPaketBezahltVorschau(bewerberName)}
      anrede="Hallo Christian,"
      intern
      ohneUnterschrift
    >
      <Absatz letzter>{leadPaketBezahltText(bewerberName)}</Absatz>

      {bewerberLink && <Handlung href={bewerberLink} text="Bewerberprofil öffnen" />}

      {vorgang.length > 0 && <Angaben titel={LEAD_PAKET_BEZAHLT_BLOCK} zeilen={vorgang} />}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => leadPaketBezahltBetreff(data?.bewerberName),
  displayName: LEAD_PAKET_BEZAHLT_ANZEIGENAME,
  previewData: {
    bewerberName: 'Julian Meyer',
    leadPaketBetragFormatiert: formatiereLeadPaketBetrag(VORSCHAU_LEAD_PAKET.betrag),
    leadAnzahl: VORSCHAU_LEAD_PAKET.anzahl,
    karriereStufe: 'vertriebspartner',
    bewerberLink: 'https://portal.more.immo/bewerberprozess?bewerber=example-id',
  },
} satisfies TemplateEntry
