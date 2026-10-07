/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben } from './_layout.tsx'

interface Props {
  bewerberName?: string
  paketTitel?: string
  signatureUrl?: string
  signedAt?: string
}

const Mail = ({ bewerberName, paketTitel, signatureUrl, signedAt }: Props) => {
  const wer = bewerberName || 'Ein Vertriebspartner'
  const zeilen: Array<[string, string]> = [['Vertriebspartner', wer]]
  if (paketTitel) zeilen.push(['Paket', paketTitel])
  if (signedAt) zeilen.push(['Unterschrieben am', signedAt])

  return (
    <EmailLayout
      augenbraue="Handelsvertretervertrag"
      titel="Gegenzeichnung erforderlich"
      vorschau={`${wer} hat den Handelsvertretervertrag unterschrieben.`}
      anrede="Hallo Christian,"
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        {wer} hat den Handelsvertretervertrag digital unterschrieben. Erst nach deiner
        Gegenzeichnung wird die beidseitig unterschriebene PDF im System abgelegt und an den
        Vertriebspartner zugestellt.
      </Absatz>

      <Handlung
        href={signatureUrl || ''}
        text="Jetzt gegenzeichnen"
        hinweis="Link 30 Tage gültig  ·  Danach läuft die Rechnungserstellung automatisch an"
      />

      <Angaben titel="Vorgang" zeilen={zeilen} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: any) => `Vertrag gegenzeichnen: ${d?.bewerberName || 'Vertriebspartner'}`,
  displayName: 'Vertrag, Gegenzeichnung Kurz',
  to: 'office@more.immo',
  previewData: {
    bewerberName: 'Hermann Jürgen Vogl',
    paketTitel: 'Lead Berater',
    signatureUrl: 'https://portal.more.immo/signatur?token=example&type=vertrag_kurz',
    signedAt: '16.06.2026, 09:14',
  },
} satisfies TemplateEntry
