import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Edge-Rate-Limit auf Basis der Postgres-Funktion `check_rate_limit`.
 * Liefert { ok, status, body } – bei `ok=false` direkt als Response zurückgeben.
 */
export interface RateLimitResult {
  ok: boolean;
  exceeded: boolean;
  reason?: string | null;
  remaining_hour?: number | null;
  remaining_day?: number | null;
  retryAfterSeconds?: number;
  /** Nur bei `failClosed`: Die Bremse war nicht pruefbar. Antwort 503. */
  unavailable?: boolean;
}

/**
 * Der Anschluss des Aufrufers.
 *
 * `cf-connecting-ip` zuerst (seit 04.10.2026): Den Kopf setzt Cloudflare am
 * Rand selbst und ueberschreibt, was der Aufrufer mitschickt. Den ersten
 * Eintrag von `x-forwarded-for` dagegen kann jeder frei waehlen, die Proxys
 * haengen nur hinten an. Wer XFF zuerst liest, laesst ein Skript mit jeder
 * Anfrage einen neuen Anschluss erfinden und die Bremse umgehen.
 */
export function clientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  );
}

export async function checkEdgeRateLimit(opts: {
  scope: string;
  key: string;
  perHour?: number;
  perDay?: number;
  /**
   * Standard false: Ist die Bremse nicht pruefbar, laeuft die Anfrage durch
   * (so bleiben submit-lead, Anmeldung und Co. unveraendert). Mit true wird
   * sie dann abgewiesen (`unavailable`), fuer Wege, bei denen ein Ausfall
   * der Bremse teurer ist als ein kurzer Ausfall des Wegs.
   */
  failClosed?: boolean;
}): Promise<RateLimitResult> {
  const gesperrt: RateLimitResult = {
    ok: false,
    exceeded: true,
    reason: "unavailable",
    unavailable: true,
    retryAfterSeconds: 60,
  };
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await admin.rpc("check_rate_limit", {
      _user_key: opts.key,
      _scope: opts.scope,
      _limit_per_hour: opts.perHour ?? null,
      _limit_per_day: opts.perDay ?? null,
    });
    if (error) {
      console.error("rate-limit RPC error", error);
      // Fail-open, damit Auth nicht durch Infra-Fehler blockiert
      return opts.failClosed ? gesperrt : { ok: true, exceeded: false };
    }
    if (opts.failClosed && typeof (data as any)?.exceeded !== "boolean") {
      console.error("rate-limit: ungueltige Antwort", data);
      return gesperrt;
    }
    const exceeded = !!(data as any)?.exceeded;
    return {
      ok: !exceeded,
      exceeded,
      reason: (data as any)?.reason ?? null,
      remaining_hour: (data as any)?.remaining_hour ?? null,
      remaining_day: (data as any)?.remaining_day ?? null,
      retryAfterSeconds: exceeded ? ((data as any)?.reason === "hour" ? 3600 : 86400) : 0,
    };
  } catch (e) {
    console.error("rate-limit failed", e);
    return opts.failClosed ? gesperrt : { ok: true, exceeded: false };
  }
}