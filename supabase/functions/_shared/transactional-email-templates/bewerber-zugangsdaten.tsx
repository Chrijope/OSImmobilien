import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Handlung, Hinweis, Nebenhandlung } from './_layout.tsx'
import { MAIL_ANLEITUNG_URL, onboardingTerminSatz } from '../bewerber-zugangsdaten.ts'

/**
 * Zugangsdaten der neuen persoenlichen @os-immobilien.com-Adresse an die private
 * Bewerber-Adresse. Bewusst ohne Unterschrifts- und Ansprechpartner-Block
 * (neutrale Systemmail) und ohne Abmeldelink (kein Newsletter). Das Passwort
 * steht nur in dieser Mail, im CRM wird es nicht gespeichert.
 */
interface Props {
  vorname?: string
  persoenlicheEmail?: string
  passwort?: string
  onboardingDatum?: string
  onboardingUhrzeit?: string
}

/*
 * Die Anleitung ist eine oeffentliche PDF und kein Link ins CRM: Der Bewerber
 * hat beim Empfang dieser Mail noch keinen CRM-Zugang. Knopf und Textlink
 * zeigen auf dieselbe Adresse, der Textlink hilft, wenn ein Mailprogramm den
 * Knopf nicht anzeigt.
 */
const Mail = ({ vorname, persoenlicheEmail, passwort, onboardingDatum, onboardingUhrzeit }: Props) => {
  const terminSatz = onboardingTerminSatz(onboardingDatum, onboardingUhrzeit)

  return (
    <EmailLayout
      augenbraue="Willkommen an Bord"
      titel="Deine persönliche OS Immobilien Adresse"
      vorschau="Deine persönliche OS Immobilien E-Mail-Adresse ist bereit."
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      ohneUnterschrift
      intern
    >
      <Absatz>
        willkommen an Bord! Deine persönliche OS Immobilien E-Mail-Adresse ist eingerichtet und
        ab sofort einsatzbereit.
      </Absatz>

      <Angaben
        titel="Deine Zugangsdaten"
        zeilen={[
          ['E-Mail-Adresse', persoenlicheEmail || ''],
          ['Passwort', passwort || ''],
        ]}
      />

      <Hinweis ton="warnung" text="Bitte ändere das Passwort nach der ersten Anmeldung." />

      <Angaben
        titel="Einrichtung in deinem Mailprogramm"
        zeilen={[
          ['Posteingang (IMAP)', 'imap.one.com · Port 993 · SSL/TLS'],
          ['Postausgang (SMTP)', 'send.one.com · Port 465 · SSL/TLS'],
          ['Benutzername', persoenlicheEmail || 'deine neue Adresse'],
        ]}
      />

      <Absatz>
        Eine Schritt-für-Schritt-Anleitung zur Einrichtung findest du unter folgendem Button
        oder unter folgendem Link.
      </Absatz>

      <Handlung href={MAIL_ANLEITUNG_URL} text="Anleitung öffnen" />
      <Nebenhandlung href={MAIL_ANLEITUNG_URL} text={MAIL_ANLEITUNG_URL} />

      <Absatz letzter>
        In deinem neuen Postfach warten außerdem bereits die Einladungen zu CRM und Investagon
        auf dich. Beide sind die Grundlage für dein Onboarding mit Christian Peetz. {terminSatz}
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: 'Deine persönliche OS Immobilien E-Mail-Adresse ist bereit',
  displayName: 'Bewerber-Zugangsdaten (persönliche Mailadresse)',
  previewData: {
    vorname: 'Max',
    persoenlicheEmail: 'm.mustermann@os-immobilien.com',
    passwort: 'Beispiel-Startpasswort',
    onboardingDatum: '24.08.2026',
    onboardingUhrzeit: '10:00',
  },
} satisfies TemplateEntry
