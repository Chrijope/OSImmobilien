import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  getClientIp,
  logWebhook,
  type SignatureStatus,
} from "../_shared/webhook-audit.ts";

/**
 * Investagon meldet Aenderungen, wir nehmen sie entgegen.
 *
 * Investagon ruft die bei `POST /api/webhook_callbacks/put_token` hinterlegte
 * Adresse auf und schickt:
 *
 *   { "event": "properties_updates",
 *     "data": { "userId": "...", "reservationId": "...",
 *               "properties": ["..."], "parking_spots": ["..."] } }
 *
 * Diese Funktion schreibt selbst nichts in Objekte oder Wohnungen. Sie legt
 * jede Meldung nur in `investagon_sync_queue` ab und stoesst die Verarbeitung
 * an. Den eigentlichen Abgleich macht `investagon-import`, also derselbe Weg
 * wie beim vollen Lauf. Zwei Importwege waeren zwei Wahrheiten.
 *
 * Die Antwort kommt sofort, noch vor dem Abgleich: Investagon wartet sonst
 * unnoetig, und eine Zeitueberschreitung auf deren Seite wuerde die Meldung
 * verlieren. Verloren geht hier nichts mehr, sobald die Zeile steht.
 *
 * Anmeldung: der bei der Registrierung vergebene Token. Investagon liefert
 * ihn je nach Aufbau als Kopfzeile oder im Rumpf, deshalb werden mehrere
 * Stellen geprueft. Er wird zeichenweise in fester Zeit verglichen.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-investagon-secret, x-investagon-token, token, x-webhook-signature, x-webhook-timestamp",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

/** Der bei Investagon hinterlegte Rueckruf-Token. */
const CALLBACK_TOKEN = (Deno.env.get("INVESTAGON_CALLBACK_TOKEN") || "").trim();
/** Altbestand: dasselbe Geheimnis unter dem frueheren Namen. */
const ALT_SECRET = (Deno.env.get("INVESTAGON_WEBHOOK_SECRET") || "").trim();

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Vergleich in fester Zeit, damit der Token nicht erraten werden kann. */
function gleich(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function tokenAusAnfrage(req: Request, body: Record<string, unknown>): string {
  const kopf = req.headers.get("x-investagon-token") ||
    req.headers.get("x-investagon-secret") ||
    req.headers.get("token") ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (kopf?.trim()) return kopf.trim();
  const url = new URL(req.url);
  const ausUrl = url.searchParams.get("token") ||
    url.searchParams.get("secret");
  if (ausUrl?.trim()) return ausUrl.trim();
  const imRumpf = body?.token;
  return typeof imRumpf === "string" ? imRumpf.trim() : "";
}

/**
 * Aus einer Meldung die einzelnen Arbeitsauftraege machen.
 *
 * Eine Meldung nennt oft mehrere Wohnungen. Jede wird ein eigener Eintrag,
 * damit ein Fehler bei einer Wohnung die anderen nicht aufhaelt.
 */
function auftraege(
  ereignis: string,
  data: Record<string, unknown>,
): Array<{ art: string; kennung: string }> {
  const raus: Array<{ art: string; kennung: string }> = [];
  const ids = (wert: unknown) =>
    Array.isArray(wert)
      ? wert.map((v) => String(v).split("/").filter(Boolean).pop() || "").filter(
        Boolean,
      )
      : [];
  for (const id of ids(data.properties)) raus.push({ art: "property", kennung: id });
  for (const id of ids(data.parking_spots)) {
    raus.push({ art: "property", kennung: id });
  }
  if (typeof data.reservationId === "string" && data.reservationId.trim()) {
    raus.push({ art: "reservierung", kennung: data.reservationId.trim() });
  }
  // Projektbezogene Meldungen kommen ohne Wohnungsliste.
  const projekt = data.projectId ?? data.project ?? data.api_project_id;
  if (typeof projekt === "string" && projekt.trim()) {
    raus.push({
      art: "projekt",
      kennung: projekt.split("/").filter(Boolean).pop() || "",
    });
  }
  if (raus.length === 0 && ereignis === "sync_stopped") return raus;
  return raus.filter((a) => a.kennung);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const t0 = Date.now();
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  const signaturStatus: SignatureStatus = "verified";

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    await logWebhook({
      source: "investagon",
      method: req.method,
      status_code: 400,
      ip,
      user_agent: userAgent,
      signature_status: "missing",
      error_message: "Kein gültiges JSON",
      duration_ms: Date.now() - t0,
    });
    return json({ error: "Kein gültiges JSON" }, 400);
  }

  if (!CALLBACK_TOKEN && !ALT_SECRET) {
    return json({ error: "Webhook nicht eingerichtet" }, 503);
  }
  const token = tokenAusAnfrage(req, body);
  if (!gleich(token, CALLBACK_TOKEN) && !gleich(token, ALT_SECRET)) {
    await logWebhook({
      source: "investagon",
      event: typeof body.event === "string" ? body.event : null,
      method: req.method,
      status_code: 401,
      ip,
      user_agent: userAgent,
      signature_status: "invalid",
      signature_reason: "Token stimmt nicht",
      duration_ms: Date.now() - t0,
    });
    return json({ error: "Nicht berechtigt" }, 401);
  }

  const ereignis = typeof body.event === "string" ? body.event : "";
  const data = (body.data && typeof body.data === "object")
    ? body.data as Record<string, unknown>
    : {};
  const liste = auftraege(ereignis, data);

  const db = createClient(SUPABASE_URL, SERVICE_ROLE);
  let angenommen = 0;
  for (const a of liste) {
    /*
     * Ein Teilindex laesst je Kennung nur einen offenen Eintrag zu. Meldet
     * Investagon dieselbe Wohnung zweimal kurz hintereinander, laeuft die
     * zweite Meldung in diesen Index und wird still verworfen: der noch
     * offene Eintrag holt ohnehin den neuesten Stand.
     */
    const { error } = await db.from("investagon_sync_queue").insert({
      art: a.art,
      kennung: a.kennung,
      ereignis: ereignis || "unbekannt",
      nutzlast: body,
    });
    if (!error) angenommen++;
    else if (error.code !== "23505") {
      console.error("investagon-webhook: Warteschlange", error.message);
    }
  }

  await logWebhook({
    source: "investagon",
    event: ereignis || null,
    method: req.method,
    status_code: 200,
    ip,
    user_agent: userAgent,
    signature_status: signaturStatus,
    payload: body,
    duration_ms: Date.now() - t0,
  });

  // Verarbeitung anstossen, ohne auf sie zu warten.
  if (angenommen > 0) {
    const start = fetch(`${SUPABASE_URL}/functions/v1/investagon-import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE}`,
      },
      body: JSON.stringify({ sync: true, warteschlange: true, bilder: true }),
    }).catch((e) => console.error("investagon-webhook: Anstoss", e));
    // deno-lint-ignore no-explicit-any
    const rt = (globalThis as any).EdgeRuntime;
    if (rt?.waitUntil) rt.waitUntil(start);
  }

  return json({ ok: true, ereignis, angenommen, gemeldet: liste.length });
});
