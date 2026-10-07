// deno-lint-ignore-file no-explicit-any
// Sync-Job Marktanalyse Phase 3.2: Bodenrichtwerte aus BORIS-D (Gutachterausschüsse je Bundesland).
// Jedes Bundesland betreibt eine eigene WFS/REST-Schnittstelle; Endpunkte sind unten registriert.
// Bei nicht erreichbaren Endpunkten fallen wir auf einen Heuristik-Schätzwert aus dem
// Kaufpreis-Median zurück (Quelle "bbsr_heuristik"), damit die Karten immer einen Wert zeigen.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Öffentliche BORIS-Portale je Bundesland (Stand 2026). Alle unter freier Lizenz (dl-de/by-2-0
// oder gleichwertig). WFS-Layer heißen bundesland-abhängig unterschiedlich — Registry hier zentral.
const BORIS_REGISTRY: Record<string, { portal: string; wfs?: string; layer?: string }> = {
  "Baden-Württemberg": { portal: "https://www.gutachterausschuesse-bw.de", wfs: "https://owsproxy.lgl-bw.de/owsproxy/ows/WFS_LGL-BW_Bodenrichtwerte", layer: "bodenrichtwert" },
  "Bayern": { portal: "https://www.immo.bayern.de", wfs: "https://geoservices.bayern.de/wms/v2/ogc_boris.cgi", layer: "bodenrichtwert" },
  "Berlin": { portal: "https://fbinter.stadt-berlin.de/boris", wfs: "https://fbinter.stadt-berlin.de/fb/wfs/data/senstadt/s_boris", layer: "s_boris" },
  "Brandenburg": { portal: "https://boris.brandenburg.de" },
  "Bremen": { portal: "https://www.boris.bremen.de" },
  "Hamburg": { portal: "https://www.boris.hamburg.de", wfs: "https://geodienste.hamburg.de/HH_WFS_Bodenrichtwerte_Baulanduebersicht", layer: "bodenrichtwerte" },
  "Hessen": { portal: "https://www.boris.hessen.de" },
  "Mecklenburg-Vorpommern": { portal: "https://www.laiv-mv.de/Vermessung/BORIS-MV/" },
  "Niedersachsen": { portal: "https://www.grundstuecksmarkt.niedersachsen.de" },
  "Nordrhein-Westfalen": { portal: "https://www.boris.nrw.de", wfs: "https://www.wms.nrw.de/geobasis/wfs_nw_boris", layer: "brw" },
  "Rheinland-Pfalz": { portal: "https://www.boris.rlp.de" },
  "Saarland": { portal: "https://geoportal.saarland.de/mapbender/boris" },
  "Sachsen": { portal: "https://www.boris.sachsen.de" },
  "Sachsen-Anhalt": { portal: "https://www.lvermgeo.sachsen-anhalt.de/de/geodaten_boris.html" },
  "Schleswig-Holstein": { portal: "https://danord.gdi-sh.de" },
  "Thüringen": { portal: "https://www.geoportal-th.de/boris" },
};

interface SyncBody {
  ags?: string[];
  limit?: number;
  dryRun?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(url, serviceKey);

    // Auth: Admin/Inhaber
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: userData } = await supa.auth.getUser(jwt);
    const uid = userData.user?.id;
    if (!uid) return json({ error: "Nicht angemeldet" }, 401);
    const { data: rolesData } = await supa.from("user_roles").select("role").eq("user_id", uid);
    const roles = (rolesData ?? []).map((r: any) => r.role);
    if (!roles.includes("admin") && !roles.includes("inhaber")) {
      return json({ error: "Nur Admin/Inhaber dürfen syncen" }, 403);
    }

    const body: SyncBody = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    let q = supa.from("standorte").select("id, ags, name, bundesland, lat, lng").order("einwohner", { ascending: false, nullsFirst: false });
    if (body.ags?.length) q = q.in("ags", body.ags);
    if (body.limit) q = q.limit(body.limit);
    const { data: standorte, error: sErr } = await q;
    if (sErr) throw sErr;

    const stats = {
      standorte_verarbeitet: 0,
      kennzahlen_upserted: 0,
      wfs_erfolg: 0,
      heuristik: 0,
      errors: [] as string[],
      per_bundesland: {} as Record<string, number>,
    };
    const heute = new Date().toISOString().slice(0, 10);

    for (const s of standorte ?? []) {
      stats.standorte_verarbeitet++;
      const reg = BORIS_REGISTRY[s.bundesland];
      let brw: number | null = null;
      let quelle: "boris" | "bbsr_heuristik" = "boris";
      let quellen_url = reg?.portal;

      if (reg?.wfs && s.lat && s.lng) {
        try {
          brw = await queryWfsBodenrichtwert(reg.wfs, reg.layer!, Number(s.lat), Number(s.lng));
          if (brw != null) stats.wfs_erfolg++;
        } catch (e) {
          stats.errors.push(`${s.name} WFS: ${(e as Error).message}`);
        }
      }

      if (brw == null) {
        // Heuristik: BRW ≈ 30-40 % des Kaufpreises/m² Wohnung. Nutze letzte Kennzahl falls vorhanden.
        const { data: kp } = await supa
          .from("standort_kennzahlen")
          .select("wert")
          .eq("standort_id", s.id)
          .eq("kennzahl", "kaufpreis_qm_wohnung")
          .order("stand", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (kp?.wert) {
          brw = Math.round(Number(kp.wert) * 0.35);
          quelle = "bbsr_heuristik";
          stats.heuristik++;
        }
      }

      if (brw == null || body.dryRun) continue;

      const { error } = await supa.from("standort_kennzahlen").upsert(
        {
          standort_id: s.id,
          kennzahl: "bodenrichtwert_eur_qm",
          wert: brw,
          einheit: "€/m²",
          stand: heute,
          quelle_id: quelle,
          meta: { bundesland: s.bundesland, portal: quellen_url, methode: quelle === "boris" ? "wfs" : "kaufpreis_x_0.35" },
        },
        { onConflict: "standort_id,kennzahl,stand" },
      );
      if (error) stats.errors.push(`${s.name}: ${error.message}`);
      else {
        stats.kennzahlen_upserted++;
        stats.per_bundesland[s.bundesland] = (stats.per_bundesland[s.bundesland] ?? 0) + 1;
      }
    }

    return json({ ok: true, quelle: "boris", stand: heute, ...stats });
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

// Minimal-WFS-GetFeature um lat/lng (BBOX ±0.002°, ~200m). Parst ersten BODENRICHTWERT-Wert
// aus der GML/JSON-Antwort. Nicht jedes Bundesland liefert GeoJSON, deshalb Regex-Fallback.
async function queryWfsBodenrichtwert(wfsBase: string, layer: string, lat: number, lng: number): Promise<number | null> {
  const bbox = `${lng - 0.002},${lat - 0.002},${lng + 0.002},${lat + 0.002},EPSG:4326`;
  const url = `${wfsBase}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(layer)}&bbox=${bbox}&outputFormat=application/json&count=5`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return null;
    const txt = await r.text();
    // Erst JSON versuchen
    try {
      const j = JSON.parse(txt);
      const feat = j.features?.[0];
      if (feat?.properties) {
        for (const [k, v] of Object.entries(feat.properties)) {
          if (/brw|bodenrichtwert|wert/i.test(k) && typeof v === "number" && v > 0) return v;
          if (/brw|bodenrichtwert|wert/i.test(k) && typeof v === "string") {
            const n = Number(v.replace(",", "."));
            if (Number.isFinite(n) && n > 0) return n;
          }
        }
      }
    } catch {
      // GML/XML: heuristischer Regex
      const m = txt.match(/<[^>]*(?:BRW|BODENRICHTWERT|Wert)[^>]*>\s*(\d+[.,]?\d*)/i);
      if (m) {
        const n = Number(m[1].replace(",", "."));
        if (Number.isFinite(n) && n > 0) return n;
      }
    }
    return null;
  } finally {
    clearTimeout(t);
  }
}