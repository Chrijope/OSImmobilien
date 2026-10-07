// Nur lesender Zugriff auf kennzahlen_tagesstand fuer das lokale Jarvis-Skript.
// Absicherung ueber den Header x-jarvis-token (Secret JARVIS_KENNZAHLEN_TOKEN).
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'x-jarvis-token, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

// Zeitkonstanter Vergleich ueber SHA-256-Hashes (gleiche Laenge)
async function gleich(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(ha), y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}

type Zeile = { stichtag: string; bereich: string; kennzahl: string; wert: number | string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'GET') return json({ error: 'Nur GET' }, 405)

  const secret = Deno.env.get('JARVIS_KENNZAHLEN_TOKEN') ?? ''
  const token = req.headers.get('x-jarvis-token') ?? ''
  if (!secret || !token || !(await gleich(token, secret))) {
    return json({ error: 'Nicht autorisiert' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Juengster Stichtag
  const { data: neu, error: e1 } = await supabase
    .from('kennzahlen_tagesstand').select('stichtag')
    .order('stichtag', { ascending: false }).limit(1)
  if (e1) return json({ error: 'Lesefehler' }, 500)
  if (!neu?.length) return json([])
  const heute = neu[0].stichtag as string
  const ziel = new Date(heute + 'T00:00:00Z')
  ziel.setUTCDate(ziel.getUTCDate() - 7)
  const zielStr = ziel.toISOString().slice(0, 10)
  // Fenster: 60 Tage vor dem Zielstichtag bis heute, um den naechstaelteren Wert zu finden
  const fenster = new Date(ziel); fenster.setUTCDate(fenster.getUTCDate() - 60)

  const zeilen: Zeile[] = []
  for (let von = 0; ; von += 1000) {
    const { data, error } = await supabase
      .from('kennzahlen_tagesstand').select('stichtag, bereich, kennzahl, wert')
      .gte('stichtag', fenster.toISOString().slice(0, 10)).lte('stichtag', heute)
      .order('stichtag', { ascending: false }).range(von, von + 999)
    if (error) return json({ error: 'Lesefehler' }, 500)
    zeilen.push(...(data as Zeile[]))
    if (!data || data.length < 1000) break
  }

  const gruppen = new Map<string, Zeile[]>()
  for (const z of zeilen) {
    const k = `${z.bereich}|${z.kennzahl}`
    if (!gruppen.has(k)) gruppen.set(k, [])
    gruppen.get(k)!.push(z) // bereits absteigend nach Stichtag
  }

  const ergebnis = []
  for (const liste of gruppen.values()) {
    const h = liste.find((z) => z.stichtag === heute)
    if (!h) continue
    const v = liste.find((z) => z.stichtag <= zielStr)
    const wh = h.wert === null ? null : Number(h.wert)
    const wv = v?.wert == null ? null : Number(v.wert)
    ergebnis.push({
      bereich: h.bereich,
      kennzahl: h.kennzahl,
      stichtag_heute: heute,
      wert_heute: wh,
      stichtag_vorwoche: v?.stichtag ?? null,
      wert_vorwoche: wv,
      veraenderung: wh !== null && wv !== null ? wh - wv : null,
    })
  }
  ergebnis.sort((a, b) => a.bereich.localeCompare(b.bereich) || a.kennzahl.localeCompare(b.kennzahl))
  return json(ergebnis)
})
