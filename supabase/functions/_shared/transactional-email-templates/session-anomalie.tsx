import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Hinweis } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  level?: 'low' | 'medium' | 'critical'
  /** Begruendung der Erkennung, kommt deutsch aus manage-sessions und bleibt so. */
  reason?: string
  country?: string
  city?: string
  ip?: string
  browser?: string
  os?: string
  zeitpunkt?: string
  /** Nur in der Kopie an die Administration. Diese Fassung bleibt deutsch. */
  adminAlert?: string
  /** Die Sprache kommt ueber die Adresse: Kunden je nach Profil, alle anderen Deutsch. */
  sprache?: MailSprache
}

const DE = {
  betreff: (kritisch: boolean) =>
    kritisch ? 'Verdächtiger Login auf deinem MOREImmo-Konto' : 'Neuer Login auf deinem MOREImmo-Konto',
  augenbraue: 'Sicherheitshinweis',
  titel: (kritisch: boolean) => (kritisch ? 'Verdächtiger Login auf deinem Konto' : 'Neuer Login auf deinem Konto'),
  vorschauRueckfall: 'Ein Login weicht von deinem üblichen Muster ab.',
  text: (grund: string) =>
    `wir haben einen Login bei deinem Konto festgestellt, der von deinem üblichen Muster abweicht${grund ? `: ${grund}` : ''}.`,
  knopf: 'Passwort ändern und Geräte abmelden',
  hinweisKnopf: 'Nur nötig, wenn du das nicht selbst warst',
  details: 'Details',
  zeitpunkt: 'Zeitpunkt',
  standort: 'Standort',
  ip: 'IP-Adresse',
  geraet: 'Gerät',
  auf: ' auf ',
  unbekannt: 'unbekannt',
  schluss:
    'Warst du das selbst, kannst du diese Mail ignorieren. Warst du es nicht, ändere bitte sofort dein Passwort und melde alle anderen Sitzungen ab.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (kritisch: boolean) =>
      kritisch ? 'Suspicious sign-in to your MOREImmo account' : 'New sign-in to your MOREImmo account',
    augenbraue: 'Security notice',
    titel: (kritisch: boolean) => (kritisch ? 'Suspicious sign-in to your account' : 'New sign-in to your account'),
    vorschauRueckfall: 'A sign-in differs from your usual pattern.',
    text: (grund: string) =>
      `We have detected a sign-in to your account that differs from your usual pattern${grund ? `: ${grund}` : ''}.`,
    knopf: 'Change your password and sign out devices',
    hinweisKnopf: 'Only necessary if this was not you',
    details: 'Details',
    zeitpunkt: 'Time',
    standort: 'Location',
    ip: 'IP address',
    geraet: 'Device',
    auf: ' on ',
    unbekannt: 'unknown',
    schluss:
      'If this was you, you can ignore this email. If it was not, please change your password immediately and sign out of all other sessions.',
  },
}

/** Die Kopie an die Administration bleibt deutsch. */
function spracheFuer(data: { adminAlert?: unknown; sprache?: unknown }): unknown {
  return data.adminAlert ? 'de' : data.sprache
}

const Mail = ({
  name = '',
  level = 'medium',
  reason = '',
  country = '',
  city = '',
  ip = '',
  browser = '',
  os = '',
  zeitpunkt = '',
  adminAlert,
  sprache: roh,
}: Props) => {
  const sprache = spracheFuer({ adminAlert, sprache: roh }) as MailSprache
  const t = texteFuer(TEXTE, sprache)
  const kritisch = level === 'critical'
  const zeilen: Array<[string, string]> = []
  if (zeitpunkt) zeilen.push([t.zeitpunkt, datumFuer(zeitpunkt, sprache)])
  zeilen.push([t.standort, [city, country].filter(Boolean).join(', ') || t.unbekannt])
  zeilen.push([t.ip, ip || t.unbekannt])
  zeilen.push([t.geraet, [browser, os].filter(Boolean).join(t.auf) || t.unbekannt])

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(kritisch)}
      vorschau={reason || t.vorschauRueckfall}
      anrede={hallo(name, sprache)}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>{t.text(reason)}</Absatz>

      <Handlung
        sprache={sprache}
        href="https://portal.more.immo/einstellungen"
        text={t.knopf}
        hinweis={t.hinweisKnopf}
      />

      <Angaben titel={t.details} zeilen={zeilen} />

      {adminAlert && <Hinweis text={adminAlert} />}

      <Hinweis ton={kritisch ? 'fehler' : 'neutral'} text={t.schluss} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) => texteFuer(TEXTE, spracheFuer(data)).betreff(data?.level === 'critical'),
  displayName: 'Session-Anomalie erkannt',
  sprachen: DE_EN,
  previewData: {
    name: 'Max Mustermann',
    level: 'critical',
    reason: 'Länderwechsel Deutschland nach Russland innerhalb von 12 Minuten',
    country: 'Russland',
    city: 'Moskau',
    ip: '203.0.113.42',
    browser: 'Chrome',
    os: 'Windows',
    zeitpunkt: '31.05.2026, 18:42',
  },
} satisfies TemplateEntry
