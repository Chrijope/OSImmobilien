/**
 * Wer im Bewerbermanagement benachrichtigt wird, und wie.
 *
 * Die Empfaenger haengen ausschliesslich an der Rolle, nie an einer Person.
 * Traegt morgen jemand anderes die HR-Rolle, oder kommt eine zweite Person
 * dazu, laeuft es ohne Codeaenderung weiter. Im Zapier-Webhook stand vorher
 * eine feste Nutzer-ID im Code; genau solche Zeilen veralten unbemerkt.
 *
 * Das Muster stammt aus send-vertrag-hr-eskalation und wird hier nur einmal
 * aufgeschrieben, damit die drei Eingangswege eines neuen Bewerbers nicht drei
 * verschiedene Empfaengerlisten bekommen.
 *
 * Glocke und Mail gehen bei einem neuen Bewerber ausschliesslich an die
 * HR-Rolle. Vorher las der Inhaber ueber die Glocke still mit; auf Wunsch der
 * Geschaeftsfuehrung ist damit Schluss: Zustaendig ist HR, und eine Glocke,
 * die staendig fuer etwas laeutet, das einen nichts angeht, wird nach einer
 * Woche ignoriert.
 */

/**
 * Vom Supabase-Client wird hier nur gelesen, geschrieben und eine Function
 * aufgerufen. Der lose Typ haelt diese Datei frei von einer npm-Angabe, die
 * je nach aufrufender Function anders lautet.
 */
type Datenzugriff = {
  from: (tabelle: string) => any
  functions: { invoke: (name: string, args: any) => Promise<{ data: any; error: any }> }
}

import { metaScore, type MetaAngaben } from './bewerber-meta-score.ts'

export const PORTAL_URL = 'https://osimmobilien.netlify.app'

/**
 * Der Weg in die Bewerberakte.
 *
 * `/bewerbung/<id>` gibt es als Route nicht, dieser Link fuehrte auf die
 * Fehlerseite. Geoeffnet wird die Akte ueber den Parameter `openBewerber`.
 */
export function bewerberPfad(bewerbungId: string): string {
  return `/bewerberprozess?openBewerber=${bewerbungId}`
}

/*
 * Die volle Adresse, nur fuer Mails.
 *
 * In die Glocke gehoert der Pfad, nie die volle Adresse: Die Glocke ruft
 * `navigate(link)`, und der Router haengt eine volle Adresse als relativen
 * Pfad an die aktuelle Seite. Daraus wird `/https:/osimmobilien.netlify.app/...`,
 * und dafuer gibt es keine Route. Genau so landete Christian am 14.09.2026
 * beim Klick auf "Neuer Bewerber: Eric Schoof" auf der 404-Seite.
 *
 * Dazu kommt: In der Lovable-Vorschau ist die Domain eine andere. Ein Pfad
 * funktioniert dort wie im Portal, eine volle Adresse nicht.
 */
export function bewerberLink(bewerbungId: string): string {
  return `${PORTAL_URL}${bewerberPfad(bewerbungId)}`
}

/**
 * Wer im Bewerbermanagement die Glocke bekommt.
 *
 * Bewusst nur noch die HR-Rolle. Die HR-Managerin bearbeitet die Bewerbung;
 * Inhaber und Admins standen frueher mit auf der Liste und haben jede
 * eingehende Bewerbung mitbekommen. Ueber Meta kommen sie schubweise herein,
 * und eine Glocke, die staendig fuer etwas laeutet, das einen nichts angeht,
 * wird nach einer Woche ignoriert.
 */
const GLOCKEN_ROLLEN = ['hr'] as const

export interface HrEmpfaenger {
  /** Nutzer-IDs fuer die Glocke: nur die HR-Rolle. */
  glockenIds: string[]
  /** Mailadressen der HR-Rolle. */
  mailAdressen: string[]
}

/** Ermittelt die Empfaenger anhand der Rollen. Wirft nicht, sondern liefert im Zweifel leere Listen. */
export async function ladeHrEmpfaenger(admin: Datenzugriff): Promise<HrEmpfaenger> {
  try {
    const { data: rollen } = await admin
      .from('user_roles')
      .select('user_id, role')
      .in('role', [...GLOCKEN_ROLLEN])

    const zeilen = (rollen || []) as Array<{ user_id: string; role: string }>
    const glockenIds = [...new Set(zeilen.map((r) => r.user_id).filter(Boolean))]
    const hrIds = [...new Set(zeilen.filter((r) => r.role === 'hr').map((r) => r.user_id).filter(Boolean))]

    let mailAdressen: string[] = []
    if (hrIds.length) {
      const { data: profile } = await admin.from('profiles').select('id, email').in('id', hrIds)
      mailAdressen = [
        ...new Set(
          ((profile || []) as Array<{ email: string | null }>)
            .map((p) => (p.email || '').trim())
            .filter((e) => e.includes('@')),
        ),
      ]
    }

    if (!hrIds.length) {
      console.warn('[hr-benachrichtigung] Keine HR-Rolle vergeben, es geht keine Mail hinaus.')
    }

    return { glockenIds, mailAdressen }
  } catch (e) {
    console.error('[hr-benachrichtigung] Empfaenger konnten nicht ermittelt werden:', e)
    return { glockenIds: [], mailAdressen: [] }
  }
}

/** Schreibt eine Glocke fuer jeden Empfaenger. Best-Effort, ein Fehlschlag bleibt im Log. */
export async function schreibeGlocke(
  admin: Datenzugriff,
  empfaengerIds: string[],
  meldung: { titel: string; nachricht: string; link: string },
): Promise<void> {
  if (!empfaengerIds.length) return
  try {
    const jetzt = new Date().toISOString()
    const { error } = await admin.from('benachrichtigungen').insert(
      empfaengerIds.map((benutzer_id) => ({
        id: crypto.randomUUID(),
        benutzer_id,
        titel: meldung.titel,
        nachricht: meldung.nachricht,
        link: meldung.link,
        gelesen: false,
        erstellt_am: jetzt,
      })),
    )
    if (error) console.error('[hr-benachrichtigung] Glocke fehlgeschlagen:', error)
  } catch (e) {
    console.error('[hr-benachrichtigung] Glocke fehlgeschlagen:', e)
  }
}

export interface NeuerBewerber {
  id: string
  vorname: string
  nachname: string
  email: string
  telefon: string
  ort: string
  /** Der Eingangsweg ins CRM, etwa "Website" oder "Meta (Zapier)". */
  quelle: string
  /** Die Stelle, auf die er sich beworben hat. */
  stelleTitel: string
  /** ISO-Zeitpunkt des Eingangs. */
  beworbenAm: string
  /**
   * Die vier Bewerbungsfragen der Anzeige, sofern dieser Eingangsweg sie hat.
   *
   * Nur der Weg ueber die Anzeige stellt sie. Wer ueber die Website kommt oder
   * von Hand angelegt wird, hat sie nicht, und dann bleibt die Mail so knapp
   * wie bisher. Bewusst kein Rueckfall auf irgendeine Ersatzzahl: Eine Zahl,
   * die auf nichts beruht, ist schlimmer als keine.
   */
  metaAngaben?: MetaAngaben
}

/**
 * Meldet einen neuen Bewerber: Glocke und Mail ausschliesslich an hr.
 *
 * Beide Wege sind best-effort. Ein Bewerber, der eingetragen ist, darf nicht
 * daran scheitern, dass die Meldung darueber nicht hinausgeht.
 */
export async function meldeNeuenBewerber(admin: Datenzugriff, b: NeuerBewerber): Promise<void> {
  const name = `${b.vorname || ''} ${b.nachname || ''}`.trim() || 'Ein Bewerber'
  const link = bewerberPfad(b.id)

  const { glockenIds, mailAdressen } = await ladeHrEmpfaenger(admin)

  /*
   * Die Vorabeinschaetzung entsteht hier, aus derselben Rechnung, die auch die
   * Bewerberliste benutzt. Sie ist `null`, wenn keine der vier Fragen
   * beantwortet ist; die Vorlage laesst den Block dann weg.
   */
  const einschaetzung = b.metaAngaben ? metaScore(b.metaAngaben) : null

  await schreibeGlocke(admin, glockenIds, {
    titel: `Neuer Bewerber: ${name}`,
    nachricht: `${name} hat sich als ${b.stelleTitel || 'Vertriebspartner'} beworben. Eingang ueber ${b.quelle || 'Website'}. Bitte anrufen und qualifizieren.`,
    link,
  })

  for (const adresse of mailAdressen) {
    try {
      const { error } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'bewerber-neu-intern',
          recipientEmail: adresse,
          // Je Bewerber und Empfaenger genau eine Mail, auch wenn die
          // aufrufende Function wiederholt wird.
          idempotencyKey: `bewerber-neu-intern-${b.id}-${adresse}`,
          templateData: {
            bewerberName: name,
            bewerberEmail: b.email || '',
            bewerberTelefon: b.telefon || '',
            ort: b.ort || '',
            quelle: b.quelle || 'Website',
            stelleTitel: b.stelleTitel || '',
            eingegangenAm: formatiereZeitpunkt(b.beworbenAm),
            bewerberLink: link,
            ...(einschaetzung ? { einschaetzung } : {}),
          },
        },
      })
      if (error) console.error('[hr-benachrichtigung] Mail an HR fehlgeschlagen:', error)
    } catch (e) {
      console.error('[hr-benachrichtigung] Mail an HR fehlgeschlagen:', e)
    }
  }
}

/**
 * Meldet eine zweite Bewerbung derselben Person: nur die Glocke an hr.
 *
 * Seit dem 04.10.2026 (M17) wird sie an die bestehende Bewerbung gehaengt,
 * statt still verworfen zu werden oder eine Dublette anzulegen. Eine Mail
 * gibt es dafuer nicht, die Bewerbung ist HR ja schon bekannt.
 */
export async function meldeErneuteBewerbung(
  admin: Datenzugriff,
  b: { id: string; name: string; quelle: string },
): Promise<void> {
  const name = b.name.trim() || 'Ein Bewerber'
  const { glockenIds } = await ladeHrEmpfaenger(admin)
  await schreibeGlocke(admin, glockenIds, {
    titel: `Erneute Bewerbung: ${name}`,
    nachricht: `${name} hat sich erneut beworben, Eingang ueber ${b.quelle || 'Website'}. Die Anfrage haengt an der bestehenden Bewerbung, es wurde keine zweite angelegt.`,
    link: bewerberPfad(b.id),
  })
}

export interface UnterschriebenerVertrag {
  bewerbungId: string
  bewerberName: string
  bewerberEmail: string
  bewerberTelefon: string
  paketTitel: string
  /** ISO-Zeitpunkt der Unterschrift des Bewerbers. */
  signedAt: string
  /** Was jetzt zu tun ist. Steht als einziger Handlungssatz in der Mail. */
  naechsterSchritt: string
}

/**
 * Meldet HR per Mail, dass der Bewerber den Vertrag unterschrieben hat.
 *
 * Ohne Glocke: Die schreibt finalize-vertrag bereits selbst, zusammen mit der
 * Onboarding-Aufgabe in der Inbox. Eine zweite waere dieselbe Meldung doppelt.
 */
export async function meldeVertragUnterschrieben(
  admin: Datenzugriff,
  v: UnterschriebenerVertrag,
): Promise<void> {
  const { mailAdressen } = await ladeHrEmpfaenger(admin)

  for (const adresse of mailAdressen) {
    try {
      const { error } = await admin.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'bewerber-vertrag-unterschrieben-intern',
          recipientEmail: adresse,
          idempotencyKey: `bewerber-vertrag-unterschrieben-${v.bewerbungId}-${adresse}`,
          templateData: {
            bewerberName: v.bewerberName,
            bewerberEmail: v.bewerberEmail || '',
            bewerberTelefon: v.bewerberTelefon || '',
            paketTitel: v.paketTitel || '',
            unterschriebenAm: formatiereZeitpunkt(v.signedAt),
            naechsterSchritt: v.naechsterSchritt,
            bewerberLink: bewerberLink(v.bewerbungId),
          },
        },
      })
      if (error) console.error('[hr-benachrichtigung] Vertragsmail an HR fehlgeschlagen:', error)
    } catch (e) {
      console.error('[hr-benachrichtigung] Vertragsmail an HR fehlgeschlagen:', e)
    }
  }
}

/** Deutscher Zeitpunkt fuer die Mail. Bei unbrauchbarer Angabe lieber nichts als "Invalid Date". */
function formatiereZeitpunkt(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
}
