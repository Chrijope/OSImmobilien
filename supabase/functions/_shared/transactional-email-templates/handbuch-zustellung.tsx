import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Haken, Luft, type Ansprechpartner } from './_layout.tsx'
import { foermlich, hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Das persönliche Immobilienhandbuch, zugestellt nach dem Konfigurator der
 * Handbuch-Seite (seit dem 26.09.2026).
 *
 * Die einzige automatische Mail an einen Lead: Er hat das Handbuch
 * ausdrücklich angefordert. Hauptknopf ist das Handbuch (online, dort auch
 * als PDF), darunter der persönliche Link zur Selbstauskunft als nächster
 * Schritt. Kein Double-Opt-in: Christian wollte das Handbuch sofort auf der
 * Seite und zusätzlich per Mail (Auftrag vom 26.09.2026).
 *
 * Absender, Antwortadresse und Unterschrift setzt send-transactional-email
 * über `absender: 'zustaendiger-partner'`: mit Partnerlink „Name | MOREImmo“
 * und Antworten an den Partner, ohne Partner das MOREImmo Team mit office@.
 *
 * Aufgerufen von `_shared/handbuch-anlage.ts`.
 *
 * Anrede: Seit dem 27.09.2026 siezt die ganze Handbuch-Strecke (Entscheidung
 * Christian, Ausnahme vom Du-Standard). Deutsch grüßt deshalb wie Gruppe F
 * über `foermlich` mit Vor- und Nachnamen („Guten Tag Erika Muster,“).
 * Englisch bleibt unverändert bei „Hello Erika,“.
 */

interface Props {
  /** Vor- und Nachname, Englisch nimmt davon nur den Vornamen. */
  name?: string
  handbuchLink?: string
  saLink?: string
  ausgang?: 'passt' | 'vielleicht' | 'noch_nicht'
  rahmenVon?: number
  rahmenBis?: number
  gueltigTage?: number
  berater?: Ansprechpartner
  sprache?: MailSprache
  /** "Herr"/"Frau", setzt send-transactional-email. Für `foermlich`. */
  kundeAnrede?: string
}

function betrag(n: number | undefined, sprache: MailSprache): string {
  const wert = Math.round(Number(n) || 0)
  return `${wert.toLocaleString(sprache === 'en' ? 'en-GB' : 'de-DE')} €`
}

const DE = {
  betreff: 'Ihr persönliches Immobilienhandbuch ist da',
  augenbraue: 'Ihr Handbuch',
  titel: 'Ihr persönliches Immobilienhandbuch',
  vorschau: 'Mit Ihrem Rahmen, Ihrer Steuerwirkung und Ihrem nächsten Schritt.',
  einleitung:
    'danke für Ihre Antworten. Ihr Handbuch ist fertig. Es zeigt Ihnen, wie eine Bank rechnet, was das Finanzamt mitträgt und welcher Rahmen zu Ihnen passt, mit Ihren eigenen Zahlen.',
  rahmen: (von: string, bis: string) => `Ihr Rahmen als Modellrechnung: ${bis ? `${von} bis ${bis}` : von}. Keine Finanzierungszusage.`,
  inhalt: [
    'Kapitel 5: Ihr Rahmen aus Überschuss und Eigenkapital',
    'Kapitel 6 und 7: Ihre Steuerwirkung und eine Musterrechnung',
    'Kapitel 11 und 12: Ihr Zeitplan und Ihre Unterlagenliste',
  ],
  knopfHandbuch: 'Handbuch öffnen',
  hinweisHandbuch: (tage: number) => `Online lesen oder als PDF speichern · Der Link gilt ${tage} Tage`,
  naechsterSchritt: {
    passt: 'Ihr nächster Schritt ist die Selbstauskunft. Damit rechnen wir Ihren Rahmen genau, und Ihr Berater kann Ihnen direkt passende Wohnungen vorstellen. Sie verpflichtet Sie zu nichts.',
    vielleicht: 'Ihre Angaben passen knapp. Mit der Selbstauskunft sehen wir genau, was geht. Sie verpflichtet Sie zu nichts.',
    noch_nicht: 'Noch passt es nicht, und das ist in Ordnung. Wenn sich Ihre Lage ändert, ist die Selbstauskunft der erste Schritt.',
  },
  knopfSa: 'Selbstauskunft starten',
  schluss: 'Fragen zum Handbuch? Antworten Sie einfach auf diese Mail.',
  hinweisModell: 'Alle Zahlen im Handbuch sind Modellrechnungen mit offengelegten Annahmen, keine Zusage und keine Steuer- oder Rechtsberatung.',
  fuss: 'Sie haben das Handbuch auf der Handbuch-Seite von MOREImmo angefordert.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your personal property handbook is here',
    augenbraue: 'Your handbook',
    titel: 'Your personal property handbook',
    vorschau: 'With your budget, your tax effect and your next step.',
    einleitung:
      'thank you for your answers. Your handbook is ready. It shows you how a bank calculates, what the tax office contributes and which budget suits you, with your own figures.',
    rahmen: (von: string, bis: string) => `Your budget as a model calculation: ${bis ? `${von} to ${bis}` : von}. Not a financing commitment.`,
    inhalt: [
      'Chapter 5: your budget from monthly surplus and equity',
      'Chapters 6 and 7: your tax effect and a sample calculation',
      'Chapters 11 and 12: your timeline and your document checklist',
    ],
    knopfHandbuch: 'Open handbook',
    hinweisHandbuch: (tage: number) => `Read online or save as PDF · The link is valid for ${tage} days`,
    naechsterSchritt: {
      passt: 'Your next step is the self-disclosure form (Selbstauskunft). It lets us calculate your budget precisely, and your contact person can present suitable flats straight away. It does not commit you to anything.',
      vielleicht: 'Your details are a close fit. The self-disclosure form (Selbstauskunft) shows us exactly what is possible. It does not commit you to anything.',
      noch_nicht: 'It is not a fit yet, and that is fine. When your situation changes, the self-disclosure form (Selbstauskunft) is the first step.',
    },
    knopfSa: 'Start self-disclosure',
    schluss: 'Questions about the handbook? Simply reply to this email.',
    hinweisModell: 'All figures in the handbook are model calculations with disclosed assumptions, not a commitment and not tax or legal advice.',
    fuss: 'You requested the handbook on the MOREImmo handbook page.',
  },
}

const Mail = ({ name, handbuchLink, saLink, ausgang, rahmenVon, rahmenBis, gueltigTage, berater, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const sp: MailSprache = sprache === 'en' ? 'en' : 'de'
  const tage = Number(gueltigTage) > 0 ? Number(gueltigTage) : 30
  const schritt = t.naechsterSchritt[ausgang ?? 'passt'] ?? t.naechsterSchritt.passt
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={sp === 'en' ? hallo(name, sprache) : foermlich(name, sprache, kundeAnrede)}
      person={berater}
      fussHinweis={t.fuss}
    >
      <Absatz>{t.einleitung}</Absatz>
      <Haken punkte={t.inhalt} />
      <Luft hoehe={10} />
      {rahmenVon !== undefined && rahmenBis !== undefined && (
        // Ohne tragbares Darlehen sind beide Enden gleich, dann nur ein Betrag.
        <Absatz>{t.rahmen(betrag(rahmenVon, sp), Number(rahmenVon) === Number(rahmenBis) ? '' : betrag(rahmenBis, sp))}</Absatz>
      )}
      <Handlung sprache={sprache} href={handbuchLink || ''} text={t.knopfHandbuch} hinweis={t.hinweisHandbuch(tage)} />
      <Luft hoehe={20} />
      <Absatz>{schritt}</Absatz>
      {saLink ? <Nebenhandlung href={saLink} text={t.knopfSa} /> : null}
      <Luft hoehe={20} />
      <Absatz>{t.schluss}</Absatz>
      <Absatz letzter>{t.hinweisModell}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Handbuch-Seite: persönliches Immobilienhandbuch',
  sprachen: DE_EN,
  absender: 'zustaendiger-partner',
  previewData: {
    name: 'Erika Muster',
    handbuchLink: 'https://portal.more.immo/handbuch/ergebnis/beispiel',
    saLink: 'https://portal.more.immo/sa/beispiel',
    ausgang: 'passt',
    rahmenVon: 158000,
    rahmenBis: 222000,
    gueltigTage: 30,
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei MOREImmo',
      telefon: '+49 151 00000000',
      email: 'office@more.immo',
    },
  },
} satisfies TemplateEntry
