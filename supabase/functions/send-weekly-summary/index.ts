import { createClient } from 'npm:@supabase/supabase-js@2'
import { automatikSchutz } from '../_shared/automatik-schutz.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmtEuro = (n: number) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const pct = (n: number, d: number) => !d ? '0%' : (n / d * 100).toFixed(1).replace('.', ',') + '%'
const fmtDate = (d: Date) => `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, 'send-weekly-summary', corsHeaders)
  if (abgewiesen) return abgewiesen

  // Der Rumpf der Anfrage ist nur einmal lesbar, deshalb wird testRecipient
  // ganz am Anfang ausgelesen und danach nur noch aus der Variablen verwendet.
  // testRecipient gilt nur mit Service-Key (Muster aus tagesbriefing), sonst
  // koennte jeder, der die Adresse kennt, die Firmenzahlen an sich schicken.
  let testRecipient: string | null = null
  const mitServiceKey = (req.headers.get('Authorization') || '') === `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
  try {
    const b = await req.json()
    if (typeof b?.testRecipient === 'string' && b.testRecipient.trim()) {
      if (mitServiceKey) testRecipient = b.testRecipient.trim()
      else console.warn('send-weekly-summary: testRecipient ohne Service-Key, ignoriert')
    }
  } catch {
    // Der Zeitplan ruft ohne Rumpf auf. Das ist der Normalfall.
  }

  // Uhrzeitpruefung. Fuer diesen Report gibt es zwei Cron-Eintraege, weil die
  // Zeitplaene der Datenbank in UTC laufen und die Zeitumstellung nicht
  // mitmachen koennen. Gemeint ist ganzjaehrig 18:00 deutscher Zeit, das ist im
  // Sommer 16:00 UTC und im Winter 17:00 UTC. Jede Woche startet also auch der
  // jeweils falsche Eintrag, und genau der bricht hier ab. Ohne diese Pruefung
  // liefe der Report zweimal, deshalb bitte nicht entfernen.
  // Ein Testversand ueber testRecipient bleibt zu jeder Uhrzeit moeglich.
  if (!testRecipient) {
    // formatToParts statt format, weil die deutsche Formatierung an die Stunde
    // ein " Uhr" anhaengt und Number("18 Uhr") NaN ergaebe. Der reine
    // Stundenanteil hat bei einstelligen Stunden eine fuehrende Null ("08"),
    // Number("08") ergibt 8. Um Mitternacht kann je nach Laufzeitumgebung "24"
    // statt "00" herauskommen, das stoert hier nicht, da nur 18 geprueft wird.
    const stundeBerlin = Number(
      new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false,
      }).formatToParts(new Date()).find(t => t.type === 'hour')?.value
    )
    // Laesst sich die Stunde nicht lesen, wird lieber gesendet als der Report
    // dauerhaft ausgelassen.
    if (!Number.isNaN(stundeBerlin) && stundeBerlin !== 18) {
      // Status 200 und kein Fehler, sonst zaehlte der planmaessige Cron-Lauf
      // als fehlgeschlagen.
      return new Response(
        JSON.stringify({ skipped: true, grund: 'nicht 18 Uhr deutscher Zeit', stundeBerlin }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const now = new Date()
  const dayOfWeek = now.getDay()
  const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const monday = new Date(now); monday.setDate(now.getDate() - diffToMonday); monday.setHours(0, 0, 0, 0)
  const monISO = monday.toISOString(); const nowISO = now.toISOString()

  const nextMon = new Date(monday); nextMon.setDate(monday.getDate() + 7)
  const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 7)
  const nextMonISO = nextMon.toISOString(); const nextSunISO = nextSun.toISOString()
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14)

  const { data: adminRoles } = await supabase.from('user_roles').select('user_id').in('role', ['inhaber', 'admin'])
  const adminIds = [...new Set((adminRoles || []).map(r => r.user_id))]
  const { data: adminProfiles } = await supabase.from('profiles').select('id, name, email').in('id', adminIds)
  const recipients = (adminProfiles || []).filter(p => p.email)

  const [
    { data: kontakte }, { count: kontakteCount },
    { data: anrufe }, { data: investmentsWeek }, { data: investmentsAll },
    { data: einreichungen }, { data: bewerbungen },
    { data: aufgabenOffen }, { data: aufgabenErledigt }, { data: followUpsOverdue },
    { data: profiles }, { data: roles }, { data: finanzierungen }, { data: wohnungenObj },
    { data: verlorene }, { data: kontakteAlle },
    { data: followUpsNext }, { data: fristenNext },
    { data: rechnungenWoche }, { data: aktivitaetenLetzte },
  ] = await Promise.all([
    supabase.from('kontakte').select('id, meta, zustaendig_id, kaufpreis').gte('erstellt_am', monISO).lte('erstellt_am', nowISO).eq('geloescht', false),
    supabase.from('kontakte').select('*', { count: 'exact', head: true }).eq('geloescht', false).eq('archiviert', false),
    supabase.from('anrufe').select('id, ergebnis').gte('angerufen_am', monISO).lte('angerufen_am', nowISO),
    supabase.from('investments').select('id, kaufpreis, status, meta, aktualisiert_am, kunde_id').gte('erstellt_am', monISO).lte('erstellt_am', nowISO),
    supabase.from('investments').select('id, kaufpreis, status, meta, aktualisiert_am, erstellt_am, kunde_id'),
    supabase.from('objekt_einreichungen').select('id').gte('erstellt_am', monISO).lte('erstellt_am', nowISO),
    supabase.from('bewerbungen').select('id').gte('erstellt_am', monISO).lte('erstellt_am', nowISO),
    supabase.from('aufgaben').select('id').eq('status', 'offen'),
    supabase.from('aufgaben').select('id').gte('erledigt_am', monISO).lte('erledigt_am', nowISO),
    supabase.from('follow_ups').select('id').lt('faellig_am', nowISO).is('erledigt_am', null),
    supabase.from('profiles').select('id, name, geburtstag'),
    supabase.from('user_roles').select('user_id, role'),
    supabase.from('finanzierungen').select('id').not('phase', 'in', '("abgeschlossen","abgelehnt")'),
    supabase.from('objekte').select('id, wohnungen'),
    supabase.from('kontakte').select('id, meta').gte('aktualisiert_am', monISO).lte('aktualisiert_am', nowISO),
    supabase.from('kontakte').select('id, meta, zustaendig_id, aktualisiert_am').eq('geloescht', false),
    supabase.from('follow_ups').select('id, faellig_am').gte('faellig_am', nextMonISO).lte('faellig_am', nextSunISO).is('erledigt_am', null),
    supabase.from('fristen').select('id, faellig_am, typ').gte('faellig_am', nextMonISO).lte('faellig_am', nextSunISO),
    supabase.from('rechnungen').select('id, brutto_summe').gte('rechnungsdatum', monday.toISOString().slice(0,10)).lte('rechnungsdatum', now.toISOString().slice(0,10)),
    supabase.from('aktivitaeten').select('kunde_id, datum, erledigt_am').order('datum', { ascending: false }),
  ])

  const k = kontakte || []
  const getStufe = (c: any) => (c.meta?.pipelineStufe || '').toLowerCase()
  const neueLeads = k.length
  const qualifizierteLeads = k.filter(c => ['interessent', 'qualifiziert', 'erstgespraech_geplant', 'erstgespraech', 'beratungsgespraech', 'bonitaet', 'objektauswahl', 'follow_up_objekt'].includes(getStufe(c))).length
  const termineBucht = k.filter(c => ['erstgespraech_geplant', 'erstgespraech', 'beratungsgespraech'].includes(getStufe(c))).length
  const reservierungen = k.filter(c => getStufe(c) === 'reservierung').length
  const abschluesse = k.filter(c => ['faelligkeit', 'abgeschlossen'].includes(getStufe(c))).length
  const conversionRate = pct(abschluesse, neueLeads || 1)

  const allInv = investmentsAll || []
  const invStufe = (i: any) => (i.meta?.pipelineStufe || '').toLowerCase()
  const isDone = (s: string) => ['abgeschlossen', 'faelligkeit'].includes(s)
  const isLost = (s: string) => ['verloren', 'archiviert', 'storniert'].includes(s)
  // Pipeline-Wert = alle aktiven Investments (nicht abgeschlossen / verloren)
  const pipelineWert = allInv.filter(i => { const s = invStufe(i); return !isDone(s) && !isLost(s) }).reduce((s, i) => s + (i.kaufpreis || 0), 0)
  // Punkt 5: Umsatz Woche = Investments in dieser Woche auf Abschluss gesetzt
  const umsatzWoche = allInv.filter(i => isDone(invStufe(i)) && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday && new Date(i.aktualisiert_am) <= now).reduce((s, i) => s + (i.kaufpreis || 0), 0)
  // Punkt 1: Provisionen = tatsächlich ausgestellte Rechnungen der Woche (brutto)
  const provisionenWoche = (rechnungenWoche || []).reduce((s: number, r: any) => s + Number(r.brutto_summe || 0), 0)

  // Punkt 4: Stagnierend = aktive Kontakte, letzte Aktivität > 14 Tage (basierend auf aktivitaeten-Tabelle)
  const letzteAktivitaetMap = new Map<string, Date>()
  for (const a of (aktivitaetenLetzte || []) as any[]) {
    if (!a.kunde_id) continue
    const d = a.erledigt_am || a.datum; if (!d) continue
    if (!letzteAktivitaetMap.has(a.kunde_id)) letzteAktivitaetMap.set(a.kunde_id, new Date(d))
  }
  const aktivStufen = ['erstgespraech_geplant', 'erstgespraech', 'beratungsgespraech', 'bonitaet', 'bonitaetsunterlagen', 'objektauswahl', 'follow_up_objekt', 'reservierung', 'finanzierung', 'notar']
  const stagnierendeDeals = (kontakteAlle || []).filter((c: any) => {
    const s = (c.meta?.pipelineStufe || '').toLowerCase()
    if (!aktivStufen.includes(s)) return false
    const last = letzteAktivitaetMap.get(c.id) || (c.aktualisiert_am ? new Date(c.aktualisiert_am) : null)
    return last ? last < twoWeeksAgo : true
  }).length

  const verloreneWoche = (verlorene || []).filter(c => ['verloren', 'archiviert'].includes((c.meta?.pipelineStufe || '').toLowerCase())).length

  // Punkt 2: Top-Berater = meiste Abschlüsse der Woche (Fallback: meiste neue Leads)
  const kontaktZustMap = new Map<string, string>()
  ;(kontakteAlle || []).forEach((c: any) => { if (c.zustaendig_id) kontaktZustMap.set(c.id, c.zustaendig_id) })
  const abschlussCount = new Map<string, number>()
  allInv.filter(i => isDone(invStufe(i)) && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday).forEach(i => {
    const uid = kontaktZustMap.get(i.kunde_id); if (!uid) return
    abschlussCount.set(uid, (abschlussCount.get(uid) || 0) + 1)
  })
  let topBeraterId = ''; let topBeraterAbschluesse = 0
  abschlussCount.forEach((c, id) => { if (c > topBeraterAbschluesse) { topBeraterAbschluesse = c; topBeraterId = id } })
  // Fallback wenn keine Abschlüsse
  let topBeraterLeads = topBeraterAbschluesse
  if (!topBeraterId) {
    const leadCount = new Map<string, number>()
    k.forEach(c => { if (c.zustaendig_id) leadCount.set(c.zustaendig_id, (leadCount.get(c.zustaendig_id) || 0) + 1) })
    leadCount.forEach((c, id) => { if (c > topBeraterLeads) { topBeraterLeads = c; topBeraterId = id } })
  }
  const profMap = new Map((profiles || []).map(p => [p.id, p]))
  const topBerater = (profMap.get(topBeraterId)?.name as string) || '–'

  const vpRoles = new Set(['vertriebspartner', 'setterin', 'vertriebsleiter'])
  const aktiveBerater = new Set((roles || []).filter(r => vpRoles.has(r.role)).map(r => r.user_id)).size

  const a = anrufe || []
  const anrufeGesamt = a.length
  const anrufeErreicht = a.filter(x => x.ergebnis === 'erreicht' || x.ergebnis === 'termin').length
  const erreichbarkeitsRate = pct(anrufeErreicht, anrufeGesamt || 1)

  let reservierteWohnungen = 0; let freieWohnungen = 0
  ;(wohnungenObj || []).forEach((obj: any) => {
    if (Array.isArray(obj.wohnungen)) obj.wohnungen.forEach((w: any) => {
      const s = (w.status || '').toLowerCase()
      if (s === 'reserviert') reservierteWohnungen++
      else if (s === 'frei' || s === 'verfügbar' || s === '') freieWohnungen++
    })
  })

  // Punkt 3: Ausblick — exakt aus kontakte.meta bzw. investments.meta
  const inRange = (iso: string | undefined | null) => {
    if (!iso) return false; const d = new Date(iso); return d >= nextMon && d <= nextSun
  }
  const ausblickErstgespraeche = (kontakteAlle || []).filter((c: any) => inRange(c.meta?.setterTerminDatum)).length
  const ausblickBeratungen = (kontakteAlle || []).filter((c: any) => inRange(c.meta?.beratungsgespraechAm)).length
  const ausblickNotartermine = allInv.filter(i => inRange(i.meta?.notarTermin)).length
  const ausblickFollowUps = (followUpsNext || []).length
  const ausblickFaelligkeiten = (fristenNext || []).filter((f: any) => /kaufpreis|faelligkeit/i.test(f.typ || '')).length

  // Geburtstage nächste Woche
  const isBdayInRange = (dobStr: string | null, from: Date, to: Date) => {
    if (!dobStr) return false
    const dob = new Date(dobStr); const yr = from.getFullYear()
    const b1 = new Date(yr, dob.getMonth(), dob.getDate())
    const b2 = new Date(yr + 1, dob.getMonth(), dob.getDate())
    return (b1 >= from && b1 <= to) || (b2 >= from && b2 <= to)
  }
  const ausblickGeburtstageTeam = (profiles || []).filter(p => isBdayInRange((p as any).geburtstag, nextMon, nextSun)).length
  const ausblickGeburtstageKunden = (kontakteAlle || []).filter((c: any) => isBdayInRange(c.meta?.geburtsdatum, nextMon, nextSun)).length

  const fmtBdayDate = (dobStr: string) => {
    const dob = new Date(dobStr)
    return `${String(dob.getDate()).padStart(2, '0')}.${String(dob.getMonth() + 1).padStart(2, '0')}.`
  }
  const geburtstageTeamListe = (profiles || [])
    .filter(p => isBdayInRange((p as any).geburtstag, nextMon, nextSun))
    .map((p: any) => `${p.name} (${fmtBdayDate(p.geburtstag)})`)
  const geburtstageKundenListe = (kontakteAlle || [])
    .filter((c: any) => isBdayInRange(c.meta?.geburtsdatum, nextMon, nextSun))
    .map((c: any) => {
      const name = [c.meta?.vorname, c.meta?.nachname].filter(Boolean).join(' ') || c.meta?.name || 'Kunde'
      return `${name} (${fmtBdayDate(c.meta.geburtsdatum)})`
    })

  const highlights: string[] = []
  if (abschluesse > 0) highlights.push(`${abschluesse} Abschluss/Abschlüsse diese Woche`)
  if (reservierungen > 0) highlights.push(`${reservierungen} neue Reservierung(en)`)
  if (topBerater !== '–') highlights.push(`Top-Berater: ${topBerater}${topBeraterAbschluesse > 0 ? ` mit ${topBeraterAbschluesse} Abschluss/Abschlüssen` : ` mit ${topBeraterLeads} Leads`}`)
  if (umsatzWoche > 0) highlights.push(`Umsatz der Woche: ${fmtEuro(umsatzWoche)}`)
  if ((einreichungen || []).length > 0) highlights.push(`${(einreichungen || []).length} neue Objekt-Einreichung(en)`)
  if ((bewerbungen || []).length > 0) highlights.push(`${(bewerbungen || []).length} neue Bewerbung(en)`)

  const baseData = {
    neueLeads, qualifizierteLeads, termineBucht, reservierungen, abschluesse, conversionRate,
    pipelineWert: fmtEuro(pipelineWert), pipelineVeraenderung: '',
    umsatzWoche: fmtEuro(umsatzWoche), provisionenWoche: fmtEuro(provisionenWoche),
    offeneFinanzierungen: (finanzierungen || []).length,
    gesamtKontakte: kontakteCount || 0, neueKontakteWoche: neueLeads,
    aktiveBerater, topBerater, topBeraterLeads: topBeraterAbschluesse || topBeraterLeads,
    anrufeGesamt, anrufeErreicht, erreichbarkeitsRate,
    neueEinreichungen: (einreichungen || []).length, reservierteWohnungen, freieWohnungen,
    neueBewerbungen: (bewerbungen || []).length,
    offeneAufgaben: (aufgabenOffen || []).length, erledigteAufgaben: (aufgabenErledigt || []).length,
    ueberfaelligeFollowUps: (followUpsOverdue || []).length,
    stagnierendeDeals, verloreneWoche,
    ausblickErstgespraeche, ausblickBeratungen, ausblickNotartermine,
    ausblickFollowUps, ausblickFaelligkeiten,
    ausblickGeburtstageTeam, ausblickGeburtstageKunden,
    geburtstageTeamListe, geburtstageKundenListe,
    ausblickVonBis: `${fmtDate(nextMon)}–${fmtDate(nextSun)}`,
    highlights,
    zeitraumVon: fmtDate(monday),
    zeitraumBis: fmtDate(now) + now.getFullYear(),
  }

  const today = new Date().toISOString().split('T')[0]
  const targets = testRecipient ? [{ email: testRecipient, name: 'Test' }] : recipients

  let sent = 0
  for (const r of targets) {
    const templateData = { ...baseData, name: r.name || '' }
    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'weekly-ceo-summary',
          recipientEmail: r.email!,
          idempotencyKey: `weekly-ceo-summary-${today}-${r.email}`,
          templateData,
        },
      })
      sent++
    } catch (e) { console.error('Weekly summary failed for', r.email, e) }
  }

  return new Response(JSON.stringify({ success: true, sent, data: baseData }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
