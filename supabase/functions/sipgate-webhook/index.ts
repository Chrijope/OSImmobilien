import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyHmacSignature } from "../_shared/webhook-signature.ts";
import { logWebhook, getClientIp, type SignatureStatus } from "../_shared/webhook-audit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/*
 * Sipgate Push-API Webhook
 * 
 * Sipgate sends POST requests for call events:
 *   - newCall      → Anruf gestartet
 *   - answer       → Anruf angenommen
 *   - hangup       → Anruf beendet (enthält Dauer)
 * 
 * Docs: https://developer.sipgate.io/push-api/api-reference
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Sipgate Push-API sends form-urlencoded data
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const SIPGATE_TOKEN = Deno.env.get("SIPGATE_TOKEN");
  const SIPGATE_HMAC_SECRET = Deno.env.get("SIPGATE_HMAC_SECRET");
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const t0 = Date.now();
  const ip = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  let signatureStatus: SignatureStatus = "not_required";
  let signatureReason: string | null = null;
  let parsedEvent: string | null = null;
  let parsedPayload: unknown = null;

  try {
    // Body einmal puffern, damit sowohl HMAC-Verifikation als auch Parsing möglich sind
    const rawBody = await req.text();

    // Optionale HMAC-Signaturprüfung (Anti-Replay via Timestamp). Aktiv, sobald
    // SIPGATE_HMAC_SECRET gesetzt ist UND der Aufrufer eine Signatur mitsendet.
    if (SIPGATE_HMAC_SECRET) {
      if (req.headers.get("x-webhook-signature")) {
        const sig = await verifyHmacSignature(req, rawBody, SIPGATE_HMAC_SECRET);
        signatureStatus = sig.valid ? "verified" : "invalid";
        signatureReason = sig.reason ?? null;
        if (!sig.valid) {
          console.warn("sipgate-webhook: invalid HMAC signature", sig.reason);
          await logWebhook({
            source: "sipgate", event: null, method: req.method, status_code: 401,
            ip, user_agent: userAgent, signature_status: signatureStatus,
            signature_reason: signatureReason, payload: { rawPreview: rawBody.slice(0, 500) },
            error_message: "invalid_signature", duration_ms: Date.now() - t0,
          });
          return new Response("Invalid signature", { status: 401, headers: corsHeaders });
        }
      } else {
        signatureStatus = "missing";
      }
    }

    // Webhook-Authentifizierung: Token-Validierung via Query-Param oder Header
    // Sipgate-URL muss konfiguriert sein als: https://.../sipgate-webhook?token=<SIPGATE_TOKEN>
    if (!SIPGATE_TOKEN) {
      console.error("SIPGATE_TOKEN not configured – rejecting webhook call");
      await logWebhook({
        source: "sipgate", method: req.method, status_code: 500, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason,
        error_message: "SIPGATE_TOKEN not configured", duration_ms: Date.now() - t0,
      });
      return new Response("Server misconfiguration", { status: 500, headers: corsHeaders });
    }
    const incomingToken =
      new URL(req.url).searchParams.get("token") ||
      req.headers.get("x-sipgate-token") ||
      "";
    if (incomingToken !== SIPGATE_TOKEN) {
      console.warn("Sipgate webhook: invalid or missing token");
      await logWebhook({
        source: "sipgate", method: req.method, status_code: 401, ip, user_agent: userAgent,
        signature_status: signatureStatus, signature_reason: signatureReason,
        error_message: "invalid_token", duration_ms: Date.now() - t0,
      });
      return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    }

    const contentType = req.headers.get("content-type") || "";
    let params: Record<string, string> = {};

    if (contentType.includes("application/x-www-form-urlencoded")) {
      params = Object.fromEntries(new URLSearchParams(rawBody));
    } else if (contentType.includes("application/json")) {
      params = JSON.parse(rawBody || "{}");
    } else {
      params = Object.fromEntries(new URLSearchParams(rawBody));
    }

    const event = params.event; // newCall, answer, hangup
    parsedEvent = event ?? null;
    parsedPayload = params;
    console.log(`Sipgate event: ${event}`, JSON.stringify(params));

    // We only care about "hangup" events to record completed calls
    if (event === "hangup") {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

      // Sipgate fields:
      // from, to, direction (in/out), cause (normalClearing, busy, cancel, noAnswer),
      // answeringNumber, duration (seconds), callId, originalCallId
      const direction = params.direction; // "in" or "out"
      const duration = parseInt(params.duration || "0", 10);
      const cause = params.cause || "";
      const from = params.from || "";
      const to = params.to || "";
      const callId = params.callId || "";
      const userId = params.userId || ""; // Sipgate userId (e.g. "w0")
      const userName = params.user || ""; // Sipgate user display name

      // Map Sipgate cause to our ergebnis enum
      let ergebnis: string;
      if (cause === "normalClearing" && duration > 0) {
        ergebnis = "erreicht";
      } else if (cause === "busy") {
        ergebnis = "nicht_erreicht";
      } else if (cause === "noAnswer" || cause === "cancel") {
        ergebnis = "nicht_erreicht";
      } else if (duration > 0) {
        ergebnis = "erreicht";
      } else {
        ergebnis = "nicht_erreicht";
      }

      // Phone number: for outgoing calls use "to", for incoming use "from"
      const telefon = direction === "out" ? to : from;

      // Try to find matching kontakt by phone number
      let kontaktId: string | null = null;
      if (telefon) {
        const normalizedPhone = telefon.replace(/\s/g, "").replace(/^\+49/, "0");
        const { data: kontakte } = await supabase
          .from("kontakte")
          .select("id, telefon")
          .not("telefon", "is", null);

        if (kontakte) {
          const match = kontakte.find((k: any) => {
            if (!k.telefon) return false;
            const kPhone = k.telefon.replace(/\s/g, "").replace(/^\+49/, "0");
            return kPhone === normalizedPhone || 
                   k.telefon.replace(/\s/g, "") === telefon.replace(/\s/g, "");
          });
          if (match) kontaktId = match.id;
        }
      }

      // Look up benutzer_id from sipgate userId mapping
      // For now we use a placeholder – the mapping needs to be configured
      // We'll store the sipgate userId in notizen for reference
      const { error } = await supabase.from("anrufe").insert({
        benutzer_id: "00000000-0000-0000-0000-000000000000", // Placeholder – see mapping below
        telefon,
        dauer_sekunden: duration,
        ergebnis,
        kontakt_id: kontaktId,
        notizen: `Sipgate: ${direction === "out" ? "Ausgehend" : "Eingehend"} | User: ${userName} (${userId}) | CallID: ${callId}`,
      });

      if (error) {
        console.error("DB insert error:", error);
        await logWebhook({
          source: "sipgate", event: parsedEvent, method: req.method, status_code: 500,
          ip, user_agent: userAgent, signature_status: signatureStatus, signature_reason: signatureReason,
          payload: parsedPayload, error_message: error.message, duration_ms: Date.now() - t0,
        });
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Call logged: ${telefon}, ${duration}s, ${ergebnis}`);
    }

    // Sipgate expects a 200 response
    await logWebhook({
      source: "sipgate", event: parsedEvent, method: req.method, status_code: 200,
      ip, user_agent: userAgent, signature_status: signatureStatus, signature_reason: signatureReason,
      payload: parsedPayload, duration_ms: Date.now() - t0,
    });
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (err) {
    console.error("Webhook error:", err);
    const msg = err instanceof Error ? err.message : "Unknown error";
    await logWebhook({
      source: "sipgate", event: parsedEvent, method: req.method, status_code: 500,
      ip, user_agent: userAgent, signature_status: signatureStatus, signature_reason: signatureReason,
      payload: parsedPayload, error_message: msg, duration_ms: Date.now() - t0,
    });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
