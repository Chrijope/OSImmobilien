import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import {
  hatNeueObjektdaten,
  istObjektdatenBefund,
  objektdatenFuerMail,
  type BefundRoh,
  type MailObjektdatenBereich,
} from '../_shared/nachtpruefung-objektdaten.ts'

/**
 * Die Morgenmail des Nachtwächters.
 *
 * Der Nachtlauf (`nachtpruefung_lauf`, per pg_cron um 3 Uhr UTC) schreibt
 * seine Befunde in `nachtpruefung_befunde`. Gelesen hat sie bisher niemand:
 * Keine Seite im CRM zeigte die Tabelle, und nach 28 Tagen wurden die Zeilen
 * gelöscht. Ein Wächter, dessen Meldungen niemand hört, ist kein Wächter.
 *
 * Diese Function holt die Befunde der letzten Nacht und schickt sie an
 * Inhaber und Administratoren.
 *
 * Zwei Entscheidungen, die hier fest verdrahtet sind:
 *
 *   Es geht nur eine Mail hinaus, wenn es wirklich etwas zu melden gibt.
 *   Eine tägliche "alles in Ordnung" Mail wird nach einer Woche ignoriert,
 *   und dann fällt die eine wichtige auch nicht mehr auf.
 *
 *   Bleibt der Nachtlauf selbst aus, ist das ebenfalls ein Befund und wird
 *   gemeldet. Sonst wäre ausgerechnet der Ausfall der Prüfung der einzige
 *   Fall, in dem es still bleibt.
 *
 *   Unstimmigkeiten in den Objektdaten (seit 24.09.2026, je Bereich OBJ,
 *   FIN, AS) lösen die Mail nur aus, wenn seit dem letzten Lauf etwas NEU
 *   ist. Bestehende stehen nur als Zahl darin. Viele dieser Befunde bleiben
 *   tagelang stehen, und eine Mail, die jeden Morgen dieselbe Liste bringt,
 *   liest bald niemand mehr.
 *
 * Die Function ist öffentlich erreichbar, weil pg_cron sie ohne Anmeldetoken
 * ruft. Der Testbetrieb weiter unten ist deshalb an den Service-Key gebunden.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const BERICHT_LINK = 'https://portal.more.immo/nachtpruefung'

/**
 * Ab wann gilt der letzte Nachtlauf als ausgefallen.
 *
 * Der Lauf ist täglich, 26 Stunden lassen also eine verschobene Ausführung
 * durchgehen und schlagen erst an, wenn wirklich ein Termin ausgefallen ist.
 * Dieselbe Spanne benutzt der Nachtwächter für den Erinnerungsdienst.
 */
const AUSFALL_STUNDEN = 26

type BefundZeile = BefundRoh

interface MailBefund {
  meldung: string
  anzahl: number
  beispiele?: string
}

/**
 * Aus den Beispielen einer Prüfung eine Zeile machen.
 *
 * Die Prüfungen legen unterschiedliche Felder ab: mal `name`, mal `titel`,
 * mal nur eine `email` oder eine Stufe. Deshalb wird das erste brauchbare
 * Feld genommen, statt je Prüfung eine eigene Darstellung zu pflegen. Drei
 * Beispiele reichen in einer Mail, die vollständige Liste steht im CRM.
 */
function beispielZeile(roh: unknown): string | undefined {
  if (!Array.isArray(roh) || roh.length === 0) return undefined

  const namen: string[] = []
  for (const eintrag of roh) {
    if (!eintrag || typeof eintrag !== 'object') continue
    const e = eintrag as Record<string, unknown>
    const kandidat = [e.name, e.titel, e.email, e.stufe, e.pruefung, e.id]
      .map((w) => (typeof w === 'string' ? w.trim() : ''))
      .find((w) => w.length > 0)
    if (kandidat) namen.push(kandidat)
    if (namen.length >= 3) break
  }

  if (namen.length === 0) return undefined
  const rest = roh.length - namen.length
  return rest > 0 ? `${namen.join(', ')} und ${rest} weitere` : namen.join(', ')
}

/** "Freitag, 07.08.2026" in deutscher Zeit, nicht in UTC. */
function deutschesDatum(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('de-DE', {
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: 'Europe/Berlin',
    })
  } catch {
    return ''
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  const db = createClient(SUPABASE_URL, SERVICE_KEY)

  /*
   * Testbetrieb: { testRecipient, dryRun }
   *
   * Diese Function läuft ohne Anmeldung (verify_jwt = false, sonst käme der
   * Zeitplan nicht durch). `testRecipient` schickt den kompletten Befundbericht
   * an eine frei gewählte Adresse, also Meldungen samt Kundennamen aus den
   * Beispielen. Wer die Adresse der Function kennt, hätte damit ein offenes
   * Rohr nach draußen gehabt. Derselbe Fehler steckte in
   * `weekly-pipeline-mahnreport`, dort ist er heute schon so behoben: Der
   * Testempfänger gilt nur, wenn der Aufrufer den Service-Key mitbringt, und
   * den hat nur die Serverseite.
   *
   * `dryRun` verschickt nichts und darf jeder aufrufen. Der Inhalt der Mail
   * geht aber nur mit Service-Key zurück, sonst wäre der Probelauf dieselbe
   * Auskunft über einen anderen Weg. Ohne Schlüssel kommen nur Stückzahlen.
   */
  let testRecipient: string | null = null
  let dryRun = false
  const mitServiceKey = (req.headers.get('Authorization') || '') === `Bearer ${SERVICE_KEY}`
  try {
    const body = await req.json()
    if (body?.dryRun === true) dryRun = true
    if (typeof body?.testRecipient === 'string') {
      if (mitServiceKey) testRecipient = body.testRecipient
      else console.warn('nachtpruefung-morgenmail: testRecipient ohne Service-Key, ignoriert')
    }
  } catch {
    // Der Zeitplan ruft ohne Rumpf auf. Das ist der Normalfall.
  }

  try {
    // 1) Den letzten Lauf finden.
    const { data: letzte, error: laufFehler } = await db
      .from('nachtpruefung_befunde')
      .select('lauf_at')
      .order('lauf_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (laufFehler) throw laufFehler

    const fehler: MailBefund[] = []
    const warnungen: MailBefund[] = []
    const hinweise: MailBefund[] = []
    let objektdaten: MailObjektdatenBereich[] = []

    const laufAt = letzte?.lauf_at as string | undefined
    const alterStunden = laufAt
      ? (Date.now() - new Date(laufAt).getTime()) / 3_600_000
      : Number.POSITIVE_INFINITY

    if (!laufAt || alterStunden > AUSFALL_STUNDEN) {
      // Der Wächter selbst schweigt. Das ist der Fall, den sonst niemand
      // bemerkt, weil ein ausbleibender Lauf keinen Lärm macht.
      fehler.push({
        meldung: laufAt
          ? `Die nächtliche Systemprüfung ist seit ${Math.round(alterStunden)} Stunden nicht mehr gelaufen. Solange sie steht, meldet auch niemand mehr, was in den Daten schiefgeht.`
          : 'Es liegt kein einziger Befund vor. Die nächtliche Systemprüfung hat offenbar noch nie gelaufen.',
        anzahl: 1,
      })
    } else {
      // 2) Die Befunde dieses Laufs holen, aber nur die mit echten Fällen.
      //
      // Alle Spalten statt einer Liste: Die Spalte `bereich` kommt erst mit
      // Migration 20260924170000. Eine ausdrückliche Auswahl mit `bereich`
      // bräche die ganze Mail ab, solange die Migration nicht gelaufen ist.
      const { data: befunde, error: befundFehler } = await db
        .from('nachtpruefung_befunde')
        .select('*')
        .eq('lauf_at', laufAt)
        .gt('anzahl', 0)

      if (befundFehler) throw befundFehler

      const zeilen = (befunde ?? []) as BefundZeile[]

      // Die Objektbefunde bekommen einen eigenen Abschnitt je Bereich, mit
      // neuen Treffern einzeln und bestehenden nur als Zahl. Sonst stünde
      // jeden Morgen dieselbe lange Liste in der Mail.
      objektdaten = objektdatenFuerMail(zeilen)

      for (const b of zeilen) {
        if (istObjektdatenBefund(b)) continue
        const zeile: MailBefund = {
          meldung: b.meldung,
          anzahl: b.anzahl,
          beispiele: beispielZeile(b.beispiele),
        }
        if (b.schwere === 'fehler') fehler.push(zeile)
        else if (b.schwere === 'warnung') warnungen.push(zeile)
        else hinweise.push(zeile)
      }
    }

    // 3) Nichts zu melden heißt: keine Mail.
    //
    // Objektbefunde, die schon gestern da waren, sind allein kein Grund für
    // eine Mail. Erst ein neuer Treffer ist einer. Geht die Mail aus einem
    // anderen Grund hinaus, stehen die bestehenden als Zahl mit darin.
    const objektdatenNeu = hatNeueObjektdaten(objektdaten)
    if (fehler.length === 0 && warnungen.length === 0 && hinweise.length === 0 && !objektdatenNeu) {
      console.log('nachtpruefung-morgenmail: nichts zu melden, keine Mail versendet')
      return new Response(
        JSON.stringify({ ok: true, versendet: 0, grund: 'nichts zu melden', lauf: laufAt ?? null }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    const templateData = {
      nacht: laufAt ? deutschesDatum(laufAt) : '',
      fehler,
      warnungen,
      hinweise,
      objektdaten,
      berichtLink: BERICHT_LINK,
    }

    if (dryRun) {
      // Ohne Service-Key nur die Stückzahlen. Sie sagen, ob der Dienst arbeitet,
      // ohne einen einzigen Kundennamen preiszugeben.
      return new Response(
        JSON.stringify(
          mitServiceKey
            ? { ok: true, dryRun: true, templateData }
            : {
                ok: true,
                dryRun: true,
                fehler: fehler.length,
                warnungen: warnungen.length,
                hinweise: hinweise.length,
                objektdatenNeu: objektdaten.reduce((n, b) => n + b.neu.length + b.neuWeitere, 0),
              },
        ),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // 4) Empfänger: Inhaber und Administratoren.
    let empfaenger: string[]
    if (testRecipient) {
      empfaenger = [testRecipient]
    } else {
      const { data: rollen, error: rollenFehler } = await db
        .from('user_roles')
        .select('user_id, profiles!inner(email)')
        .in('role', ['inhaber', 'admin'])

      if (rollenFehler) throw rollenFehler

      empfaenger = [
        ...new Set(
          (rollen ?? [])
            .map((r) => (r as { profiles?: { email?: string } }).profiles?.email)
            .filter((e): e is string => typeof e === 'string' && e.includes('@')),
        ),
      ]
    }

    if (empfaenger.length === 0) {
      console.warn('nachtpruefung-morgenmail: kein Inhaber und kein Administrator mit Mailadresse gefunden')
      return new Response(
        JSON.stringify({ ok: false, versendet: 0, grund: 'keine Empfaenger' }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    // Der Schlüssel enthält den Lauf, nicht den Aufrufzeitpunkt. Ein zweiter
    // Aufruf am selben Tag schickt damit nicht dieselbe Mail noch einmal.
    const laufSchluessel = (laufAt ?? new Date().toISOString()).slice(0, 19)

    let versendet = 0
    const fehlschlaege: Array<{ empfaenger: string; grund: string }> = []

    for (const adresse of empfaenger) {
      const ergebnis = await sendeVorlage(db, {
        templateName: 'nachtpruefung-bericht',
        recipientEmail: adresse,
        idempotencyKey: `nachtpruefung-${laufSchluessel}-${adresse}`,
        templateData,
      })
      if (ergebnis.ok) versendet++
      else fehlschlaege.push({ empfaenger: adresse, grund: ergebnis.grund ?? 'unbekannt' })
    }

    console.log(
      `nachtpruefung-morgenmail: ${versendet} von ${empfaenger.length} Mails versendet, ` +
        `${fehler.length} Fehler, ${warnungen.length} Warnungen, ${hinweise.length} Hinweise`,
    )

    return new Response(
      JSON.stringify({ ok: true, versendet, empfaenger: empfaenger.length, fehlschlaege, lauf: laufAt ?? null }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    console.error('nachtpruefung-morgenmail:', e)
    return new Response(JSON.stringify({ ok: false, fehler: text }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
