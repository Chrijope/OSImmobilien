/**
 * Die Sprache einer Kundenmail: Deutsch oder Englisch.
 *
 * Plan Kundensprache, Etappe 2 (freigegeben am 25.09.2026). Jede Kundenvorlage
 * hat ihre Texte als `{ de: {...}, en: {...} }` in derselben Datei und wählt
 * mit `texteFuer(TEXTE, sprache)` die passende Hälfte. Welche Sprache gilt,
 * entscheidet `send-transactional-email` und legt sie als `sprache` in die
 * Felder der Vorlage. Interne Mails bleiben deutsch.
 *
 * Reine Hilfen ohne Deno- oder Browser-Importe. Vitest liest diese Datei
 * direkt, siehe `src/lib/mailSprache.test.ts`.
 */

export type MailSprache = 'de' | 'en'

/** Die Sprachen, die eine zweisprachige Kundenvorlage in `sprachen` meldet. */
export const DE_EN: readonly MailSprache[] = ['de', 'en']

/** Alles, was nicht eindeutig Englisch ist, gilt als Deutsch. */
export function mailSprache(wert: unknown): MailSprache {
  if (typeof wert !== 'string') return 'de'
  const t = wert.trim().toLowerCase()
  return t === 'en' || t.startsWith('en-') || t.startsWith('en_') || t === 'english' || t === 'englisch' ? 'en' : 'de'
}

/**
 * Die Form, die beide Hälften eines Textobjekts erfüllen müssen.
 *
 *   const DE = { titel: 'Dein Termin', knopf: (n: number) => `${n} Minuten` }
 *   const TEXTE: Zweisprachig<typeof DE> = { de: DE, en: { ... } }
 *
 * Fehlt im Englischen ein Schlüssel, meldet es der Compiler. Funktionen
 * werden auf `=> string` geweitet, sonst verlangte TypeScript im Englischen
 * genau die deutschen Wörter als Rückgabe.
 */
export type Zweisprachig<T> = { de: TextForm<T>; en: TextForm<T> }
type TextForm<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => string ? (...args: A) => string : T[K]
}

/** Die Hälfte eines Textobjekts in der Sprache der Mail. */
export function texteFuer<T>(texte: { de: T; en: T }, sprache: unknown): T {
  return mailSprache(sprache) === 'en' ? texte.en : texte.de
}

/* ── Datum und Uhrzeit, die schon deutsch formatiert ankommen ──────────── */

const MONATE_DE = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
]
const MONATE_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const MONATE_EN_KURZ = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const TAGE_DE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']
const TAGE_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const TAGE_DE_KURZ = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const TAGE_EN_KURZ = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MONAT_MUSTER = `(${MONATE_DE.join('|')}|Maerz)`

/**
 * Ein Datum, das der Aufrufer schon deutsch formatiert hat, in der Sprache
 * der Mail.
 *
 * Warum hier und nicht beim Aufrufer: Rund vierzig Stellen schicken Datum und
 * Uhrzeit fertig als Text, etwa „Donnerstag, 6. August 2026“ oder
 * „06.08.2026“. Jede einzeln auf die Kundensprache umzustellen hieße, an
 * jeder Stelle die Sprache vorher zu kennen. Die Vorlage kennt sie ohnehin.
 * Deshalb übersetzt sie hier Wochentag, Monat und Punktformat selbst:
 *
 *   „Donnerstag, 6. August 2026“  → „Thursday, 6 August 2026“
 *   „06.08.2026“                  → „6 Aug 2026“
 *   „Mo., 06.08.2026, 10:00 Uhr“  → „Mon, 6 Aug 2026, 10:00“
 *   „10:15 Uhr“                   → „10:15“
 *
 * Auf Deutsch bleibt der Text unverändert. Was nicht nach Datum aussieht,
 * bleibt ebenfalls stehen.
 */
export function datumFuer(text: string | null | undefined, sprache: unknown): string {
  const roh = String(text ?? '')
  if (mailSprache(sprache) !== 'en' || !roh.trim()) return roh
  let t = roh
  // 2026-08-06 → 6 Aug 2026 (manche Aufrufer schicken das Datum roh)
  t = t.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (ganz, jahr: string, monat: string, tag: string) => {
    const m = Number(monat)
    return m >= 1 && m <= 12 ? `${Number(tag)} ${MONATE_EN_KURZ[m - 1]} ${jahr}` : ganz
  })
  // 06.08.2026 → 6 Aug 2026
  t = t.replace(/\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/g, (ganz, tag: string, monat: string, jahr: string) => {
    const m = Number(monat)
    return m >= 1 && m <= 12 ? `${Number(tag)} ${MONATE_EN_KURZ[m - 1]} ${jahr}` : ganz
  })
  // 6. August → 6 August
  t = t.replace(new RegExp(`\\b(\\d{1,2})\\.\\s*${MONAT_MUSTER}`, 'g'), (_g, tag: string, monat: string) => {
    const i = monat === 'Maerz' ? 2 : MONATE_DE.indexOf(monat)
    return `${Number(tag)} ${MONATE_EN[i]}`
  })
  // Einzelne Monatsnamen, etwa „August 2026“
  t = t.replace(new RegExp(`\\b${MONAT_MUSTER}\\b`, 'g'), (monat: string) => {
    const i = monat === 'Maerz' ? 2 : MONATE_DE.indexOf(monat)
    return MONATE_EN[i]
  })
  TAGE_DE.forEach((tag, i) => {
    t = t.replace(new RegExp(`\\b${tag}\\b`, 'g'), TAGE_EN[i])
  })
  // Kurze Wochentage nur mit Punkt oder Komma dahinter, sonst träfe „So“ das Wort.
  TAGE_DE_KURZ.forEach((tag, i) => {
    t = t.replace(new RegExp(`\\b${tag}\\.?(?=,)`, 'g'), TAGE_EN_KURZ[i])
  })
  // „… um 14:30 Uhr“ → „… at 14:30“
  t = t.replace(/\bum (\d{1,2}:\d{2})/g, 'at $1')
  return uhrzeitFuer(t, 'en')
}

/**
 * Eine Uhrzeit in der Sprache der Mail: Deutsch „10:15 Uhr“, Englisch
 * „10:15“. Ein schon angehängtes „Uhr“ wird nicht verdoppelt.
 */
export function uhrzeitFuer(text: string | null | undefined, sprache: unknown): string {
  const roh = String(text ?? '').trim()
  if (!roh) return ''
  const ohne = roh.replace(/\s*Uhr\b/g, '').trim()
  if (mailSprache(sprache) === 'en') return ohne
  return /^\d{1,2}:\d{2}$/.test(ohne) ? `${ohne} Uhr` : roh
}

/**
 * Die Zeitangabe einer Erinnerung, die der Aufrufer deutsch schickt, etwa
 * „in etwa 24 Stunden“ oder „in weniger als einer Stunde“. Englisch wird sie
 * übersetzt, unbekannte Wendungen bleiben stehen.
 */
export function zeitraumFuer(text: string | null | undefined, sprache: unknown): string {
  const roh = String(text ?? '').trim()
  if (mailSprache(sprache) !== 'en' || !roh) return roh
  const fest: Record<string, string> = {
    'in weniger als einer stunde': 'in less than an hour',
    'in einer stunde': 'in one hour',
    'in 1 stunde': 'in one hour',
    'in gut einer stunde': 'in just over an hour',
    'in kürze': 'shortly',
    'in kuerze': 'shortly',
    'morgen': 'tomorrow',
    'heute': 'today',
  }
  const genau = fest[roh.toLowerCase()]
  if (genau) return genau
  const etwa = /^in etwa (\d+) stunden$/i.exec(roh)
  if (etwa) return `in about ${etwa[1]} hours`
  const stunden = /^in (\d+) stunden$/i.exec(roh)
  if (stunden) return `in ${stunden[1]} hours`
  const tage = /^in (\d+) tagen$/i.exec(roh)
  if (tage) return `in ${tage[1]} days`
  return roh
}

/* ── Das gemeinsame Mail-Layout ───────────────────────────────────────── */

/** Die Texte des Layouts (Fuß, Unterschrift, Ersatztexte). */
export const LAYOUT_TEXTE = {
  de: {
    impressum: 'Impressum',
    datenschutz: 'Datenschutz',
    abmelden: 'Abmelden',
    rolleRueckfall: 'Ansprechpartner bei OS Immobilien',
    linkFehlt:
      'Der Link zu diesem Schritt fehlt leider in dieser Nachricht. Eine kurze Antwort auf diese E-Mail genügt, dann kommt er sofort.',
    anhang: 'Anhang',
  },
  en: {
    impressum: 'Legal notice',
    datenschutz: 'Privacy policy',
    abmelden: 'Unsubscribe',
    // Entscheidung 16: nie „advisor“, das klingt nach Anlageberatung.
    rolleRueckfall: 'Your contact at OS Immobilien',
    linkFehlt:
      'Unfortunately, the link for this step is missing from this message. Simply reply to this email and we will send it to you right away.',
    anhang: 'Attachment',
  },
} as const

/**
 * Die Rollenzeile unter dem Namen des Ansprechpartners.
 *
 * Im CRM steht dort eine deutsche Berufsbezeichnung, meist
 * „Immobilienberater“, manchmal ein selbst gepflegtes Positionsfeld. Eine
 * englische Mail bekommt einheitlich „Your contact at OS Immobilien“: Das Glossar
 * verbietet „advisor“ (Entscheidung 16), und ein frei gepflegtes deutsches
 * Positionsfeld lässt sich nicht verlässlich übersetzen.
 */
export function rolleFuer(rolle: string | null | undefined, sprache: unknown): string {
  if (mailSprache(sprache) === 'en') return LAYOUT_TEXTE.en.rolleRueckfall
  return String(rolle ?? '').trim() || LAYOUT_TEXTE.de.rolleRueckfall
}

/**
 * Hängt `lang=en` an eine Adresse, damit die Zielseite gleich englisch
 * startet. Auf Deutsch bleibt die Adresse unverändert.
 *
 * Auch für den Platzhalter `{{unsubscribe_url}}`: Der Versanddienst setzt
 * dort die Abmeldeadresse `…/unsubscribe?token=…` ein, das angehängte
 * `&lang=en` bleibt dahinter stehen.
 */
export function mitSprache(url: string, sprache: unknown): string {
  if (mailSprache(sprache) !== 'en' || !url) return url
  if (url.startsWith('{{')) return `${url}&lang=en`
  return `${url}${url.includes('?') ? '&' : '?'}lang=en`
}

/* ── Notar ────────────────────────────────────────────────────────────── */

/**
 * Der feste Hinweis in jeder englischen Notarmail (Plan 4.3, Entscheidung 17).
 *
 * Die Urkunde wird deutsch errichtet (§ 5 BeurkG). Spricht der Käufer nicht
 * ausreichend Deutsch, muss der Notar übersetzen lassen (§ 16 BeurkG). Ohne
 * frühen Hinweis platzt der Termin, weil der Dolmetscher fehlt. Zu den Kosten
 * steht hier bewusst nichts, das klärt der Anwalt.
 */
export const NOTAR_DOLMETSCHER_HINWEIS_EN =
  'Please note: the notarial deed is drawn up in German. If your German is not sufficient to follow the reading of the deed, ' +
  'the notary will arrange for it to be translated, usually by an interpreter. Please let us know as early as possible, ' +
  'so that an interpreter can be booked in good time and the appointment can go ahead as planned.'
