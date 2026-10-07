/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Absatz, Code, EmailLayout } from './_gemeinsam.ts'
import { texteFuer } from './_sprache.ts'

/**
 * Der Einmalcode der erneuten Identitaetspruefung.
 *
 * Die einzige der sechs Mails ohne Knopf: `token` ist der ganze Inhalt. Er
 * steht deshalb an der Stelle, an der sonst der Knopf steht, und in dessen
 * Groesse.
 *
 * `sprache` setzt der Hook aus dem Kundenprofil (Plan Kundensprache, M30).
 * Ohne Angabe bleibt die Mail deutsch.
 */
interface ReauthenticationEmailProps {
  token: string
  sprache?: string
}

const TEXTE = {
  de: {
    augenbraue: 'Sicherheit',
    titel: 'Bestätigung deiner Identität',
    vorschau: 'Dein Bestätigungscode',
    anrede: 'Hallo,',
    text: 'bitte verwende den folgenden Code, um deine Identität zu bestätigen:',
    ignorieren:
      'Dieser Code ist nur kurze Zeit gültig. Wenn du ihn nicht angefordert hast, kannst du diese E-Mail einfach ignorieren.',
  },
  en: {
    augenbraue: 'Security',
    titel: 'Confirm your identity',
    vorschau: 'Your confirmation code',
    anrede: 'Hello,',
    text: 'please use the following code to confirm your identity:',
    ignorieren:
      "This code is only valid for a short time. If you didn't request it, you can simply ignore this email.",
  },
} as const

export const ReauthenticationEmail = ({ token, sprache }: ReauthenticationEmailProps) => {
  const t = texteFuer(TEXTE, sprache)
  return (
    <EmailLayout
      augenbraue={t.augenbraue}
      titel={t.titel}
      vorschau={t.vorschau}
      anrede={t.anrede}
      intern
      ohneUnterschrift
    >
      <Absatz>{t.text}</Absatz>

      <Code wert={token} />

      <Absatz letzter>{t.ignorieren}</Absatz>
    </EmailLayout>
  )
}

export default ReauthenticationEmail
