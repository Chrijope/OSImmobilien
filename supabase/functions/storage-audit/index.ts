import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Storage-Bucket-Audit (Admin-only).
 * Listet alle Buckets mit Public-Flag, Größe und Datei-Anzahl und gibt
 * Empfehlungen für sensible Buckets, die NICHT öffentlich sein sollten.
 */
const SENSITIVE_BUCKETS = new Set([
  "unterlagen",
  "selbstauskunft-pdfs",
  "rechnungen-pdf",
  "bewerbungen",
  "zertifikate",
  "bug-reports",
  "backups",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Optionaler Body: { action: "scan" | "autofix" }
    let action: "scan" | "autofix" = "scan";
    if (req.method === "POST") {
      try {
        const body = await req.json();
        if (body?.action === "autofix") action = "autofix";
      } catch { /* ignore */ }
    }

    // Auth-Check: JWT → Rolle muss admin/inhaber sein
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false },
    });
    const { data: userData } = await userClient.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });
    const { data: isAdmin } = await admin.rpc("is_admin_role", { _user_id: uid });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) throw error;

    // ─── AUTO-FIX MODE ───────────────────────────────────────────
    // Setzt jeden sensiblen Bucket, der fälschlicherweise public ist, auf privat.
    if (action === "autofix") {
      const fixed: Array<{ id: string; previous: boolean; success: boolean; error?: string }> = [];
      for (const b of buckets ?? []) {
        if (SENSITIVE_BUCKETS.has(b.id) && b.public) {
          const { error: upErr } = await admin.storage.updateBucket(b.id, { public: false });
          fixed.push({ id: b.id, previous: true, success: !upErr, error: upErr?.message });

          // Audit-Log
          await admin.from("audit_log").insert({
            actor: uid,
            action: "storage_bucket_autofix",
            entity: "storage.buckets",
            entity_id: b.id,
            vorher: { public: true },
            nachher: { public: false },
            meta: { reason: "sensitive_bucket_was_public", error: upErr?.message ?? null },
          });
        }
      }
      return new Response(
        JSON.stringify({ action: "autofix", fixed, fixedCount: fixed.length, scannedAt: new Date().toISOString() }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const result = [];
    for (const b of buckets ?? []) {
      let fileCount = 0;
      let totalBytes = 0;
      try {
        const { data: files } = await admin.storage.from(b.id).list("", { limit: 1000, sortBy: { column: "name", order: "asc" } });
        fileCount = files?.length ?? 0;
        totalBytes = (files ?? []).reduce((s: number, f: any) => s + (f?.metadata?.size ?? 0), 0);
      } catch { /* ignore */ }

      const sensitive = SENSITIVE_BUCKETS.has(b.id);
      const issues: string[] = [];
      if (sensitive && b.public) {
        issues.push("KRITISCH: Sensibler Bucket ist öffentlich – sofort auf privat umstellen und signierte URLs verwenden.");
      }
      if (!b.public && !sensitive && fileCount === 0) {
        issues.push("Bucket ist leer – evtl. nicht benötigt.");
      }

      result.push({
        id: b.id,
        name: b.name,
        public: !!b.public,
        sensitive,
        fileCount,
        totalBytes,
        createdAt: b.created_at,
        issues,
        severity: issues.some((s) => s.startsWith("KRITISCH")) ? "critical"
                  : issues.length > 0 ? "warn" : "ok",
      });
    }

    return new Response(
      JSON.stringify({ buckets: result, scannedAt: new Date().toISOString() }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("storage-audit error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});