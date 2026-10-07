// Shared rate-limit helper for Lovable Edge Functions.
// Backed by public.check_rate_limit RPC + rate_limit_buckets table.
// Uses service_role; do NOT expose to anon/authenticated.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.98.0";

export interface RateLimitConfig {
  scope: string;            // e.g. "invite-user"
  perHour?: number;         // null => no hourly limit
  perDay?: number;          // null => no daily limit
  /**
   * Bei einem Fehler der Limitprüfung abbrechen statt durchlassen (503).
   * Standard bleibt durchlassen. Gesetzt nur, wo ein Ausfall der Bremse
   * Massenversand an Kunden erlauben würde (`send-kunden-expose`).
   */
  failClosed?: boolean;
}

export interface RateLimitResult {
  ok: boolean;
  status: number;           // 200 if ok, 429 if exceeded
  remaining_hour: number | null;
  remaining_day: number | null;
  reason: string | null;
}

/** Antwort, wenn die Limitprüfung selbst ausfällt: durchlassen oder, mit `failClosed`, abbrechen. */
function beiAusfall(cfg: RateLimitConfig): RateLimitResult {
  return cfg.failClosed
    ? { ok: false, status: 503, remaining_hour: null, remaining_day: null, reason: "unavailable" }
    : { ok: true, status: 200, remaining_hour: null, remaining_day: null, reason: null };
}

/**
 * Check + increment a rate-limit bucket for a given user/IP key.
 * Returns { ok:false, status:429, ... } when the limit is exceeded.
 * Fail-open on infra errors (logs a warning), fail-closed (503) with `failClosed`.
 */
export async function checkRateLimit(
  req: Request,
  authUserId: string | null,
  cfg: RateLimitConfig,
): Promise<RateLimitResult> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  let userKey: string;
  if (authUserId) {
    userKey = `user:${authUserId}`;
  } else {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("cf-connecting-ip") ||
      "anon";
    userKey = `ip:${ip}`;
  }

  try {
    const { data, error } = await admin.rpc("check_rate_limit", {
      _user_key: userKey,
      _scope: cfg.scope,
      _limit_per_hour: cfg.perHour ?? null,
      _limit_per_day: cfg.perDay ?? null,
    });
    if (error) {
      console.warn(`[rate-limit:${cfg.scope}] RPC error, failing ${cfg.failClosed ? "closed" : "open"}:`, error.message);
      return beiAusfall(cfg);
    }
    const d = (data || {}) as any;
    // Eine Antwort ohne klares Ergebnis zählt im strengen Modus als Ausfall.
    if (cfg.failClosed && typeof d.exceeded !== "boolean") {
      console.warn(`[rate-limit:${cfg.scope}] no result, failing closed`);
      return beiAusfall(cfg);
    }
    const exceeded = d.exceeded === true;
    if (exceeded) {
      // Audit-Log Eintrag bei Überschreitung (Erkennung kompromittierter Accounts)
      try {
        await admin.from("audit_log").insert({
          actor: authUserId,
          action: "rate_limit_exceeded",
          entity: "edge_function",
          entity_id: cfg.scope,
          meta: {
            user_key: userKey,
            reason: d.reason,
            hour_count: d.hour_count,
            day_count: d.day_count,
            limit_per_hour: cfg.perHour,
            limit_per_day: cfg.perDay,
          },
        });
      } catch (e) {
        console.warn(`[rate-limit:${cfg.scope}] audit insert failed`, e);
      }
    }
    return {
      ok: !exceeded,
      status: exceeded ? 429 : 200,
      remaining_hour: d.remaining_hour ?? null,
      remaining_day: d.remaining_day ?? null,
      reason: d.reason ?? null,
    };
  } catch (e) {
    console.warn(`[rate-limit:${cfg.scope}] threw, failing ${cfg.failClosed ? "closed" : "open"}:`, e);
    return beiAusfall(cfg);
  }
}

export function rateLimitErrorBody(scope: string, res: RateLimitResult, extraHeaders: Record<string, string> = {}) {
  if (res.reason === "unavailable") {
    return new Response(
      JSON.stringify({ error: "Die Mengenprüfung ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.", scope }),
      { status: 503, headers: { ...extraHeaders, "Content-Type": "application/json" } },
    );
  }
  const msg = res.reason === "hour"
    ? "Stündliches Limit erreicht. Bitte später erneut versuchen."
    : "Tageslimit erreicht. Bitte morgen erneut versuchen.";
  return new Response(
    JSON.stringify({
      error: msg,
      rate_limited: true,
      scope,
      reason: res.reason,
      remaining_hour: res.remaining_hour,
      remaining_day: res.remaining_day,
    }),
    {
      status: 429,
      headers: { ...extraHeaders, "Content-Type": "application/json", "Retry-After": res.reason === "hour" ? "3600" : "86400" },
    },
  );
}