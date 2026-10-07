import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { BERUF_IMMOBILIENBERATER } from '../berufsbezeichnung.ts'
import { EmailLayout, Absatz, Handlung, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Leeres Selbstauskunft-Formular als ausfuellbare PDF an den Kunden.
 *
 * Bewusst getrennt von "selbstauskunft-pdf": Dort geht die FERTIGE,
 * unterschriebene Selbstauskunft hinaus ("wurde digital bestätigt"). Hier
 * geht das LEERE Formular hinaus, fuer Kunden, denen der Online-Weg nicht
 * liegt. Der Text erklaert beide Wege: drucken und handschriftlich in
 * Druckbuchstaben, oder direkt am Computer ausfuellen.
 *
 * Das Formular selbst gibt es bis Etappe 4 nur deutsch. Die englische Mail
 * sagt das offen und bietet an, es gemeinsam auszufuellen.
 */

interface Props {
  kundenName?: string
  berater?: Ansprechpartner
  /** Adresse der Formular-PDF auf der veroeffentlichten Domain. */
  formularUrl?: string
  /** Der Anhang ist mit den Angaben des vorherigen Kaufs vorausgefuellt. */
  vorbelegt?: boolean
  /** Aus welchem Investment die vorausgefuellten Angaben stammen. */
  vorbelegtAusInvestment?: number
  sprache?: MailSprache
  kundeAnrede?: string
}

const FORMULAR_URL_RUECKFALL = 'https://portal.more.immo/dokumente/selbstauskunft-formular.pdf'

/** Gruppe F: Deutsch in der Sie-Form, Englisch foermlich (Plan 4.4). */
const DE = {
  betreff: 'Ihre Selbstauskunft zum Ausfüllen',
  augenbraue: 'Ihre Unterlagen',
  titel: 'Ihre Selbstauskunft zum Ausfüllen',
  vorschau: 'Ein Klick öffnet die Selbstauskunft als PDF: direkt ausfüllen oder drucken.',
  fuss: 'Die Selbstauskunft enthält persönliche Daten. Bewahren Sie sie entsprechend auf.',
  einleitung: 'wie besprochen erhalten Sie hier Ihre Selbstauskunft als ausfüllbares PDF.',
  /** Nur Englisch: Das Formular selbst ist bis Etappe 4 deutsch. */
  nurDeutsch: '',
  vorbelegtFett: 'Im Anhang dieser E-Mail liegt Ihre Selbstauskunft bereits vorausgefüllt.',
  vorbelegtText: (investment?: number) =>
    `Wir haben die Angaben aus Ihrer Selbstauskunft${investment ? ` zu Investment ${investment}` : ' zu Ihrem letzten Kauf'} übernommen, damit Sie nicht alles noch einmal schreiben müssen. Die übernommenen Felder sind hellgelb hinterlegt.`,
  vorbelegtPruefen:
    'Bitte prüfen Sie jeden dieser Werte und ändern Sie, was heute nicht mehr stimmt. Erst mit Ihrer Unterschrift bestätigen Sie die Angaben als aktuell. Alles Weitere steht auf dem Deckblatt des Dokuments.',
  knopfLeer: 'Leeres Formular öffnen',
  hinweisLeer: 'Nur falls Sie lieber neu beginnen · Ihre vorausgefüllte Fassung liegt im Anhang',
  knopf: 'Selbstauskunft öffnen',
  hinweis: 'Öffnet das PDF im Browser · Herunterladen jederzeit möglich',
  computerFett: 'Am Computer:',
  computer:
    'Füllen Sie die Felder direkt im PDF aus, speichern Sie die Datei und senden Sie sie uns zurück. Auf der letzten Seite können Sie digital unterschreiben.',
  papierFett: 'Auf Papier:',
  papier:
    'Drucken Sie das PDF aus und füllen Sie es bitte vollständig und gut leserlich in Druckbuchstaben aus. Unterschreiben Sie auf der letzten Seite und senden Sie uns das Dokument sauber eingescannt zurück, oder bringen Sie es zum nächsten Termin mit.',
  fragen:
    'Bei Fragen füllen wir die Selbstauskunft gerne gemeinsam mit Ihnen aus. Melden Sie sich einfach bei Ihrem Berater.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your self-disclosure form to complete',
    augenbraue: 'Your documents',
    titel: 'Your self-disclosure form to complete',
    vorschau: 'One click opens the self-disclosure form as a PDF: complete it on screen or print it.',
    fuss: 'The self-disclosure contains personal data. Please keep it safe accordingly.',
    einleitung: 'As discussed, please find your self-disclosure form (Selbstauskunft) as a fillable PDF.',
    nurDeutsch:
      'Please note that the form itself is currently only available in German. Your contact person at MOREImmo will be glad to go through it with you.',
    vorbelegtFett: 'The attachment to this email contains your self-disclosure, already pre-filled.',
    vorbelegtText: (investment?: number) =>
      `We have taken over the details from your self-disclosure${investment ? ` for investment ${investment}` : ' for your last purchase'}, so that you do not have to write everything again. The fields we have filled in are highlighted in light yellow.`,
    vorbelegtPruefen:
      'Please check each of these values and change anything that is no longer correct. Only with your signature do you confirm that the details are up to date. Everything else is explained on the cover page of the document.',
    knopfLeer: 'Open a blank form',
    hinweisLeer: 'Only if you would rather start afresh · Your pre-filled version is attached',
    knopf: 'Open the self-disclosure form',
    hinweis: 'Opens the PDF in your browser · You can download it at any time',
    computerFett: 'On a computer:',
    computer:
      'Fill in the fields directly in the PDF, save the file and send it back to us. You can sign digitally on the last page.',
    papierFett: 'On paper:',
    papier:
      'Print the PDF and fill it in completely and legibly in block capitals. Sign on the last page and send us a clean scan of the document, or bring it with you to your next appointment.',
    fragen:
      'If you have any questions, we will be glad to complete the self-disclosure together with you. Simply get in touch with your contact person.',
  },
}

const Mail = ({ kundenName, berater, formularUrl, vorbelegt, vorbelegtAusInvestment, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={foermlich(kundenName, sprache, kundeAnrede)}
      person={berater}
      fussHinweis={t.fuss}
    >
      <Absatz letzter={!t.nurDeutsch}>{t.einleitung}</Absatz>
      {t.nurDeutsch && <Absatz letzter>{t.nurDeutsch}</Absatz>}

      {/*
        Der Knopf zeigt immer auf das LEERE Formular, das liegt als statische
        Datei auf unserer Domain. Ist der Anhang vorausgefuellt, muss die Mail
        das sagen, sonst faengt der Kunde am falschen Dokument an.
      */}
      {vorbelegt ? (
        <>
          <Absatz>
            <strong>{t.vorbelegtFett}</strong> {t.vorbelegtText(vorbelegtAusInvestment)}
          </Absatz>
          <Absatz>{t.vorbelegtPruefen}</Absatz>
          <Handlung
            sprache={sprache}
            href={formularUrl || FORMULAR_URL_RUECKFALL}
            text={t.knopfLeer}
            hinweis={t.hinweisLeer}
          />
        </>
      ) : (
        <Handlung
          sprache={sprache}
          href={formularUrl || FORMULAR_URL_RUECKFALL}
          text={t.knopf}
          hinweis={t.hinweis}
        />
      )}

      <Absatz>
        <strong>{t.computerFett}</strong> {t.computer}
      </Absatz>
      <Absatz>
        <strong>{t.papierFett}</strong> {t.papier}
      </Absatz>
      <Absatz letzter>{t.fragen}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Selbstauskunft-Formular (leere PDF) an Kunden',
  sprachen: DE_EN,
  previewData: {
    kundenName: 'Herr Mustermann',
    formularUrl: FORMULAR_URL_RUECKFALL,
    berater: {
      name: 'Christian Peetz',
      rolle: BERUF_IMMOBILIENBERATER,
      telefon: '08061 000000',
      email: 'c.peetz@more.immo',
    },
  },
} satisfies TemplateEntry
