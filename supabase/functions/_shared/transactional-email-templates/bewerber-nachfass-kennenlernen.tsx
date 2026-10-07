import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { berufsbezeichnung } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, Handlung, Haken, Luft, Nebenhandlung, T, type Ansprechpartner } from './_layout.tsx'
import {
  KL_NACHFASS_ABSAGE,
  KL_NACHFASS_ABSAGE_TITEL,
  KL_NACHFASS_AUGENBRAUE,
  KL_NACHFASS_BETREFF,
  KL_NACHFASS_DANACH,
  KL_NACHFASS_DANKE,
  KL_NACHFASS_INHALT,
  KL_NACHFASS_KNOPF,
  KL_NACHFASS_KNOPF_HINWEIS,
  KL_NACHFASS_PUNKTE,
  KL_NACHFASS_SCHLUSS,
  KL_NACHFASS_TITEL,
  KL_NACHFASS_VORSCHAU,
  NACHFASS_KEIN_INTERESSE,
  NACHFASS_KEIN_INTERESSE_HINWEIS,
  keinInteresseLink,
  nachfassAnrede,
} from '../bewerber-nachfass.ts'

/**
 * Die zweite Sammelmail an alle Bewerber im Status Eingang.
 *
 * Die erste (`bewerber-nachfass-eingang`) fuehrte zur Terminbuchung. Diese
 * fuehrt zum Kennenlernbogen, und das ist der einzige Unterschied, den der
 * Bewerber sehen soll. Dass der Ablauf sich geaendert hat, steht bewusst
 * nirgends: Fuer ihn ist das keine Information, sondern eine Entschuldigung,
 * die er nicht verlangt hat.
 *
 * **Zwei offene Wege, und das ist Absicht.** Der Hauptknopf oeffnet das
 * Kennenlernen. Darunter steht, in voller Textgroesse und nicht
 * kleingedruckt, der Weg zur Absage: ein unterstrichener Verweis, kein
 * zweiter Knopf. Das ist die `Nebenhandlung` des Layouts, und die Abstufung
 * ist gewollt, denn der Hauptweg soll der Hauptweg bleiben. Sichtbar ist er
 * trotzdem. Eine ehrliche Absage ist fuer das Haus mehr wert als ein
 * Bewerber, der im Eingang liegen bleibt und dreimal erinnert wird. Wer ihn
 * klickt, landet auf einer Seite, die beim Oeffnen nichts aendert; erst der
 * Knopf dort meldet ab, und dabei kann er sagen, woran es lag.
 *
 * Jeder Bewerber bekommt seinen eigenen Kennenlernlink. Ohne ihn geht die Mail
 * nicht hinaus, siehe `send-bewerber-nachfass`.
 *
 * Wortlaut in `_shared/bewerber-nachfass.ts`, damit der Vitest-Test und die
 * Vorschau im Versanddialog ihn lesen koennen.
 */

interface Props {
  bewerberName?: string
  /** Der persoenliche Link zum Kennenlernen. Ohne ihn hat die Mail keinen Zweck. */
  kennenlernenLink?: string
  /** Das Token dieses Bewerbers aus `bewerber_abmeldung`. */
  abmeldeToken?: string
  /** Alternativ der fertige Absagelink, etwa fuer die Vorschau. */
  keinInteresseLink?: string
  hrKontakt?: Ansprechpartner
  berater?: Ansprechpartner
}

const Mail = ({
  bewerberName,
  kennenlernenLink,
  abmeldeToken,
  keinInteresseLink: fertigerLink,
  hrKontakt,
  berater,
}: Props) => {
  const person: Ansprechpartner | undefined = hrKontakt?.name ? hrKontakt : berater
  const abmeldeLink = fertigerLink || (abmeldeToken ? keinInteresseLink(abmeldeToken) : '')

  return (
    <EmailLayout
      augenbraue={KL_NACHFASS_AUGENBRAUE}
      titel={KL_NACHFASS_TITEL}
      vorschau={KL_NACHFASS_VORSCHAU}
      anrede={nachfassAnrede(bewerberName)}
      person={person}
    >
      <Absatz>{KL_NACHFASS_DANKE}</Absatz>

      <Absatz letzter>{KL_NACHFASS_INHALT}</Absatz>

      <Haken punkte={KL_NACHFASS_PUNKTE} />

      {kennenlernenLink && (
        <Handlung
          href={kennenlernenLink}
          text={KL_NACHFASS_KNOPF}
          hinweis={KL_NACHFASS_KNOPF_HINWEIS}
        />
      )}

      <Absatz letzter>{KL_NACHFASS_DANACH}</Absatz>

      <Luft hoehe={10} />

      <Absatz letzter>
        {/* `T` ist die Farbtafel des Layouts, kein Bauteil. Fettdruck deshalb
            von Hand, mit der Textfarbe aus derselben Tafel. Die Klasse
            `mi-text` muss dazu: Der Dunkelmodus laeuft ueber Klassen, ein
            Inline-Stil allein bliebe dort schwarz auf schwarzem Grund. */}
        <span className="mi-text" style={{ fontWeight: 600, color: T.text }}>
          {KL_NACHFASS_ABSAGE_TITEL}
        </span>{' '}
        {KL_NACHFASS_ABSAGE}
      </Absatz>

      {/* Ohne Token gibt es keinen Link. Die Aufforderung "sag uns das kurz"
          ohne Weg dorthin waere eine leere Bitte. */}
      {abmeldeLink && (
        <Nebenhandlung
          href={abmeldeLink}
          text={NACHFASS_KEIN_INTERESSE}
          hinweis={NACHFASS_KEIN_INTERESSE_HINWEIS}
        />
      )}

      {/* Der Schlusssatz braucht Abstand zur Nebenhandlung, die selbst keinen
          nach unten setzt. */}
      <div style={{ height: '28px', fontSize: 0, lineHeight: 0 }}>&nbsp;</div>
      <Absatz letzter>{KL_NACHFASS_SCHLUSS}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: KL_NACHFASS_BETREFF,
  displayName: 'Bewerber: Sammelmail zum Kennenlernen',
  previewData: {
    bewerberName: 'Max Mustermann',
    kennenlernenLink: 'https://osimmobilien.netlify.app/kennenlernen/beispiel-token',
    keinInteresseLink: keinInteresseLink('beispiel-token'),
    hrKontakt: {
      name: 'Sarah Kaiser-Thom',
      rolle: berufsbezeichnung('hr'),
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
