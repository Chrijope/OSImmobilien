import { createClient } from 'npm:@supabase/supabase-js@2'
import {
  schwellenFuerStufe,
  istBekannteStufe,
  stufenLabel,
  tageSeit,
} from '../_shared/pipeline-schwellen.ts'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'
import { ESKALATION_STICHTAG, eskalationsBezug, vorStichtag } from '../_shared/eskalation-bezug.ts'

/**
 * Der Eskalationsdienst für liegengebliebene Leads.
 *
 * Er legt dem Zuständigen eine Aufgabe an, sobald ein Lead in seiner Stufe zu
 * lange still ist, und eine zweite, dringende, wenn die finale Schwelle
 * gerissen ist. Ab der finalen Schwelle geht zusätzlich eine Meldung an die
 * Führung.
 *
 * Zwei Löcher, die dieser Dienst bis heute hatte:
 *
 *   Er führte eine eigene Kopie der Schwellentabelle mit dem Kommentar "1:1
 *   aus Pipeline.tsx". Die stimmte längst nicht mehr: Sie kannte die
 *   abgeschafften Stufen `closing` und `vermoegensaufbau`, und ihr fehlte die
 *   gesamte Mitte des Prozesses. Ein Lead in Beratungsgespräch,
 *   Selbstauskunft, Nicht erreicht, Erreicht oder NoShow fiel in
 *   `if (!thresholds) continue` und wurde stillschweigend übersprungen. Die
 *   Tabelle liegt jetzt in `_shared/pipeline-schwellen.ts` und wird von einem
 *   Test gegen die Anwendung gehalten.
 *
 *   Empfänger waren nur Vertriebspartner und Vertriebsleiter.
 *
 * Seit dem 04.10.2026 (H1): Die Rollenliste enthielt `juniorpartner`, das es
 * im Enum nicht gibt. Die Abfrage scheiterte still, und der Dienst fand nie
 * einen Betreuer. Dazu Stichtag und eigene Merkmarke, siehe
 * `_shared/eskalation-bezug.ts`.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Rollen, die einen Lead betreuen können. Nur Werte aus `app_role`: Ein
 * unbekannter Wert lässt die ganze Abfrage scheitern. Die Setter-Rolle ruht
 * seit dem 29.09.2026 und steht deshalb nicht mehr hier.
 */
const BETREUENDE_ROLLEN = [
  'vertriebspartner',
  'vertriebsleiter',
  'admin',
  'inhaber',
]

interface Zaehler {
  aufgaben: number
  fuehrungsmeldungen: number
  ruhig: number
  bereitsGemeldet: number
  ohneStufe: number
  nichtUeberwachteStufe: number
  unbekannteStufe: number
  ohneZustaendigen: number
  ohneBetreuungsrolle: number
  vorStichtag: number
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'lead-eskalation-check', corsHeaders)
  if (abgewiesen) return abgewiesen

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  let dryRun = false
  try {
    const body = await req.json()
    if (body?.dryRun) dryRun = true
  } catch { /* Der Zeitplan ruft ohne Rumpf auf, das ist der Normalfall. */ }

  // 1) Aktive Kontakte mit Zuständigem und Pipeline-Stufe
  const { data: kontakte, error: kErr } = await supabase
    .from('kontakte')
    .select('id, vorname, nachname, berater, zustaendig_id, aktualisiert_am, erstellt_am, meta')
    .eq('archiviert', false)
    .eq('geloescht', false)

  // Die Postgres-Meldung nennt Tabellen und Spalten, sie gehoert ins Log.
  if (kErr) {
    console.error('lead-eskalation-check: Kontakte nicht lesbar:', kErr.message)
    return new Response(JSON.stringify({ success: false, error: 'Kontakte nicht lesbar' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // 2) Wer darf überhaupt Leads betreuen
  const { data: rollen, error: rErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role', BETREUENDE_ROLLEN)
  // Ohne Rollen wäre jeder Lead "ohne Betreuungsrolle", und der Dienst
  // meldete Erfolg. Genau so lief er bis heute nie.
  if (rErr) {
    console.error('lead-eskalation-check: Rollen nicht lesbar:', rErr.message)
    return new Response(JSON.stringify({ success: false, error: 'Rollen nicht lesbar' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
  const betreuerIds = new Set<string>((rollen || []).map((r) => r.user_id))

  // 3) Namen der Zuständigen, für die Meldung an die Führung
  const zustaendigIds = [...new Set((kontakte || []).map((k) => k.zustaendig_id).filter(Boolean))]
  const { data: profile } = zustaendigIds.length
    ? await supabase.from('profiles').select('id, name').in('id', zustaendigIds)
    : { data: [] as Array<{ id: string; name: string | null }> }
  const namen = new Map<string, string>()
  for (const p of (profile || [])) namen.set(p.id, (p.name || '').trim())

  /**
   * Wer die Leads eines Betreuers überblicken darf.
   *
   * Kommt aus `public.aufsicht_ueber`, damit Dienst und Oberfläche später
   * dieselbe Team-Zuordnung benutzen. Solange die zugehörige Migration
   * `20260807160000_team_zuordnung.sql` in Supabase noch nicht gelaufen ist,
   * schlägt der Aufruf fehl. Dann bleibt die Führungsmeldung aus und der Rest
   * des Dienstes läuft weiter, statt dass alles stehenbleibt.
   */
  const aufsichtCache = new Map<string, string[]>()
  let aufsichtVerfuegbar = true
  const aufsichtUeber = async (betreuerId: string): Promise<string[]> => {
    if (!aufsichtVerfuegbar) return []
    const bekannt = aufsichtCache.get(betreuerId)
    if (bekannt) return bekannt
    const { data, error } = await supabase.rpc('aufsicht_ueber', { _mitglied: betreuerId })
    if (error) {
      aufsichtVerfuegbar = false
      console.warn('lead-eskalation-check: aufsicht_ueber nicht verfuegbar:', error.message)
      return []
    }
    const ids = (data || [])
      .map((z: { aufseher_id?: string }) => z.aufseher_id)
      .filter((id: string | undefined): id is string => !!id)
    aufsichtCache.set(betreuerId, ids)
    return ids
  }

  const z: Zaehler = {
    aufgaben: 0,
    fuehrungsmeldungen: 0,
    ruhig: 0,
    bereitsGemeldet: 0,
    ohneStufe: 0,
    nichtUeberwachteStufe: 0,
    unbekannteStufe: 0,
    ohneZustaendigen: 0,
    ohneBetreuungsrolle: 0,
    vorStichtag: 0,
  }
  const errors: string[] = []
  /** Stufen, die in den Daten stehen, aber in keiner Tabelle. Datenfehler. */
  const unbekannteStufen = new Set<string>()

  for (const k of (kontakte || [])) {
    const meta = (k.meta as Record<string, unknown>) || {}
    const stufe = (meta.pipelineStufe as string | undefined) || ''

    // Gar keine Stufe ist etwas anderes als eine Stufe ohne Überwachung, und
    // beides etwas anderes als eine Stufe, die es nicht gibt. Vorher landete
    // alles drei im selben Topf `skipped`.
    if (!stufe) { z.ohneStufe++; continue }

    if (!istBekannteStufe(stufe)) {
      // Früher landete das im selben Topf wie alles andere und war damit
      // unsichtbar. Eine Stufe, die es nicht gibt, ist ein Datenfehler und
      // gehört benannt.
      z.unbekannteStufe++
      unbekannteStufen.add(stufe)
      continue
    }

    const schwellen = schwellenFuerStufe(stufe)
    if (!schwellen) { z.nichtUeberwachteStufe++; continue }

    /*
     * Ein Lead ohne Zuständigen wird hier NICHT eskaliert, und das ist eine
     * bewusste Entscheidung, kein übriggebliebenes Loch.
     *
     * Dieser Dienst schreibt eine Aufgabe an eine Person. Ohne Zuständigen
     * gibt es diese Person nicht, es bliebe nur ein Rundruf an alle. Genau
     * diesen Fall deckt seit dem 07.08. die Nachtprüfung ab: Sie meldet jeden
     * unzugewiesenen Kontakt nach drei Tagen, und seit der Morgenmail liest
     * ihn auch jemand. Zwei Dienste, die denselben Lead melden, heißt zwei
     * Meldungen, und die zweite wird die erste entwerten.
     *
     * Gezählt wird der Fall trotzdem und in der Antwort ausgewiesen. Wenn die
     * Zahl unerwartet groß ist, sieht man es, statt es zu vermuten.
     */
    if (!k.zustaendig_id) { z.ohneZustaendigen++; continue }
    if (!betreuerIds.has(k.zustaendig_id)) { z.ohneBetreuungsrolle++; continue }

    // Die eigene Merkmarke zählt nicht als Aktivität, siehe eskalation-bezug.ts.
    const bezug = eskalationsBezug(k)
    if (vorStichtag(bezug)) { z.vorStichtag++; continue }
    const tage = tageSeit(bezug)
    const istRot = tage >= schwellen.rot
    const istFinal = tage >= schwellen.final

    if (!istRot && !istFinal) { z.ruhig++; continue }

    // Idempotenz-Marker, damit derselbe Lead in derselben Stufe nur einmal
    // erinnert und einmal final gemeldet wird.
    const eskaliert = (meta.eskalationGesendet as Record<string, string>) || {}
    const eskaliertFinal = (meta.eskalationFinalGesendet as Record<string, string>) || {}

    const sendeFinal = istFinal && !eskaliertFinal[stufe]
    const sendeErste = !sendeFinal && istRot && !eskaliert[stufe]

    if (!sendeFinal && !sendeErste) { z.bereitsGemeldet++; continue }

    const leadName = `${k.vorname || ''} ${k.nachname || ''}`.trim() || 'Unbekannt'
    const label = stufenLabel(stufe)

    if (dryRun) {
      z.aufgaben++
      if (sendeFinal) z.fuehrungsmeldungen++
      continue
    }

    const titel = sendeFinal
      ? `Finale Eskalation: ${leadName} (${label}), ${tage} Tage ohne Aktivität`
      : `Eskalation: ${leadName} (${label}), ${tage} Tage ohne Aktivität`
    const beschreibung = sendeFinal
      ? `Letzte Erinnerung: "${leadName}" liegt seit ${tage} Tagen in der Stufe "${label}" (finale Schwelle ${schwellen.final} Tage). Bitte jetzt entscheiden: weiterführen, verloren oder archivieren.`
      : `"${leadName}" ist seit ${tage} Tagen in der Stufe "${label}" ohne Aktivität. Bitte zeitnah nachfassen.`

    try {
      const { error: insErr } = await supabase.from('aufgaben').insert({
        benutzer_id: k.zustaendig_id,
        zugewiesen_an: k.zustaendig_id,
        kontakt_id: k.id,
        typ: 'aufgabe',
        prioritaet: sendeFinal ? 'dringend' : 'hoch',
        status: 'offen',
        titel,
        beschreibung,
        faellig_am: new Date().toISOString(),
      })
      if (insErr) errors.push(`aufgabe ${k.id}: ${insErr.message}`)
      else z.aufgaben++
    } catch (e) {
      errors.push(`aufgabe ${k.id}: ${e instanceof Error ? e.message : String(e)}`)
    }

    /*
     * Alarm bei Rot: Nur die finale Schwelle geht an die Führung.
     *
     * Die erste Erinnerung bleibt beim Zuständigen. Ginge jede rote Kachel
     * nach oben, wäre die Meldung binnen zwei Wochen Rauschen und die eine
     * wirklich kritische fiele nicht mehr auf. Die Wochenübersicht in
     * `weekly-pipeline-mahnreport` zeigt der Führung ohnehin das ganze Bild.
     *
     * Empfänger sind Inhaber, Administratoren und die Vertriebsleiter dieses
     * Betreuers, nicht das ganze Haus. Name und Stufe stehen ausdrücklich in
     * der Meldung: Der Vertriebsleiter soll gezielt nachfassen können, und
     * genau diese Angaben sieht er in "Alle Kontakte" ohnehin.
     */
    if (sendeFinal) {
      const betreuerName = namen.get(k.zustaendig_id) || 'ohne Namen'
      for (const aufseherId of await aufsichtUeber(k.zustaendig_id)) {
        try {
          const { error: bErr } = await supabase.from('benachrichtigungen').insert({
            benutzer_id: aufseherId,
            titel: `Lead entscheidungsreif: ${leadName}`,
            nachricht: `"${leadName}" liegt seit ${tage} Tagen in der Stufe "${label}", betreut von ${betreuerName}. Die finale Schwelle von ${schwellen.final} Tagen ist erreicht, hier muss entschieden werden.`,
            link: `/kunden/${k.id}`,
            gelesen: false,
          })
          if (bErr) errors.push(`fuehrung ${k.id}: ${bErr.message}`)
          else z.fuehrungsmeldungen++
        } catch (e) {
          errors.push(`fuehrung ${k.id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }

    // Marker setzen, damit die nächste Nacht nicht dasselbe noch einmal meldet.
    try {
      const jetzt = new Date().toISOString()
      const patch: Record<string, unknown> = sendeFinal
        ? {
            eskalationFinalGesendet: { ...eskaliertFinal, [stufe]: jetzt },
            // Die erste Stufe gleich mit abhaken, falls sie noch offen war.
            eskalationGesendet: { ...eskaliert, [stufe]: eskaliert[stufe] || jetzt },
          }
        : { eskalationGesendet: { ...eskaliert, [stufe]: jetzt } }
      // Die Marke setzt aktualisiert_am auf jetzt. Damit die nächste Nacht
      // trotzdem ab der letzten echten Aktivität zählt, steht sie hier mit.
      patch.eskalationBezug = bezug
      patch.eskalationMarkeAm = jetzt
      const { error: mErr } = await supabase.rpc('merge_kontakt_meta', { _kontakt_id: k.id, _updates: patch })
      if (mErr) errors.push(`marker ${k.id}: ${mErr.message}`)
    } catch (e) {
      errors.push(`marker ${k.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  const zusammenfassung = {
    success: true,
    dryRun,
    kontakteGesamt: kontakte?.length || 0,
    aufgabenAngelegt: z.aufgaben,
    fuehrungsmeldungen: z.fuehrungsmeldungen,
    fuehrungErreichbar: aufsichtVerfuegbar,
    uebersprungen: {
      nochRuhig: z.ruhig,
      bereitsGemeldet: z.bereitsGemeldet,
      ohneStufe: z.ohneStufe,
      stufeWirdNichtUeberwacht: z.nichtUeberwachteStufe,
      // Nicht schweigend, sondern ausgewiesen: hier steckt der Datenfehler.
      stufeUnbekannt: z.unbekannteStufe,
      unbekannteStufen: [...unbekannteStufen],
      // Behandelt die Nachtpruefung, siehe Begruendung im Rumpf.
      ohneZustaendigen: z.ohneZustaendigen,
      zustaendigerOhneBetreuungsrolle: z.ohneBetreuungsrolle,
      // Letzte Aktivität vor dem Stichtag: Altfall, wird nicht eskaliert.
      vorStichtag: z.vorStichtag,
      stichtag: ESKALATION_STICHTAG,
    },
    // Nur die Zahl nach aussen, die Meldungen selbst stehen im Log.
    fehler: errors.length,
  }

  if (errors.length) console.error('lead-eskalation-check: Fehler:', errors.slice(0, 50).join(' | '))
  console.log('lead-eskalation-check:', JSON.stringify(zusammenfassung))

  return new Response(JSON.stringify(zusammenfassung), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
