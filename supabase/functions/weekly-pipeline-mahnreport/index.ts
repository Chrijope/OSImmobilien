import { createClient } from 'npm:@supabase/supabase-js@2'
import { sendeVorlage } from '../_shared/transactional-versand.ts'
import {
  schwellenFuerStufe,
  istBekannteStufe,
  stufenLabel,
  STUFEN_REIHENFOLGE,
  tageSeit,
} from '../_shared/pipeline-schwellen.ts'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'

/**
 * Der wöchentliche Pipeline-Bericht, montags früh.
 *
 * Jeder Vertriebspartner bekommt seine liegengebliebenen Leads. Inhaber,
 * Administratoren und Vertriebsleiter bekommen dieselbe Aufstellung für ihren
 * Bereich, mit Namen und Betreuer, damit sie gezielt nachfassen können.
 *
 * Drei Dinge waren hier kaputt:
 *
 *   Die Schwellentabelle war eine eigene Kopie mit dem Kommentar "1:1 aus
 *   Pipeline.tsx" und kannte weder Beratungsgespräch noch Selbstauskunft noch
 *   Nicht erreicht. Ein Lead in der Mitte des Prozesses tauchte im Bericht nie
 *   auf, egal wie lange er lag. Die Tabelle steht jetzt in
 *   `_shared/pipeline-schwellen.ts` und wird gegen die Anwendung getestet.
 *
 *   Im Quelltext stand ein fest einkodiertes anon-JWT, um
 *   `send-transactional-email` zu rufen. Das ist ersatzlos weg, der Versand
 *   läuft über `sendeVorlage` wie überall sonst.
 *
 *   Die Führung bekam gar nichts. Sie sah weder, was liegt, noch bei wem.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const APP_BASE_URL = 'https://portal.more.immo'

/**
 * Wer den Bericht bekommt.
 *
 * Vertriebspartner und Vertriebsleiter wie bisher, dazu neu Inhaber und
 * Administratoren für die Hausübersicht. Setterinnen und Juniorpartner stehen
 * bewusst nicht hier: Ihre Leads werden seit heute zwar überwacht, aber sie
 * bekommen dafür täglich Aufgaben aus `lead-eskalation-check`. Eine
 * zusätzliche Wochenmail wäre dieselbe Information ein zweites Mal.
 */
const EMPFAENGER_ROLLEN = ['vertriebspartner', 'vertriebsleiter', 'admin', 'inhaber']

/** Rollen, die die Führungsfassung mit Betreuernamen bekommen. */
const FUEHRUNGSROLLEN = new Set(['vertriebsleiter', 'admin', 'inhaber'])

interface MahnLead {
  id: string
  name: string
  pipelineStufe: string
  stufeLabel: string
  daysInactive: number
  isRed: boolean
  link: string
  /** Nur in der Führungsfassung gesetzt. */
  berater?: string
  /** Interner Schlüssel, geht nicht in die Mail. */
  besitzerId: string | null
}

/** Was tatsächlich in der Mail landet, ohne die internen Felder. */
type MailLead = Omit<MahnLead, 'besitzerId'>

interface StufeGruppe {
  stufeLabel: string
  leads: MailLead[]
}

/**
 * Höchstens so viele Leads je Farbe stehen in der Mail.
 *
 * Für einen Vertriebspartner ist die Grenze theoretisch. Für einen Inhaber,
 * dessen Bereich das ganze Haus ist, wäre die Mail sonst hundert Zeilen lang
 * und damit unlesbar. Die Kennzahlen oben nennen weiterhin die volle Zahl, die
 * Liste zeigt die am längsten liegenden.
 */
const MAX_ZEILEN_JE_FARBE = 40

/** Nach Stufe gruppieren, in der Reihenfolge der Pipeline. */
function gruppiere(alle: MahnLead[], mitBerater: boolean): StufeGruppe[] {
  const leads = alle
    .slice()
    .sort((a, b) => b.daysInactive - a.daysInactive)
    .slice(0, MAX_ZEILEN_JE_FARBE)
  const nachStufe = new Map<string, MahnLead[]>()
  for (const l of leads) {
    if (!nachStufe.has(l.pipelineStufe)) nachStufe.set(l.pipelineStufe, [])
    nachStufe.get(l.pipelineStufe)!.push(l)
  }
  return STUFEN_REIHENFOLGE
    .filter((s) => nachStufe.has(s))
    .map((s) => ({
      stufeLabel: stufenLabel(s),
      leads: nachStufe
        .get(s)!
        .slice()
        .sort((a, b) => b.daysInactive - a.daysInactive)
        // `besitzerId` ist ein interner Schlüssel und hat in der Mail nichts
        // zu suchen. Der Betreuername nur in der Führungsfassung.
        .map(({ besitzerId: _weg, ...l }) => (mitBerater ? l : { ...l, berater: undefined })),
    }))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'weekly-pipeline-mahnreport', corsHeaders)
  if (abgewiesen) return abgewiesen

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  /*
   * Testbetrieb: { testRecipient, dryRun }
   *
   * `testRecipient` schickt den kompletten Bericht an eine frei gewählte
   * Adresse, also Kundennamen, Stufen und Liegezeiten. Diese Function läuft
   * ohne Anmeldung (verify_jwt = false, sonst käme der Zeitplan nicht durch),
   * damit wäre das ein offenes Rohr nach draußen. Der Testempfänger gilt
   * deshalb nur, wenn der Aufrufer den Service-Key mitbringt, und den hat nur
   * die Serverseite. `dryRun` verschickt nichts und darf jeder.
   */
  let testRecipient: string | null = null
  let dryRun = false
  const mitServiceKey =
    (req.headers.get('Authorization') || '') === `Bearer ${supabaseServiceKey}`
  try {
    const body = await req.json()
    if (body?.dryRun === true) dryRun = true
    if (typeof body?.testRecipient === 'string') {
      if (mitServiceKey) testRecipient = body.testRecipient
      else console.warn('weekly-pipeline-mahnreport: testRecipient ohne Service-Key, ignoriert')
    }
  } catch { /* Der Zeitplan ruft ohne Rumpf auf. */ }

  // ── 1) Empfänger und ihre Rollen ─────────────────────────────────────────
  const { data: rollen, error: rollenFehler } = await supabase
    .from('user_roles')
    .select('user_id, role')
    .in('role', EMPFAENGER_ROLLEN)

  if (rollenFehler) {
    return new Response(JSON.stringify({ success: false, error: rollenFehler.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const rollenJeNutzer = new Map<string, Set<string>>()
  for (const r of (rollen || [])) {
    if (!rollenJeNutzer.has(r.user_id)) rollenJeNutzer.set(r.user_id, new Set())
    rollenJeNutzer.get(r.user_id)!.add(r.role)
  }
  const empfaengerIds = [...rollenJeNutzer.keys()]

  if (!empfaengerIds.length) {
    return new Response(JSON.stringify({ success: true, versendet: 0, grund: 'keine Empfaenger' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Alle Profile, nicht nur die der Empfänger: Für die Führungsfassung braucht
  // es auch die Namen der Betreuer, und für die Zuordnung über das Freitextfeld
  // `berater` die Namen aller internen Nutzer.
  const { data: alleProfile } = await supabase.from('profiles').select('id, name, email')
  const profilNach = new Map<string, { name: string; email: string }>()
  const idNachName = new Map<string, string>()
  for (const p of (alleProfile || [])) {
    const name = (p.name || '').trim()
    profilNach.set(p.id, { name, email: (p.email || '').trim() })
    const schluessel = name.toLowerCase().replace(/\s+/g, ' ')
    // Bei zwei gleichen Namen wäre die Zuordnung geraten. Lieber keine.
    if (schluessel) idNachName.set(schluessel, idNachName.has(schluessel) ? '' : p.id)
  }

  // ── 2) Kontakte einmal laden und einmal bewerten ─────────────────────────
  const { data: kontakte, error: kontakteFehler } = await supabase
    .from('kontakte')
    .select('id, vorname, nachname, berater, zustaendig_id, aktualisiert_am, erstellt_am, meta')
    .eq('archiviert', false)
    .eq('geloescht', false)

  if (kontakteFehler) {
    return new Response(JSON.stringify({ success: false, error: kontakteFehler.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const kritisch: MahnLead[] = []
  const unbekannteStufen = new Set<string>()
  let ohneBesitzer = 0

  for (const k of (kontakte || [])) {
    const meta = (k.meta as Record<string, unknown>) || {}
    const stufe = (meta.pipelineStufe as string | undefined) || ''
    if (stufe && !istBekannteStufe(stufe)) { unbekannteStufen.add(stufe); continue }

    const schwellen = schwellenFuerStufe(stufe)
    if (!schwellen) continue

    const tage = tageSeit(k.aktualisiert_am || k.erstellt_am)
    const istRot = tage >= schwellen.rot
    if (!istRot && tage < schwellen.orange) continue

    /*
     * Besitzer über `zustaendig_id`, nicht über den Namen.
     *
     * Der Bericht verglich bisher `kontakte.berater` mit dem Profilnamen. Das
     * ist ein Freitextfeld; maßgeblich für die Zuständigkeit ist überall sonst
     * `zustaendig_id`. Der Name bleibt nur als Rückfallebene für Altbestände,
     * in denen die ID nie gesetzt wurde, und auch nur, wenn er eindeutig ist.
     */
    let besitzerId: string | null = k.zustaendig_id || null
    if (!besitzerId && k.berater) {
      const treffer = idNachName.get(String(k.berater).trim().toLowerCase().replace(/\s+/g, ' '))
      besitzerId = treffer || null
    }
    if (!besitzerId) ohneBesitzer++

    kritisch.push({
      id: k.id,
      name: `${k.vorname || ''} ${k.nachname || ''}`.trim() || 'Unbekannt',
      pipelineStufe: stufe,
      stufeLabel: stufenLabel(stufe),
      daysInactive: tage,
      isRed: istRot,
      link: `${APP_BASE_URL}/kunden/${k.id}`,
      berater: besitzerId ? (profilNach.get(besitzerId)?.name || '') : (k.berater || 'ohne Betreuer'),
      besitzerId,
    })
  }

  // ── 3) Zuständigkeitsbereich je Empfänger ────────────────────────────────
  /*
   * `public.zustaendigkeitsbereich` liefert für Inhaber und Administratoren
   * das ganze Haus, für Vertriebsleiter ihr Team plus sich selbst und für alle
   * anderen nur sich selbst. Die Team-Zuordnung stand vorher ausschließlich im
   * Frontend, deshalb konnte kein Dienst sie benutzen.
   *
   * Ist die Migration `20260807160000_team_zuordnung.sql` in Supabase noch
   * nicht gelaufen, schlägt der Aufruf fehl. Dann bleibt es beim eigenen
   * Bestand, also genau beim bisherigen Verhalten, statt dass der ganze
   * Bericht ausfällt.
   */
  let bereichVerfuegbar = true
  const bereichVon = async (userId: string): Promise<Set<string>> => {
    if (bereichVerfuegbar) {
      const { data, error } = await supabase.rpc('zustaendigkeitsbereich', { _user: userId })
      if (!error) {
        const ids = (data || [])
          .map((z: { bereich_id?: string }) => z.bereich_id)
          .filter((id: string | undefined): id is string => !!id)
        return new Set<string>([userId, ...ids])
      }
      bereichVerfuegbar = false
      console.warn('weekly-pipeline-mahnreport: zustaendigkeitsbereich nicht verfuegbar:', error.message)
    }
    return new Set<string>([userId])
  }

  // ── 4) Versand ───────────────────────────────────────────────────────────
  const heute = new Date()
  const zeitraum = heute.toLocaleDateString('de-DE', {
    weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Berlin',
  })
  const tagesSchluessel = heute.toISOString().slice(0, 10)

  let versendet = 0
  let uebersprungen = 0
  const ergebnisse: Array<Record<string, unknown>> = []

  for (const empfaengerId of empfaengerIds) {
    const profil = profilNach.get(empfaengerId)
    if (!profil?.email || !profil.name) { uebersprungen++; continue }

    const meineRollen = rollenJeNutzer.get(empfaengerId)!
    const istFuehrung = [...meineRollen].some((r) => FUEHRUNGSROLLEN.has(r))
    const bereich = istFuehrung ? await bereichVon(empfaengerId) : new Set([empfaengerId])

    const meineLeads = kritisch.filter((l) => l.besitzerId && bereich.has(l.besitzerId))
    if (!meineLeads.length) {
      uebersprungen++
      ergebnisse.push({ empfaenger: profil.email, status: 'nichts_kritisches' })
      continue
    }

    const rot = meineLeads.filter((l) => l.isRed)
    const orange = meineLeads.filter((l) => !l.isRed)

    // Der Betreuername steht nur in der Führungsfassung. Ein Vertriebspartner
    // sieht ohnehin nur eigene Leads, dort wäre die Spalte nur Ballast.
    const templateData = {
      vpName: profil.name.split(' ')[0],
      zeitraum,
      fuehrung: istFuehrung,
      totalRot: rot.length,
      totalOrange: orange.length,
      totalKritisch: meineLeads.length,
      pipelineLink: `${APP_BASE_URL}/pipeline`,
      rotGruppen: gruppiere(rot, istFuehrung),
      orangeGruppen: gruppiere(orange, istFuehrung),
    }

    const adresse = testRecipient || profil.email

    if (dryRun) {
      ergebnisse.push({
        empfaenger: adresse, status: 'probelauf', fuehrung: istFuehrung,
        gesamt: meineLeads.length, rot: rot.length, orange: orange.length,
      })
      if (testRecipient) break
      continue
    }

    const ergebnis = await sendeVorlage(supabase, {
      templateName: 'pipeline-mahnreport',
      recipientEmail: adresse,
      idempotencyKey: `pipeline-mahnreport-${empfaengerId}-${tagesSchluessel}`,
      templateData,
    })

    if (ergebnis.ok) {
      versendet++
      ergebnisse.push({
        empfaenger: adresse, status: 'versendet', fuehrung: istFuehrung,
        gesamt: meineLeads.length, rot: rot.length, orange: orange.length,
      })
    } else {
      ergebnisse.push({ empfaenger: adresse, status: 'fehlgeschlagen', grund: ergebnis.grund })
    }

    // Im Testbetrieb genau eine Mail, damit die Vorschau nicht das ganze Haus erreicht.
    if (testRecipient) break
  }

  const zusammenfassung = {
    success: true,
    dryRun,
    versendet,
    uebersprungen,
    empfaenger: empfaengerIds.length,
    kritischeLeads: kritisch.length,
    leadsOhneBesitzer: ohneBesitzer,
    unbekannteStufen: [...unbekannteStufen],
    teamZuordnungVerfuegbar: bereichVerfuegbar,
    ergebnisse,
  }

  console.log('weekly-pipeline-mahnreport:', JSON.stringify(zusammenfassung))

  return new Response(JSON.stringify(zusammenfassung), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
