import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'

/**
 * Abgelaufene Unterschrift zur Selbstauskunft: jemanden zuständig machen.
 *
 * Anlass: Der Nachtwächter hat beim ersten Lauf zehn abgelaufene
 * Unterschriftsanfragen gefunden. Zehn Kunden hatten einen Link bekommen, nie
 * unterschrieben, und niemand hat nachgefasst, weil es niemandem aufgefallen
 * ist. Bei jedem dieser zehn stand ein angefangener Vorgang still.
 *
 * Melden allein reicht dafür nicht. Der Wächter sagt es hinterher, hier
 * bekommt der Vorgang einen Besitzer: Läuft der Link ab, entsteht eine Aufgabe
 * für den zuständigen Berater. Ein abgelaufener Link ist kein technisches
 * Ereignis, sondern ein Kunde, der zögert. Da hilft nur ein Anruf.
 *
 * Genau einmal je Vorgang, der Riegel steht in `signature_requests.meta`.
 *
 * Bis zum 15.09.2026 ging hier zusätzlich vierundzwanzig Stunden vor Ablauf
 * eine Erinnerung an den Kunden (Vorlage `selbstauskunft-signatur`, Vermerk
 * `meta.erinnert_at`). Christian hat alle automatischen Erinnerungen an den
 * Kunden abgeschaltet; der Vermerk bleibt in Altdaten stehen und wird nicht
 * mehr gesetzt.
 *
 * Läuft täglich über pg_cron, siehe Migration 20260805130000. Der Zeitplan
 * bleibt, weil die Aufgabe an den Berater an ihm hängt.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface Bericht {
  aufgaben: number
  fehler: string[]
}

/** Fehler lesbar machen: Supabase liefert Objekte, keine Error-Instanzen. */
function fehlerText(e: unknown): string {
  if (e instanceof Error) return e.message
  if (e && typeof e === 'object') {
    const o = e as Record<string, unknown>
    return [o.message, o.details, o.hint, o.code].filter(Boolean).join(' | ') || JSON.stringify(o)
  }
  return String(e)
}

/** Wie der Berater den Ablaufzeitpunkt in der Aufgabe lesen soll. */
function fristText(bis: string): string {
  const d = new Date(bis)
  return d.toLocaleString('de-DE', {
    day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit',
  }) + ' Uhr'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'signatur-erinnerung')
  if (abgewiesen) return abgewiesen

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  const bericht: Bericht = { aufgaben: 0, fehler: [] }
  const jetzt = new Date()

  // ── Abgelaufen: der Berater übernimmt ────────────────────────────────
  try {
    // Nur die letzten sieben Tage. Alles davor ist kalt, und eine Aufgabe zu
    // einem drei Monate alten Vorgang liest niemand mehr.
    const seit = new Date(jetzt.getTime() - 7 * 86400_000).toISOString()

    const { data: abgelaufen, error } = await db
      .from('signature_requests')
      .select('id, name, kontakt_id, expires_at, meta, person_type')
      .eq('status', 'pending')
      /*
       * NUR Selbstauskuenfte.
       *
       * In dieser Tabelle liegen vier verschiedene Vorgaenge: Selbstauskunft
       * (person1/person2), Reservierungsvereinbarung (rv_...), Arbeitsvertrag
       * und Kurzvertrag. Ein Arbeitsvertrag hat keinen Kontakt in der
       * Kundenakte, seine Kennung zeigt auf einen Bewerber. Reservierungen
       * hat `send-reservierung-eskalation` mit eigener Frist.
       */
      .in('person_type', ['person1', 'person2'])
      .lt('expires_at', jetzt.toISOString())
      .gte('expires_at', seit)
      .limit(50)

    if (error) throw error

    for (const s of abgelaufen ?? []) {
      const meta = (s.meta ?? {}) as Record<string, unknown>
      if (meta.aufgabe_at || !s.kontakt_id) continue

      /*
       * Ohne Zuständigen keine Aufgabe.
       *
       * Die Tabelle verlangt zwingend einen Besitzer, und das ist auch
       * richtig so: Eine Aufgabe, die niemandem gehört, liest niemand. Fehlt
       * der Zuständige, meldet stattdessen der Nachtwächter den Kontakt ohne
       * Betreuer, und das ist dann das eigentliche Problem.
       */
      const { data: kontakt } = await db
        .from('kontakte').select('zustaendig_id').eq('id', s.kontakt_id).maybeSingle()
      const besitzer = (kontakt as { zustaendig_id?: string } | null)?.zustaendig_id
      if (!besitzer) {
        bericht.fehler.push(`${s.name}: kein Zuständiger, keine Aufgabe angelegt`)
        continue
      }

      const { error: riegel } = await db
        .from('signature_requests')
        .update({ meta: { ...meta, aufgabe_at: jetzt.toISOString() } })
        .eq('id', s.id)
        .is('meta->>aufgabe_at', null)
      if (riegel) { bericht.fehler.push(`Riegel ${s.id}: ${riegel.message}`); continue }

      // Die Aufgabe hängt am Kontakt, nicht an einem Nutzer. So sieht sie
      // jeder, der den Kunden betreut, auch nach einem Betreuerwechsel.
      const { error: aufgabeFehler } = await db.from('aufgaben').insert({
        benutzer_id: besitzer,
        zugewiesen_an: besitzer,
        kontakt_id: s.kontakt_id,
        titel: `Unterschrift abgelaufen: ${s.name}`,
        beschreibung:
          `${s.name} hat den Link zur Unterschrift bekommen und nicht unterschrieben. ` +
          `Er ist am ${fristText(s.expires_at)} abgelaufen. ` +
          `Bitte kurz anrufen und klären, woran es liegt, danach einen neuen Link senden.`,
        prioritaet: 'hoch',
        faellig_am: jetzt.toISOString().slice(0, 10),
        typ: 'aufgabe',
        ausloeser_schluessel: `signatur_abgelaufen:${s.id}`,
      })

      if (aufgabeFehler) bericht.fehler.push(`Aufgabe für ${s.name}: ${aufgabeFehler.message}`)
      else bericht.aufgaben++
    }
  } catch (e) {
    const text = fehlerText(e)
    console.error('signatur-erinnerung, Teil Aufgaben:', e)
    bericht.fehler.push(`Aufgaben: ${text}`)
  }

  /*
   * Nach aussen nur Zahlen.
   *
   * Die Function ist ohne Anmeldung erreichbar, weil pg_cron sie ruft, und
   * der Zeitplan schickt keinen Ausweis mit. Sie ist damit fuer jeden
   * aufrufbar, der die Adresse kennt. In der Fehlerliste standen Klarnamen
   * und Mailadressen von Kunden: Wer sie aufrief, bekam die Namen derer
   * zurueck, bei denen eine Unterschrift aussteht.
   *
   * Die vollstaendige Liste bleibt im Log, dort gehoert sie hin.
   */
  console.log('signatur-erinnerung:', JSON.stringify(bericht))
  return new Response(JSON.stringify({
    aufgaben: bericht.aufgaben,
    fehler: bericht.fehler.length,
  }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
