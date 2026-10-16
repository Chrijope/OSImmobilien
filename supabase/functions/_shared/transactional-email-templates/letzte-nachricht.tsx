import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, type Ansprechpartner } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'
import { istTeam } from './_nicht-erreicht.ts'

/**
 * Die letzte Nachricht nach drei erfolglosen Kontaktversuchen (Strategie
 * Vertrieb, Abschnitt 8, seit 16.10.2026).
 *
 * Eine Vorlage für den Partner, zur Aufgabe „Drei Versuche ohne Erfolg:
 * letzte Nachricht senden und Vorgang pausieren“ (`nachfassplan.ts`). Kein
 * Druck, keine Frist: Der Vorgang ruht, und der Kunde weiß, wie er sich
 * wieder meldet. Absender ist der zuständige Partner.
 *
 * Nicht zu verwechseln mit `nicht-erreicht-mail-3`: Die geht an Leads vor dem
 * Erstgespräch.
 */

interface Props {
  kundeName?: string
  kundeAnrede?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
}

const DE = {
  betreff: 'Ich lasse deinen Vorgang vorerst ruhen',
  betreffTeam: 'Wir lassen deinen Vorgang vorerst ruhen',
  augenbraue: 'Kurze Nachricht',
  titel: (team: boolean) => (team ? 'Wir lassen deinen Vorgang vorerst ruhen' : 'Ich lasse deinen Vorgang vorerst ruhen'),
  vorschau: (team: boolean) => (team ? 'Wir möchten nicht aufdringlich sein.' : 'Ich möchte nicht aufdringlich sein.'),
  text: (team: boolean) =>
    team
      ? 'wir haben in den letzten Tagen mehrmals versucht, dich zu erreichen. Wir möchten nicht aufdringlich sein, deshalb lassen wir deinen Vorgang vorerst ruhen.'
      : 'ich habe in den letzten Tagen mehrmals versucht, dich zu erreichen. Ich möchte nicht aufdringlich sein, deshalb lasse ich deinen Vorgang vorerst ruhen.',
  schluss: (team: boolean) =>
    team
      ? 'Wenn das Thema für dich wieder passt, antworte einfach auf diese Mail. Wir melden uns dann gern.'
      : 'Wenn das Thema für dich wieder passt, antworte einfach auf diese Mail oder ruf mich an. Ich melde mich dann gern.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'I will put your enquiry on hold for now',
    betreffTeam: 'We will put your enquiry on hold for now',
    augenbraue: 'A short message',
    titel: (team: boolean) => (team ? 'We will put your enquiry on hold for now' : 'I will put your enquiry on hold for now'),
    vorschau: (team: boolean) => (team ? 'We do not want to be intrusive.' : 'I do not want to be intrusive.'),
    text: (team: boolean) =>
      team
        ? 'We have tried to reach you several times over the last few days. We do not want to be intrusive, so we will put your enquiry on hold for now.'
        : 'I have tried to reach you several times over the last few days. I do not want to be intrusive, so I will put your enquiry on hold for now.',
    schluss: (team: boolean) =>
      team
        ? 'If the topic suits you again, simply reply to this email. We will be glad to get back to you.'
        : 'If the topic suits you again, simply reply to this email or give me a call. I will be glad to get back to you.',
  },
}

const Mail = ({ kundeName, berater, sprache }: Props) => {
  const t = texteFuer(TEXTE, sprache)
  const team = istTeam(berater)
  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(team)}
      vorschau={t.vorschau(team)}
      anrede={hallo(kundeName, sprache)}
      person={berater}
    >
      <Absatz>{t.text(team)}</Absatz>
      <Absatz letzter>{t.schluss(team)}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => {
    const t = texteFuer(TEXTE, data?.sprache)
    return istTeam(data?.berater) ? t.betreffTeam : t.betreff
  },
  displayName: 'Letzte Nachricht nach drei Versuchen (Vorlage für Partner)',
  sprachen: DE_EN,
  absender: 'zustaendiger-partner',
  previewData: {
    kundeName: 'Max Mustermann',
    berater: {
      name: 'Vorname Nachname',
      rolle: 'Vertriebspartner',
      telefon: '+49 30 000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
