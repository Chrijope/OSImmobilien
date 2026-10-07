import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { dsgvoOrdnerFuerKontakt } from "../_shared/zusammengefuehrteOrdner.ts";
import { ENDGUELTIG_LOESCHEN_ROLLEN } from "../_shared/endgueltigLoeschen.ts";

/**
 * DSGVO Storage Cleanup
 * --------------------------------------------------------------
 * Löscht alle gespeicherten Dateien eines Kontakts aus den
 * relevanten Storage-Buckets und schreibt einen Audit-Eintrag
 * in `dsgvo_deletion_log` (E-Mail/Name als SHA-256-Hash).
 *
 * Body: { kontakt_id: uuid, grund_referenz?: string }
 * Auth: Bearer (Admin, Inhaber, Vertriebsleitung, Individuell)
 */

// Wie dsgvo-hard-delete (_shared/endgueltigLoeschen.ts), dazu wie bisher "individuell".
const ADMIN_ROLES = new Set([...ENDGUELTIG_LOESCHEN_ROLLEN, "individuell"]);

// Buckets die nutzergebundene Daten enthalten (Pfad-Prefix: <kontakt_id>/...)
const KONTAKT_BUCKETS = [
  "unterlagen",
  "selbstauskunft-pdfs",
  "avatars",
  "rechnungen-pdf",
];

async function sha256Hex(value: string): Promise<string> {
  const buf = new TextEncoder().encode(value.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function listAllRecursive(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<string[]> {
  const out: string[] = [];
  const queue: string[] = [prefix];
  while (queue.length) {
    const dir = queue.shift()!;
    const { data, error } = await admin.storage.from(bucket).list(dir, {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      // Bucket kann leer / Pfad nicht existieren — kein harter Fehler
      continue;
    }
    for (const entry of data || []) {
      const full = dir ? `${dir}/${entry.name}` : entry.name;
      // Ordner haben kein id/metadata
      if (!entry.id && !entry.metadata) {
        queue.push(full);
      } else {
        out.push(full);
      }
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // 1) Caller verifizieren
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claims.claims.sub as string;

    // 2) Service-Client für Storage + Audit
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    // 3) Admin-Rolle prüfen
    const { data: roles, error: rolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (rolesErr) throw rolesErr;
    const hasAdmin = (roles || []).some((r: any) => ADMIN_ROLES.has(r.role));
    if (!hasAdmin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4) Body validieren
    const body = await req.json().catch(() => ({}));
    const kontaktId: string | undefined = body?.kontakt_id;
    const grund: string | undefined = body?.grund_referenz;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!kontaktId || !UUID_RE.test(kontaktId)) {
      return new Response(JSON.stringify({ error: "kontakt_id (uuid) erforderlich" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5) Kontakt für Hashes laden (auch wenn bereits soft-deleted)
    const { data: kontakt } = await admin
      .from("kontakte")
      .select("id, vorname, name, email, meta")
      .eq("id", kontaktId)
      .maybeSingle();

    const emailRaw = (kontakt?.email || (kontakt?.meta as any)?.email || "").toString();
    const nameRaw = `${kontakt?.vorname || ""} ${kontakt?.name || ""}`.trim();
    const emailHash = emailRaw ? await sha256Hex(emailRaw) : null;
    const nameHash = nameRaw ? await sha256Hex(nameRaw) : null;

    // 6) Caller-Name fürs Log
    const { data: callerProfile } = await admin
      .from("profiles")
      .select("vorname, name")
      .eq("user_id", callerId)
      .maybeSingle();
    const callerName = `${callerProfile?.vorname || ""} ${callerProfile?.name || ""}`.trim() || "Unbekannt";

    // 7) Storage purgen
    const report: Record<string, { deleted: number; errors: number }> = {};
    let totalDeleted = 0;
    // Nach einem Zusammenführen gehören die Ordner des aufgelösten Kontakts
    // dem behaltenen, siehe _shared/zusammengefuehrteOrdner.ts.
    const ordnerListe = dsgvoOrdnerFuerKontakt(kontaktId, kontakt?.meta);
    for (const bucket of KONTAKT_BUCKETS) {
      const paths: string[] = [];
      for (const ordner of ordnerListe) paths.push(...await listAllRecursive(admin, bucket, ordner));
      let deleted = 0;
      let errors = 0;
      // In Chunks à 100 löschen (Supabase Limit)
      for (let i = 0; i < paths.length; i += 100) {
        const chunk = paths.slice(i, i + 100);
        const { error } = await admin.storage.from(bucket).remove(chunk);
        if (error) errors += chunk.length;
        else deleted += chunk.length;
      }
      report[bucket] = { deleted, errors };
      totalDeleted += deleted;
    }

    // 8) Audit-Eintrag schreiben
    const { error: logErr } = await admin.from("dsgvo_deletion_log").insert({
      email_hash: emailHash,
      name_hash: nameHash,
      kontakt_id: kontaktId,
      geloeschtvon: callerId,
      geloeschtvon_name: callerName,
      grund_referenz: grund || `storage_cleanup:${totalDeleted}_files`,
    });
    if (logErr) throw logErr;

    return new Response(
      JSON.stringify({
        success: true,
        kontakt_id: kontaktId,
        total_deleted: totalDeleted,
        buckets: report,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[dsgvo-storage-cleanup]", e);
    return new Response(JSON.stringify({ error: (e as Error).message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});