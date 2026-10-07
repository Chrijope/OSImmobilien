/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Absatz, EmailLayout, Handlung, Luft, T } from './_gemeinsam.ts'
import { texteFuer } from './_sprache.ts'

/**
 * Passwort zuruecksetzen. `confirmationUrl` ist der Link, hinter dem das neue
 * Passwort vergeben wird.
 *
 * Der Link steht hier zusaetzlich ausgeschrieben. Das ist bei den uebrigen
 * Vorlagen nicht ueblich und hier Absicht: Wer sich nicht mehr anmelden kann,
 * hat keinen zweiten Weg. Blockiert ein Postfach den Knopf, weil dessen
 * Outlook-Fassung aus VML besteht, bleibt die Adresse zum Kopieren.
 *
 * `sprache` setzt der Hook aus dem Kundenprofil (Plan Kundensprache, M30).
 * Ohne Angabe bleibt die Mail deutsch.
 */
interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
  sprache?: string
}

const TEXTE = {
  de: {
    augenbraue: 'Passwort',
    titel: 'Passwort zurücksetzen',
    vorschau: (site: string) => `Passwort für ${site} zurücksetzen`,
    anrede: 'Hallo,',
    text: (site: string) =>
      `du hast angefordert, dein Passwort für ${site} zurückzusetzen. Mit dem Knopf unten wählst du ein neues.`,
    knopf: 'Neues Passwort festlegen',
    hinweis: 'Der Link ist aus Sicherheitsgründen 60 Minuten gültig',
    kopieren: 'Falls der Knopf nicht funktioniert, kopiere bitte diese Adresse in deinen Browser:',
    ignorieren:
      'Wenn du diese Anfrage nicht gestellt hast, kannst du diese E-Mail ignorieren. Dein Passwort bleibt dann unverändert.',
  },
  en: {
    augenbraue: 'Password',
    titel: 'Reset your password',
    vorschau: (site: string) => `Reset your password for ${site}`,
    anrede: 'Hello,',
    text: (site: string) =>
      `you asked to reset your password for ${site}. Use the button below to choose a new one.`,
    knopf: 'Set new password',
    hinweis: 'For security reasons, the link is valid for 60 minutes',
    kopieren: "If the button doesn't work, please copy this address into your browser:",
    ignorieren:
      "If you didn't make this request, you can ignore this email. Your password will stay the same.",
  },
} as const

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
  sprache,
}: RecoveryEmailProps) => {
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

      <Luft />

      <Absatz>
        {t.kopieren}
        <br />
        <a
          href={confirmationUrl}
          className="mi-link"
          style={{ color: T.blauLink, wordBreak: 'break-all' as const }}
        >
          {confirmationUrl}
        </a>
      </Absatz>

      <Absatz letzter>{t.ignorieren}</Absatz>
    </EmailLayout>
  )
}

export default RecoveryEmail
