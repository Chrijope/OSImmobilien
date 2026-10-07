import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type SignatureStatus = "verified" | "invalid" | "missing" | "not_required";

export interface WebhookAuditEntry {
  source: string;
  event?: string | null;
  method?: string | null;
  status_code?: number | null;
  ip?: string | null;
  user_agent?: string | null;
  signature_status?: SignatureStatus;
  signature_reason?: string | null;
  payload?: unknown;
  error_message?: string | null;
  duration_ms?: number | null;
}

const MAX_PAYLOAD_BYTES = 8 * 1024; // 8KB Cap pro Eintrag

function truncatePayload(payload: unknown): unknown {
  if (payload == null) return null;
  try {
    const str = typeof payload === "string" ? payload : JSON.stringify(payload);
    if (str.length <= MAX_PAYLOAD_BYTES) {
      return typeof payload === "string" ? { raw: payload } : payload;
    }
    return { _truncated: true, _originalBytes: str.length, preview: str.slice(0, MAX_PAYLOAD_BYTES) };
  } catch {
    return { _unserializable: true };
  }
}

export function getClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Schreibt einen Webhook-Eintrag ins Audit-Log. Schluckt Fehler, damit das
 * Logging niemals den eigentlichen Webhook-Flow blockiert.
 */
export async function logWebhook(entry: WebhookAuditEntry): Promise<void> {
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return;
    const supabase = createClient(url, key);
    await supabase.from("webhook_audit_log").insert({
      source: entry.source,
      event: entry.event ?? null,
      method: entry.method ?? null,
      status_code: entry.status_code ?? null,
      ip: entry.ip ?? null,
      user_agent: entry.user_agent ?? null,
      signature_status: entry.signature_status ?? "not_required",
      signature_reason: entry.signature_reason ?? null,
      payload: truncatePayload(entry.payload),
      error_message: entry.error_message ?? null,
      duration_ms: entry.duration_ms ?? null,
    });
  } catch (e) {
    console.warn("[webhook-audit] log failed:", (e as Error).message);
  }
}