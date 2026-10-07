import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'

/**
 * Zweiter Versuch für Mails, die beim ersten Mal nicht rausgingen.
 *
 * Warum es das braucht: Bisher wurde ein Fehlschlag zwar festgehalten
 * (`meta.bestaetigung_fehler` an der Buchung, `erfolg = false` an der
 * Erinnerung), aber niemand hat es noch einmal versucht. Der Kunde hatte
 * gebucht und nie eine Mail bekommen, und gemerkt hat es niemand, weil ein
 * ausbleibender Versand keinen Lärm macht.
 *
 * Bewusst genau EIN zweiter Versuch, nicht mehr:
 *
 *   * Die häufigste Ursache ist eine kurze Störung beim Mailanbieter. Die ist
 *     nach ein paar Stunden vorbei, und ein zweiter Versuch reicht.
 *   * Die zweithäufigste ist eine Adresse auf der Sperrliste oder ein Tippfehler
 *     darin. Da hilft auch der zehnte Versuch nicht, er erzeugt nur Last und
 *     schadet dem Ruf der Absenderadresse.
 *
 * Nach dem zweiten Fehlschlag bleibt es beim Vermerk, und der Nachtwächter
 * meldet es morgens. Dann muss ein Mensch ran.
 *
 * NOCH OHNE ZEITPLAN. Es gibt keinen pg_cron-Eintrag, der diese Function
 * ruft. Sie ist ausgerollt und erreichbar, laeuft aber von selbst nie.
 * Gefunden vom Sicherheitspruefer. Der Zeitplan steht in der Migration
 * 20260805160000; bis die ausgefuehrt ist, passiert hier nichts.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

/** Nur Buchungen der letzten zwei Tage. Ältere holt niemand mehr nach. */
const FENSTER_TAGE = 2

interface Bericht {
  buchungen_geprueft: number
  buchungen_erfolgreich: number
  buchungen_endgueltig: number
  bewerbertermine_nachgeholt: number
  fehler: string[]
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok')

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'mail-nachzuegler')
  if (abgewiesen) return abgewiesen

  const db = createClient(SUPABASE_URL, SERVICE_KEY)
  const bericht: Bericht = {
    buchungen_geprueft: 0, buchungen_erfolgreich: 0, buchungen_endgueltig: 0,
    bewerbertermine_nachgeholt: 0, fehler: [],
  }

  try {
    const seit = new Date(Date.now() - FENSTER_TAGE * 86400_000).toISOString()

    // Buchungen mit vermerktem Fehlschlag, bei denen der zweite Versuch noch
    // aussteht. `bestaetigung_zweitversuch` ist der Riegel dagegen, dass
    // dieselbe Buchung bei jedem Lauf erneut angefasst wird.
    const { data: buchungen, error } = await db
      .from('buchungen')
      .select('id, name, email, start_at, terminart_id, absage_token, meta')
      .gte('created_at', seit)
      .not('meta->>bestaetigung_fehler', 'is', null)
      .is('meta->>bestaetigung_zweitversuch', null)
      .limit(50)

    if (error) throw error

    for (const b of buchungen ?? []) {
      bericht.buchungen_geprueft++
      const meta = (b.meta ?? {}) as Record<string, unknown>

      /*
       * Zwei Dinge in einem Schreibvorgang:
       *
       *   * Den Riegel setzen, damit diese Buchung nicht bei jedem Lauf
       *     erneut angefasst wird.
       *   * `bestaetigung_at` entfernen. send-buchung-bestaetigung sperrt sich
       *     selbst gegen Doppelversand über genau dieses Feld, und es wird VOR
       *     dem Versand gesetzt. Nach einem Fehlschlag steht es also da,
       *     obwohl nie eine Mail hinausging, und der zweite Versuch liefe
       *     gegen die eigene Sperre.
       *
       * Das ist unbedenklich, weil `bestaetigung_fehler` gesetzt ist: Dieses
       * Feld sagt gerade aus, dass die Mail NICHT beim Kunden ankam.
       */
      const { bestaetigung_at: _alteSperre, ...ohneSperre } = meta
      const { error: riegelFehler } = await db
        .from('buchungen')
        .update({ meta: { ...ohneSperre, bestaetigung_zweitversuch: new Date().toISOString() } })
        .eq('id', b.id)
        .is('meta->>bestaetigung_zweitversuch', null)

      if (riegelFehler) {
        bericht.fehler.push(`Riegel für ${b.id}: ${riegelFehler.message}`)
        continue
      }

      try {
        // Die Function nimmt ausschliesslich den Absagetoken, alles Weitere
        // holt sie sich selbst aus der Datenbank.
        const { data: antwort, error: sendeFehler } = await db.functions.invoke(
          'send-buchung-bestaetigung', { body: { absageToken: b.absage_token } },
        )
        if (sendeFehler) throw sendeFehler

        /*
         * Die Antwort auswerten, nicht nur den Aufruf.
         *
         * send-buchung-bestaetigung antwortet auch dann mit Status 200, wenn
         * gar nichts hinausging, etwa weil die Adresse auf der Sperrliste
         * steht. Ohne diese Pruefung entfernte der Nachzuegler danach den
         * Fehlervermerk, der Nachtwaechter meldete den Fall nicht mehr, und
         * der Kunde hatte weiterhin keine Bestaetigung. Der Reparaturversuch
         * haette den Fehler verdeckt statt ihn zu beheben.
         */
        const ergebnis = (antwort ?? {}) as { gesendet?: boolean; ok?: boolean; error?: string }
        if (ergebnis.gesendet === false || ergebnis.ok === false) {
          throw new Error(ergebnis.error || 'Die Bestaetigung ging erneut nicht hinaus')
        }

        // Den Fehlervermerk entfernen, sonst meldet der Nachtwächter ihn
        // weiter. Frisch aus der Datenbank lesen: Die Function hat das meta
        // eben selbst angefasst und `bestaetigung_at` neu gesetzt.
        const { data: frisch } = await db
          .from('buchungen').select('meta').eq('id', b.id).maybeSingle()
        const { bestaetigung_fehler: _weg, ...rest } = (frisch?.meta ?? {}) as Record<string, unknown>
        await db.from('buchungen').update({
          meta: { ...rest, bestaetigung_nachgeholt: new Date().toISOString() },
        }).eq('id', b.id)

        bericht.buchungen_erfolgreich++
      } catch (e) {
        bericht.buchungen_endgueltig++
        const text = e instanceof Error ? e.message : String(e)
        bericht.fehler.push(`Buchung ${b.id}: ${text}`)
        console.error(`Zweiter Versuch für Buchung ${b.id} gescheitert:`, e)
      }
    }
    /*
     * Bewerbertermine, deren Mail nie angestossen wurde.
     *
     * Beim Bewerbertermin startet der Browser den Versand nach der Buchung,
     * bewusst ohne zu warten, damit die Seite nicht haengt. Schliesst der
     * Bewerber sie in der Sekunde dazwischen oder bricht die Verbindung weg,
     * steht der Termin, aber weder er noch HR erfahren davon.
     *
     * Anders als bei den Kundenbuchungen oben gibt es dann keinen
     * Fehlervermerk, denn es wurde ja nichts versucht. Der Anker ist deshalb
     * ein FEHLENDER Vermerk: `send-bewerber-termin` schreibt nach jedem
     * Versand `meta.bewerber_mail_stand`. Fehlt der bei einer offenen
     * Bewerberbuchung, die aelter als fuenf Minuten ist, ging nichts hinaus.
     *
     * Die fuenf Minuten sind Absicht: Frisch gebuchte Termine sollen nicht
     * doppelt angestossen werden, waehrend der Browser noch dabei ist.
     */
    const vorMinuten = new Date(Date.now() - 5 * 60_000).toISOString()
    const { data: bewerberBuchungen, error: bewerberFehler } = await db
      .from('buchungen')
      .select('id, bewerbung_id, created_at, meta')
      .gte('created_at', seit)
      .lte('created_at', vorMinuten)
      .eq('status', 'offen')
      .not('bewerbung_id', 'is', null)
      .is('meta->>bewerber_mail_stand', null)
      .limit(50)

    if (bewerberFehler) throw bewerberFehler

    for (const b of bewerberBuchungen ?? []) {
      try {
        const { data: formular } = await db
          .from('bewerber_formular')
          .select('token')
          .eq('bewerbung_id', b.bewerbung_id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (!formular?.token) {
          bericht.fehler.push(`Bewerbertermin ${b.id}: kein Token gefunden`)
          continue
        }
        const { error: sendeFehler } = await db.functions.invoke('send-bewerber-termin', {
          body: { token: formular.token, vorgang: 'gebucht' },
        })
        if (sendeFehler) throw sendeFehler
        bericht.bewerbertermine_nachgeholt++
        console.log(`mail-nachzuegler: Bewerbertermin ${b.id} nachgeholt`)
      } catch (e) {
        const text = e instanceof Error ? e.message : String(e)
        bericht.fehler.push(`Bewerbertermin ${b.id}: ${text}`)
        console.error(`Nachholen fuer Bewerbertermin ${b.id} gescheitert:`, e)
      }
    }
  } catch (e) {
    const text = e instanceof Error ? e.message : String(e)
    console.error('mail-nachzuegler:', e)
    bericht.fehler.push(text)
  }

  console.log('mail-nachzuegler:', JSON.stringify(bericht))
  return new Response(JSON.stringify(bericht), {
    headers: { 'Content-Type': 'application/json' },
  })
})
