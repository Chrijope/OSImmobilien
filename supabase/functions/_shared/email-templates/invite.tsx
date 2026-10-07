/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Link } from 'npm:@react-email/components@0.0.22'

import { Absatz, EmailLayout, Handlung, T } from './_gemeinsam.ts'
import { texteFuer } from './_sprache.ts'

/**
 * Einladung in das Portal. Fuer viele neue Partner die erste Mail von uns.
 *
 * `confirmationUrl` ist der Einladungslink. Ohne ihn kann die Einladung nicht
 * angenommen werden.
 *
 * `sprache` setzt der Hook aus dem Kundenprofil (Plan Kundensprache, M30).
 * Ohne Angabe bleibt die Mail deutsch.
 */
interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
  sprache?: string
}

const TEXTE = {
  de: {
    augenbraue: 'Einladung',
    titel: 'Du wurdest eingeladen',
    vorschau: (site: string) => `Du wurdest zu ${site} eingeladen`,
    anrede: 'Hallo,',
    vor: 'du wurdest eingeladen,',
    nach: 'beizutreten. Mit dem Knopf unten nimmst du die Einladung an und richtest deinen Zugang ein.',
    knopf: 'Einladung annehmen',
    ignorieren: 'Wenn du diese Einladung nicht erwartet hast, kannst du diese E-Mail einfach ignorieren.',
  },
  en: {
    augenbraue: 'Invitation',
    titel: "You've been invited",
    vorschau: (site: string) => `You've been invited to ${site}`,
    anrede: 'Hello,',
    vor: "you've been invited to join",
    nach: '. Use the button below to accept the invitation and set up your access.',
    knopf: 'Accept invitation',
    ignorieren: "If you weren't expecting this invitation, you can simply ignore this email.",
  },
} as const

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
  sprache,
}: InviteEmailProps) => {
  const t = texteFuer(TEXTE, sprache)
  const englisch = t === TEXTE.en
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
        {t.vor}{' '}
        <Link href={siteUrl} className="mi-link" style={{ color: T.blauLink, textDecoration: 'none' }}>
          <strong>{siteName}</strong>
        </Link>
        {/* Im Deutschen steht ein Leerzeichen vor „beizutreten“, im Englischen folgt der Punkt direkt. */}
        {englisch ? '' : ' '}
        {t.nach}
      </Absatz>

      <Handlung href={confirmationUrl} text={t.knopf} />

      <Absatz letzter>{t.ignorieren}</Absatz>
    </EmailLayout>
  )
}

export default InviteEmail
