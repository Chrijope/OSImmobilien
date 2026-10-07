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
  const abgewiesen = automatikSchutz(req, 'send-weekly-vp-summary', corsHeaders)
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
      else console.warn('send-weekly-vp-summary: testRecipient ohne Service-Key, ignoriert')
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
  const today = now.toISOString().split('T')[0]

  const nextMon = new Date(monday); nextMon.setDate(monday.getDate() + 7)
  const nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 7)
  const nextMonISO = nextMon.toISOString(); const nextSunISO = nextSun.toISOString()
  const twoWeeksAgo = new Date(now); twoWeeksAgo.setDate(now.getDate() - 14)

  // Empfänger: vertriebspartner + vertriebsleiter
  const vpRoles = ['vertriebspartner', 'vertriebsleiter']
  const { data: roles } = await supabase.from('user_roles').select('user_id, role').in('role', vpRoles)
  if (!roles?.length) return new Response(JSON.stringify({ success: true, sent: 0 }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const vpUserIds = [...new Set(roles.map(r => r.user_id))]
  const { data: profiles } = await supabase.from('profiles').select('id, name, email').in('id', vpUserIds)
  const profileMap = new Map((profiles || []).map(p => [p.id, p]))

  const [
    { data: allKontakte }, { data: allInvestments },
    { data: aufgabenOffen }, { data: aufgabenErledigt }, { data: followUpsOverdue },
    { data: followUpsNext }, { data: fristenNext },
    { data: rechnungenWoche }, { data: aktivitaetenAll },
  ] = await Promise.all([
    supabase.from('kontakte').select('id, meta, zustaendig_id, kaufpreis, aktualisiert_am, erstellt_am').eq('geloescht', false),
    supabase.from('investments').select('id, kaufpreis, status, meta, aktualisiert_am, erstellt_am, kunde_id'),
    supabase.from('aufgaben').select('id, benutzer_id, zugewiesen_an').eq('status', 'offen'),
    supabase.from('aufgaben').select('id, benutzer_id, zugewiesen_an').gte('erledigt_am', monISO).lte('erledigt_am', nowISO),
    supabase.from('follow_ups').select('id, benutzer_id, berater').lt('faellig_am', nowISO).is('erledigt_am', null),
    supabase.from('follow_ups').select('id, benutzer_id, berater').gte('faellig_am', nextMonISO).lte('faellig_am', nextSunISO).is('erledigt_am', null),
    supabase.from('fristen').select('id, faellig_am, typ, meta').gte('faellig_am', nextMonISO).lte('faellig_am', nextSunISO),
    supabase.from('rechnungen').select('id, brutto_summe, user_id').gte('rechnungsdatum', monday.toISOString().slice(0,10)).lte('rechnungsdatum', now.toISOString().slice(0,10)),
    supabase.from('aktivitaeten').select('kunde_id, datum, erledigt_am').order('datum', { ascending: false }),
  ])

  const kAll = allKontakte || []; const invAll = allInvestments || []
  const invStufe = (i: any) => (i.meta?.pipelineStufe || '').toLowerCase()
  const isDone = (s: string) => ['abgeschlossen', 'faelligkeit'].includes(s)
  const isLost = (s: string) => ['verloren', 'archiviert', 'storniert'].includes(s)

  // Letzte Aktivität pro Kontakt (für Stagnations-Erkennung)
  const letzteAktMap = new Map<string, Date>()
  for (const a of (aktivitaetenAll || []) as any[]) {
    if (!a.kunde_id) continue
    const d = a.erledigt_am || a.datum; if (!d) continue
    if (!letzteAktMap.has(a.kunde_id)) letzteAktMap.set(a.kunde_id, new Date(d))
  }
  const aktivStufen = ['erstgespraech_geplant', 'erstgespraech', 'beratungsgespraech', 'bonitaet', 'bonitaetsunterlagen', 'objektauswahl', 'follow_up_objekt', 'reservierung', 'finanzierung', 'notar']

  // Ranking: Abschlüsse Woche > Reservierungen Woche > neue Leads
  const zustMap = new Map<string, string>()
  kAll.forEach(c => { if (c.zustaendig_id) zustMap.set(c.id, c.zustaendig_id) })
  const scoreByUser = new Map<string, number>()
  for (const uid of vpUserIds) {
    const myInvWeekDone = invAll.filter(i => zustMap.get(i.kunde_id) === uid && isDone(invStufe(i)) && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday).length
    const myInvWeekRes = invAll.filter(i => zustMap.get(i.kunde_id) === uid && invStufe(i) === 'reservierung' && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday).length
    const myLeadsWeek = kAll.filter(c => c.zustaendig_id === uid && c.erstellt_am && new Date(c.erstellt_am) >= monday).length
    scoreByUser.set(uid, myInvWeekDone * 1000 + myInvWeekRes * 100 + myLeadsWeek)
  }
  const ranked = [...scoreByUser.entries()].sort((a, b) => b[1] - a[1]).map(([uid]) => uid)
  const teamGroesse = vpUserIds.length

  let sent = 0
  for (const userId of vpUserIds) {
    const profile = profileMap.get(userId)
    if (!profile?.email) continue
    const email = testRecipient || profile.email
    const firstName = profile.name?.split(' ')[0] || profile.name || 'Partner'

    const myLeadsWeek = kAll.filter(c => c.zustaendig_id === userId && c.erstellt_am && new Date(c.erstellt_am) >= monday)
    const getStufe = (c: any) => (c.meta?.pipelineStufe || '').toLowerCase()
    const neueLeads = myLeadsWeek.length
    const qualifizierteLeads = myLeadsWeek.filter(c => ['interessent', 'qualifiziert', 'erstgespraech_geplant', 'erstgespraech', 'beratungsgespraech', 'bonitaet', 'objektauswahl', 'follow_up_objekt'].includes(getStufe(c))).length
    const termineBucht = myLeadsWeek.filter(c => ['erstgespraech_geplant', 'erstgespraech', 'beratungsgespraech'].includes(getStufe(c))).length

    // Alle eigenen Kontakte für Pipeline-Sicht
    const myAllKontaktIds = new Set(kAll.filter(c => c.zustaendig_id === userId).map(c => c.id))
    const myInv = invAll.filter(i => myAllKontaktIds.has(i.kunde_id))
    const pipelineWert = myInv.filter(i => { const s = invStufe(i); return !isDone(s) && !isLost(s) }).reduce((s, i) => s + (i.kaufpreis || 0), 0)
    // Punkt 5: Umsatz Woche = eigene Investments diese Woche auf Abschluss
    const umsatzWoche = myInv.filter(i => isDone(invStufe(i)) && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday).reduce((s, i) => s + (i.kaufpreis || 0), 0)
    // Punkt 2: Abschlüsse basierend auf Investments (nicht neue Leads)
    const abschluesse = myInv.filter(i => isDone(invStufe(i)) && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday).length
    const reservierungen = myInv.filter(i => invStufe(i) === 'reservierung' && i.aktualisiert_am && new Date(i.aktualisiert_am) >= monday).length
    const conversionRate = pct(abschluesse, neueLeads || 1)
    // Punkt 1: Provisionen = tatsächliche eigene Rechnungen der Woche
    const provisionenWoche = (rechnungenWoche || []).filter((r: any) => r.user_id === userId).reduce((s: number, r: any) => s + Number(r.brutto_summe || 0), 0)

    // Pipeline-Health
    const myAllKontakte = kAll.filter(c => c.zustaendig_id === userId)
    const heisseDeals = myAllKontakte.filter(c => ['reservierung', 'finanzierung', 'notar', 'faelligkeit'].includes(getStufe(c))).length
    // Punkt 4: Stagnierend über Aktivitäten
    const stagnierendeDeals = myAllKontakte.filter(c => {
      const s = getStufe(c); if (!aktivStufen.includes(s)) return false
      const last = letzteAktMap.get(c.id) || (c.aktualisiert_am ? new Date(c.aktualisiert_am) : null)
      return last ? last < twoWeeksAgo : true
    }).length
    const offeneBonitaet = myAllKontakte.filter(c => ['bonitaet', 'bonitaetsunterlagen'].includes(getStufe(c))).length

    const myAufgabenOffen = (aufgabenOffen || []).filter(a => a.benutzer_id === userId || a.zugewiesen_an === userId).length
    const myAufgabenErledigt = (aufgabenErledigt || []).filter(a => a.benutzer_id === userId || a.zugewiesen_an === userId).length
    const myFollowUpsOverdue = (followUpsOverdue || []).filter(f => f.benutzer_id === userId || f.berater === userId).length

    // Punkt 3: Ausblick exakt aus meta-Feldern
    const inRange = (iso: string | undefined | null) => {
      if (!iso) return false; const d = new Date(iso); return d >= nextMon && d <= nextSun
    }
    const ausblickErstgespraeche = myAllKontakte.filter(c => inRange(c.meta?.setterTerminDatum)).length
    const ausblickBeratungen = myAllKontakte.filter(c => inRange(c.meta?.beratungsgespraechAm)).length
    const ausblickNotartermine = myInv.filter(i => inRange(i.meta?.notarTermin)).length
    const ausblickFollowUps = (followUpsNext || []).filter(f => f.benutzer_id === userId || f.berater === userId).length

    const isBdayInRange = (dobStr: string | null, from: Date, to: Date) => {
      if (!dobStr) return false
      const dob = new Date(dobStr); const yr = from.getFullYear()
      const b1 = new Date(yr, dob.getMonth(), dob.getDate()); const b2 = new Date(yr + 1, dob.getMonth(), dob.getDate())
      return (b1 >= from && b1 <= to) || (b2 >= from && b2 <= to)
    }
    const ausblickGeburtstageKunden = myAllKontakte.filter(c => isBdayInRange((c as any).meta?.geburtsdatum, nextMon, nextSun)).length

    const rangPosition = ranked.indexOf(userId) + 1

    const highlights: string[] = []
    if (abschluesse > 0) highlights.push(`${abschluesse} Abschluss/Abschlüsse diese Woche 🎉`)
    if (reservierungen > 0) highlights.push(`${reservierungen} neue Reservierung(en)`)
    if (qualifizierteLeads > 0) highlights.push(`${qualifizierteLeads} Leads qualifiziert`)
    if (umsatzWoche > 0) highlights.push(`Umsatz: ${fmtEuro(umsatzWoche)}`)
    if (myAufgabenErledigt > 0) highlights.push(`${myAufgabenErledigt} Aufgaben erledigt ✅`)
    if (rangPosition > 0 && rangPosition <= 3) highlights.push(`Top ${rangPosition} im Team-Ranking 🏆`)

    const templateData = {
      name: firstName,
      neueLeads, qualifizierteLeads, termineBucht, reservierungen, abschluesse, conversionRate,
      pipelineWert: fmtEuro(pipelineWert), umsatzWoche: fmtEuro(umsatzWoche), provisionenWoche: fmtEuro(provisionenWoche),
      offeneAufgaben: myAufgabenOffen, erledigteAufgaben: myAufgabenErledigt, ueberfaelligeFollowUps: myFollowUpsOverdue,
      highlights,
      zeitraumVon: fmtDate(monday), zeitraumBis: fmtDate(now) + now.getFullYear(),
      rangPosition, teamGroesse,
      stagnierendeDeals, heisseDeals, offeneBonitaet,
      ausblickErstgespraeche, ausblickBeratungen, ausblickNotartermine, ausblickFollowUps, ausblickGeburtstageKunden,
      ausblickVonBis: `${fmtDate(nextMon)}–${fmtDate(nextSun)}`,
    }

    try {
      await supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'weekly-vp-summary',
          recipientEmail: email,
          idempotencyKey: `weekly-vp-summary-${today}-${userId}`,
          templateData,
        },
      })
      sent++
    } catch (e) { console.error('VP summary failed for', email, e) }

    if (testRecipient) break
  }

  return new Response(JSON.stringify({ success: true, sent }), {
    status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
