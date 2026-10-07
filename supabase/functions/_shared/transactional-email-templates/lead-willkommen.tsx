import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Nebenhandlung, Luft, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Willkommensmail an einen Lead, sobald ihm intern ein Vertriebspartner
 * zugewiesen ist (Auftrag Christian, 30.09.2026, Idee von Hermann Vogl).
 *
 * Erst nach der Zuweisung, damit der zuständige Partner mit Namen, Foto und
 * Kontaktdaten unter der Mail steht. Absender, Antwortadresse und Unterschrift
 * setzt send-transactional-email über `absender: 'zustaendiger-partner'` aus
 * `kontakte.zustaendig_id`, nie aus dem, was der Aufrufer mitschickt.
 *
 * Ein Hauptknopf auf den Handbuch-Konfigurator des Partners: sechs Fragen, der
 * Lead sieht seinen Rahmen und bekommt danach das Handbuch per Mail. Das ganze
 * Handbuch gleich zu Beginn wäre zu viel. Die Handbuchseite steht nur als
 * ruhiger Textlink darunter.
 *
 * Du-Form, obwohl die Handbuch-Strecke siezt: Christian hat den Du-Text so
 * freigegeben. Aufgerufen von send-lead-zuweisung-mail.
 */

interface Props {
  kundeName?: string
  konfiguratorLink?: string
  handbuchLink?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: (berater: string) => (berater ? `Deine Anfrage bei OS Immobilien, ${berater} meldet sich` : 'Deine Anfrage bei OS Immobilien'),
  augenbraue: 'Willkommen bei OS Immobilien',
  titel: 'Danke für deine Anfrage',
  vorschau: 'Bis zum ersten Gespräch kannst du schon mit deinen eigenen Zahlen rechnen.',
  gruss: (berater: string) =>
    berater
      ? `danke für deine Anfrage. ${berater} ist ab jetzt dein persönlicher Ansprechpartner und meldet sich in den nächsten Tagen bei dir.`
      : 'danke für deine Anfrage. Dein persönlicher Ansprechpartner meldet sich in den nächsten Tagen bei dir.',
  angebot:
    'Wenn du vorher schon einen Eindruck bekommen möchtest: Beantworte sechs kurze Fragen zu deinem Einkommen, deinem monatlichen Überschuss und deinem Eigenkapital. Du siehst danach sofort, welcher Kaufpreisrahmen als Modellrechnung für dich infrage kommt, und bekommst dein persönliches Immobilienhandbuch per Mail. Es erklärt, wie eine Bank rechnet und was steuerlich zu beachten ist.',
  knopf: 'Meinen Rahmen berechnen',
  knopfHinweis: 'Rund zwei Minuten, kostenlos, ohne Schufa-Abfrage.',
  schluss: (berater: string) =>
    `Das ist freiwillig. Im Gespräch rechnen wir ohnehin gemeinsam mit deinen echten Zahlen. Fragen vorab? Melde dich gern direkt bei ${berater || 'deinem Ansprechpartner'}, die Kontaktdaten findest du unten.`,
  handbuch: 'Zur Handbuchseite',
  handbuchHinweis: 'Lies in Ruhe, wie wir arbeiten.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (berater: string) => (berater ? `Your enquiry at OS Immobilien: ${berater} will be in touch` : 'Your enquiry at OS Immobilien'),
    augenbraue: 'Welcome to OS Immobilien',
    titel: 'Thank you for your enquiry',
    vorschau: 'Until our first conversation, you can already calculate with your own figures.',
    gruss: (berater: string) =>
      berater
        ? `thank you for your enquiry. ${berater} is now your personal contact person and will get in touch with you in the next few days.`
        : 'thank you for your enquiry. Your personal contact person will get in touch with you in the next few days.',
    angebot:
      'If you would like to get an impression beforehand: answer six short questions about your income, your monthly surplus and your equity. You will then see straight away which purchase price range comes into question for you as a model calculation, and you will receive your personal property handbook by email. It explains how a bank calculates and what to consider for tax purposes.',
    knopf: 'Calculate my budget',
    knopfHinweis: 'About two minutes, free of charge, no credit check.',
    schluss: (berater: string) =>
      `This is optional. In our conversation we will do the numbers together with your real figures anyway. Questions in advance? Feel free to contact ${berater || 'your contact person'} directly, you will find the contact details below.`,
    handbuch: 'To the handbook page',
    handbuchHinweis: 'Read at your own pace how we work.',
  },
}

const Mail = ({ kundeName, konfiguratorLink, handbuchLink, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const name = (berater?.name || '').trim()
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz>{t.gruss(name)}</Absatz>
      <Absatz>{t.angebot}</Absatz>
      <Handlung sprache={sprache} href={konfiguratorLink || ''} text={t.knopf} hinweis={t.knopfHinweis} />
      <Luft hoehe={20} />
      <Absatz>{t.schluss(name)}</Absatz>
      <Nebenhandlung href={handbuchLink || ''} text={t.handbuch} hinweis={t.handbuchHinweis} />
      <Luft hoehe={10} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff(String(data?.berater?.name || '').trim()),
  displayName: 'Willkommensmail an Leads nach der Zuweisung',
  sprachen: DE_EN,
  absender: 'zustaendiger-partner',
  previewData: {
    kundeName: 'Max Mustermann',
    konfiguratorLink: 'https://osimmobilien.netlify.app/handbuch/christian-peetz/konfigurator?utm_source=mail&utm_medium=email&utm_campaign=willkommen',
    handbuchLink: 'https://osimmobilien.netlify.app/handbuch/christian-peetz?utm_source=mail&utm_medium=email&utm_campaign=willkommen',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Dein Ansprechpartner bei OS Immobilien',
      telefon: '+49 151 00000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
