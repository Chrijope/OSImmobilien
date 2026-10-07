import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, type Ansprechpartner } from './_layout.tsx'
import {
  BEWERBER_ANZAHL_FRAGEN,
  BEWERBER_BUCHUNGSLINK,
  BEWERBER_EINGANG_DANKE,
  BEWERBER_EINGANG_TERMIN,
  bewerberFragebogenHinweis,
} from '../bewerber-eingangsmail.ts'

/**
 * Die Eingangsmail nach jeder Bewerbung, über alle drei Kanäle.
 *
 * Der Hauptknopf führt zur Terminbuchung: Die Mail sagt den Anruf zu, und wer
 * darauf nicht warten will, sucht sich über Calendly selbst einen Termin für
 * das 60-minütige Gespräch aus. Der Fragebogen bleibt erhalten, aber als
 * ruhiger Textlink unter dem Knopf; seine Erinnerungsstrecke und die
 * Bestätigungsseite dahinter funktionieren unverändert. Zwei gleich starke
 * Knöpfe gibt es weiterhin nicht, siehe `Nebenhandlung` im Layout.
 *
 * Wortlaut und Buchungslink liegen in `_shared/bewerber-eingangsmail.ts`,
 * damit der Vitest-Test sie prüfen kann.
 *
 * Anrede durchgängig Du, wie auf der Website und im Erstgesprächsskript.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

interface Props {
  bewerberName?: string
  formularLink?: string
  gueltigTage?: number
  anzahlFragen?: number
  beraterName?: string
  beraterEmail?: string
  beraterTelefon?: string
  beraterRolle?: string
  berater?: Ansprechpartner
  /**
   * Die HR-Managerin fuer den Kasten am Fuss der Mail.
   *
   * Getrennt von `berater`: Der fuehrt das Gespraech und gehoert in die
   * Terminangabe, die HR-Managerin bearbeitet die Bewerbung und ist die,
   * bei der man sich meldet. Frueher war das dasselbe Feld, und dann stand
   * unter jeder Mail derselbe Name wie im Termin.
   */
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  formularLink,
  gueltigTage = 14,
  anzahlFragen = BEWERBER_ANZAHL_FRAGEN,
  beraterName,
  beraterEmail,
  beraterTelefon,
  beraterRolle,
  berater,
}: Props) => {
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : {
    name: berater?.name || beraterName || STANDARD.name,
    rolle: berater?.rolle || beraterRolle || STANDARD.rolle,
    telefon: berater?.telefon || beraterTelefon || STANDARD.telefon,
    email: berater?.email || beraterEmail || STANDARD.email,
  }

  return (
    <EmailLayout
      augenbraue="Deine Bewerbung"
      titel="Danke für dein Interesse"
      vorschau="Wir melden uns zeitnah telefonisch bei dir. Oder du buchst dir direkt einen Gesprächstermin."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz>{BEWERBER_EINGANG_DANKE}</Absatz>

      <Absatz letzter>{BEWERBER_EINGANG_TERMIN}</Absatz>

      <Handlung
        href={BEWERBER_BUCHUNGSLINK}
        text="Gesprächstermin buchen, 60 Minuten"
        hinweis="Du wählst Tag und Uhrzeit selbst"
      />

      {/* Ohne Ziel lieber kein Link und keine Erklärung: Ein Verweis auf die
          Mail selbst wäre für den Bewerber eine Sackgasse. */}
      {formularLink && (
        <>
          <Nebenhandlung
            href={formularLink}
            text="Vorab den Fragebogen beantworten"
            hinweis={bewerberFragebogenHinweis(anzahlFragen, gueltigTage)}
          />

          <Absatz letzter>
            Der Fragebogen ist freiwillig. Wer ihn vor dem Gespräch beantwortet, spricht
            darin über die Dinge, die ihn wirklich betreffen, statt noch einmal zu
            erzählen, was er beruflich macht.
          </Absatz>
        </>
      )}
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Danke für dein Interesse an MOREImmo',
  displayName: 'Bewerber Eingangsbestätigung mit Terminbuchung und Fragebogen',
  previewData: {
    bewerberName: 'Max Mustermann',
    formularLink: 'https://portal.more.immo/bewerberfragen/beispiel-token',
    berater: STANDARD,
  },
} satisfies TemplateEntry
