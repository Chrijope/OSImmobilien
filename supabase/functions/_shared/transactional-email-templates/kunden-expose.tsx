import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { bezeichnungInSprache, gueltigkeitsSatz, kundenlinkBetreff } from '../kunden-expose.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Der persönliche Kundenlink an den Kunden, verschickt von
 * `send-kunden-expose`. Zwei Arten, derselbe Aufbau:
 *   - `objektuebersicht`: die Objektübersicht des Hauses, Einstieg bei einer
 *     Wohnung. Betreff „Deine Objektübersicht: Wohnung 7, Parkstraße 8,
 *     Augsburg“ (Christian, 23.09.2026).
 *   - `expose` (auch ohne Angabe): das Exposé einer Einheit oder des ganzen
 *     Objekts, wie bisher.
 *
 * Eine Handlung: der Knopf zum Link. Bewusst ohne Preise oder andere Zahlen.
 * Die stehen auf der Seite selbst, dort mit Stand und neutralen Annahmen; in
 * einer Mail veralten sie und lassen sich weiterleiten, ohne dass der
 * Zusammenhang mitkommt.
 */
interface Props {
  /** `objektuebersicht` oder `expose`. Alles andere gilt als Exposé. */
  art?: string
  /** Voller Name aus dem Kontakt, die Anrede nimmt daraus den Vornamen. */
  name?: string
  /** „Wohnung 7, Parkstraße 8, Augsburg“ */
  bezeichnung?: string
  /** Objektübersicht mit Einstiegswohnung: Satz über die übrigen freien Wohnungen des Hauses. */
  mitWohnungen?: boolean
  link?: string
  /** „22. November 2026“ */
  gueltigBis?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  uebersichtAugenbraue: 'Objektübersicht',
  uebersichtTitel: 'Deine Objektübersicht',
  uebersichtVorschau: 'Bilder, Lage, Objektdaten und Unterlagen an einem Ort.',
  uebersichtText: (wofuer: string, mitWohnungen: boolean) =>
    `${wofuer ? `hier ist deine persönliche Objektübersicht für ${wofuer}.` : 'hier ist deine persönliche Objektübersicht.'} Darin findest du Bilder, Lage, Objektdaten und Unterlagen, alles an einem Ort und in Ruhe zum Anschauen.${mitWohnungen ? ' Gibt es im Haus noch weitere freie Wohnungen, siehst du sie dort ebenfalls.' : ''}`,
  uebersichtKnopf: 'Objektübersicht ansehen',
  exposeAugenbraue: 'Exposé',
  exposeTitel: 'Dein persönliches Exposé',
  exposeVorschau: 'Bilder, Lage, Objektdaten und ein Rechner zum Durchspielen.',
  exposeText: (wofuer: string) =>
    `${wofuer ? `hier ist dein persönliches Exposé für ${wofuer}.` : 'hier ist dein persönliches Exposé.'} Darin findest du Bilder, Lage und Objektdaten sowie einen Rechner, mit dem du die Zahlen in Ruhe durchspielen kannst.`,
  exposeKnopf: 'Exposé ansehen',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    uebersichtAugenbraue: 'Property overview',
    uebersichtTitel: 'Your property overview',
    uebersichtVorschau: 'Photos, location, property details and documents in one place.',
    uebersichtText: (wofuer: string, mitWohnungen: boolean) =>
      `${wofuer ? `Here is your personal property overview for ${wofuer}.` : 'Here is your personal property overview.'} It contains photos, the location, property details and documents, all in one place for you to look through at your leisure.${mitWohnungen ? ' If there are other apartments still available in the building, you will see them there as well.' : ''}`,
    uebersichtKnopf: 'View the property overview',
    exposeAugenbraue: 'Exposé',
    exposeTitel: 'Your personal exposé',
    exposeVorschau: 'Photos, location, property details and a calculator to try out the figures.',
    exposeText: (wofuer: string) =>
      `${wofuer ? `Here is your personal exposé for ${wofuer}.` : 'Here is your personal exposé.'} It contains photos, the location and property details, as well as a calculator you can use to work through the figures at your leisure.`,
    exposeKnopf: 'View the exposé',
  },
}

const Mail = ({ art, name, bezeichnung, mitWohnungen, link, gueltigBis, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const wofuer = bezeichnungInSprache(bezeichnung, sprache)
  // Die Seite hinter dem Link bleibt bis Etappe 3 deutsch; der Link selbst ist fuer beide gleich.
  const gueltig = gueltigkeitsSatz(datumFuer(gueltigBis, sprache), sprache)

  if (art === 'objektuebersicht') {
    return (
      <EmailLayout
        sprache={sprache}
        augenbraue={t.uebersichtAugenbraue}
        titel={t.uebersichtTitel}
        vorschau={t.uebersichtVorschau}
        anrede={hallo(name, sprache)}
        person={berater}
      >
        <Absatz letzter>{t.uebersichtText(wofuer, Boolean(mitWohnungen))}</Absatz>

        <Handlung sprache={sprache} href={link || ''} text={t.uebersichtKnopf} hinweis={gueltig} />
      </EmailLayout>
    )
  }

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.exposeAugenbraue}
      titel={t.exposeTitel}
      vorschau={t.exposeVorschau}
      anrede={hallo(name, sprache)}
      person={berater}
    >
      <Absatz letzter>{t.exposeText(wofuer)}</Absatz>

      <Handlung sprache={sprache} href={link || ''} text={t.exposeKnopf} hinweis={gueltig} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (d: Record<string, any>) => kundenlinkBetreff(d?.art, d?.bezeichnung, d?.sprache),
  displayName: 'Kundenlink (Objektübersicht oder Exposé)',
  sprachen: DE_EN,
  previewData: {
    art: 'objektuebersicht',
    name: 'Martina Brandl',
    bezeichnung: 'Wohnung 7, Parkstraße 8, Augsburg',
    mitWohnungen: true,
    link: 'https://osimmobilien.netlify.app/immobilie/0000000000000000000000000000000000000000000000000000000000000000',
    gueltigBis: '22. November 2026',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
