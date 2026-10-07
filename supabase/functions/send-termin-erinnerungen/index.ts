import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'
import {
  alteErinnerungVerschickt,
  checklistenTerminErinnern,
  MAX_VERSUCHE,
  terminSperrSchluessel,
  versuchsSchluessel,
} from '../_shared/termin-checkliste.ts'

/**
 * send-termin-erinnerungen
 *
 * Stuendlich per pg_cron zur Minute 20. Erinnert den Kunden 24, 6 und 1 Stunde
 * vor einem Termin per Mail, unabhaengig vom Anlass und davon, wie der Termin
 * entstanden ist.
 *
 * Quelle sind die Termine selbst: `aktivitaeten` mit `art = 'meeting'`, dazu
 * `faellig_am` und `uhrzeit`. Damit ist gleichgueltig, ob der Termin von Hand
 * angelegt oder ueber den Buchungslink entstanden ist.
 *
 * Gegen doppelten Versand steht `termin_erinnerungen`. Der Eintrag entsteht VOR
 * dem Versand und bleibt auch bei einem Fehlschlag stehen, siehe die Migration
 * 20260804120000. Laeuft die Migration noch nicht, verschickt diese Function
 * bewusst gar nichts, statt ohne Sperre jede Stunde erneut zu mailen.
 *
 * Die aeltere Erinnerung send-erstgespraech-reminders laeuft bewusst weiter.
 * Die fruehere Zoom-Erinnerung ist seit dem 29.09.2026 entfernt.
 *
 * Seit dem 04.10.2026 (M12) dazu die Termine aus der Checkliste im
 * Kundenprofil (`kontakte.meta.setterTerminDatum` und `-Uhrzeit`), die keine
 * Aktivitaet mit Datum haben. Vorher wurden sie hier uebersprungen, in der
 * Annahme, send-erstgespraech-reminders kuemmere sich darum; fuer die steht
 * aber kein Zeitplan in den Migrationen. Wie doppelte Mails ausgeschlossen
 * sind, steht in `_shared/termin-checkliste.ts`.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Die Stufen, von der fruehesten zur spaetesten. */
const STUFEN: Array<{ name: '24h' | '6h' | '1h'; grenzeStunden: number }> = [
  { name: '24h', grenzeStunden: 24 },
  { name: '6h', grenzeStunden: 6 },
  { name: '1h', grenzeStunden: 1 },
]

const BERLIN_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hour12: false,
})

/** Wie weit Berlin zu diesem Zeitpunkt vor UTC liegt, in Millisekunden. */
function versatzMs(zeitpunkt: Date): number {
  const teile = BERLIN_FORMAT
    .formatToParts(zeitpunkt)
    .reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a }, {})
  const alsBerlin = Date.UTC(
    Number(teile.year), Number(teile.month) - 1, Number(teile.day),
    Number(teile.hour === '24' ? '0' : teile.hour), Number(teile.minute), Number(teile.second),
  )
  // Auf ganze Sekunden gerechnet, weil die Formatierung keine Millisekunden
  // liefert. Zeitzonenversaetze sind ohnehin volle Minuten.
  return alsBerlin - Math.floor(zeitpunkt.getTime() / 1000) * 1000
}

/**
 * Datum (yyyy-mm-dd oder tt.mm.jjjj) und Uhrzeit (HH:MM) als Berliner
 * Wanduhrzeit lesen und den passenden UTC-Zeitpunkt zurueckgeben.
 *
 * Deno laeuft in UTC. Ohne diese Umrechnung kaeme die Erinnerung ein bis zwei
 * Stunden zu spaet. Dieselbe Rechnung steckt in send-erstgespraech-reminders,
 * sie liegt hier noch einmal, weil an jener Function bewusst nichts geaendert
 * wird, solange beide parallel laufen.
 *
 * Gemessen wird zweimal, und das ist kein Uebereifer. Der Versatz wird am
 * naiven Zeitpunkt abgelesen, also an einem, der noch um ein bis zwei Stunden
 * danebenliegt. An den beiden Umstellungstagen im Jahr liegt in dieser Spanne
 * die Umstellung selbst. Beispiel 29. Maerz 2026, Termin um 01:30 Berliner
 * Zeit: Der naive Zeitpunkt 01:30 UTC liegt bereits in der Sommerzeit, die
 * einmalige Messung ergibt zwei Stunden und rechnet den Termin auf 00:30
 * Berliner Zeit zurueck, also eine Stunde zu frueh. Deshalb wird der Versatz
 * am gefundenen Zeitpunkt noch einmal abgelesen; weicht er ab, gilt der
 * zweite. Der Fehler betraf Termine zwischen Mitternacht und zwei Uhr an
 * genau diesen zwei Tagen. Er steckt wortgleich in
 * send-erstgespraech-reminders, die hier bewusst nicht angefasst wird.
 */
function berlinerZeitNachUtc(datumRoh: string, uhrzeit: string): Date | null {
  if (!datumRoh || !uhrzeit) return null
  let datum = datumRoh.trim()
  const de = datum.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (de) {
    datum = `${de[3]}-${String(+de[2]).padStart(2, '0')}-${String(+de[1]).padStart(2, '0')}`
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return null

  const [jahr, monat, tag] = datum.split('-').map(Number)
  const [stunde, minute] = uhrzeit.trim().split(':').map(Number)
  if ([jahr, monat, tag, stunde, minute].some((n) => Number.isNaN(n))) return null

  const naivUtc = Date.UTC(jahr, monat - 1, tag, stunde, minute, 0)
  const ersterVersatz = versatzMs(new Date(naivUtc))
  let ergebnis = naivUtc - ersterVersatz
  const zweiterVersatz = versatzMs(new Date(ergebnis))
  if (zweiterVersatz !== ersterVersatz) ergebnis = naivUtc - zweiterVersatz
  return new Date(ergebnis)
}

/** Der Tag in Berlin als yyyy-mm-dd. */
function berlinerTag(zeitpunkt: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(zeitpunkt)
}

/**
 * Alle Schreibweisen eines Tages, die in `faellig_am` vorkommen koennen.
 *
 * Die Spalte ist Text und wird je nach Herkunft als yyyy-mm-dd oder in
 * deutscher Schreibweise gefuellt, dort mal mit und mal ohne fuehrende Null.
 * Nach diesen Werten wird gefiltert, statt alle Termine aller Jahre zu laden.
 */
function schreibweisen(tagIso: string): string[] {
  const [jahr, monat, tag] = tagIso.split('-')
  const mm = monat
  const tt = tag
  const m = String(Number(monat))
  const t = String(Number(tag))
  return [...new Set([
    tagIso,
    `${tt}.${mm}.${jahr}`,
    `${t}.${m}.${jahr}`,
    `${t}.${mm}.${jahr}`,
    `${tt}.${m}.${jahr}`,
  ])]
}

/**
 * Wie lange es noch dauert, in einem Satz, der immer stimmt.
 *
 * Im Regelfall liegt der Termin knapp unter der Stufe, dann steht die Stufe
 * selbst da: "in 24 Stunden". Wird ein Termin kurzfristig angelegt, sind
 * mehrere Stufen auf einmal ueberschritten, und die Stufe waere gelogen. Dann
 * zaehlt die tatsaechliche Restzeit.
 *
 * Die tatsaechliche Restzeit hat Vorrang, sobald sie unter einer Stunde liegt.
 * Ohne diesen Vorrang stand in jeder Mail der 1h-Stufe "in einer Stunde", auch
 * wenn nur noch zehn Minuten blieben: bei der Stufengrenze 1 ist
 * "stundenBis > grenze - 1" fuer jede Restzeit erfuellt. Umgekehrt las sich
 * eine Restzeit von 1,2 Stunden als "in weniger als einer Stunde", weil die
 * alte Schwelle bei 1,5 lag. Beides stand auch in der Betreffzeile.
 */
function vorText(stundenBis: number, grenzeStunden: number): string {
  if (stundenBis < 1) return 'in weniger als einer Stunde'
  if (stundenBis > grenzeStunden - 1) {
    return grenzeStunden === 1 ? 'in einer Stunde' : `in ${grenzeStunden} Stunden`
  }
  if (stundenBis < 1.6) return 'in gut einer Stunde'
  return `in etwa ${Math.round(stundenBis)} Stunden`
}

/**
 * Aus dem gespeicherten Zugang eine vollstaendige Adresse machen.
 *
 * `zoom_link` haelt zweierlei: eine fertige Adresse eines fremden Dienstes, oder einen Pfad
 * wie /raum/<token> beim eigenen Videoraum. Der Pfad steht dort bewusst, weil
 * die Datenbank die oeffentliche Adresse der Anwendung nicht kennt. In einer
 * Mail ist er wertlos, hier wird er ergaenzt.
 */
function vollstaendigeAdresse(zugang: string | null | undefined, basis: string): string {
  const wert = (zugang || '').trim()
  if (!wert) return ''
  if (/^https?:\/\//i.test(wert)) return wert
  if (wert.startsWith('/')) return `${basis.replace(/\/+$/, '')}${wert}`
  // Etwas wie "meet.example.com/abc" ohne Schema. Alles andere ist kein Link.
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(wert)) return `https://${wert}`
  return ''
}

/** "45" oder "45 Minuten" ergeben 45. Alles ohne Zahl ergibt nichts. */
function dauerInMinuten(dauer: string | null | undefined): number | undefined {
  const treffer = String(dauer || '').match(/\d+/)
  if (!treffer) return undefined
  const minuten = Number(treffer[0])
  return Number.isFinite(minuten) && minuten > 0 ? minuten : undefined
}

/** Nur eine saubere Anrede verwenden, sonst lieber den Vornamen. */
function saubereAnrede(anrede: string | null | undefined): string {
  // Das Feld enthaelt mal "Herr", mal "Sehr geehrter Herr". Beides ist
  // gemeint, alles andere lieber weglassen als falsch anreden.
  const wert = (anrede || '').trim().toLowerCase()
  if (wert.includes('frau')) return 'Frau'
  if (wert.includes('herr')) return 'Herr'
  return ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Nur die Automatik darf hier hinein (verify_jwt = false). Siehe
  // _shared/automatik-schutz.ts; ohne hinterlegtes Geheimwort laesst der
  // Schutz im Uebergang noch durch. Der Zeitplan schickt den Kopf seit
  // 20261004190000 mit.
  const abgewiesen = automatikSchutz(req, 'send-termin-erinnerungen', corsHeaders)
  if (abgewiesen) return abgewiesen

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: 'Missing env' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Die oeffentliche Adresse der Anwendung. Sie steht als Geheimnis, damit eine
  // andere Umgebung nicht auf das Portal zeigt.
  const basisAdresse = (Deno.env.get('APP_BASE_URL') || 'https://osimmobilien.netlify.app').trim()

  const supabase = createClient(supabaseUrl, serviceKey)

  try {
    const jetzt = new Date()

    // Ein Termin, der hoechstens 24 Stunden entfernt ist, liegt in Berlin
    // entweder heute oder morgen. Mehr muss gar nicht geladen werden.
    const heute = berlinerTag(jetzt)
    const morgen = berlinerTag(new Date(jetzt.getTime() + 24 * 60 * 60 * 1000))
    const tage = [...new Set([...schreibweisen(heute), ...schreibweisen(morgen)])]

    const { data: termine, error: terminFehler } = await supabase
      .from('aktivitaeten')
      .select('id, kunde_id, beschreibung, faellig_am, uhrzeit, dauer, zoom_link, erledigt_am')
      .eq('art', 'meeting')
      .in('faellig_am', tage)

    if (terminFehler) {
      console.error('[termin-erinnerungen] Termine konnten nicht geladen werden', terminFehler)
      // Die Meldung aus Postgres bleibt im Log. Sie nennt Tabellen- und
      // Spaltennamen und gehoert nicht in eine Antwort, die ohne Anmeldung
      // abgeholt werden kann.
      return new Response(JSON.stringify({ error: 'Termine nicht ladbar' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Was in dieser Stunde faellig waere, noch ohne Ruecksicht auf den Kunden.
    type Faellig = {
      /** Leer bei einem Termin aus der Checkliste, der keine Aktivitaet hat. */
      aktivitaetId: string | null
      kundeId: string
      stufe: '24h' | '6h' | '1h'
      stufeGrenze: number
      terminAt: Date
      stundenBis: number
      titel: string
      dauer?: number
      zugangUrl: string
      datumDeutsch: string
      uhrzeit: string
    }
    const faellige: Faellig[] = []

    // Nur die kleinste erreichte Stufe. Wird ein Termin kurzfristig
    // angelegt, sind mehrere Stufen auf einmal ueberschritten; dann darf nur
    // eine Mail hinausgehen, und zwar die, die der Wirklichkeit am naechsten
    // kommt. Die groesseren Stufen koennen spaeter nicht mehr greifen, weil
    // immer nur die kleinste erreichte zaehlt.
    const kleinsteStufe = (stundenBis: number) => {
      const erreicht = STUFEN.filter((s) => stundenBis <= s.grenzeStunden)
      return erreicht.length ? erreicht[erreicht.length - 1] : null
    }

    // Alle Meeting-Zeitpunkte je Kunde, auch erledigte und abgesagte. Daran
    // misst sich unten, ob ein Checklisten-Termin eine eigene Erinnerung bekommt.
    const meetingZeiten = new Map<string, Date[]>()

    for (const termin of termine || []) {
      const terminAt = berlinerZeitNachUtc(String(termin.faellig_am || ''), String(termin.uhrzeit || ''))
      if (!terminAt || Number.isNaN(terminAt.getTime())) continue
      const kundeIdRoh = String(termin.kunde_id || '').trim()
      if (kundeIdRoh) meetingZeiten.set(kundeIdRoh, [...(meetingZeiten.get(kundeIdRoh) || []), terminAt])
      if (termin.erledigt_am) continue

      const stundenBis = (terminAt.getTime() - jetzt.getTime()) / 3_600_000
      if (stundenBis <= 0) continue

      const stufe = kleinsteStufe(stundenBis)
      if (!stufe) continue

      const kundeId = String(termin.kunde_id || '').trim()
      if (!kundeId) continue

      const [jahr, monat, tag] = berlinerTag(terminAt).split('-')
      faellige.push({
        aktivitaetId: String(termin.id),
        kundeId,
        stufe: stufe.name,
        stufeGrenze: stufe.grenzeStunden,
        terminAt,
        stundenBis,
        titel: String(termin.beschreibung || '').trim() || 'Termin',
        dauer: dauerInMinuten(termin.dauer),
        zugangUrl: vollstaendigeAdresse(termin.zoom_link, basisAdresse),
        datumDeutsch: `${tag}.${monat}.${jahr}`,
        uhrzeit: String(termin.uhrzeit || '').trim(),
      })
    }

    // ── Termine aus der Checkliste im Kundenprofil ──
    //
    // Ein Lesefehler haelt die Erinnerungen aus den Aktivitaeten nicht auf.
    const { data: checkKontakte, error: checkFehler } = await supabase
      .from('kontakte')
      .select('id, meta')
      .in('meta->>setterTerminDatum', tage)
      .eq('archiviert', false)
      .eq('geloescht', false)
    if (checkFehler) console.error('[termin-erinnerungen] Checklisten-Termine nicht ladbar', checkFehler)
    for (const k of checkKontakte || []) {
      const meta = (k.meta || {}) as Record<string, unknown>
      const terminAt = berlinerZeitNachUtc(String(meta.setterTerminDatum || ''), String(meta.setterTerminUhrzeit || ''))
      if (!terminAt || Number.isNaN(terminAt.getTime())) continue
      const stundenBis = (terminAt.getTime() - jetzt.getTime()) / 3_600_000
      if (stundenBis <= 0) continue
      const stufe = kleinsteStufe(stundenBis)
      if (!stufe) continue
      const kundeId = String(k.id)
      // Verloren, NoShow, oder eine Aktivitaet zum selben Zeitpunkt (auch
      // erledigt oder abgesagt): keine eigene Erinnerung.
      if (!checklistenTerminErinnern(meta, meetingZeiten.get(kundeId) || [], terminAt)) continue
      const [jahr, monat, tag] = berlinerTag(terminAt).split('-')
      faellige.push({
        aktivitaetId: null,
        kundeId,
        stufe: stufe.name,
        stufeGrenze: stufe.grenzeStunden,
        terminAt,
        stundenBis,
        // Kein Titel: Die Vorlage nimmt ihren eigenen, in der Kundensprache.
        titel: '',
        zugangUrl: '',
        datumDeutsch: `${tag}.${monat}.${jahr}`,
        uhrzeit: String(meta.setterTerminUhrzeit || '').trim(),
      })
    }

    if (faellige.length === 0) {
      return new Response(JSON.stringify({ ok: true, geprueft: (termine || []).length, gesendet: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // ── Abgesagte Buchungen aussortieren ──
    //
    // `buchung_absagen` aus der Grundlagenmigration setzt nur
    // `buchungen.status`. Die Aktivitaet in der Kundenakte bleibt unberuehrt
    // stehen: gleiches Datum, gleiche Uhrzeit, `erledigt_am` leer. Ohne diese
    // Pruefung bekaeme ein Kunde, der abgesagt hat, weiter alle drei
    // Erinnerungen samt Link zum Videoraum.
    //
    // Die Migration 20260804170000 setzt beim Absagen kuenftig `erledigt_am`,
    // was oben schon greift. Diese Pruefung bleibt trotzdem: sie deckt die
    // Zeit bis zu deren Ausfuehrung ab und die Buchungen, die vorher abgesagt
    // wurden und deren Aktivitaet nachtraeglich niemand schliesst.
    const abgesagteAktivitaeten = new Set<string>()
    const { data: abgesagte, error: abgesagtFehler } = await supabase
      .from('buchungen')
      .select('aktivitaet_id')
      .eq('status', 'abgesagt')
      .in('aktivitaet_id', [...new Set(faellige.map((f) => f.aktivitaetId).filter((id): id is string => !!id))])
    if (abgesagtFehler) {
      // Bewusst weiterlaufen: waere hier Schluss, wuerde ein voruebergehender
      // Fehler alle Erinnerungen verstummen lassen. Abgesagte Termine sind der
      // seltenere Fall, eine Erinnerung zu viel der kleinere Schaden.
      console.error('[termin-erinnerungen] Abgesagte Buchungen nicht pruefbar', abgesagtFehler)
    } else {
      for (const b of abgesagte || []) {
        if (b.aktivitaet_id) abgesagteAktivitaeten.add(String(b.aktivitaet_id))
      }
    }

    // Die Kunden dazu, in einem Zug.
    const { data: kontakte, error: kontaktFehler } = await supabase
      .from('kontakte')
      .select('id, anrede, vorname, nachname, email, archiviert, geloescht, zustaendig_id, meta')
      .in('id', [...new Set(faellige.map((f) => f.kundeId))])

    if (kontaktFehler) {
      console.error('[termin-erinnerungen] Kontakte konnten nicht geladen werden', kontaktFehler)
      return new Response(JSON.stringify({ error: 'Kontakte nicht ladbar' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const kontaktNach = new Map<string, any>()
    for (const k of kontakte || []) kontaktNach.set(String(k.id), k)

    let gesendet = 0
    let uebersprungen = 0
    let fehlgeschlagen = 0

    for (const eintrag of faellige) {
      if (eintrag.aktivitaetId && abgesagteAktivitaeten.has(eintrag.aktivitaetId)) {
        uebersprungen++
        continue
      }
      const kontakt = kontaktNach.get(eintrag.kundeId)
      if (!kontakt) continue
      if (kontakt.archiviert || kontakt.geloescht) continue
      const email = String(kontakt.email || '').trim()
      if (!email) continue

      // ── Keine zweite Mail, wenn die alte Erinnerung schon geschickt hat ──
      //
      // Zeigt die Checkliste auf denselben Zeitpunkt und hat
      // send-erstgespraech-reminders diese Stufe vermerkt, ist der Kunde
      // bereits erinnert. Bis zum 04.10.2026 wurde hier jeder solche Termin
      // uebersprungen, auch ohne dass die alte Erinnerung je lief.
      const meta = (kontakt.meta || {}) as Record<string, unknown>
      const checklistenZeit = berlinerZeitNachUtc(
        String(meta.setterTerminDatum || ''),
        String(meta.setterTerminUhrzeit || ''),
      )
      if (alteErinnerungVerschickt(meta, checklistenZeit, eintrag.terminAt, eintrag.stufe)) {
        uebersprungen++
        continue
      }

      // ── Altbestand: vor dem 04.10.2026 sperrte termin_erinnerungen ──
      //
      // Was dort zur Aktivitaet steht, ist erledigt. Sonst ginge eine Stufe,
      // die kurz vor dem Ausrollen verschickt wurde, unter dem neuen
      // Schluessel ein zweites Mal hinaus. Fehlt die Tabelle, zaehlt nur die
      // neue Sperre.
      if (eintrag.aktivitaetId) {
        const { data: alt, error: altFehler } = await supabase
          .from('termin_erinnerungen')
          .select('id')
          .eq('aktivitaet_id', eintrag.aktivitaetId)
          .eq('stufe', eintrag.stufe)
          .eq('termin_at', eintrag.terminAt.toISOString())
          .limit(1)
        if (!altFehler && alt && alt.length > 0) {
          uebersprungen++
          continue
        }
      }

      // ── Platz belegen, bevor gesendet wird ──
      //
      // Ein Schluessel je Kontakt, Terminzeitpunkt und Stufe, fuer Aktivitaet
      // und Checkliste derselbe. Ohne Sperre geht nichts hinaus.
      const sperre = terminSperrSchluessel(eintrag.kundeId, eintrag.terminAt, eintrag.stufe)
      const { data: claim, error: claimFehler } = await supabase.rpc('buchung_mail_claim', { _schluessel: sperre })
      if (claimFehler) {
        console.error('[termin-erinnerungen] Sperre nicht moeglich, es wird nichts gesendet', claimFehler)
        return new Response(
          JSON.stringify({ error: 'Versandsicherung nicht verfuegbar' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        )
      }
      if (claim !== 'frei') {
        uebersprungen++
        continue
      }

      // ── Versuche zaehlen ──
      //
      // Ein Fehlschlag gibt die Sperre wieder frei, der naechste Lauf versucht
      // es erneut. Nach MAX_VERSUCHE bleibt es dabei.
      // ponytail: ein Schluessel je Versuch statt einer Zaehlspalte, damit es
      // ohne Migration geht.
      let versuch = 0
      for (let n = 1; n <= MAX_VERSUCHE; n++) {
        const { data: v, error: vFehler } = await supabase.rpc('buchung_mail_claim', { _schluessel: versuchsSchluessel(sperre, n) })
        if (vFehler || v === 'frei') {
          if (!vFehler) await supabase.rpc('buchung_mail_fertig', { _schluessel: versuchsSchluessel(sperre, n), _erfolg: true })
          versuch = n
          break
        }
      }
      if (versuch === 0) {
        console.error(`[termin-erinnerungen] ${eintrag.stufe} fuer Kontakt ${eintrag.kundeId}: nach ${MAX_VERSUCHE} Versuchen aufgegeben`)
        await supabase.rpc('buchung_mail_fertig', { _schluessel: sperre, _erfolg: true })
        uebersprungen++
        continue
      }

      const daten: Record<string, unknown> = {
        anrede: saubereAnrede(kontakt.anrede),
        vorname: String(kontakt.vorname || '').trim(),
        nachname: String(kontakt.nachname || '').trim(),
        vorText: vorText(eintrag.stundenBis, eintrag.stufeGrenze),
        terminDatum: eintrag.datumDeutsch,
        terminUhrzeit: eintrag.uhrzeit,
        terminDauer: eintrag.dauer,
        terminTitel: eintrag.titel || undefined,
        zugangUrl: eintrag.zugangUrl || undefined,
        // Name, Rolle und Erreichbarkeit loest send-transactional-email
        // zentral auf, siehe _shared/ansprechpartner.ts.
        beraterUserId: kontakt.zustaendig_id || undefined,
        berater: {},
      }

      // Die Antwort wird ausgewertet, nicht nur der Fehler: Steht die Adresse
      // auf der Sperrliste, antwortet send-transactional-email mit Status 200
      // und `{ success: false }`. Das sah frueher wie ein gelungener Versand
      // aus. Siehe _shared/transactional-versand.ts.
      const ergebnis = await sendeVorlage(supabase, {
        templateName: 'termin-erinnerung',
        recipientEmail: email,
        // Derselbe Schluessel wie die Sperre: Ein wiederholter Versuch nach
        // einem Fehlschlag wird nicht doppelt zugestellt.
        idempotencyKey: sperre,
        templateData: daten,
        kontaktId: kontakt.id,
      })
      const fehlertext = ergebnis.ok ? '' : (ergebnis.grund || 'Versand fehlgeschlagen')

      // Erledigt nur bei echtem Erfolg, oder nach dem letzten Versuch. Sonst
      // bleibt die Sperre offen und der naechste Lauf versucht es erneut.
      const endgueltig = !fehlertext || versuch >= MAX_VERSUCHE
      await supabase.rpc('buchung_mail_fertig', { _schluessel: sperre, _erfolg: endgueltig })
      if (fehlertext && endgueltig) {
        console.error(`[termin-erinnerungen] ${eintrag.stufe} fuer Kontakt ${eintrag.kundeId}: nach ${MAX_VERSUCHE} Versuchen aufgegeben`)
      }
      // Beim Checklisten-Termin wie die alte Erinnerung vermerken, damit
      // send-erstgespraech-reminders dieselbe Stufe nicht noch einmal schickt.
      if (!fehlertext && !eintrag.aktivitaetId) {
        const bisher = Array.isArray(meta.remindersSent) ? (meta.remindersSent as string[]) : []
        const { error: vermerkFehler } = await supabase.rpc('merge_kontakt_meta', {
          _kontakt_id: kontakt.id,
          _updates: { remindersSent: [...new Set([...bisher, eintrag.stufe])] },
        })
        if (vermerkFehler) console.error('[termin-erinnerungen] remindersSent nicht vermerkt', vermerkFehler)
      }

      if (fehlertext) {
        fehlgeschlagen++
        console.error(`[termin-erinnerungen] ${eintrag.stufe} an ${email} fehlgeschlagen: ${fehlertext}`)
      } else {
        gesendet++
        console.log(
          `[termin-erinnerungen] ${eintrag.stufe} an ${email} fuer ${eintrag.datumDeutsch} ${eintrag.uhrzeit}`,
        )
      }
    }

    return new Response(
      JSON.stringify({ ok: true, geprueft: (termine || []).length, gesendet, uebersprungen, fehlgeschlagen }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (fehler) {
    console.error('[termin-erinnerungen] unerwarteter Fehler', fehler)
    return new Response(
      JSON.stringify({ error: 'Unerwarteter Fehler' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
