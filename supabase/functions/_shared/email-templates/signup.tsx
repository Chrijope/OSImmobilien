/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Link } from 'npm:@react-email/components@0.0.22'

import { Absatz, EmailLayout, Handlung, T } from './_gemeinsam.ts'
import { texteFuer } from './_sprache.ts'

/**
 * Bestaetigung der E-Mail-Adresse nach der Registrierung.
 *
 * Die Eigenschaften kommen aus `auth-email-hook/index.ts` und stammen von
 * Supabase. `confirmationUrl` ist der Bestaetigungslink: Ohne ihn kommt der
 * Empfaenger nicht in seinen Zugang.
 *
 * `sprache` setzt der Hook aus dem Kundenprofil (Plan Kundensprache, M30).
 * Ohne Angabe bleibt die Mail deutsch.
 */
interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
  sprache?: string
}

const TEXTE = {
  de: {
    augenbraue: 'Registrierung',
    titel: 'E-Mail-Adresse bestätigen',
    vorschau: (site: string) => `E-Mail-Adresse für ${site} bestätigen`,
    anrede: 'Hallo,',
    dankVor: 'vielen Dank für deine Registrierung bei',
    bitteVor: 'Bitte bestätige deine E-Mail-Adresse',
    bitteNach: ', dann ist dein Zugang fertig eingerichtet.',
    knopf: 'E-Mail bestätigen',
    ignorieren: 'Wenn du diesen Zugang nicht angelegt hast, kannst du diese E-Mail einfach ignorieren.',
  },
  en: {
    augenbraue: 'Registration',
    titel: 'Confirm your email address',
    vorschau: (site: string) => `Confirm your email address for ${site}`,
    anrede: 'Hello,',
    dankVor: 'thank you for registering with',
    bitteVor: 'Please confirm your email address',
    bitteNach: ' and your access will be ready.',
    knopf: 'Confirm email',
    ignorieren: "If you didn't create this account, you can simply ignore this email.",
  },
} as const

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
  sprache,
}: SignupEmailProps) => {
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
      <Absatz>
        {t.dankVor}{' '}
        <Link href={siteUrl} className="mi-link" style={{ color: T.blauLink, textDecoration: 'none' }}>
          {siteName}
        </Link>
        .
      </Absatz>

      <Absatz>
        {t.bitteVor} <strong>{recipient}</strong>{t.bitteNach}
      </Absatz>

      <Handlung href={confirmationUrl} text={t.knopf} />

      <Absatz letzter>{t.ignorieren}</Absatz>
    </EmailLayout>
  )
}

export default SignupEmail
