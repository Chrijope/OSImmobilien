import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Security-Cockpit Edge Function (Admin-only).
 * Liefert konsolidierte Sicherheits-Sicht: Linter, Audit-Anomalien,
 * Secret-Inventar mit Rotations-Alter, CSP-Header-Status.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Auth
    const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!jwt) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("is_admin_role", { _user_id: uid });
    if (!isAdmin) return json({ error: "forbidden" }, 403);

    // Bekannte Secrets (manuell gepflegtes Inventar – Edge-Runtime hat keinen
    // generischen API-Zugang auf Secret-Metadaten).
    const KNOWN_SECRETS = [
      "INGEST_SHARED_SECRET",
      // Das Geheimwort der 18 Automatiken (Audit-Befund F08). Steht hier, weil
      // es die einzige Stelle im Haus ist, an der sich ohne Lovable nachsehen
      // laesst, ob es gesetzt ist. Solange es fehlt, lassen die Automatiken
      // im Uebergang noch jeden durch.
      "AUTOMATIK_GEHEIMWORT",
      "SIPGATE_TOKEN",
      "SIPGATE_HMAC_SECRET",
      "GOOGLE_CALENDAR_CLIENT_SECRET",
      "RECAPTCHA_SECRET_KEY",
      "LOVABLE_API_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
      "SUPABASE_JWKS",
    ];

    const presentSecrets = KNOWN_SECRETS.map((name) => ({
      name,
      configured: !!Deno.env.get(name),
    }));

    // Rotations-Historie
    const { data: rotations } = await admin
      .from("secret_rotations")
      .select("*")
      .order("last_rotated_at", { ascending: false });

    const rotMap = new Map<string, any>();
    (rotations ?? []).forEach((r: any) => rotMap.set(r.secret_name, r));

    const ROTATION_WARN_DAYS = 90;
    const ROTATION_CRIT_DAYS = 180;
    const secrets = presentSecrets.map((s) => {
      const rec = rotMap.get(s.name);
      const lastIso = rec?.last_rotated_at ?? null;
      let ageDays: number | null = null;
      if (lastIso) ageDays = Math.floor((Date.now() - new Date(lastIso).getTime()) / 86_400_000);
      let severity: "ok" | "warn" | "critical" | "unknown" = "unknown";
      if (ageDays != null) {
        if (ageDays >= ROTATION_CRIT_DAYS) severity = "critical";
        else if (ageDays >= ROTATION_WARN_DAYS) severity = "warn";
        else severity = "ok";
      }
      return {
        name: s.name,
        configured: s.configured,
        lastRotatedAt: lastIso,
        rotatedByName: rec?.rotated_by_name ?? null,
        notes: rec?.notes ?? null,
        ageDays,
        severity,
      };
    });

    // Self-Check (Linter)
    let linter: any = { rls_disabled: [], definer_no_search_path: [], rls_no_policy: [] };
    try {
      const { data, error } = await admin.rpc("run_security_self_check");
      if (error) throw error;
      linter = data;
    } catch (e) {
      linter._error = (e as Error).message;
    }

    // Anomalien
    let anomalies: any = { mass_deletes: [], role_changes: [], login_failures: [], dsgvo_deletes: [] };
    try {
      const { data, error } = await admin.rpc("detect_audit_anomalies");
      if (error) throw error;
      anomalies = data;
    } catch (e) {
      anomalies._error = (e as Error).message;
    }

    return json({
      linter,
      anomalies,
      secrets,
      rotationThresholds: { warnDays: ROTATION_WARN_DAYS, criticalDays: ROTATION_CRIT_DAYS },
      scannedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("security-cockpit error", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}