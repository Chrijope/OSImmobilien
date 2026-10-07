import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Hinweis } from './_layout.tsx'

/**
 * Interne Meldung an HR: Ein versendeter Vertrag liegt seit Tagen unsigniert.
 *
 * Bis hierher war der Vertragsversand die stillste Stelle im ganzen Prozess.
 * Der Link ist 30 Tage gültig und lief danach lautlos ab, ohne dass jemand im
 * Haus davon erfuhr. Zu diesem Zeitpunkt sind Werbebudget, Erstgespräch und ein
 * Closing bereits investiert, es ist also die teuerste Stelle zum Aufgeben.
 *
 * Die Mail geht an HR, Inhaber und Admins, nicht an den Bewerber.
 */

interface Props {
  bewerberName?: string
  bewerberEmail?: string
  bewerberTelefon?: string
  tageOffen?: number
  versendetAm?: string
  stufe?: string
  handlung?: string
  profilLink?: string
  restTage?: number
}

const Mail = ({
  bewerberName,
  bewerberEmail,
  bewerberTelefon,
  tageOffen,
  versendetAm,
  stufe,
  handlung,
  profilLink,
  restTage,
}: Props) => (
  <EmailLayout
    augenbraue="Vertrag offen"
    titel={`${bewerberName || 'Ein Bewerber'} hat noch nicht unterschrieben`}
    vorschau={`Seit ${tageOffen ?? '?'} Tagen offen. ${handlung || ''}`}
    intern
    ohneUnterschrift
  >
    <Absatz>
      der Vertrag liegt seit {tageOffen} Tagen beim Bewerber und ist noch nicht
      unterschrieben. {handlung}
    </Absatz>

    <Angaben
      titel="Der Vorgang"
      zeilen={[
        ['Bewerber', bewerberName || ''],
        ['E-Mail', bewerberEmail || ''],
        ['Telefon', bewerberTelefon || 'nicht hinterlegt'],
        ['Vertrag versendet', versendetAm || ''],
        ['Offen seit', `${tageOffen} Tagen`],
        ['Eskalationsstufe', stufe || ''],
      ]}
    />

    {typeof restTage === 'number' && restTage <= 7 && (
      <Hinweis
        ton="warnung"
        text={`Der Signaturlink verfällt in ${restTage} Tagen. Danach muss der Vertrag neu erzeugt und erneut versendet werden.`}
      />
    )}

    <Absatz letzter>
      {profilLink
        ? `Bewerberprofil: ${profilLink}`
        : 'Das Bewerberprofil findest du im Bewerbermanagement.'}
    </Absatz>
  </EmailLayout>
)

export const template = {
  component: Mail,
  subject: (data: Record<string, unknown>) =>
    `Vertrag seit ${data.tageOffen ?? '?'} Tagen offen: ${data.bewerberName ?? 'Bewerber'}`,
  displayName: 'HR-Eskalation: Vertrag nicht unterschrieben',
  previewData: {
    bewerberName: 'Max Mustermann',
    bewerberEmail: 'max@example.com',
    bewerberTelefon: '+49 170 1234567',
    tageOffen: 7,
    versendetAm: '12.08.2026',
    stufe: 'Stufe 2 von 4',
    handlung: 'Bitte einmal persönlich anrufen und fragen, ob beim Lesen etwas unklar war.',
    profilLink: 'https://osimmobilien.netlify.app/bewerbung/beispiel',
    restTage: 23,
  },
} satisfies TemplateEntry
