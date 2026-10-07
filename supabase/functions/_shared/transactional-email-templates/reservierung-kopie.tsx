import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Hinweis, Nebenhandlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Die Vertragskopie nach der letzten Unterschrift, mit dem PDF im Anhang.
 *
 * Bei einem Fernabsatzvertrag muss der Unternehmer den Vertrag samt
 * Widerrufsbelehrung auf einem dauerhaften Datentraeger bestaetigen
 * (§ 312f Abs. 2 BGB). Eine Download-Moeglichkeit im Portal reicht dafuer
 * nicht; ohne diese Mail beginnt die Widerrufsfrist nicht zu laufen.
 * Verschickt von finalize-reservierung, an jeden Kaeufer einzeln.
 *
 * Formell in der Sie-Form: Vertraege, Datenschutz und Widerruf bleiben beim
 * Sie, auch seit das uebrige Haus duzt (Gruppe F der Du-Umstellung). Die
 * englische Fassung ist foermlich (Plan 4.4). Das PDF im Anhang bleibt bis
 * Etappe 4 deutsch, das sagt die englische Mail ausdruecklich.
 *
 * Seit 05.10.2026 steht statt des Satzes zur Reservierungsgebuehr (Hoehe,
 * Frist, Abschnitt 4) der Verweis aufs Kundenportal, wo die Vereinbarung beim
 * Investment im Abschnitt Reservierung liegt (Christians Wunsch: nicht mit
 * der Gebuehr formulieren).
 */

/** Die Investments-Seite des Kundenportals, dort steht der Abschnitt Reservierung. */
export const KUNDENPORTAL_INVESTMENTS_URL = 'https://osimmobilien.netlify.app/kunde/investments'

interface Props {
  name?: string
  objektTitel?: string
  /** "sofort" oder "abwarten", siehe Abschnitt 7 der Vereinbarung. */
  widerrufWahl?: string
  /** Wenn abgewartet wird: der Tag, ab dem die Reservierung wirksam ist. */
  reservierungAb?: string
  /**
   * Wird fuer diese Reservierung keine Gebuehr erhoben? Dann steht im PDF
   * weder ein Gebuehrenabschnitt noch eine Widerrufsbelehrung, und diese Mail
   * darf beides ebenfalls nicht ankuendigen (seit 22.09.2026).
   */
  ohneGebuehr?: boolean
  /**
   * War die Einheit bei der Unterschrift schon an einen anderen Kunden
   * vergeben? Dann ist keine Reservierung zustande gekommen, und die Mail darf
   * keine Zahlung anfordern (Christians Regeln vom 23.09.2026). Die Kopie
   * geht trotzdem hinaus, weil der Kunde unterschrieben hat.
   */
  einheitVergeben?: boolean
  /**
   * Reservierung eines ganzen Hauses (Globalobjekt, seit 23.09.2026). Dann
   * spricht die Mail vom Objekt und nicht von einer Wohnung.
   */
  gesamtobjekt?: boolean
  /**
   * Keine Widerrufsbelehrung im PDF, weil eine Gesellschaft kauft. Die Mail
   * darf dann keine ankuendigen.
   */
  ohneWiderruf?: boolean
  /**
   * Portalzugang des Empfaengers, siehe `portalZugangFuer` in
   * `_shared/portal-verknuepfung.ts`. true: Knopf zum
   * Portal, false: Zugangsdaten folgen gesondert, fehlt: kein Portalabsatz.
   */
  portalZugang?: boolean
  berater?: Ansprechpartner
  sprache?: MailSprache
  kundeAnrede?: string
}

const DE = {
  betreff: 'Ihre Reservierungsvereinbarung: Vertragskopie',
  augenbraue: 'Ihre Vertragskopie',
  titel: 'Ihre Reservierungsvereinbarung',
  vorschau: 'Ihre unterschriebene Reservierungsvereinbarung liegt dieser E-Mail als PDF bei.',
  fuss: 'Die Reservierungsvereinbarung enthält persönliche Daten. Bitte bewahren Sie sie entsprechend auf.',
  einleitung: (objekt: string, mitWiderruf: boolean) =>
    `anbei erhalten Sie Ihre Reservierungsvereinbarung${objekt ? ` für ${objekt}` : ''} als PDF. Sie ist von allen Kaufinteressenten digital unterschrieben${mitWiderruf ? ' und enthält die Widerrufsbelehrung' : ''}. Bitte bewahren Sie das Dokument auf.`,
  nurDeutsch: '',
  vergeben: (gesamt: boolean) =>
    `Leider war ${gesamt ? 'das Objekt' : 'die Wohnung'} zum Zeitpunkt Ihrer Unterschrift bereits an einen anderen Kaufinteressenten vergeben. Die Reservierung ist deshalb nicht zustande gekommen. Bitte zahlen Sie keine Reservierungsgebühr; eine bereits gezahlte Gebühr erhalten Sie vollständig zurück. Ihr persönlicher Ansprechpartner meldet sich bei Ihnen.`,
  ohneGebuehr:
    'Für diese Reservierung wird keine Reservierungsgebühr erhoben. Die Reservierung und die Leistungen von OS Immobilien beginnen mit der Unterzeichnung dieser Vereinbarung.',
  abwarten: (ab: string, gesamt: boolean) =>
    `Sie haben gewählt, das Ende der Widerrufsfrist abzuwarten. Die Reservierung beginnt deshalb am ${ab}. Bis dahin ist ${gesamt ? 'das Objekt' : 'die Wohnung'} nicht für Sie reserviert und kann anderen Kaufinteressenten angeboten werden; kommt es dazu, erhalten Sie eine bereits gezahlte Reservierungsgebühr vollständig zurück.`,
  portal:
    'Ihre Reservierungsvereinbarung finden Sie jederzeit in Ihrem Kundenportal unter Ihrem Investment im Abschnitt Reservierung als PDF zum Herunterladen.',
  portalKnopf: 'Zum Kundenportal',
  portalFolgt:
    'Ihre Zugangsdaten zum Kundenportal erhalten Sie gesondert. Dort finden Sie die Vereinbarung dann jederzeit zum Herunterladen.',
  fragen: 'Bei Fragen wenden Sie sich jederzeit an Ihren persönlichen Ansprechpartner.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your reservation agreement: copy of the contract',
    augenbraue: 'Your copy of the contract',
    titel: 'Your reservation agreement',
    vorschau: 'Your signed reservation agreement is attached to this email as a PDF.',
    fuss: 'The reservation agreement contains personal data. Please keep it safe accordingly.',
    einleitung: (objekt: string, mitWiderruf: boolean) =>
      `Please find attached your reservation agreement${objekt ? ` for ${objekt}` : ''} as a PDF. It has been signed digitally by all prospective buyers${mitWiderruf ? ' and contains the information on your right of withdrawal (Widerrufsbelehrung)' : ''}. Please keep this document.`,
    nurDeutsch:
      'The attached agreement is drawn up in German. Your contact person at OS Immobilien will be glad to explain any part of it to you.',
    vergeben: (gesamt: boolean) =>
      `Unfortunately, at the time of your signature the ${gesamt ? 'property' : 'apartment'} had already been allocated to another prospective buyer. The reservation has therefore not come into effect. Please do not pay a reservation fee; any fee you have already paid will be refunded in full. Your personal contact person will get in touch with you.`,
    ohneGebuehr:
      'No reservation fee is charged for this reservation. The reservation and the services of OS Immobilien begin when this agreement is signed.',
    abwarten: (ab: string, gesamt: boolean) =>
      `You have chosen to wait until the end of the withdrawal period. The reservation therefore begins on ${ab}. Until then, the ${gesamt ? 'property' : 'apartment'} is not reserved for you and may be offered to other prospective buyers; should this happen, any reservation fee you have already paid will be refunded in full.`,
    portal:
      'You can find your reservation agreement at any time in your customer portal under your investment, in the Reservation section, as a PDF to download.',
    portalKnopf: 'Go to the customer portal',
    portalFolgt:
      'You will receive your login details for the customer portal separately. You will then be able to download the agreement there at any time.',
    fragen: 'If you have any questions, please contact your personal contact person at any time.',
  },
}

const Mail = ({ name, objektTitel, widerrufWahl, reservierungAb, ohneGebuehr, einheitVergeben, gesamtobjekt, ohneWiderruf, portalZugang, berater, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const gesamt = Boolean(gesamtobjekt)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={foermlich(name, sprache, kundeAnrede)}
      person={berater}
      fussHinweis={t.fuss}
    >
      <Absatz>{t.einleitung(objektTitel || '', !(ohneGebuehr || ohneWiderruf))}</Absatz>
      {t.nurDeutsch && <Absatz>{t.nurDeutsch}</Absatz>}

      {einheitVergeben ? (
        <Absatz>{t.vergeben(gesamt)}</Absatz>
      ) : ohneGebuehr ? (
        <Absatz>{t.ohneGebuehr}</Absatz>
      ) : widerrufWahl === 'abwarten' && reservierungAb ? (
        <Absatz>{t.abwarten(datumFuer(reservierungAb, sprache), gesamt)}</Absatz>
      ) : null}

      {portalZugang === true ? (
        <>
          <Absatz>{t.portal}</Absatz>
          <Handlung href={KUNDENPORTAL_INVESTMENTS_URL} text={t.portalKnopf} sprache={sprache} />
          <Nebenhandlung href={KUNDENPORTAL_INVESTMENTS_URL} text={KUNDENPORTAL_INVESTMENTS_URL} />
        </>
      ) : portalZugang === false ? (
        <Absatz>{t.portalFolgt}</Absatz>
      ) : null}

      <Hinweis text={t.fragen} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Reservierung Vertragskopie (an Kunde, mit PDF)',
  sprachen: DE_EN,
  previewData: {
    name: 'Erika Muster',
    objektTitel: 'Musterstraße 12, WE 6',
    widerrufWahl: 'abwarten',
    reservierungAb: '30.09.2026',
    portalZugang: true,
    berater: {
      name: 'Christian Peetz',
      rolle: 'Persönlicher Ansprechpartner bei OS Immobilien',
      telefon: '08061 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
