/**
 * Alles, was eine Buchungsmail ueber ihren Termin wissen muss.
 *
 * Bestaetigung, Absage und Verschiebung brauchen dieselben Angaben: Zeitzone,
 * Anrede, Videoraum, Kalenderdatei, Adresse des Vertriebspartners, Link zur
 * Kundenakte. Diese Datei traegt sie an einer Stelle zusammen, damit die drei
 * Faelle nicht dreimal dieselbe Rechnung anstellen und dabei auseinanderlaufen.
 *
 * Was hier bewusst NICHT passiert: aus dem Browser uebergebene Namen oder
 * Adressen zu verwenden. Der Aufrufer schickt nur den Absagetoken, alles
 * Weitere steht in der Datenbank. Sonst waere jeder dieser Aufrufe ein
 * Versandwerkzeug, mit dem sich Mails an Fremde ausloesen liessen.
 */

import { spracheAusMeta, type Sprache } from './kunden-sprache.ts'

// ── Reine Hilfsfunktionen ────────────────────────────────────────────────

/**
 * Aus dem gespeicherten Zugang eine vollstaendige Adresse machen.
 *
 * `zoom_link` haelt zweierlei: eine fertige Adresse eines fremden Dienstes, oder einen Pfad
 * wie /raum/<token> beim eigenen Videoraum. Der Pfad steht dort bewusst, weil
 * die Datenbank die oeffentliche Adresse der Anwendung nicht kennt.
 */
export function vollstaendigeAdresse(zugang: string | null | undefined, basis: string): string {
  const wert = (zugang || '').trim()
  if (!wert) return ''
  if (/^https?:\/\//i.test(wert)) return wert
  if (wert.startsWith('/')) return `${basis.replace(/\/+$/, '')}${wert}`
  // Etwas wie "meet.example.com/abc" ohne Schema. Alles andere ist kein Link.
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(wert)) return `https://${wert}`
  return ''
}

/** "Donnerstag, 6. August 2026". */
export function datumLang(zeitpunkt: Date, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: zone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(zeitpunkt)
}

/** "10:15" als Wanduhrzeit in der Zone des Mitarbeiters. */
export function uhrzeitKurz(zeitpunkt: Date, zone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(zeitpunkt)
}

/** "Donnerstag, 6. August 2026, 10:15 Uhr", fuer die Angabe der alten Zeit. */
export function zeitSatz(zeitpunkt: Date, zone: string): string {
  return `${datumLang(zeitpunkt, zone)}, ${uhrzeitKurz(zeitpunkt, zone)} Uhr`
}

/** Das gedraengte Format, das Google Kalender in der Adresse erwartet. */
export function kompakteZeit(zeitpunkt: Date): string {
  return `${zeitpunkt.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
}

/** Nur eine saubere Anrede verwenden, sonst lieber den Vornamen. */
export function saubereAnrede(anrede: string | null | undefined): string {
  // Das Feld enthaelt mal "Herr", mal "Sehr geehrter Herr". Beides ist
  // gemeint, alles andere lieber weglassen als falsch anreden.
  const wert = (anrede || '').trim().toLowerCase()
  if (wert.includes('frau')) return 'Frau'
  if (wert.includes('herr')) return 'Herr'
  return ''
}

// ── Der Kontext ──────────────────────────────────────────────────────────

export interface BuchungKontext {
  zone: string
  /** Anrede, Vorname, Nachname des Buchenden. */
  anrede: string
  vorname: string
  nachname: string
  /** Ob der Kontakt durch diese Buchung erst entstanden ist. */
  kundeNeu: boolean
  kundeEmail: string
  kundeName: string
  kundeTelefon: string
  nachricht: string
  partnerEmail: string
  partnerName: string
  /** Ueberschrift des Termins, notfalls das blosse Wort "Termin". */
  titel: string
  beschreibung: string
  /** Vollstaendige Adresse zum Videoraum oder Meeting, sofern es einen gibt. */
  zugangUrl: string
  /** Seite, auf der der Kunde selbst absagen oder verschieben kann. */
  verwaltenUrl: string
  /** Der offene Buchungslink des Mitarbeiters, sofern er aktiv ist. */
  neuBuchenUrl: string
  /** Kundenakte im CRM. */
  kundeUrl?: string
  start?: Date
  ende?: Date
  terminDatum: string
  terminUhrzeit: string
  dauer?: number
  /**
   * Kalenderdatei und Google-Link in der Sprache des Kunden. Nur fuer die
   * Kundenmail; der Partner liest das CRM auf Deutsch.
   */
  icsUrl?: string
  googleCalendarUrl?: string
  /** Die Kundensprache aus dem Profil, ohne Kontakt Deutsch. */
  sprache: Sprache
}

export interface KontextOptionen {
  supabaseUrl: string
  basisAdresse: string
  /**
   * Zaehler fuer die Kalenderdatei. Beim Verschieben geht dieselbe UID mit
   * neuer Zeit hinaus; ohne hoehere SEQUENCE lassen Apple Kalender und Outlook
   * den alten Eintrag stehen.
   */
  icsSequenz?: number
}

// Der Supabase-Client kommt aus einer npm-Angabe der aufrufenden Function.
// Hier wird nur gelesen, deshalb reicht die lose Form.
type Client = {
  from: (tabelle: string) => any
}

export async function ladeBuchungKontext(
  supabase: Client,
  buchung: Record<string, any>,
  optionen: KontextOptionen,
): Promise<BuchungKontext> {
  const basis = optionen.basisAdresse.replace(/\/+$/, '')

  const { data: einstellungen } = await supabase
    .from('buchung_einstellungen')
    .select('slug, zeitzone, offen_aktiv')
    .eq('mitarbeiter_id', buchung.mitarbeiter_id)
    .maybeSingle()
  const zone = String(einstellungen?.zeitzone || 'Europe/Berlin')

  const { data: terminart } = buchung.terminart_id
    ? await supabase
        .from('buchung_terminarten')
        .select('bezeichnung, beschreibung')
        .eq('id', buchung.terminart_id)
        .maybeSingle()
    : { data: null }

  // Der Zugang zum Videoraum steht in der Aktivitaet, meist als Pfad
  // /raum/<token>. Fehlt die Aktivitaet, hilft der Raum selbst weiter.
  let zugangRoh = ''
  if (buchung.aktivitaet_id) {
    const { data: aktivitaet } = await supabase
      .from('aktivitaeten')
      .select('zoom_link')
      .eq('id', buchung.aktivitaet_id)
      .maybeSingle()
    zugangRoh = String(aktivitaet?.zoom_link || '')
  }
  if (!zugangRoh && buchung.videoraum_id) {
    const { data: raum } = await supabase
      .from('videoraeume')
      .select('token')
      .eq('id', buchung.videoraum_id)
      .maybeSingle()
    if (raum?.token) zugangRoh = `/raum/${raum.token}`
  }
  const zugangUrl = vollstaendigeAdresse(zugangRoh, basis)

  // Anrede und Namensteile aus dem Kontakt, dazu die Frage, ob er durch
  // diese Buchung erst entstanden ist. Kontakt und Buchung entstehen in
  // derselben Transaktion, ihre Zeitstempel liegen dann gleichauf.
  let anrede = ''
  let vorname = ''
  let nachname = ''
  let kundeNeu = false
  let sprache: Sprache = 'de'
  if (buchung.kontakt_id) {
    const { data: kontakt } = await supabase
      .from('kontakte')
      .select('anrede, vorname, nachname, erstellt_am, quelle, meta')
      .eq('id', buchung.kontakt_id)
      .maybeSingle()
    if (kontakt) {
      anrede = saubereAnrede(kontakt.anrede)
      sprache = spracheAusMeta(kontakt.meta)
      vorname = String(kontakt.vorname || '').trim()
      nachname = String(kontakt.nachname || '').trim()
      const angelegt = new Date(String(kontakt.erstellt_am || '')).getTime()
      const gebucht = new Date(String(buchung.created_at || '')).getTime()
      kundeNeu =
        Number.isFinite(angelegt) &&
        Number.isFinite(gebucht) &&
        Math.abs(angelegt - gebucht) < 60_000
    }
  }
  // Ohne Kontakt bleibt nur der Name aus dem Formular.
  if (!vorname && !nachname) {
    const teile = String(buchung.name || '').trim().split(/\s+/).filter(Boolean)
    vorname = teile[0] || ''
    nachname = teile.slice(1).join(' ')
  }

  const { data: profil } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', buchung.mitarbeiter_id)
    .maybeSingle()

  // Der Weg zum Absagen und Verschieben. Der Zugangstoken darf angehaengt
  // werden, damit die Verwaltungsseite freie Zeiten holen kann, siehe
  // absageUrl() in src/lib/buchungStore.ts.
  let zugangToken = ''
  if (buchung.link_id) {
    const { data: link } = await supabase
      .from('buchung_links')
      .select('token')
      .eq('id', buchung.link_id)
      .maybeSingle()
    zugangToken = String(link?.token || '')
  }
  if (!zugangToken) zugangToken = String(einstellungen?.slug || '')
  const verwaltenBasis = `${basis}/termin/verwalten/${buchung.absage_token}`
  const verwaltenUrl = zugangToken
    ? `${verwaltenBasis}?zugang=${encodeURIComponent(zugangToken)}`
    : verwaltenBasis

  // Nach einer Absage soll der Kunde gleich neu buchen koennen. Das geht nur
  // ueber den offenen Link: ein persoenlicher Link kann einmalig und damit
  // verbraucht sein.
  const neuBuchenUrl =
    einstellungen?.offen_aktiv && einstellungen?.slug
      ? `${basis}/termin/${einstellungen.slug}`
      : ''

  const start = new Date(String(buchung.start_at))
  const ende = new Date(String(buchung.ende_at))
  const gueltigeZeit = !Number.isNaN(start.getTime()) && !Number.isNaN(ende.getTime())
  const titel = String(buchung.bezeichnung || terminart?.bezeichnung || '').trim() || 'Termin'
  const beschreibung = String(terminart?.beschreibung || '').trim()
  // Im Kalender des Kunden: ohne gepflegte Terminart englisch "Appointment".
  // Eine gepflegte Bezeichnung ist ein Name aus dem CRM und bleibt.
  const kalenderTitel = sprache === 'en' && titel === 'Termin' ? 'Appointment' : titel

  // Kalenderdatei ueber die vorhandene Function get-ics, denselben Weg nimmt
  // src/lib/meetingEinladung.ts. Start und Ende gehen als vollstaendiges
  // ISO-8601 hinaus, denn get-ics liest sie mit `new Date(...)`.
  const icsUrl = gueltigeZeit
    ? `${optionen.supabaseUrl.replace(/\/+$/, '')}/functions/v1/get-ics` +
      `?title=${encodeURIComponent(kalenderTitel)}` +
      `&start=${encodeURIComponent(start.toISOString())}` +
      `&end=${encodeURIComponent(ende.toISOString())}` +
      `&desc=${encodeURIComponent(beschreibung)}` +
      `&loc=${encodeURIComponent(zugangUrl || 'Online')}` +
      `&org=${encodeURIComponent(String(profil?.name || 'OS Immobilien'))}` +
      `&orgEmail=${encodeURIComponent(String(profil?.email || ''))}` +
      `&att=${encodeURIComponent(String(buchung.email || ''))}` +
      `&uid=${encodeURIComponent(`buchung-${buchung.id}`)}` +
      (optionen.icsSequenz ? `&seq=${optionen.icsSequenz}` : '') +
      (sprache === 'en' ? '&lang=en' : '')
    : undefined

  const googleCalendarUrl = gueltigeZeit
    ? 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      `&text=${encodeURIComponent(kalenderTitel)}` +
      `&dates=${kompakteZeit(start)}/${kompakteZeit(ende)}` +
      `&details=${encodeURIComponent(beschreibung)}` +
      `&location=${encodeURIComponent(zugangUrl || 'Online')}`
    : undefined

  return {
    zone,
    anrede,
    vorname,
    nachname,
    kundeNeu,
    kundeEmail: String(buchung.email || '').trim(),
    kundeName: String(buchung.name || '').trim(),
    kundeTelefon: String(buchung.telefon || '').trim(),
    nachricht: String(buchung.nachricht || '').trim(),
    partnerEmail: String(profil?.email || '').trim(),
    partnerName: String(profil?.name || '').trim(),
    titel,
    beschreibung,
    zugangUrl,
    verwaltenUrl,
    neuBuchenUrl,
    kundeUrl: buchung.kontakt_id ? `${basis}/kunden/${buchung.kontakt_id}` : undefined,
    start: gueltigeZeit ? start : undefined,
    ende: gueltigeZeit ? ende : undefined,
    terminDatum: gueltigeZeit ? datumLang(start, zone) : '',
    terminUhrzeit: gueltigeZeit ? uhrzeitKurz(start, zone) : '',
    dauer: Number(buchung.dauer_minuten) || undefined,
    icsUrl,
    googleCalendarUrl,
    sprache,
  }
}
