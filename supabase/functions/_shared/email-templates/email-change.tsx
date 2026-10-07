/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import { Absatz, Angaben, EmailLayout, Handlung, Hinweis } from './_gemeinsam.ts'
import { texteFuer } from './_sprache.ts'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
  // Aus dem Kundenprofil, gesetzt vom Hook (Plan Kundensprache, M30). Ohne Angabe Deutsch.
  sprache?: string
}

const TEXTE = {
  de: {
    augenbraue: 'Sicherheit',
    titel: 'E-Mail-Änderung bestätigen',
    vorschau: (site: string) => `E-Mail-Änderung für ${site} bestätigen`,
    anrede: 'Hallo,',
    text: (site: string) =>
      `du hast angefordert, deine E-Mail-Adresse für ${site} zu ändern. Mit dem Knopf unten bestätigst du die Änderung.`,
    knopf: 'Änderung bestätigen',
    angabenTitel: 'Die Änderung',
    bisher: 'Bisher',
    neu: 'Neu',
    warnung:
      'Wenn du diese Änderung nicht angefordert hast, sichere bitte umgehend deinen Zugang und melde dich bei uns.',
  },
  en: {
    augenbraue: 'Security',
    titel: 'Confirm your email change',
    vorschau: (site: string) => `Confirm your email change for ${site}`,
    anrede: 'Hello,',
    text: (site: string) =>
      `you asked to change your email address for ${site}. Use the button below to confirm the change.`,
    knopf: 'Confirm change',
    angabenTitel: 'The change',
    bisher: 'Previous',
    neu: 'New',
    warnung:
      "If you didn't request this change, please secure your account straight away and get in touch with us.",
  },
} as const

/**
 * Bestaetigung einer geaenderten Anmeldeadresse.
 *
 * Die beiden Adressen standen vorher mitten im Fliesstext und waren als
 * `mailto:`-Verweise gesetzt. Jetzt stehen sie als Angabenzeilen untereinander:
 * Bei einer Aenderung kommt es genau darauf an, alt und neu nebeneinander
 * lesen zu koennen, und ein Verweis, der ein neues Mailfenster oeffnet, hilft
 * dabei nicht.
 */
export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
  sprache,
}: EmailChangeEmailProps) => {
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

      <Handlung href={confirmationUrl} text={t.knopf} />

      <Angaben
        titel={t.angabenTitel}
        zeilen={[
          [t.bisher, oldEmail],
          [t.neu, newEmail],
        ]}
      />

      <Hinweis ton="warnung" text={t.warnung} />
    </EmailLayout>
  )
}

export default EmailChangeEmail
