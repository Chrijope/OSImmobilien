import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Handlung, type Ansprechpartner } from './_layout.tsx'
import {
  HR_ANRUF_AUGENBRAUE,
  HR_ANRUF_KNOPF,
  HR_ANRUF_SCHLUSS,
  HR_ANRUF_TITEL,
  HR_SICHTUNG_TITEL,
  buchungHrBetreff,
  sichtungHrBetreff,
} from '../bewerber-kennenlernen-mail.ts'

/**
 * Die interne Meldung zu einem Bewerber, der liegen bleibt.
 *
 * Drei Anlässe, eine Vorlage:
 *
 *   `bogen`     Tag 11, das Kennenlernen wurde nie abgeschickt.
 *   `sichtung`  Tag 3 und Tag 7, der Bogen liegt abgeschickt da und niemand
 *               hat entschieden, ob eingeladen oder abgesagt wird.
 *   `termin`    Tag 10 nach der Einladung, ein Termin fehlt.
 *
 * ## Warum `sichtung` dazugekommen ist
 *
 * Seit dem 08.09.2026 endet der Kennenlernbogen ohne Terminwahl. Vorher mahnte
 * die Kette an dieser Stelle den Bewerber, sich endlich einen Termin
 * auszusuchen; das ist sinnlos geworden, weil er gar nicht buchen kann, solange
 * niemand ihn eingeladen hat. Die Mahnung ist deshalb nicht entfallen, sondern
 * umgedreht: Sie geht an uns. Ohne sie wäre die Umstellung ein Rückschritt,
 * denn ein Bogen, den niemand ansieht, lässt einen Menschen warten, dem wir
 * gerade geschrieben haben, dass wir uns melden.
 *
 * ## Warum es sie überhaupt gibt
 *
 * Diese Meldungen endeten bisher mit einer Glocke im CRM. Eine Glocke sieht nur,
 * wer gerade im CRM arbeitet; wer drei Tage unterwegs ist, findet sie in der
 * Liste nie wieder. Genau an dieser Stelle bricht der Ablauf ab, und zwar
 * lautlos: Niemand merkt, dass niemand angerufen hat. Deshalb ab dem
 * 07.09.2026 zusätzlich eine Mail. Die Glocke bleibt, sie ist die schnellere
 * der beiden.
 *
 * Sie geht an die Rolle `hr`, nicht an eine Person. Wechselt die Person,
 * wechselt der Empfänger mit, ohne dass jemand Code anfasst.
 *
 * ## Warum sie so kurz ist
 *
 * Sie hat genau eine Aufgabe: anrufen. Deshalb der Name, die Zahl der Tage,
 * die Telefonnummer und ein Knopf in die Akte. Alles Weitere steht dort.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 176 60995539',
  email: 'office@more.immo',
}

/*
 * Der Anlass 'bogen' ist am 14.09.2026 entfallen. Wer das Kennenlernen nie
 * geöffnet hat, bekommt seit dieser Fassung an Tag 11 selbst eine Mail, und
 * sein Stand geht dabei auf „Kein Interesse". Eine Bitte an HR gibt es dort
 * nicht mehr, siehe `bewerber-kennenlernen-erinnerung-3`.
 */
export type HrAnrufAnlass = 'termin' | 'sichtung'

interface Props {
  anlass?: HrAnrufAnlass
  /** Der Name des Bewerbers, nicht der Name der Empfängerin. */
  bewerberName?: string
  bewerberEmail?: string
  bewerberTelefon?: string
  /** Der Satz, der sagt, was los ist. Kommt aus dem gemeinsamen Wortlaut. */
  nachricht?: string
  /** Der Weg in die Akte. Fehlt er, entfällt der Knopf. */
  bewerberUrl?: string
  berater?: Ansprechpartner
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  anlass = 'termin',
  bewerberName,
  bewerberEmail,
  bewerberTelefon,
  nachricht,
  bewerberUrl,
  berater,
  hrKontakt,
}: Props) => {
  const name = (bewerberName || '').trim() || 'Ein Bewerber'
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)

  const zeilen: Array<[string, string]> = []
  if (bewerberName) zeilen.push(['Bewerber', bewerberName])
  if (bewerberTelefon) zeilen.push(['Telefon', bewerberTelefon])
  if (bewerberEmail) zeilen.push(['E-Mail', bewerberEmail])

  return (
    <EmailLayout
      augenbraue={HR_ANRUF_AUGENBRAUE}
      titel={anlass === 'sichtung' ? HR_SICHTUNG_TITEL : HR_ANRUF_TITEL}
      vorschau={
        anlass === 'sichtung'
          ? `Der Bogen von ${name} wartet auf eure Entscheidung.`
          : `${name} hat keinen Termin gebucht.`
      }
      anrede="Hallo,"
      person={person}
    >
      <Absatz letzter>{nachricht || ''}</Absatz>

      {zeilen.length > 0 && <Angaben titel="Wen es betrifft" zeilen={zeilen} />}

      {bewerberUrl && <Handlung href={bewerberUrl} text={HR_ANRUF_KNOPF} />}

      <Absatz letzter>{HR_ANRUF_SCHLUSS}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const name = String(data?.bewerberName || '').trim() || 'Ein Bewerber'
    if (data?.anlass === 'sichtung') return sichtungHrBetreff(name)
    return buchungHrBetreff(name)
  },
  displayName: 'Bewerberprozess, interne Meldung an HR',
  previewData: {
    anlass: 'termin',
    bewerberName: 'Max Mustermann',
    bewerberEmail: 'max.mustermann@example.com',
    bewerberTelefon: '+49 170 1234567',
    nachricht:
      'Max Mustermann ist eingeladen, hat aber seit 10 Tagen keinen Termin gebucht. Bitte anrufen und den Termin gemeinsam buchen.',
    bewerberUrl: 'https://portal.more.immo/bewerberprozess?bewerber=beispiel',
    berater: STANDARD,
  },
} satisfies TemplateEntry
