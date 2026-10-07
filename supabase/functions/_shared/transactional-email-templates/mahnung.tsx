import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Hinweis } from './_layout.tsx'

interface Props {
  mieterName?: string
  stufe?: 1 | 2 | 3
  betreff?: string
  textIntro?: string
  textSchluss?: string
  mietobjekt?: string
  mietzeitraum?: string
  sollFormatted?: string
  gezahltFormatted?: string
  ausstehendFormatted?: string
  fristDatum?: string
  absenderFirma?: string
  titel?: string
}

const Mail = ({
  mieterName,
  stufe = 1,
  betreff,
  textIntro,
  textSchluss,
  mietobjekt,
  mietzeitraum,
  sollFormatted,
  gezahltFormatted,
  ausstehendFormatted,
  fristDatum,
  absenderFirma,
  titel,
}: Props) => {
  const zeilen: Array<[string, string]> = [
    ['Mietobjekt', mietobjekt || 'ohne Angabe'],
    ['Mietzeitraum', mietzeitraum || 'ohne Angabe'],
    ['Gesamtmiete (Soll)', sollFormatted || 'ohne Angabe'],
    ['Bereits gezahlt', gezahltFormatted || '0,00 €'],
    ['Ausstehend', ausstehendFormatted || 'ohne Angabe'],
  ]

  return (
    <EmailLayout
      augenbraue={`${titel || 'Mahnung'}, Stufe ${stufe} von 3`}
      titel={betreff || 'Ausstehende Mietzahlung'}
      vorschau={betreff || 'Ausstehende Mietzahlung'}
      anrede={mieterName ? `Sehr geehrte/r ${mieterName},` : 'Sehr geehrte Damen und Herren,'}
      person={{ name: absenderFirma || 'OS Immobilien', rolle: 'Hausverwaltung' }}
    >
      <Absatz letzter>{textIntro}</Absatz>

      <Angaben titel="Die offene Position" zeilen={zeilen} />

      {fristDatum && (
        <Hinweis ton="warnung" text={`Zahlungsfrist: ${fristDatum}`} />
      )}

      {textSchluss && <Absatz>{textSchluss}</Absatz>}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => d?.betreff || 'Ausstehende Mietzahlung',
  displayName: 'Mahnung / Zahlungserinnerung',
  previewData: {
    mieterName: 'Max Mustermann',
    stufe: 1,
    betreff: 'Zahlungserinnerung, ausstehende Mietzahlung',
    textIntro:
      'bei der Überprüfung unserer Konten haben wir festgestellt, dass die nachstehend aufgeführte Zahlung bisher nicht bei uns eingegangen ist.',
    textSchluss: 'Bitte überweisen Sie den ausstehenden Betrag innerhalb der genannten Frist.',
    mietobjekt: 'Musterstraße 12, München',
    mietzeitraum: 'Mai 2026',
    sollFormatted: '1.250,00 €',
    gezahltFormatted: '0,00 €',
    ausstehendFormatted: '1.250,00 €',
    fristDatum: '07.07.2026',
    absenderFirma: 'OS Immobilien',
    titel: 'Zahlungserinnerung',
  },
} satisfies TemplateEntry
