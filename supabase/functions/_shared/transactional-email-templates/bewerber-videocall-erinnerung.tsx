import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Angaben, Handlung, Nebenhandlung, type Ansprechpartner } from './_layout.tsx'
import {
  TERMIN_KNOPF_HINWEIS,
  TERMIN_VERWALTEN_TEXT,
  VIDEOCALL_ERINNERUNG_AUGENBRAUE,
  VIDEOCALL_ERINNERUNG_SCHLUSS,
  VIDEOCALL_ERINNERUNG_SCHLUSS_OHNE_LINK,
  videocallErinnerungBetreff,
  videocallErinnerungText,
  videocallErinnerungTitel,
} from '../bewerber-termin-mail.ts'

/**
 * Die Erinnerung vor dem persönlichen Gespräch: 24, 6 und 1 Stunde vorher.
 *
 * Das Gegenstück zu `bewerber-erstgespraech-erinnerung`, die im bestehenden
 * Bewerbungsmanagement an ein Telefonat erinnert. Zwei getrennte Vorlagen,
 * weil zwei verschiedene Dinge angekündigt werden: Dort ruft jemand an, hier
 * treffen sich beide in einem Videoraum. Die alte Fassung schrieb dem
 * Bewerber „ich rufe Sie pünktlich zur vereinbarten Zeit an" und nannte keinen
 * Link, obwohl gar niemand anrief.
 *
 * Anrede Du, wie das gesamte Kennenlernen.
 */

const STANDARD: Ansprechpartner = {
  name: 'Christian Kurz',
  rolle: 'Ansprechpartner Vertriebspartnerschaften',
  telefon: '+49 30 863289210',
  email: 'os@os-immobilien.com',
}

interface Props {
  bewerberName?: string
  /** „in 24 Stunden", „in 6 Stunden" oder „in 1 Stunde". */
  vorText?: string
  /**
   * Die Uhrzeit in Ziffern, nur für die letzte Stufe.
   *
   * „In einer Stunde" zwingt sonst jeden zum Rechnen, und wer die Mail zwanzig
   * Minuten später öffnet, rechnet falsch. Leer bei 24 und 6 Stunden: Dort
   * meint die Uhrzeit einen anderen Tag beziehungsweise klingt sie nach
   * „gleich".
   */
  uhrzeitImText?: string
  terminDatum?: string
  terminUhrzeit?: string
  terminDauer?: number
  /** Wer im Videoraum wartet. */
  beraterName?: string
  /** Der eigene Videoraum. Fehlt er, entfällt der Knopf. */
  zugangUrl?: string
  /** Der persönliche Link zum Verschieben und Absagen. */
  verwaltenUrl?: string
  berater?: Ansprechpartner
  hrKontakt?: Ansprechpartner
}

const Mail = ({
  hrKontakt,
  bewerberName,
  vorText,
  uhrzeitImText,
  terminDatum,
  terminUhrzeit,
  terminDauer,
  beraterName,
  zugangUrl,
  verwaltenUrl,
  berater,
}: Props) => {
  const wann = vorText?.trim() || 'in Kürze'
  const vorname = bewerberName ? bewerberName.split(' ')[0] : ''
  const person: Ansprechpartner = hrKontakt?.name ? hrKontakt : (berater?.name ? berater : STANDARD)

  const zeilen: Array<[string, string]> = []
  if (terminDatum) zeilen.push(['Datum', terminDatum])
  if (terminUhrzeit) zeilen.push(['Uhrzeit', `${terminUhrzeit} Uhr`])
  if (terminDauer) zeilen.push(['Dauer', `${terminDauer} Minuten`])
  if (beraterName) zeilen.push(['Wir sprechen mit', beraterName])

  return (
    <EmailLayout
      augenbraue={VIDEOCALL_ERINNERUNG_AUGENBRAUE}
      titel={videocallErinnerungTitel(wann)}
      vorschau={
        zugangUrl
          ? `Der Link zum Videoraum, für unseren Termin ${wann}.`
          : `Erinnerung an unseren Termin ${wann}.`
      }
      anrede={vorname ? `Hallo ${vorname},` : 'Hallo,'}
      person={person}
    >
      <Absatz letzter>{videocallErinnerungText(wann, uhrzeitImText, !!zugangUrl)}</Absatz>

      {zugangUrl && (
        <Handlung href={zugangUrl} text="Videoraum öffnen" hinweis={TERMIN_KNOPF_HINWEIS} />
      )}

      {verwaltenUrl && <Nebenhandlung href={verwaltenUrl} text={TERMIN_VERWALTEN_TEXT} />}

      {zeilen.length > 0 && <Angaben titel="Dein Termin" zeilen={zeilen} />}

      {/*
        Ohne Videoraum verweist der Schluss nicht auf einen persönlichen Link,
        den es in diesem Fall nicht gibt. Siehe bewerber-termin-mail.ts.
      */}
      <Absatz letzter>
        {zugangUrl ? VIDEOCALL_ERINNERUNG_SCHLUSS : VIDEOCALL_ERINNERUNG_SCHLUSS_OHNE_LINK}
      </Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => videocallErinnerungBetreff(String(data?.vorText || '')),
  displayName: 'Bewerber Persönliches Gespräch, Erinnerung 24 h, 6 h und 1 h vorher',
  previewData: {
    bewerberName: 'Max Mustermann',
    vorText: 'in 24 Stunden',
    terminDatum: '15.09.2026',
    terminUhrzeit: '10:00',
    terminDauer: 45,
    beraterName: 'Christian Kurz',
    zugangUrl: 'https://osimmobilien.netlify.app/raum/beispiel-token',
    verwaltenUrl: 'https://osimmobilien.netlify.app/kennenlernen/beispiel-token',
    berater: STANDARD,
  },
} satisfies TemplateEntry
