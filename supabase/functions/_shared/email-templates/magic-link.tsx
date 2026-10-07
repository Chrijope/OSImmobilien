/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Absatz, EmailLayout, Handlung } from './_gemeinsam.ts'
import { texteFuer } from './_sprache.ts'

/**
 * Anmeldung ohne Passwort. `confirmationUrl` ist der Anmeldelink selbst.
 *
 * `sprache` setzt der Hook aus dem Kundenprofil (Plan Kundensprache, M30).
 * Ohne Angabe bleibt die Mail deutsch.
 */
interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
  sprache?: string
}

const TEXTE = {
  de: {
    augenbraue: 'Anmeldung',
    titel: 'Dein Anmeldelink',
    vorschau: (site: string) => `Dein Anmeldelink für ${site}`,
    anrede: 'Hallo,',
    text: (site: string) => `mit dem Knopf unten meldest du dich bei ${site} an.`,
    knopf: 'Jetzt anmelden',
    hinweis: 'Der Link ist aus Sicherheitsgründen nur kurze Zeit gültig',
    ignorieren: 'Wenn du diesen Link nicht angefordert hast, kannst du diese E-Mail ignorieren.',
  },
  en: {
    augenbraue: 'Sign in',
    titel: 'Your sign-in link',
    vorschau: (site: string) => `Your sign-in link for ${site}`,
    anrede: 'Hello,',
    text: (site: string) => `use the button below to sign in to ${site}.`,
    knopf: 'Sign in now',
    hinweis: 'For security reasons, the link is only valid for a short time',
    ignorieren: "If you didn't request this link, you can ignore this email.",
  },
} as const

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
  sprache,
}: MagicLinkEmailProps) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau(siteName)}
      anrede={t.anrede}
      intern
      ohneUnterschrift
    >
      <Absatz>{t.text(siteName)}</Absatz>

      <Handlung href={confirmationUrl} text={t.knopf} hinweis={t.hinweis} />

      <Absatz letzter>{t.ignorieren}</Absatz>
    </EmailLayout>
  )
}

export default MagicLinkEmail
