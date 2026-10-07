// DSGVO Hard-Delete (Anonymisierung):
// - Anonymisiert kontakte-Row (PII raus, Investments bleiben verlinkt)
// - Löscht alle Storage-Files unter unterlagen/<kontaktId>/, selbstauskunft-pdfs/<kontaktId>/
// - Löscht auth.users-Entry (falls vorhanden)
// - Schreibt audit_log
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.0";
import { dsgvoOrdnerFuerKontakt } from "../_shared/zusammengefuehrteOrdner.ts";
import { darfEndgueltigLoeschen } from "../_shared/endgueltigLoeschen.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, key);

    // Auth-Check: entweder internes Shared-Secret (Cron) ODER JWT mit
    // Admin, Inhaber oder Vertriebsleitung (_shared/endgueltigLoeschen.ts).
    const internalSecret = Deno.env.get("INGEST_SHARED_SECRET") || "";
    const headerSecret = req.headers.get("x-internal-secret") || "";
    const isInternalCall = internalSecret.length > 0 && headerSecret === internalSecret;

    let callerId: string | null = null;
    if (!isInternalCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader?.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const token = authHeader.replace("Bearer ", "");
      const { data: userData, error: userErr } = await admin.auth.getUser(token);
      if (userErr || !userData?.user?.id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      callerId = userData.user.id;
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", callerId);
      if (!darfEndgueltigLoeschen((roles || []).map((r: any) => r.role))) {
        return new Response(JSON.stringify({ error: "Endgültig löschen dürfen nur Admin, Inhaber und Vertriebsleitung." }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const kontaktId: string | undefined = body.kontaktId;
    const reason: string = body.reason || "";
    const triggeredBy: string = body.triggeredBy || "system";

    if (!kontaktId) {
      return new Response(JSON.stringify({ error: "kontaktId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1) Kontakt laden
    const { data: kontakt, error: kErr } = await admin
      .from("kontakte").select("*").eq("id", kontaktId).maybeSingle();
    if (kErr) throw kErr;
    if (!kontakt) {
      return new Response(JSON.stringify({ error: "kontakt not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authUserId = (kontakt.meta as any)?.authUserId as string | undefined;
    const person2AuthUserId = (kontakt.meta as any)?.person2?.authUserId as string | undefined;

    const errors: string[] = [];

    // 2) Storage-Files löschen (unterlagen + selbstauskunft-pdfs). Nach einem
    // Zusammenführen gehören die Ordner des aufgelösten Kontakts dem
    // behaltenen, siehe _shared/zusammengefuehrteOrdner.ts.
    for (const ordner of dsgvoOrdnerFuerKontakt(kontaktId, kontakt.meta)) {
      for (const bucket of ["unterlagen", "selbstauskunft-pdfs"]) {
        try {
          const { data: files } = await admin.storage.from(bucket).list(ordner, { limit: 1000 });
          if (files && files.length > 0) {
            const paths = files.map((f: any) => `${ordner}/${f.name}`);
            await admin.storage.from(bucket).remove(paths);
          }
          for (const folder of ["finanzierung", "notar", "selbstauskunft"]) {
            const { data: nested } = await admin.storage.from(bucket).list(`${ordner}/${folder}`, { limit: 1000 });
            if (nested && nested.length > 0) {
              await admin.storage.from(bucket).remove(nested.map((f: any) => `${ordner}/${folder}/${f.name}`));
            }
          }
        } catch (e) {
          errors.push(`storage:${bucket}:${ordner}:${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // 3) Verknüpfte Datensätze hart löschen
    const relatedTables = [
      "aufgaben",
      "anrufe",
      "emails",
      "pipeline",
      "signature_requests",
      "activation_tokens",
      "sa_fill_tokens",
      "mobile_scan_sessions",
      // dsgvo_deletion_log bleibt bewusst stehen: Es ist der Nachweis, dass
      // gelöscht wurde, und enthält nur die Kennung (Christian, 26.09.2026).
    ];
    for (const t of relatedTables) {
      try {
        await admin.from(t).delete().eq("kontakt_id", kontaktId);
      } catch (e) {
        errors.push(`${t}:${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 4) Kontakt-Row hart löschen
    const { error: delErr } = await admin.from("kontakte").delete().eq("id", kontaktId);
    if (delErr) errors.push(`kontakt-delete:${delErr.message}`);

    // 4) auth.users löschen
    for (const uid of [authUserId, person2AuthUserId].filter(Boolean) as string[]) {
      try {
        await admin.auth.admin.deleteUser(uid);
      } catch (e) {
        errors.push(`auth:${uid}:${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // 5) audit_log
    try {
      await admin.from("audit_log").insert({
        action: "dsgvo_hard_delete",
        entity: "kontakt",
        entity_id: kontaktId,
        actor: callerId,
        meta: {
          triggeredBy,
          reason,
          authUserDeleted: !!authUserId,
          person2AuthUserDeleted: !!person2AuthUserId,
          errors,
        },
      });
    } catch (e) {
      errors.push(`audit:${e instanceof Error ? e.message : String(e)}`);
    }

    return new Response(JSON.stringify({
      ok: errors.length === 0,
      kontaktId,
      errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("dsgvo-hard-delete error:", e);
    return new Response(JSON.stringify({
      error: e instanceof Error ? e.message : String(e),
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});