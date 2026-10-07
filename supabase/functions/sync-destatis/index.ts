// deno-lint-ignore-file no-explicit-any
// Sync-Job Marktanalyse Phase 2: Kreisstädte-Basisdaten aus GENESIS-Online (Destatis)
// Läuft manuell (Admin-Trigger) oder per Cron. Idempotent (upsert per AGS + Kennzahl+Stand).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { KREISSTAEDTE_SEED } from "../_shared/marktanalyse-kreisstaedte.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GENESIS_BASE = "https://www-genesis.destatis.de/genesisWS/rest/2020";

interface SyncBody {
  ags?: string[]; // optional: nur diese AGS syncen (sonst alle Seeds)
  dryRun?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(url, serviceKey);

    // Auth-Check: nur Admin/Inhaber
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
    const targets = body.ags?.length
      ? KREISSTAEDTE_SEED.filter((k) => body.ags!.includes(k.ags))
      : KREISSTAEDTE_SEED;

    const stats = { standorte_upserted: 0, kennzahlen_upserted: 0, errors: [] as string[] };
    // Neue Destatis-API unterstützt Token-Auth: username=<token>, password leer.
    // Legacy: username + password.
    const token = Deno.env.get("DESTATIS_GENESIS_TOKEN") ?? "";
    const genesisUser = token || (Deno.env.get("DESTATIS_GENESIS_USER") ?? "");
    const genesisPass = token ? "" : (Deno.env.get("DESTATIS_GENESIS_PASS") ?? "");
    const hasCreds = !!genesisUser;
    const heute = new Date().toISOString().slice(0, 10);

    for (const k of targets) {
      // 1) Standort upserten
      const { data: standort, error: stErr } = await supa
        .from("standorte")
        .upsert(
          {
            ags: k.ags,
            name: k.name,
            bundesland: k.bundesland,
            kreis: k.kreis ?? null,
            typ: "kreisstadt",
            lat: k.lat,
            lng: k.lng,
            uni_stadt: k.uni_stadt ?? false,
            last_sync_at: new Date().toISOString(),
          },
          { onConflict: "ags" },
        )
        .select("id")
        .single();
      if (stErr) {
        stats.errors.push(`${k.ags} ${k.name}: ${stErr.message}`);
        continue;
      }
      stats.standorte_upserted++;
      if (body.dryRun) continue;

      // 2) Kennzahlen von GENESIS-Online holen (falls Credentials/Token vorhanden)
      if (hasCreds) {
        try {
          const kennzahlen = await fetchDestatisKennzahlen(k.ags, genesisUser, genesisPass);
          for (const kz of kennzahlen) {
            const { error } = await supa.from("standort_kennzahlen").upsert(
              {
                standort_id: standort.id,
                kennzahl: kz.kennzahl,
                wert: kz.wert,
                einheit: kz.einheit,
                stand: kz.stand ?? heute,
                quelle_id: "destatis",
                meta: kz.meta ?? {},
              },
              { onConflict: "standort_id,kennzahl,stand" },
            );
            if (error) stats.errors.push(`${k.name} ${kz.kennzahl}: ${error.message}`);
            else stats.kennzahlen_upserted++;
          }
        } catch (e) {
          stats.errors.push(`${k.name}: ${(e as Error).message}`);
        }
      }
    }

    return json({
      ok: true,
      quelle: "destatis",
      stand: heute,
      genesis_credentials_present: hasCreds,
      auth_mode: token ? "token" : (genesisUser ? "user_pass" : "none"),
      ...stats,
    });
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

interface DestatisKennzahl {
  kennzahl: string;
  wert: number;
  einheit: string;
  stand?: string;
  meta?: Record<string, unknown>;
}

// Holt Kernkennzahlen für einen Kreis/eine kreisfreie Stadt.
// GENESIS-Tabellen: 12411-01-01-4 (Bevölkerung), 13211-01-01-4 (Arbeitslosenquote),
// 82111-01-01-4 (BIP). Da die Tabellen-IDs regelmäßig wechseln, bleibt diese
// Funktion bewusst schlank & fehlertolerant.
async function fetchDestatisKennzahlen(
  ags: string,
  user: string,
  pass: string,
): Promise<DestatisKennzahl[]> {
  const out: DestatisKennzahl[] = [];
  const params = (name: string) =>
    `?username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}&name=${name}&area=all&language=de`;

  // Bevölkerung insgesamt (12411-0015)
  try {
    const r = await fetch(`${GENESIS_BASE}/data/tablefile${params("12411-0015")}&regionalschluessel=${ags}`);
    if (r.ok) {
      const txt = await r.text();
      const einwohner = parseSingleValue(txt);
      if (einwohner != null) {
        out.push({ kennzahl: "einwohner", wert: einwohner, einheit: "Personen", meta: { table: "12411-0015" } });
      }
    }
  } catch { /* ignore */ }

  // Arbeitslosenquote (13211-0003)
  try {
    const r = await fetch(`${GENESIS_BASE}/data/tablefile${params("13211-0003")}&regionalschluessel=${ags}`);
    if (r.ok) {
      const txt = await r.text();
      const alq = parseSingleValue(txt);
      if (alq != null) {
        out.push({ kennzahl: "arbeitslosenquote_pct", wert: alq, einheit: "%", meta: { table: "13211-0003" } });
      }
    }
  } catch { /* ignore */ }

  return out;
}

// GENESIS liefert CSV-artige Tabellen. Wir extrahieren den ersten numerischen Wert
// aus der letzten Datenzeile. Für Phase 2 reicht das; Phase 3 baut robusten Parser.
function parseSingleValue(csv: string): number | null {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim() && !l.startsWith("#"));
  for (let i = lines.length - 1; i >= 0; i--) {
    const cells = lines[i].split(";").map((c) => c.replace(/"/g, "").trim());
    for (let j = cells.length - 1; j >= 0; j--) {
      const num = Number(cells[j].replace(/\./g, "").replace(",", "."));
      if (Number.isFinite(num) && num > 0) return num;
    }
  }
  return null;
}
