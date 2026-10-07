/**
 * Öffentlich: Wie viele Objekte stehen je Standort im Angebot?
 *
 * Für die Seite „Partner werden“ (/partner-werden). Anonyme Besucher dürfen
 * `objekte` nicht lesen, deshalb zählt diese Function mit der Service-Rolle
 * und gibt NUR die fünf Zahlen heraus: keine Kennungen, keine Adressen, keine
 * Preise. Die Zählregel steht in `_shared/partner-standorte.ts`.
 *
 * Schutz, weil ohne Anmeldung erreichbar: Bremse je IP über
 * `check_rate_limit`, nur GET und POST, und die Antwort darf zehn Minuten im
 * Zwischenspeicher liegen, damit nicht jeder Seitenaufruf zählt.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkEdgeRateLimit, clientIp } from "../_shared/edge-rate-limit.ts";
import { zaehleObjekteJeStandort, type StandortEinheit, type StandortObjekt } from "../_shared/partner-standorte.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

/** Supabase liefert je Abruf höchstens 1000 Zeilen, ohne Fehlermeldung. */
const BLOCK = 1000;
/** Notbremse, damit ein Fehler nicht endlos blättert. */
const MAX_BLOECKE = 30;

function antwort(body: Record<string, unknown>, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return antwort({ error: "Nur GET oder POST" }, 405);

  try {
    const rl = await checkEdgeRateLimit({ scope: "partner-standorte", key: clientIp(req), perHour: 120, perDay: 600 });
    if (rl.exceeded) {
      return antwort({ error: "rate_limited" }, 429, { "Retry-After": String(rl.retryAfterSeconds ?? 3600) });
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    const { data: objekte, error: objFehler } = await admin
      .from("objekte")
      .select("id, ort, adresse, sichtbar")
      .eq("sichtbar", true)
      .limit(5000);
    if (objFehler) throw objFehler;

    // Aus dem Investagon-Datensatz nur die drei Felder, nach denen entschieden wird.
    const einheiten: StandortEinheit[] = [];
    for (let block = 0; block < MAX_BLOECKE; block++) {
      const { data, error } = await admin
        .from("wohnungen")
        .select("objekt_id, status, active:meta->investagonRaw->active, visibility:meta->investagonRaw->visibility, draft:meta->investagonRaw->draft")
        .order("id")
        .range(block * BLOCK, block * BLOCK + BLOCK - 1);
      if (error) throw error;
      for (const w of (data ?? []) as Array<Record<string, unknown>>) {
        einheiten.push({
          objekt_id: String(w.objekt_id),
          status: typeof w.status === "string" ? w.status : null,
          roh: { active: w.active, visibility: w.visibility, draft: w.draft },
        });
      }
      if (!data || data.length < BLOCK) break;
    }

    const standorte = zaehleObjekteJeStandort((objekte ?? []) as StandortObjekt[], einheiten);
    return antwort({ standorte, stand: new Date().toISOString() }, 200, { "Cache-Control": "public, max-age=600" });
  } catch (e) {
    // Kein Fehlertext nach draußen, nur ins Protokoll. Die Seite zeigt dann keine Zahl.
    console.error("[partner-standorte] Fehler", e);
    return antwort({ error: "nicht_verfuegbar" }, 500);
  }
});
