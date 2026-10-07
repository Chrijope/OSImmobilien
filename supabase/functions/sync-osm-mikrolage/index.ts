// deno-lint-ignore-file no-explicit-any
// Sync-Job Marktanalyse Phase 2: Mikrolage-POIs via OpenStreetMap Overpass API.
// Zählt Kitas, Schulen, Ärzte, Supermärkte, ÖPNV-Stops im 2 km Umkreis
// eines Standorts und speichert Kennzahlen (Quelle: OSM/ODbL).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const RADIUS_M = 2000;

// OSM-Kategorien → Kennzahl-Name
const CATEGORIES: { kennzahl: string; overpass: string }[] = [
  { kennzahl: "poi_kitas", overpass: '["amenity"="kindergarten"]' },
  { kennzahl: "poi_schulen", overpass: '["amenity"="school"]' },
  { kennzahl: "poi_aerzte", overpass: '["amenity"~"doctors|clinic|hospital"]' },
  { kennzahl: "poi_supermaerkte", overpass: '["shop"~"supermarket|convenience"]' },
  { kennzahl: "poi_oepnv", overpass: '["public_transport"="stop_position"]' },
  { kennzahl: "poi_apotheken", overpass: '["amenity"="pharmacy"]' },
  { kennzahl: "poi_restaurants", overpass: '["amenity"~"restaurant|cafe|bar"]' },
];

interface Body {
  standort_id?: string;
  ags?: string;
  limit?: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(url, serviceKey);

    // Auth
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: userData } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    const uid = userData.user?.id;
    if (!uid) return json({ error: "Nicht angemeldet" }, 401);
    const { data: rolesData } = await supa.from("user_roles").select("role").eq("user_id", uid);
    const roles = (rolesData ?? []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("inhaber")) {
      return json({ error: "Nur Admin/Inhaber dürfen syncen" }, 403);
    }

    const body: Body = req.method === "POST" ? await req.json().catch(() => ({})) : {};

    // Zielmenge bestimmen
    let q = supa.from("standorte").select("id, ags, name, lat, lng");
    if (body.standort_id) q = q.eq("id", body.standort_id);
    else if (body.ags) q = q.eq("ags", body.ags);
    if (body.limit) q = q.limit(body.limit);
    const { data: standorte, error } = await q;
    if (error) return json({ error: error.message }, 500);

    const stats = { standorte: 0, kennzahlen: 0, errors: [] as string[] };
    const heute = new Date().toISOString().slice(0, 10);

    for (const s of standorte ?? []) {
      if (s.lat == null || s.lng == null) {
        stats.errors.push(`${s.name}: keine Koordinaten`);
        continue;
      }
      try {
        const counts = await fetchOverpassCounts(Number(s.lat), Number(s.lng));
        for (const [kennzahl, wert] of Object.entries(counts)) {
          const { error: upErr } = await supa.from("standort_kennzahlen").upsert(
            {
              standort_id: s.id,
              kennzahl,
              wert,
              einheit: "Anzahl",
              stand: heute,
              quelle_id: "osm",
              meta: { radius_m: RADIUS_M },
            },
            { onConflict: "standort_id,kennzahl,stand" },
          );
          if (upErr) stats.errors.push(`${s.name} ${kennzahl}: ${upErr.message}`);
          else stats.kennzahlen++;
        }
        stats.standorte++;
        // Overpass fair-use: 1 Request/Sekunde
        await sleep(1100);
      } catch (e) {
        stats.errors.push(`${s.name}: ${(e as Error).message}`);
      }
    }

    return json({ ok: true, quelle: "osm", radius_m: RADIUS_M, ...stats });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchOverpassCounts(lat: number, lng: number): Promise<Record<string, number>> {
  const parts = CATEGORIES.map(
    (c, i) => `node${c.overpass}(around:${RADIUS_M},${lat},${lng})->.cat${i};`,
  ).join("\n");
  const outStmts = CATEGORIES.map((_, i) => `.cat${i} out count;`).join("\n");
  const query = `[out:json][timeout:25];\n${parts}\n${outStmts}`;

  const r = await fetch(OVERPASS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "data=" + encodeURIComponent(query),
  });
  if (!r.ok) throw new Error(`Overpass HTTP ${r.status}`);
  const j = await r.json();
  const counts: Record<string, number> = {};
  const elements: any[] = j.elements ?? [];
  // Overpass "out count" liefert je Set ein Element mit tags.total
  elements.forEach((el, idx) => {
    const cat = CATEGORIES[idx];
    if (!cat) return;
    const total = Number(el?.tags?.total ?? el?.tags?.nodes ?? 0);
    counts[cat.kennzahl] = Number.isFinite(total) ? total : 0;
  });
  return counts;
}
