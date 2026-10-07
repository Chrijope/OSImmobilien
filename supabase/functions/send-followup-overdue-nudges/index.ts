import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'
import { entscheideMitRollen } from '../_shared/glocke-zustaendiger.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysBetween(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z').getTime()
  const now = Date.now()
  return Math.floor((now - d) / (1000 * 60 * 60 * 24))
}

/**
 * Ab wie vielen Tagen Überfälligkeit die Führung mitbekommt, dass ein
 * Follow-Up liegenbleibt.
 *
 * Drei Tage: Ein Follow-Up, das am Freitag fällig war und am Montag noch
 * offen ist, ist ein normales Wochenende. Wer am Dienstag immer noch nicht
 * angerufen hat, hat es nicht vergessen, sondern liegen lassen.
 */
const ESKALATION_AB_TAGEN = 3

/**
 * Wer die Leads eines Betreuers überblicken darf: Inhaber, Administratoren
 * und die eigenen Vertriebsleiter. Kommt aus `public.aufsicht_ueber`.
 *
 * Diese Meldung gab es schon einmal, sie wurde entfernt mit dem Hinweis, jede
 * Person sehe ausschließlich Benachrichtigungen zu eigenen Kontakten. Die
 * Variable `escalations` blieb stehen und lieferte seither konstant null, die
 * Dokumentation behauptete weiter, es gäbe die Eskalation. Der Auftraggeber
 * hat entschieden: Die Führung bekommt sie wieder, aber gezielt an den
 * zuständigen Vertriebsleiter statt als Rundruf an das ganze Haus, und mit
 * Namen, damit er nachfassen kann.
 *
 * Solange `20260807160000_team_zuordnung.sql` in Supabase nicht gelaufen ist,
 * schlägt der Aufruf fehl. Dann bleibt es bei der Meldung an den Zuständigen,
 * statt dass der ganze Dienst abbricht.
 */
function macheAufsichtsAbfrage() {
  const zwischenspeicher = new Map<string, string[]>()
  let verfuegbar = true
  return {
    get verfuegbar() { return verfuegbar },
    async fuer(betreuerId: string): Promise<string[]> {
      if (!verfuegbar) return []
      const bekannt = zwischenspeicher.get(betreuerId)
      if (bekannt) return bekannt
      const { data, error } = await supabase.rpc('aufsicht_ueber', { _mitglied: betreuerId })
      if (error) {
        verfuegbar = false
        console.warn('send-followup-overdue-nudges: aufsicht_ueber nicht verfuegbar:', error.message)
        return []
      }
      const ids = (data || [])
        .map((z: { aufseher_id?: string }) => z.aufseher_id)
        .filter((id: string | undefined): id is string => !!id)
      zwischenspeicher.set(betreuerId, ids)
      return ids
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'send-followup-overdue-nudges', corsHeaders)
  if (abgewiesen) return abgewiesen

  const today = todayISO()
  let nudgesSent = 0
  let escalations = 0
  const errors: string[] = []
  const aufsicht = macheAufsichtsAbfrage()
  // Namen der Betreuer, damit in der Meldung an die Führung steht, bei wem
  // etwas liegt. Wird nur für die wenigen Eskalationsfälle geholt.
  const betreuerName = new Map<string, string>()

  try {
    // 1) Alle offenen, überfälligen Follow-Ups laden
    const { data: overdueFollowUps, error: fuErr } = await supabase
      .from('follow_ups')
      .select('id, kunde_id, kunde_name, titel, faellig_am, benutzer_id')
      .eq('status', 'offen')
      .lt('faellig_am', today)

    if (fuErr) throw fuErr

    for (const fu of overdueFollowUps || []) {
      try {
        // Kontakt für Verantwortlichen + lastFollowupNudgeAt
        const { data: kontakt } = await supabase
          .from('kontakte')
          .select('id, vorname, nachname, zustaendig_id, meta, status')
          .eq('id', fu.kunde_id)
          .maybeSingle()

        if (!kontakt) continue
        // Skip wenn Kontakt schon verloren/archiviert
        if (kontakt.status === 'verloren') continue
        const meta = (kontakt.meta || {}) as Record<string, any>
        if (meta.archiviert) continue
        if ((meta.pipelineStufe || '') === 'verloren') continue

        // Bereits heute genudged? skip
        const lastNudge = meta.lastFollowupNudgeAt || ''
        if (lastNudge.startsWith(today)) continue

        // Regel vom 29.09.2026: Hat ein Partner das Follow-Up angelegt und
        // gehoert ihm der Kontakt nicht mehr, geht die Meldung an den
        // aktuellen Zustaendigen, ohne ihn an die Leitung. Follow-Ups von
        // Setterin oder Backoffice bleiben bei ihnen. Siehe
        // _shared/glocke-zustaendiger.ts.
        let empfaenger: string[] = []
        if (fu.benutzer_id) {
          const e = await entscheideMitRollen(supabase, fu.benutzer_id, kontakt.zustaendig_id || null)
          empfaenger = e.art === 'wie_geplant' ? [fu.benutzer_id] : e.art === 'umleiten' ? e.an : []
        } else if (kontakt.zustaendig_id) {
          empfaenger = [kontakt.zustaendig_id]
        }
        if (empfaenger.length === 0) continue
        // Die Fuehrung des Betreuers gibt es nur bei genau einem Betreuer; geht
        // die Meldung an die Leitung, ist die Fuehrung schon im Bild.
        const responsibleId: string | null = empfaenger.length === 1 ? empfaenger[0] : null

        // Idempotenz-Lock SOFORT setzen, damit parallele Invocations doppelte
        // Benachrichtigungen nicht erneut erzeugen können.
        await supabase.rpc('merge_kontakt_meta', {
          _kontakt_id: kontakt.id,
          _updates: { lastFollowupNudgeAt: new Date().toISOString() },
        })

        const overdueDays = Math.max(1, daysBetween(fu.faellig_am))
        const kundeName = fu.kunde_name || `${kontakt.vorname || ''} ${kontakt.nachname || ''}`.trim() || 'Kunde'

        // Bell-Notification an Verantwortlichen
        await supabase.from('benachrichtigungen').insert(empfaenger.map((uid) => ({
          benutzer_id: uid,
          titel: `Follow-Up überfällig (${overdueDays} Tag${overdueDays === 1 ? '' : 'e'})`,
          nachricht: `Dein Follow-Up "${fu.titel}" mit ${kundeName} war am ${fu.faellig_am} fällig. Bitte zeitnah Kontakt aufnehmen.`,
          link: `/kunden/${kontakt.id}`,
        })))
        nudgesSent++

        // ── Alarm bei Rot: ab drei Tagen erfährt es die Führung ──
        // Nur einmal je Kontakt, der Marker `followupEscalatedAt` sorgt dafür.
        if (responsibleId && overdueDays >= ESKALATION_AB_TAGEN && !meta.followupEscalatedAt) {
          const aufseher = await aufsicht.fuer(responsibleId)
          if (aufseher.length) {
            if (!betreuerName.has(responsibleId)) {
              const { data: p } = await supabase
                .from('profiles').select('name').eq('id', responsibleId).maybeSingle()
              betreuerName.set(responsibleId, (p?.name || '').trim() || 'ohne Namen')
            }
            const wer = betreuerName.get(responsibleId)
            for (const aufseherId of aufseher) {
              // Der Zuständige hat seine eigene Meldung schon bekommen.
              if (aufseherId === responsibleId) continue
              await supabase.from('benachrichtigungen').insert({
                benutzer_id: aufseherId,
                titel: `Follow-Up liegt seit ${overdueDays} Tagen`,
                nachricht: `Das Follow-Up "${fu.titel}" mit ${kundeName} war am ${fu.faellig_am} fällig und ist noch offen. Betreut von ${wer}.`,
                link: `/kunden/${kontakt.id}`,
                gelesen: false,
              })
              escalations++
            }
            await supabase.rpc('merge_kontakt_meta', {
              _kontakt_id: kontakt.id,
              _updates: { followupEscalatedAt: new Date().toISOString() },
            })
          }
        }
      } catch (e: any) {
        errors.push(`${fu.id}: ${e?.message || String(e)}`)
      }
    }

    return new Response(
      JSON.stringify({
        ok: true, today, nudgesSent, escalations,
        // Ist die Team-Migration noch nicht gelaufen, sind Eskalationen
        // zwangsläufig null. Das soll man in der Antwort sehen können.
        fuehrungErreichbar: aufsicht.verfuegbar,
        processed: overdueFollowUps?.length || 0, errors,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e: any) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || String(e) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})