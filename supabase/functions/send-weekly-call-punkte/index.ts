import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import { istWeeklyCallLeitung } from '../_shared/weekly-call-runden.ts'

/**
 * Die Punkte für den Weekly Sales Call, montags um 17 Uhr an die Leitung.
 *
 * Am Montag um 17 Uhr ist Redaktionsschluss. Bis dahin tragen die Partner ein,
 * was sie im Call besprechen wollen; danach sagt der Banner im CRM schon
 * heute: "Danach geht die Liste an die Leitung." Diese Function löst genau
 * dieses Versprechen ein, damit sich die Moderation vor den beiden Calls um
 * 19:00 (Lead-Berater) und 19:30 (Vertriebspartner) vorbereiten kann. Die
 * Punkte stehen in der Mail je Call getrennt (`call_runde`, Migration
 * 20261005160000).
 *
 * Weil die Mail beide Calls enthält, geht sie nur an die Leitung (Admin,
 * Inhaber, Vertriebsleitung, Vorgabe Christian vom 05.10.2026). Jede Adresse
 * wird über `profiles.email` einem Nutzer zugeordnet und gegen seine Rollen
 * geprüft (`_shared/weekly-call-runden.ts`). Ohne Nutzer oder ohne
 * Leitungsrolle wird sie übersprungen und im Protokoll vermerkt, auch im
 * Testbetrieb.
 *
 * ── DIE EMPFÄNGER ÄNDERN ────────────────────────────────────────────────
 *
 * Der Kreis steht NICHT im Code, sondern in der Datenbank, in
 * `public.app_config` unter dem Schlüssel `weekly_call_punkte_empfaenger`,
 * als JSON-Array von Mailadressen. Aufnehmen oder entfernen heißt: die
 * vollständige neue Liste eintragen, im Supabase SQL-Editor:
 *
 *     update public.app_config
 *        set wert = '["os@os-immobilien.com","os@os-immobilien.com"]'::jsonb,
 *            aktualisiert_am = now()
 *      where schluessel = 'weekly_call_punkte_empfaenger';
 *
 * Den aktuellen Stand zeigt:
 *
 *     select wert from public.app_config
 *      where schluessel = 'weekly_call_punkte_empfaenger';
 *
 * Bewusst keine Bestimmung über Rollen und ausdrücklich keine Namen im Code.
 * Die Rollen `inhaber` und `admin` tragen möglicherweise mehr Leute als
 * gedacht, und die bekämen die Liste dann sofort mit, ohne dass jemand es
 * entschieden hat. Dieselbe Begründung wie in `tagesbriefing/index.ts`.
 *
 * Fehlt der Schlüssel, ist er leer oder kein Array, geht NICHTS hinaus. Kein
 * Rückfall auf eine im Code stehende Adresse, keiner auf alle Administratoren.
 * Der Grund steht dann im Protokoll.
 *
 * ── OHNE VERFASSER ──────────────────────────────────────────────────────
 *
 * Die Punkte sind anonym, und das ist der Zweck der Liste, nicht ein Mangel
 * (siehe 20260824140000_weekly_call_punkte.sql). Diese Function liest die
 * Tabelle zwar mit dem Service-Key und könnte die Verfasser mitschicken, tut
 * es aber nicht: `user_id` wird gar nicht erst abgefragt. Stünde der Name in
 * der Mail, kämen genau die unbequemen Punkte nicht mehr.
 *
 * ── LEERE WOCHE ─────────────────────────────────────────────────────────
 *
 * Liegt kein Punkt vor, geht keine Mail hinaus. Die Punkte sind freiwillige
 * Wortmeldungen und keine Kennzahlen: Eine leere Woche ist ein Normalfall und
 * keine Meldung wert. Eine Mail, die an vier von fünf Montagen "diese Woche
 * nichts" sagt, wird nach dem dritten Mal ungelesen weggeklickt, und dann
 * trifft es auch die Montage, an denen etwas drinsteht.
 *
 * ── DIE ZEITUMSTELLUNG ──────────────────────────────────────────────────
 *
 * pg_cron läuft in UTC und macht die Sommerzeit nicht mit. 17 Uhr deutscher
 * Zeit ist im Sommer 15:00 UTC und im Winter 16:00 UTC. Deshalb gibt es zwei
 * Zeitplaneinträge, und diese Function prüft die Berliner Stunde selbst nach
 * und bricht ab, wenn es dort nicht 17 Uhr ist. Ohne diese Prüfung ginge die
 * Mail ein halbes Jahr lang zweimal hinaus. Genauso gelöst wie in
 * `send-weekly-summary` und `tagesbriefing`.
 *
 * Die Function ist öffentlich erreichbar (verify_jwt = false), weil pg_cron
 * sie ohne Anmeldetoken ruft. Der Testbetrieb mit frei gewählter Adresse ist
 * deshalb an den Service-Key gebunden.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Der Schlüssel in `app_config`, unter dem die Empfängerliste steht. */
const EMPFAENGER_SCHLUESSEL = 'weekly_call_punkte_empfaenger'

/** Die Stunde in Berlin, zu der die Mail hinausgeht. Redaktionsschluss. */
const STUNDE_BERLIN = 17

/** Der Wochentag in Berlin, an dem die Mail hinausgeht. 1 = Montag. */
const WOCHENTAG_BERLIN = 1

/**
 * Die beiden Startzeiten, nur für den Text der Mail. Seit 05.10.2026 wieder
 * zwei Calls: 19:00 Lead-Berater, 19:30 Vertriebspartner.
 *
 * Maßgeblich bleibt `src/lib/weeklyCallZeit.ts`. Hier stehen sie noch einmal,
 * weil eine Edge Function nicht auf den Browser-Quellcode zugreifen kann. Wer
 * den Call verlegt, ändert beide Stellen; falsch wäre hier höchstens eine
 * Uhrzeit im Fließtext, der Versand selbst hängt nicht daran.
 */
const ZEIT_LEAD_BERATER = '19:00'
const ZEIT_VERTRIEBSPARTNER = '19:30'

const PORTAL = 'https://osimmobilien.netlify.app'

/**
 * Was diese Function vom Supabase-Client wirklich braucht.
 *
 * Der erzeugte Typ von `createClient` hängt an den generierten Schematypen,
 * und die kennen `weekly_call_punkte` nicht. Statt jeden Aufruf einzeln
 * wegzucasten, steht hier die lose Beschreibung dessen, was gebraucht wird.
 * Derselbe Behelf wie in `tagesbriefing/index.ts`.
 */
type Datenbank = {
  from: (tabelle: string) => any
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
  // `any` statt `unknown`, damit der Typ zu `Mailversender` in
  // `_shared/transactional-versand.ts` passt und `sendeVorlage` ohne Cast
  // aufgerufen werden kann. Genauso in `tagesbriefing/index.ts`.
  // deno-lint-ignore no-explicit-any
  functions: { invoke: (name: string, args: any) => Promise<{ data: any; error: any }> }
}

// ── Kleine Helfer ────────────────────────────────────────────────────────

function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** Die Stunde in Berlin, oder NaN, wenn sie sich nicht lesen lässt. */
function berlinerStunde(): number {
  return Number(
    new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false })
      .formatToParts(new Date())
      .find((t) => t.type === 'hour')?.value,
  )
}

/** Der Wochentag in Berlin, 1 für Montag bis 7 für Sonntag. */
function berlinerWochentag(): number {
  const kurz = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' })
    .format(new Date())
    .toLowerCase()
  const tage = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  return tage.indexOf(kurz) + 1
}

/** "2026-09-21" in deutscher Zeit, nicht in UTC. */
function isoTagBerlin(zeitpunkt: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(zeitpunkt)
}

/** "Montag, 21.09.2026" aus "2026-09-21". */
function deutscherTag(iso: string): string {
  const [j, m, t] = iso.split('-').map(Number)
  if (!j || !m || !t) return iso
  // Mittags statt mitternachts, damit die Umrechnung nach Berlin nicht über
  // die Tagesgrenze rutscht.
  return new Date(Date.UTC(j, m - 1, t, 12)).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin',
  })
}

/**
 * "heute, 16:02 Uhr" oder "Freitag, 09:14 Uhr".
 *
 * Der Wochentag statt des Datums, weil alle Punkte aus derselben Woche
 * stammen und "Freitag" schneller zu erfassen ist als "19.09.".
 */
function wannText(erstellt: string, heuteIso: string): string {
  const d = new Date(erstellt)
  if (Number.isNaN(d.getTime())) return ''
  const uhrzeit = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  const tagIso = isoTagBerlin(d)
  if (tagIso === heuteIso) return `heute, ${uhrzeit} Uhr`
  const wochentag = d.toLocaleDateString('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' })
  return `${wochentag}, ${uhrzeit} Uhr`
}

/**
 * "seit 3 Tagen", oder leer, wenn der Punkt von heute ist.
 *
 * Gezählt werden Kalendertage in Berliner Zeit, nicht 24-Stunden-Schritte.
 * Ein Punkt von Freitagabend und einer von Freitagmorgen liegen beide "seit
 * 3 Tagen", und genau so liest man es auch.
 */
function alterText(erstellt: string, heuteIso: string): string {
  const tagIso = isoTagBerlin(new Date(erstellt))
  if (!tagIso || tagIso === heuteIso) return ''
  const tage = Math.round(
    (Date.parse(`${heuteIso}T12:00:00Z`) - Date.parse(`${tagIso}T12:00:00Z`)) / 86_400_000,
  )
  if (!Number.isFinite(tage) || tage <= 0) return ''
  return tage === 1 ? 'seit 1 Tag' : `seit ${tage} Tagen`
}

// ── Die Empfänger ────────────────────────────────────────────────────────

interface EmpfaengerErgebnis {
  adressen: string[]
  /** Warum die Liste leer ist, in einem Satz für das Protokoll. */
  grund: string | null
  uebersprungen: string[]
}

/**
 * Die Empfängerliste aus `app_config`.
 *
 * Kein Rückfall auf irgendetwas. Fehlt der Eintrag, geht die Mail nicht
 * hinaus, und der Grund steht im Protokoll. Das ist die sichere Richtung:
 * Eine nicht verschickte Mail lässt sich nachholen, eine verschickte nicht
 * zurückholen.
 */
async function ladeEmpfaenger(db: Datenbank): Promise<EmpfaengerErgebnis> {
  const { data, error } = await db
    .from('app_config')
    .select('wert')
    .eq('schluessel', EMPFAENGER_SCHLUESSEL)
    .maybeSingle()

  if (error) {
    return {
      adressen: [],
      uebersprungen: [],
      grund:
        `Die Empfaengerliste konnte nicht gelesen werden: ${error.message}. ` +
        `Erwartet wird der Schluessel "${EMPFAENGER_SCHLUESSEL}" in public.app_config.`,
    }
  }

  if (!data) {
    return {
      adressen: [],
      uebersprungen: [],
      grund:
        `In public.app_config gibt es keinen Eintrag "${EMPFAENGER_SCHLUESSEL}". ` +
        `Die Migration 20260918120000_weekly_call_punkte_mail.sql legt ihn an. ` +
        `Solange er fehlt, wird bewusst nichts versendet.`,
    }
  }

  const roh = (data as { wert?: unknown }).wert
  if (!Array.isArray(roh)) {
    return {
      adressen: [],
      uebersprungen: [],
      grund:
        `Der Eintrag "${EMPFAENGER_SCHLUESSEL}" in public.app_config ist kein JSON-Array, ` +
        `sondern ${typeof roh}. Erwartet wird zum Beispiel ["os@os-immobilien.com"].`,
    }
  }

  const adressen: string[] = []
  const uebersprungen: string[] = []
  for (const eintrag of roh) {
    const wert = typeof eintrag === 'string' ? eintrag.trim() : ''
    // Absichtlich nur die eine Pruefung: Eine Adresse ohne @ ist mit
    // Sicherheit keine. Alles darueber hinaus waere geraten, und der
    // Versanddienst prueft ohnehin selbst.
    if (wert && wert.includes('@')) adressen.push(wert)
    else uebersprungen.push(typeof eintrag === 'string' ? eintrag : JSON.stringify(eintrag))
  }

  const eindeutig = [...new Set(adressen)]
  if (eindeutig.length === 0) {
    return {
      adressen: [],
      uebersprungen,
      grund:
        `Der Eintrag "${EMPFAENGER_SCHLUESSEL}" in public.app_config enthaelt keine ` +
        `gueltige Mailadresse. Es wird bewusst nichts versendet.`,
    }
  }

  return { adressen: eindeutig, uebersprungen, grund: null }
}

// ── Der Calltermin ───────────────────────────────────────────────────────

/**
 * Der Termin des Calls, für den die Punkte gelten.
 *
 * Erste Wahl ist die Datenbankfunktion `weekly_call_woche()`. Sie ist die
 * einzige maßgebliche Stelle für den Stichtag, und der Punkt trägt denselben
 * Wert in `call_termin`.
 *
 * Fällt sie aus, wird auf das heutige Berliner Datum zurückgefallen. Das ist
 * beim planmäßigen Lauf richtig: Die Function läuft montags um 17 Uhr, der
 * Wochenschnitt liegt um 20:30, also gehört 17 Uhr immer zum heutigen Montag.
 */
async function ermittleCallTermin(db: Datenbank, heuteIso: string): Promise<string> {
  try {
    const { data, error } = await db.rpc('weekly_call_woche')
    if (!error && typeof data === 'string' && data) return data
    if (error) console.warn('send-weekly-call-punkte: weekly_call_woche nicht lesbar:', error.message)
  } catch (e) {
    console.warn('send-weekly-call-punkte: weekly_call_woche fehlgeschlagen:', e)
  }
  return heuteIso
}

// ── Die Punkte ───────────────────────────────────────────────────────────

interface MailPunkt {
  text: string
  wann: string
  alter?: string
  besprochen?: boolean
  /** 'lead_berater' (19:00) oder 'vertriebspartner' (19:30). */
  runde: 'lead_berater' | 'vertriebspartner'
}

/**
 * Die Punkte eines Calls, ohne Verfasser.
 *
 * `user_id` wird bewusst nicht mit abgefragt. Was nicht geladen wird, kann
 * auch nicht versehentlich in der Mail landen.
 */
async function ladePunkte(db: Datenbank, termin: string, heuteIso: string): Promise<MailPunkt[]> {
  const abfrage = (spalten: string) =>
    db
      .from('weekly_call_punkte')
      .select(spalten)
      .eq('call_termin', termin)
      .order('created_at', { ascending: true })

  let { data, error } = await abfrage('text, besprochen_am, created_at, call_runde')
  // Ohne Migration 20261005160000 gibt es die Spalte noch nicht. Dann gehören
  // alle Punkte zum 19:00-Call, wie es die Migration später auch festlegt.
  if (error && /call_runde/.test(error.message || '')) {
    ;({ data, error } = await abfrage('text, besprochen_am, created_at'))
  }

  if (error) {
    console.error('send-weekly-call-punkte: Punkte nicht lesbar:', error.message)
    return []
  }

  return ((data || []) as Array<{
    text?: string
    besprochen_am?: string | null
    created_at?: string
    call_runde?: string
  }>)
    .filter((z) => typeof z.text === 'string' && z.text.trim())
    .map((z) => {
      const alter = z.created_at ? alterText(z.created_at, heuteIso) : ''
      return {
        text: z.text!.trim(),
        wann: z.created_at ? wannText(z.created_at, heuteIso) : '',
        ...(alter ? { alter } : {}),
        ...(z.besprochen_am ? { besprochen: true } : {}),
        runde: z.call_runde === 'vertriebspartner' ? 'vertriebspartner' : 'lead_berater',
      }
    })
}

// ── Nur an die Leitung ──────────────────────────────────────────────────

/**
 * Die Adressen (klein geschrieben), deren Nutzer eine Leitungsrolle trägt,
 * über `profiles.email` und `user_roles`. Alles andere bekommt nichts.
 */
async function leitungsAdressen(db: Datenbank, adressen: string[]): Promise<Set<string>> {
  const ergebnis = new Set<string>()
  if (adressen.length === 0) return ergebnis
  const gesucht = new Set(adressen.map((a) => a.toLowerCase()))

  // ilike, weil die Schreibweise in profiles und app_config abweichen kann.
  // Verglichen wird danach exakt, ein Platzhalter im Namen zieht also nichts.
  const { data: profile, error } = await db
    .from('profiles')
    .select('id, email')
    .or(adressen.map((a) => `email.ilike.${a}`).join(','))
  if (error) {
    console.error('send-weekly-call-punkte: Profile nicht lesbar:', error.message)
    return ergebnis
  }
  const treffer = ((profile || []) as Array<{ id: string; email?: string | null }>)
    .filter((z) => z.email && gesucht.has(z.email.toLowerCase()))
  if (treffer.length === 0) return ergebnis

  const { data: rollenZeilen, error: rollenFehler } = await db
    .from('user_roles')
    .select('user_id, role')
    .in('user_id', treffer.map((z) => z.id))
  if (rollenFehler) {
    console.error('send-weekly-call-punkte: Rollen nicht lesbar:', rollenFehler.message)
    return ergebnis
  }
  const rollenJeNutzer = new Map<string, string[]>()
  for (const z of (rollenZeilen || []) as Array<{ user_id: string; role: string }>) {
    rollenJeNutzer.set(z.user_id, [...(rollenJeNutzer.get(z.user_id) || []), z.role])
  }

  for (const z of treffer) {
    if (istWeeklyCallLeitung(rollenJeNutzer.get(z.id) || [])) ergebnis.add(z.email!.toLowerCase())
  }
  return ergebnis
}

// ── Der Lauf ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const db = createClient(SUPABASE_URL, SERVICE_KEY) as unknown as Datenbank

  /*
   * Testbetrieb: { testEmpfaenger, dryRun, sofort }
   *
   * `testEmpfaenger` umgeht die gepflegte Liste und schickt an eine frei
   * gewählte Adresse. Nur mit Service-Key, sonst hätte jeder, der die Adresse
   * dieser Function kennt, ein offenes Rohr für interne Wortmeldungen.
   * `dryRun` verschickt nichts. `sofort` schickt außerhalb des Zeitfensters,
   * aber nur an die gepflegte Liste; dafür braucht es keinen Schlüssel, weil
   * damit höchstens dieselbe Mail ein zweites Mal an denselben Kreis geht.
   */
  let testEmpfaenger: string | null = null
  let dryRun = false
  let sofort = false
  const mitServiceKey = (req.headers.get('Authorization') || '') === `Bearer ${SERVICE_KEY}`
  try {
    const body = await req.json()
    if (body?.dryRun === true) dryRun = true
    if (body?.sofort === true) sofort = true
    if (typeof body?.testEmpfaenger === 'string') {
      if (mitServiceKey) testEmpfaenger = body.testEmpfaenger.trim()
      else console.warn('send-weekly-call-punkte: testEmpfaenger ohne Service-Key, ignoriert')
    }
  } catch {
    // Der Zeitplan ruft ohne Rumpf auf. Das ist der Normalfall.
  }

  const istTest = Boolean(testEmpfaenger) || dryRun || sofort

  /*
   * Das Zeitfenster. pg_cron läuft in UTC und macht die Sommerzeit nicht mit,
   * deshalb gibt es zwei Einträge (15:00 und 16:00 UTC) und genau einer von
   * beiden ist der richtige. Der falsche bricht hier ab. Ohne diese Prüfung
   * ginge die Mail ein halbes Jahr lang zweimal hinaus, bitte nicht entfernen.
   *
   * Lässt sich die Stunde nicht lesen, wird lieber gesendet, als die Liste
   * dauerhaft ausfallen zu lassen. Der Wochentag wird dann trotzdem geprüft,
   * denn der hängt nicht an der Zeitumstellung.
   */
  if (!istTest) {
    const stunde = berlinerStunde()
    if (!Number.isNaN(stunde) && stunde !== STUNDE_BERLIN) {
      // Status 200, sonst zählte der planmäßige Lauf als fehlgeschlagen.
      return json({ uebersprungen: true, grund: `nicht ${STUNDE_BERLIN} Uhr deutscher Zeit`, stunde })
    }
    const wochentag = berlinerWochentag()
    if (wochentag !== WOCHENTAG_BERLIN) {
      return json({ uebersprungen: true, grund: 'nicht Montag', wochentag })
    }
  }

  try {
    const heuteIso = isoTagBerlin()
    const callTermin = await ermittleCallTermin(db, heuteIso)

    // 1) Die Punkte zuerst. Ohne sie geht ohnehin nichts hinaus, dann muss
    //    auch die Empfängerliste nicht gelesen werden.
    const punkte = await ladePunkte(db, callTermin, heuteIso)

    if (punkte.length === 0) {
      // Bewusst keine Mail mit leerer Liste, siehe Kopf dieser Datei.
      console.log(`send-weekly-call-punkte: keine Punkte fuer ${callTermin}, kein Versand.`)
      return json({ ok: true, versendet: 0, punkte: 0, callTermin, grund: 'keine Punkte eingetragen' })
    }

    // 2) Die Empfänger.
    let empfaenger: string[] = []
    let empfaengerGrund: string | null = null
    let uebersprungeneAdressen: string[] = []

    if (testEmpfaenger) {
      empfaenger = [testEmpfaenger]
    } else {
      const ergebnis = await ladeEmpfaenger(db)
      empfaenger = ergebnis.adressen
      empfaengerGrund = ergebnis.grund
      uebersprungeneAdressen = ergebnis.uebersprungen

      if (uebersprungeneAdressen.length > 0) {
        console.warn(
          `send-weekly-call-punkte: ${uebersprungeneAdressen.length} Eintrag/Eintraege in ` +
            `app_config.${EMPFAENGER_SCHLUESSEL} sind keine Mailadresse und wurden ` +
            `uebersprungen: ${uebersprungeneAdressen.join(', ')}`,
        )
      }

      if (empfaenger.length === 0 && !dryRun) {
        console.warn(`send-weekly-call-punkte: kein Versand. ${empfaengerGrund}`)
        return json({
          ok: false,
          versendet: 0,
          punkte: punkte.length,
          grund: empfaengerGrund,
          uebersprungen: uebersprungeneAdressen,
        })
      }
    }

    // 3) Nur die Leitung. Die Mail enthält beide Calls, getrennt nach 19:00
    //    und 19:30, deshalb geht sie an niemanden sonst.
    const leitung = await leitungsAdressen(db, empfaenger)
    const zuSenden = empfaenger.filter((a) => leitung.has(a.toLowerCase()))
    const ohneBerechtigung = empfaenger.filter((a) => !leitung.has(a.toLowerCase()))
    if (ohneBerechtigung.length > 0) {
      console.warn(
        `send-weekly-call-punkte: ${ohneBerechtigung.length} Adresse(n) gehoeren zu keinem Nutzer ` +
          `mit Leitungsrolle (admin, inhaber, vertriebsleiter) und werden uebersprungen: ` +
          ohneBerechtigung.join(', '),
      )
    }

    const templateData: Record<string, unknown> = {
      callTag: deutscherTag(callTermin),
      zeitLeadBerater: ZEIT_LEAD_BERATER,
      zeitVertriebspartner: ZEIT_VERTRIEBSPARTNER,
      punkte,
      anzahlAelter: punkte.filter((p) => p.alter).length,
      link: `${PORTAL}/weekly-call`,
    }

    if (dryRun) {
      // Ohne Service-Key nur die Stückzahlen. Der Wortlaut der Punkte ist
      // intern und geht über einen offenen Aufruf nicht hinaus.
      return json(
        mitServiceKey
          ? {
              ok: true,
              dryRun: true,
              callTermin,
              empfaenger: zuSenden,
              empfaengerGrund,
              uebersprungen: uebersprungeneAdressen,
              ohneBerechtigung,
              templateData,
            }
          : {
              ok: true,
              dryRun: true,
              callTermin,
              punkte: punkte.length,
              empfaenger: zuSenden.length,
            },
      )
    }

    // 4) Versenden.
    let versendet = 0
    const fehlschlaege: Array<{ empfaenger: string; grund: string }> = []
    for (const adresse of zuSenden) {
      const ergebnis = await sendeVorlage(db, {
        templateName: 'weekly-call-punkte',
        recipientEmail: adresse,
        // Der Calltermin steckt im Schlüssel, nicht der Aufrufzeitpunkt. Ein
        // zweiter Aufruf am selben Montag schickt damit nicht dieselbe Mail
        // noch einmal. Ein Probelauf bekommt einen eigenen Schlüssel, sonst
        // hielte der Versand die reguläre Mail für ein Duplikat.
        idempotencyKey: `weekly-call-punkte-${callTermin}-${adresse}${sofort ? '-sofort' : ''}`,
        templateData,
      })
      if (ergebnis.ok) versendet++
      else fehlschlaege.push({ empfaenger: adresse, grund: ergebnis.grund ?? 'unbekannt' })
    }

    console.log(
      `send-weekly-call-punkte: ${versendet} von ${zuSenden.length} Mails versendet, ` +
        `${punkte.length} Punkte fuer ${callTermin}`,
    )

    return json({
      ok: true,
      versendet,
      empfaenger: zuSenden.length,
      punkte: punkte.length,
      callTermin,
      fehlschlaege,
      ohneBerechtigung,
      uebersprungen: uebersprungeneAdressen,
    })
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    console.error('send-weekly-call-punkte:', e)
    return json({ ok: false, fehler: text }, 500)
  }
})
