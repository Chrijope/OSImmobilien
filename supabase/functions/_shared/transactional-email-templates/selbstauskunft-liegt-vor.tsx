import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, type Ansprechpartner } from './_layout.tsx'
import { foermlich } from './_anrede.ts'
import { DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

/**
 * Antwort auf die offene Selbstauskunft der Handbuch-Seite, wenn die
 * Selbstauskunft des Kontakts schon unterschrieben vorliegt (HB-009, seit dem
 * 26.09.2026). Geht nur an die GESPEICHERTE Adresse eines über die E-Mail
 * erkannten Kontakts; die Seite selbst sagt nicht, ob die Adresse bekannt
 * war. Parallel bekommt der zuständige Partner eine Glocke.
 *
 * Gruppe F (Selbstauskunft): Deutsch in der Sie-Form, Englisch förmlich,
 * wie `sa-invitation`. Bis zum 26.09.2026 duzte die Mail wie die
 * Handbuch-Seite. Absender wie bei `sa-invitation`: OS Immobilien, der
 * zuständige Partner als Unterschrift.
 *
 * Verschickt von `_shared/handbuch-anlage.ts`.
 */

interface Props {
  name?: string
  berater?: Ansprechpartner
  sprache?: MailSprache
  /** "Herr"/"Frau" für die förmliche englische Anrede, setzt send-transactional-email. */
  kundeAnrede?: string
}

const DE = {
  betreff: 'Ihre Selbstauskunft liegt uns bereits vor',
  augenbraue: 'Selbstauskunft',
  titel: 'Ihre Selbstauskunft liegt vor',
  vorschau: 'Möchten Sie etwas ändern, meldet sich Ihr Berater bei Ihnen.',
  text: 'Ihre Selbstauskunft liegt uns bereits vor. Möchten Sie etwas ändern, meldet sich Ihr Berater bei Ihnen.',
  fuss: 'Sie haben die Selbstauskunft auf der Handbuch-Seite von OS Immobilien angefordert.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: 'Your self-disclosure is already on file',
    augenbraue: 'Self-disclosure',
    titel: 'Your self-disclosure is on file',
    vorschau: 'Should you wish to make any changes, your contact person will get in touch with you.',
    text: 'We already have your self-disclosure form (Selbstauskunft) on file. Should you wish to make any changes, your contact person will get in touch with you.',
    fuss: 'You requested the self-disclosure on the OS Immobilien handbook page.',
  },
}

const Mail = ({ name, berater, sprache, kundeAnrede }: Props) => {
  const t = texteFuer(TEXTE, sprache)
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
      <Absatz letzter>{t.text}</Absatz>
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, data?.sprache).betreff,
  displayName: 'Handbuch-Seite: Selbstauskunft liegt schon vor',
  sprachen: DE_EN,
  previewData: {
    name: 'Erika Muster',
    berater: {
      name: 'Christian Peetz',
      rolle: 'Ihr Ansprechpartner bei OS Immobilien',
      telefon: '+49 151 00000000',
      email: 'os@os-immobilien.com',
    },
  },
} satisfies TemplateEntry
