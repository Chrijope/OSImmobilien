import * as React from 'npm:react@18.3.1'
import type { TemplateEntry } from './registry.ts'
import { EmailLayout, Absatz, Handlung, Angaben, Hinweis } from './_layout.tsx'
import { hallo } from './_anrede.ts'
import { datumFuer, DE_EN, type MailSprache, texteFuer, type Zweisprachig } from './_sprache.ts'

interface Props {
  name?: string
  email?: string
  ip?: string
  zeitpunkt?: string
  locked_until?: string
  lockout_count?: number
  max_attempts?: number
  /** Dieselbe Vorlage geht auch an die Administration. Die Fassung bleibt deutsch. */
  adminAlert?: boolean
  targetEmail?: string
  /** Die Sprache kommt ueber die Adresse: Kunden je nach Profil, alle anderen Deutsch. */
  sprache?: MailSprache
}

const DE = {
  betreff: (admin: boolean, ziel: string) =>
    admin ? `Konto gesperrt: ${ziel || 'unbekannt'}` : 'Dein MOREImmo-Konto wurde vorübergehend gesperrt',
  augenbraue: 'Sicherheitshinweis',
  titel: (admin: boolean) => (admin ? 'Ein Konto wurde gesperrt' : 'Dein Konto ist vorübergehend gesperrt'),
  vorschau: (admin: boolean, ziel: string) =>
    admin
      ? `Automatische Sperrung nach zu vielen Fehlversuchen: ${ziel}`
      : 'Zum Schutz deines Kontos haben wir es vorübergehend gesperrt.',
  text: (admin: boolean, ziel: string, versuche: number) =>
    admin
      ? `Das Konto ${ziel || 'eines Nutzers'} wurde nach zu vielen Fehlversuchen automatisch gesperrt.`
      : `wir haben ${versuche} fehlgeschlagene Anmeldeversuche auf deinem Konto festgestellt. Zum Schutz haben wir es vorübergehend gesperrt.`,
  knopf: 'Passwort zurücksetzen',
  hinweisKnopf: 'Falls du dein Passwort vergessen hast',
  details: 'Details',
  konto: 'Konto',
  zeitpunkt: 'Zeitpunkt',
  gesperrtBis: 'Gesperrt bis',
  ip: 'IP-Adresse',
  ipUnbekannt: 'unbekannt',
  nummer: 'Sperrung Nummer',
  warnung: (admin: boolean) =>
    admin
      ? 'Wenn der Lockout verdächtig wirkt, etwa durch eine unbekannte IP oder mehrere in Folge, prüfe die Session-Anomalien im Adminbereich.'
      : 'Warst du das nicht, hat jemand versucht sich Zugang zu verschaffen. Setze dann sofort dein Passwort zurück und melde dich bei uns.',
}

const TEXTE: Zweisprachig<typeof DE> = {
  de: DE,
  en: {
    betreff: (admin: boolean, ziel: string) =>
      admin ? `Account locked: ${ziel || 'unknown'}` : 'Your MOREImmo account has been temporarily locked',
    augenbraue: 'Security notice',
    titel: (admin: boolean) => (admin ? 'An account has been locked' : 'Your account is temporarily locked'),
    vorschau: (admin: boolean, ziel: string) =>
      admin
        ? `Automatic lock after too many failed attempts: ${ziel}`
        : 'To protect your account, we have temporarily locked it.',
    text: (admin: boolean, ziel: string, versuche: number) =>
      admin
        ? `The account ${ziel || 'of a user'} was locked automatically after too many failed attempts.`
        : `We have detected ${versuche} failed sign-in attempts on your account. To protect it, we have temporarily locked it.`,
    knopf: 'Reset your password',
    hinweisKnopf: 'In case you have forgotten your password',
    details: 'Details',
    konto: 'Account',
    zeitpunkt: 'Time',
    gesperrtBis: 'Locked until',
    ip: 'IP address',
    ipUnbekannt: 'unknown',
    nummer: 'Lock number',
    warnung: (admin: boolean) =>
      admin
        ? 'If the lock looks suspicious, for example because of an unknown IP address or several in a row, check the session anomalies in the admin area.'
        : 'If this was not you, someone has tried to gain access. In that case, reset your password immediately and get in touch with us.',
  },
}

/** Die Meldung an die Administration bleibt deutsch. */
function spracheFuer(data: { adminAlert?: boolean; sprache?: unknown }): unknown {
  return data.adminAlert ? 'de' : data.sprache
}

const Mail = ({
  name = '',
  email = '',
  ip,
  zeitpunkt = '',
  locked_until = '',
  lockout_count = 1,
  max_attempts = 5,
  adminAlert = false,
  targetEmail = '',
  sprache: roh,
}: Props) => {
  const sprache = spracheFuer({ adminAlert, sprache: roh }) as MailSprache
  const t = texteFuer(TEXTE, sprache)
  const konto = adminAlert ? targetEmail : email
  const zeilen: Array<[string, string]> = []
  if (konto) zeilen.push([t.konto, konto])
  if (zeitpunkt) zeilen.push([t.zeitpunkt, datumFuer(zeitpunkt, sprache)])
  if (locked_until) zeilen.push([t.gesperrtBis, datumFuer(locked_until, sprache)])
  zeilen.push([t.ip, ip || t.ipUnbekannt])
  zeilen.push([t.nummer, String(lockout_count)])

  return (
    <EmailLayout
      sprache={sprache}
      augenbraue={t.augenbraue}
      titel={t.titel(adminAlert)}
      vorschau={t.vorschau(adminAlert, targetEmail)}
      anrede={adminAlert ? undefined : hallo(name, sprache)}
      intern
      ohneUnterschrift
    >
      <Absatz letzter>{t.text(adminAlert, targetEmail, max_attempts)}</Absatz>

      {!adminAlert && (
        <Handlung
          sprache={sprache}
          href="https://portal.more.immo/login"
          text={t.knopf}
          hinweis={t.hinweisKnopf}
        />
      )}

      <Angaben titel={t.details} zeilen={zeilen} />

      <Hinweis ton="warnung" text={t.warnung(adminAlert)} />
    </EmailLayout>
  )
}

export const template = {
  component: Mail,
  subject: (data: Record<string, any>) =>
    texteFuer(TEXTE, spracheFuer(data)).betreff(Boolean(data?.adminAlert), data?.targetEmail ?? ''),
  displayName: 'Account-Lockout',
  sprachen: DE_EN,
  previewData: {
    name: 'Max Mustermann',
    email: 'max@example.com',
    ip: '203.0.113.42',
    zeitpunkt: '31.05.2026, 18:42',
    locked_until: '31.05.2026, 18:57',
    lockout_count: 1,
    max_attempts: 5,
  },
} satisfies TemplateEntry
