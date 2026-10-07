import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import {
  BEREICH_LABEL,
  BEREICH_REIHENFOLGE,
  CHARLOTTE_AUFTRAG,
  KENNZAHL_LABEL,
  baueDatenblock,
  baueNutzerNachricht,
  bewegteZahlen,
  formatiereVeraenderung,
  formatiereWert,
  gerisseneSchwellen,
  type KennzahlZeile,
} from '../_shared/tagesbriefing-auftrag.ts'

/**
 * Das Tagesbriefing der Geschäftsleitung.
 *
 * Jeden Werktag um 8 Uhr deutscher Zeit eine Mail: ein Lagebild aus allen
 * Abteilungen, geschrieben von einem Sprachmodell in der Rolle von Charlotte
 * Renner, der Assistenz der Geschäftsleitung.
 *
 * ── DIE EMPFÄNGER ÄNDERN ────────────────────────────────────────────────
 *
 * Der Kreis steht NICHT im Code, sondern in der Datenbank, in
 * `public.app_config` unter dem Schlüssel `tagesbriefing_empfaenger`, als
 * JSON-Array von Mailadressen. Wer jemanden aufnehmen will, führt im Supabase
 * SQL-Editor diese Zeile aus und trägt die vollständige neue Liste ein:
 *
 *     update public.app_config
 *        set wert = '["os@os-immobilien.com","zweite.adresse@os-immobilien.com"]'::jsonb,
 *            aktualisiert_am = now()
 *      where schluessel = 'tagesbriefing_empfaenger';
 *
 * Den aktuellen Stand zeigt:
 *
 *     select wert from public.app_config
 *      where schluessel = 'tagesbriefing_empfaenger';
 *
 * Bewusst keine Bestimmung über Rollen. Die Rollen `inhaber` und `admin`
 * tragen möglicherweise mehr Leute als gedacht, und die bekämen das Briefing
 * dann sofort mit, ohne dass jemand es entschieden hat. Eine Mail, die an
 * einen ungewollten Kreis gegangen ist, lässt sich nicht zurückholen.
 *
 * Fehlt der Schlüssel, ist er leer oder kein Array, geht NICHTS hinaus. Es
 * gibt bewusst keinen Rückfall auf eine im Code stehende Adresse und keinen
 * auf alle Administratoren. Der Grund steht dann im Protokoll.
 *
 * ── DIE ZAHLEN ──────────────────────────────────────────────────────────
 *
 * Alles kommt aus `public.kennzahlen_verlauf()`, gefüllt vom nächtlichen Lauf
 * um 04:10 UTC (Migrationen 20260908180000 und 20260914180000). Die Function
 * rechnet selbst nichts aus. Läge die Rechnung hier, gäbe es sie zweimal,
 * einmal in SQL und einmal in TypeScript, und die beiden liefen auseinander.
 *
 * ── DIE ZEITUMSTELLUNG ──────────────────────────────────────────────────
 *
 * pg_cron läuft in UTC und macht die Sommerzeit nicht mit. 8 Uhr deutscher
 * Zeit ist im Sommer 06:03 UTC und im Winter 07:03 UTC. Deshalb gibt es zwei
 * Zeitplaneinträge, und diese Function prüft die Berliner Stunde selbst nach
 * und bricht ab, wenn es dort nicht 8 Uhr ist. Ohne diese Prüfung ginge die
 * Mail ein halbes Jahr lang zweimal hinaus. Genauso gelöst wie in
 * `send-weekly-summary/index.ts:27`.
 *
 * ── WENN DAS MODELL AUSFÄLLT ────────────────────────────────────────────
 *
 * Dann geht die Mail trotzdem hinaus, nur ohne Text. Eine ausbleibende Mail
 * merkt niemand, ein fehlender Absatz fällt sofort auf.
 *
 * ── DATENSCHUTZ ─────────────────────────────────────────────────────────
 *
 * Das Modell wird über den Lovable AI Gateway angesprochen. Der steht im
 * Auftragsverarbeitungsvertrag (`public/dokumente/AVV-Template-OS Immobilien.md`),
 * Anthropic steht dort nicht. Deshalb dieser Weg und kein anderer.
 * Hinausgereicht werden ausschließlich Zahlen: keine Namen, keine Adressen,
 * keine Kennungen. `kennzahlen_tagesstand` enthält nichts anderes.
 *
 * Die Function ist öffentlich erreichbar (verify_jwt = false), weil pg_cron
 * sie ohne Anmeldetoken ruft. Der Testbetrieb ist deshalb an den Service-Key
 * gebunden, so wie in `nachtpruefung-morgenmail`.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')

/** Der Schlüssel in `app_config`, unter dem die Empfängerliste steht. */
const EMPFAENGER_SCHLUESSEL = 'tagesbriefing_empfaenger'

/** Die Stunde in Berlin, zu der die Mail hinausgeht. */
const STUNDE_BERLIN = 8

const AI_GATEWAY = 'https://ai.gateway.lovable.dev/v1/chat/completions'
const AI_MODELL = 'google/gemini-2.5-flash'

/**
 * Wie lange auf das Modell gewartet wird.
 *
 * Nach dieser Zeit gilt es als ausgefallen und die Mail geht ohne Text
 * hinaus. Lieber eine nüchterne Mail um acht als eine schöne um halb neun.
 */
const AI_TIMEOUT_MS = 45_000

/**
 * Was diese Function vom Supabase-Client wirklich braucht.
 *
 * Der erzeugte Typ von `createClient` haengt an den generierten Schematypen,
 * und die kennen `kennzahlen_verlauf` nicht. Statt den Aufruf einzeln
 * wegzucasten, steht hier die lose Beschreibung dessen, was gebraucht wird.
 * Derselbe Behelf wie in `_shared/transactional-versand.ts`.
 */
type Datenbank = {
  from: (tabelle: string) => {
    select: (spalten: string) => {
      eq: (spalte: string, wert: string) => {
        maybeSingle: () => Promise<{ data: { wert?: unknown } | null; error: { message?: string } | null }>
      }
    }
  }
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>
  functions: { invoke: (name: string, args: any) => Promise<{ data: any; error: any }> }
}

interface Antwort {
  betreff?: string
  vorschau?: string
  lage?: string
  entscheidungen?: Array<{ text?: string; frist?: string; blockiert?: string }>
  liegenbleiber?: Array<{ text?: string; alter?: string; folge?: string }>
  zahlen?: Array<{ text?: string; wert?: string; einordnung?: string; ton?: string }>
  unsicher?: string
}

// ── Kleine Helfer ────────────────────────────────────────────────────────

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

/** "Montag, 14.09.2026" in deutscher Zeit. */
function deutschesDatum(): string {
  return new Date().toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
  })
}

/** "2026-09-14" in deutscher Zeit, nicht in UTC. */
function isoTagBerlin(): string {
  const teile = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return teile
}

/** Eine Zahl aus der Datenbank. Numeric kommt über PostgREST oft als Text. */
function zahl(wert: unknown): number | null {
  if (wert === null || wert === undefined || wert === '') return null
  const n = Number(wert)
  return Number.isFinite(n) ? n : null
}

function json(daten: unknown, status = 200): Response {
  return new Response(JSON.stringify(daten), {
    status, headers: { 'Content-Type': 'application/json' },
  })
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
        `Die Migration 20260915060000_tagesbriefing.sql legt ihn an. Solange er fehlt, ` +
        `wird bewusst nichts versendet.`,
    }
  }

  const roh = data.wert
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
    // Absichtlich nur die eine Prüfung: Eine Adresse ohne @ ist mit Sicherheit
    // keine. Alles darüber hinaus wäre geraten, und der Versanddienst prüft
    // ohnehin selbst.
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

// ── Die Zahlen ───────────────────────────────────────────────────────────

async function ladeKennzahlen(db: Datenbank): Promise<KennzahlZeile[]> {
  const { data, error } = await db.rpc('kennzahlen_verlauf', { p_bereich: null })
  if (error) throw new Error(`kennzahlen_verlauf: ${error.message}`)
  if (!Array.isArray(data)) return []

  const zeilen: KennzahlZeile[] = []
  for (const roh of data as Record<string, unknown>[]) {
    const bereich = typeof roh.bereich === 'string' ? roh.bereich : ''
    const kennzahl = typeof roh.kennzahl === 'string' ? roh.kennzahl : ''
    const wert = zahl(roh.wert_heute)
    if (!bereich || !kennzahl || wert === null) continue

    const wertVorwoche = zahl(roh.wert_vorwoche)
    zeilen.push({
      bereich,
      kennzahl,
      // Ein unbekannter Kurzname ist kein Fehler, dann steht er eben da.
      label: KENNZAHL_LABEL[kennzahl] || kennzahl,
      stichtag: String(roh.stichtag_heute || ''),
      wert,
      stichtagVorwoche: roh.stichtag_vorwoche ? String(roh.stichtag_vorwoche) : null,
      wertVorwoche,
      veraenderung: wertVorwoche === null ? null : wert - wertVorwoche,
    })
  }
  return zeilen
}

/** Die vollständige Tabelle am Ende der Mail, nach Bereichen gruppiert. */
function baueTabelle(zeilen: KennzahlZeile[]) {
  const bloecke: Array<{ bereich: string; zeilen: Array<Record<string, string>> }> = []
  for (const kuerzel of BEREICH_REIHENFOLGE) {
    const gruppe = zeilen.filter((z) => z.bereich === kuerzel)
    if (gruppe.length === 0) continue
    bloecke.push({
      bereich: BEREICH_LABEL[kuerzel] || kuerzel,
      zeilen: gruppe.map((z) => ({
        label: z.label,
        wert: formatiereWert(z.kennzahl, z.wert),
        vorwoche: z.wertVorwoche === null ? 'kein Vergleich' : formatiereWert(z.kennzahl, z.wertVorwoche),
        veraenderung: z.wertVorwoche === null ? '' : formatiereVeraenderung(z),
      })),
    })
  }
  return bloecke
}

// ── Das Modell ───────────────────────────────────────────────────────────

/**
 * Den Text aus dem Modell holen. Gibt `null` zurück, wenn irgendetwas daran
 * scheitert, und der Aufrufer schickt dann die nackten Zahlen.
 */
async function frageModell(datenblock: string): Promise<{ antwort: Antwort | null; grund: string | null }> {
  if (!LOVABLE_API_KEY) {
    return { antwort: null, grund: 'Der Zugang zum Sprachmodell ist nicht eingerichtet (LOVABLE_API_KEY fehlt).' }
  }

  const abbruch = new AbortController()
  const uhr = setTimeout(() => abbruch.abort(), AI_TIMEOUT_MS)

  try {
    const res = await fetch(AI_GATEWAY, {
      method: 'POST',
      signal: abbruch.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LOVABLE_API_KEY}` },
      body: JSON.stringify({
        model: AI_MODELL,
        messages: [
          { role: 'system', content: CHARLOTTE_AUFTRAG },
          { role: 'user', content: baueNutzerNachricht(datenblock) },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.error('tagesbriefing: AI-Gateway antwortet', res.status, text.slice(0, 500))
      if (res.status === 429) return { antwort: null, grund: 'Das Sprachmodell war ausgelastet.' }
      if (res.status === 402) return { antwort: null, grund: 'Das Kontingent des Sprachmodells ist aufgebraucht.' }
      return { antwort: null, grund: `Das Sprachmodell hat mit Status ${res.status} geantwortet.` }
    }

    const roh = await res.json()
    const inhalt: string = roh?.choices?.[0]?.message?.content || ''
    if (!inhalt.trim()) return { antwort: null, grund: 'Das Sprachmodell hat eine leere Antwort geliefert.' }

    const geparst = parseAntwort(inhalt)
    if (!geparst) return { antwort: null, grund: 'Die Antwort des Sprachmodells war nicht lesbar.' }
    return { antwort: geparst, grund: null }
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    console.error('tagesbriefing: Modellaufruf gescheitert', text)
    return {
      antwort: null,
      grund: abbruch.signal.aborted
        ? 'Das Sprachmodell hat nicht rechtzeitig geantwortet.'
        : 'Das Sprachmodell war nicht erreichbar.',
    }
  } finally {
    clearTimeout(uhr)
  }
}

/**
 * Das JSON aus der Antwort holen.
 *
 * Der Auftrag verlangt reines JSON, aber Modelle legen gern einen Code-Zaun
 * darum oder schreiben einen Satz davor. Beides wird hier abgeräumt, statt
 * daran zu scheitern.
 */
function parseAntwort(inhalt: string): Antwort | null {
  const ohneZaun = inhalt.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const kandidaten = [ohneZaun]
  const von = ohneZaun.indexOf('{')
  const bis = ohneZaun.lastIndexOf('}')
  if (von >= 0 && bis > von) kandidaten.push(ohneZaun.slice(von, bis + 1))

  for (const kandidat of kandidaten) {
    try {
      const wert = JSON.parse(kandidat)
      if (wert && typeof wert === 'object' && !Array.isArray(wert)) return wert as Antwort
    } catch {
      // Nächster Versuch.
    }
  }
  return null
}

/** Aus der Modellantwort die Felder machen, die die Vorlage erwartet. */
function baueTextteile(antwort: Antwort) {
  const text = (wert: unknown, max = 400): string =>
    typeof wert === 'string' ? wert.trim().slice(0, max) : ''

  const liste = <T,>(wert: unknown, abbilden: (e: Record<string, unknown>) => T): T[] => {
    if (!Array.isArray(wert)) return []
    return wert
      .filter((e): e is Record<string, unknown> => !!e && typeof e === 'object')
      .slice(0, 5)
      .map(abbilden)
  }

  return {
    betreff: text(antwort.betreff, 90),
    vorschau: text(antwort.vorschau, 90),
    lage: text(antwort.lage, 600),
    entscheidungen: liste(antwort.entscheidungen, (e) => ({
      text: text(e.text), frist: text(e.frist, 80), blockiert: text(e.blockiert, 200),
    })).filter((e) => e.text),
    liegenbleiber: liste(antwort.liegenbleiber, (e) => ({
      text: text(e.text), alter: text(e.alter, 40), folge: text(e.folge, 200),
    })).filter((e) => e.text),
    zahlen: liste(antwort.zahlen, (e) => ({
      text: text(e.text, 120),
      wert: text(e.wert, 80),
      einordnung: text(e.einordnung, 200),
      ton: e.ton === 'fehler' || e.ton === 'warnung' ? (e.ton as 'fehler' | 'warnung') : ('neutral' as const),
    })).filter((e) => e.text),
    unsicher: text(antwort.unsicher, 400),
  }
}

/**
 * Der Vorschautext für den Fall ohne Modell.
 *
 * Auch dann sollen die ersten 90 Zeichen etwas sagen. Sie bestehen aus dem,
 * was sich ohne Sprache berechnen lässt: wie viele Schwellen gerissen sind.
 */
function vorschauOhneModell(zeilen: KennzahlZeile[]): string {
  const gerissen = gerisseneSchwellen(zeilen)
  if (zeilen.length === 0) return 'Heute Nacht kam keine einzige Kennzahl an.'
  if (gerissen.length === 0) return 'Keine Kennzahl über der Schwelle, der Text fehlt heute.'
  const anzahl = gerissen.length
  return `${anzahl} Kennzahl${anzahl === 1 ? '' : 'en'} über der Schwelle, der Text fehlt heute.`
    .slice(0, 90)
}

// ── Der Lauf ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const db = createClient(SUPABASE_URL, SERVICE_KEY) as unknown as Datenbank

  /*
   * Testbetrieb: { testEmpfaenger, dryRun, ohneModell, sofort }
   *
   * `testEmpfaenger` umgeht die gepflegte Liste und schickt an eine frei
   * gewählte Adresse. Das gilt nur mit Service-Key, sonst hätte jeder, der die
   * Adresse dieser Function kennt, ein offenes Rohr für die Firmenzahlen.
   * `dryRun` verschickt nichts. `ohneModell` erzwingt den Ausfallweg, damit
   * sich die nackte Fassung prüfen lässt, ohne das Modell abzuschalten.
   *
   * `sofort` schickt das Briefing außerhalb des Zeitfensters, aber nur an die
   * gepflegte Empfängerliste. Dafür braucht es keinen Schlüssel: Wer die
   * Adresse dieser Function kennt, kann damit höchstens Christian sein
   * eigenes Briefing ein zweites Mal schicken, an niemanden sonst. Gedacht
   * für einen Probelauf aus pg_cron, das keinen Service-Key mitgeben kann.
   */
  let testEmpfaenger: string | null = null
  let dryRun = false
  let sofort = false
  let ohneModellErzwingen = false
  const mitServiceKey = (req.headers.get('Authorization') || '') === `Bearer ${SERVICE_KEY}`
  try {
    const body = await req.json()
    if (body?.dryRun === true) dryRun = true
    if (body?.sofort === true) sofort = true
    if (body?.ohneModell === true) ohneModellErzwingen = true
    if (typeof body?.testEmpfaenger === 'string') {
      if (mitServiceKey) testEmpfaenger = body.testEmpfaenger.trim()
      else console.warn('tagesbriefing: testEmpfaenger ohne Service-Key, ignoriert')
    }
  } catch {
    // Der Zeitplan ruft ohne Rumpf auf. Das ist der Normalfall.
  }

  const istTest = Boolean(testEmpfaenger) || dryRun || sofort

  /*
   * Das Zeitfenster. pg_cron läuft in UTC und macht die Sommerzeit nicht mit,
   * deshalb gibt es zwei Einträge (06:03 und 07:03 UTC) und genau einer von
   * beiden ist der richtige. Der falsche bricht hier ab. Ohne diese Prüfung
   * ginge die Mail ein halbes Jahr lang zweimal hinaus, bitte nicht entfernen.
   *
   * Lässt sich die Stunde nicht lesen, wird lieber gesendet, als das Briefing
   * dauerhaft ausfallen zu lassen.
   */
  if (!istTest) {
    const stunde = berlinerStunde()
    if (!Number.isNaN(stunde) && stunde !== STUNDE_BERLIN) {
      // Status 200, sonst zählte der planmäßige Lauf als fehlgeschlagen.
      return json({ uebersprungen: true, grund: `nicht ${STUNDE_BERLIN} Uhr deutscher Zeit`, stunde })
    }
    const wochentag = berlinerWochentag()
    if (wochentag >= 6) {
      // Charlottes Meldung kommt Montag bis Freitag, so von Christian gesetzt.
      return json({ uebersprungen: true, grund: 'Wochenende', wochentag })
    }
  }

  try {
    // 1) Die Empfänger zuerst. Ohne sie braucht niemand das Modell zu fragen.
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
          `tagesbriefing: ${uebersprungeneAdressen.length} Eintrag/Eintraege in ` +
            `app_config.${EMPFAENGER_SCHLUESSEL} sind keine Mailadresse und wurden ` +
            `uebersprungen: ${uebersprungeneAdressen.join(', ')}`,
        )
      }

      if (empfaenger.length === 0 && !dryRun) {
        console.warn(`tagesbriefing: kein Versand. ${empfaengerGrund}`)
        return json({ ok: false, versendet: 0, grund: empfaengerGrund, uebersprungen: uebersprungeneAdressen })
      }
    }

    // 2) Die Zahlen.
    const zeilen = await ladeKennzahlen(db)
    const heuteIso = isoTagBerlin()
    const datenblock = baueDatenblock(zeilen, heuteIso)
    const tabelle = baueTabelle(zeilen)
    const datenstand = zeilen[0]?.stichtag || heuteIso

    // 3) Das Modell.
    const { antwort, grund: modellGrund } = ohneModellErzwingen
      ? { antwort: null, grund: 'Der Ausfallweg wurde für einen Test erzwungen.' }
      : await frageModell(datenblock)

    const teile = antwort ? baueTextteile(antwort) : null
    // Eine Antwort ohne Lage ist keine Antwort. Dann lieber ehrlich die nackten
    // Zahlen, als einen leeren Absatz zu zeigen.
    const ohneText = !teile || !teile.lage

    const templateData: Record<string, unknown> = {
      tag: deutschesDatum(),
      datenstand,
      tabelle,
      ohneText,
      ohneTextGrund: ohneText ? (modellGrund || 'Das Sprachmodell hat nichts Brauchbares geliefert.') : '',
      ...(ohneText
        ? { vorschau: vorschauOhneModell(zeilen) }
        : {
            betreff: teile!.betreff,
            vorschau: teile!.vorschau,
            lage: teile!.lage,
            entscheidungen: teile!.entscheidungen,
            liegenbleiber: teile!.liegenbleiber,
            zahlen: teile!.zahlen,
            unsicher: teile!.unsicher,
          }),
    }

    if (dryRun) {
      // Ohne Service-Key nur die Stückzahlen. Der Inhalt sind Firmenzahlen, und
      // die gehen über einen offenen Aufruf nicht hinaus.
      return json(
        mitServiceKey
          ? { ok: true, dryRun: true, empfaenger, empfaengerGrund, uebersprungen: uebersprungeneAdressen, templateData, datenblock }
          : {
              ok: true, dryRun: true,
              kennzahlen: zeilen.length,
              schwellenGerissen: gerisseneSchwellen(zeilen).length,
              bewegt: bewegteZahlen(zeilen).length,
              ohneText,
              empfaenger: empfaenger.length,
            },
      )
    }

    // 4) Versenden.
    let versendet = 0
    const fehlschlaege: Array<{ empfaenger: string; grund: string }> = []
    for (const adresse of empfaenger) {
      const ergebnis = await sendeVorlage(db, {
        templateName: 'tagesbriefing',
        recipientEmail: adresse,
        // Der Tag steckt im Schlüssel, nicht der Aufrufzeitpunkt. Ein zweiter
        // Aufruf am selben Tag schickt damit nicht dieselbe Mail noch einmal.
        // Ein Probelauf bekommt einen eigenen Schlüssel, sonst hielte der
        // Versand die reguläre Mail desselben Tages für ein Duplikat.
        idempotencyKey: `tagesbriefing-${heuteIso}-${adresse}${sofort ? '-sofort' : ''}`,
        templateData,
      })
      if (ergebnis.ok) versendet++
      else fehlschlaege.push({ empfaenger: adresse, grund: ergebnis.grund ?? 'unbekannt' })
    }

    console.log(
      `tagesbriefing: ${versendet} von ${empfaenger.length} Mails versendet, ` +
        `${zeilen.length} Kennzahlen, ${ohneText ? 'ohne Text' : 'mit Text'}`,
    )

    return json({
      ok: true,
      versendet,
      empfaenger: empfaenger.length,
      fehlschlaege,
      kennzahlen: zeilen.length,
      ohneText,
      ohneTextGrund: templateData.ohneTextGrund,
      uebersprungen: uebersprungeneAdressen,
    })
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    console.error('tagesbriefing:', e)
    return json({ ok: false, fehler: text }, 500)
  }
})
