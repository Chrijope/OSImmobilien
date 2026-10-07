import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Schritte } from './_layout.tsx'

/**
 * Interne Mail an den Vertriebspartner, sobald ihm ein Lead zugewiesen wurde.
 *
 * Bewusst im internen Du und ohne Abmeldelink (`intern`): Empfaenger ist ein
 * Partner, kein Kunde. Der Knopf fuehrt direkt in das Kundenprofil im CRM,
 * damit zwischen Mail und Anruf kein Suchen liegt.
 */
interface Props {
  partnerVorname?: string
  leadName?: string
  leadTelefon?: string
  leadEmail?: string
  leadQuelle?: string
  leadOrt?: string
  profilUrl?: string
}

const Mail = ({ partnerVorname, leadName, leadTelefon, leadEmail, leadQuelle, leadOrt, profilUrl }: Props) => {
  const name = (leadName || '').trim() || 'Ein neuer Lead'
  const zeilen: Array<[string, string]> = []
  if (leadTelefon) zeilen.push(['Telefon', leadTelefon])
  if (leadEmail) zeilen.push(['E-Mail', leadEmail])
  if (leadOrt) zeilen.push(['Ort', leadOrt])
  if (leadQuelle) zeilen.push(['Quelle', leadQuelle])

  return (
    <EmailLayout
      augenbraue="Neuer Lead"
      titel={`${name} wartet auf deinen Anruf`}
      vorschau={`${name} wurde dir gerade zugewiesen. Jetzt anrufen.`}
      anrede={partnerVorname ? `Hey ${partnerVorname},` : 'Hey,'}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>
        du hast einen neuen Lead erhalten. <strong>{name}</strong> wurde dir gerade zugewiesen und
        wartet auf deinen direkten oder zeitnahen Anruf. Je schneller der erste Kontakt, desto
        groesser die Chance auf ein Erstgespraech.
      </Absatz>

      <Handlung
        href={profilUrl || ''}
        text="Lead-Profil oeffnen"
        hinweis="Am besten innerhalb der naechsten Stunde anrufen"
      />

      {zeilen.length > 0 && <Angaben titel="Kontaktdaten" zeilen={zeilen} />}

      <Schritte titel="Was jetzt zu tun ist" punkte={[
        'Anrufen und den Kontaktversuch im Profil protokollieren.',
        'Erreicht? Dann direkt das Erstgespraech terminieren.',
        'Nicht erreicht? Follow-up setzen, damit der Lead nicht liegen bleibt.',
      ]} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    data?.leadName ? `Neuer Lead: ${data.leadName} wartet auf deinen Anruf` : 'Neuer Lead wartet auf deinen Anruf',
  displayName: 'Neuer Lead an Vertriebspartner',
  previewData: {
    partnerVorname: 'Julian',
    leadName: 'Maja Mustermann',
    leadTelefon: '0170 1234567',
    leadEmail: 'maja@example.de',
    leadQuelle: 'Meta Ads',
    leadOrt: 'München',
    profilUrl: 'https://portal.more.immo/kunden/00000000-0000-0000-0000-000000000000',
  },
} satisfies TemplateEntry
