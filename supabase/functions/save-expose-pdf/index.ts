import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INTERNAL_ROLES = new Set([
  "admin",
  "inhaber",
  "vertriebspartner",
  "hausverwaltung",
  "buchhaltung",
  "setterin",
  "objektpartner",
  "finanzierungspartner",
  "individuell",
  "testaccount",
  "marketing",
  "hr",
  "backoffice",
  "vertriebsleiter",
  "versicherungsexperte",
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Server-Konfiguration fehlt" }, 500);

    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Nicht angemeldet" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await admin.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return json({ error: "Sitzung ungültig" }, 401);

    const { data: roles, error: rolesError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    if (rolesError) return json({ error: "Rollen konnten nicht geprüft werden" }, 500);
    if (!(roles || []).some((r: { role: string }) => INTERNAL_ROLES.has(r.role))) {
      return json({ error: "Keine Berechtigung zum Speichern des Exposés" }, 403);
    }

    const form = await req.formData();
    const objektId = String(form.get("objektId") || "");
    const fileName = String(form.get("fileName") || "");
    const file = form.get("file");

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(objektId)) {
      return json({ error: "Ungültige Objekt-ID" }, 400);
    }
    const isObjectExpose = fileName.startsWith(`expose/${objektId}/`);
    const isWohnungsExpose = fileName.startsWith(`wohnungsexpose/${objektId}/`);
    if ((!isObjectExpose && !isWohnungsExpose) || !fileName.endsWith(".pdf") || fileName.includes("..")) {
      return json({ error: "Ungültiger Speicherpfad" }, 400);
    }
    if (!(file instanceof File) || (file.type && file.type !== "application/pdf")) {
      return json({ error: "Bitte eine PDF-Datei übergeben" }, 400);
    }

    const { data: objekt, error: objektError } = await admin
      .from("objekte")
      .select("id, meta, erstellt_von")
      .eq("id", objektId)
      .maybeSingle();
    if (objektError || !objekt) return json({ error: "Objekt nicht gefunden" }, 404);

    /*
     * Ablegen ist Pflege am Objekt: Dieselbe Regel wie `darf_objekt_schreiben`
     * (Migration 20260930120000), Admin und Inhaber immer, der Objektpartner
     * am eigenen Objekt. Die Function schreibt mit der Dienstrolle und muss
     * die Regel deshalb selbst prüfen. Partner nutzen für Kunden das
     * Online-Exposé; das bleibt für alle zu sehen und herunterzuladen.
     */
    const rollen = new Set((roles || []).map((r: { role: string }) => r.role));
    const darfAblegen = rollen.has("admin") || rollen.has("inhaber")
      || (rollen.has("objektpartner") && (objekt as { erstellt_von?: string | null }).erstellt_von === user.id);
    if (!darfAblegen) {
      return json({
        error: "Ablegen dürfen Admin und Inhaber. Das Exposé kannst du über den Online-Link ansehen und herunterladen.",
      }, 403);
    }

    const folder = fileName.split("/").slice(0, -1).join("/");
    const { data: existingFiles } = await admin.storage
      .from("objekt-medien")
      .list(folder);
    if (existingFiles?.length) {
      await admin.storage
        .from("objekt-medien")
        .remove(existingFiles.map((f) => `${folder}/${f.name}`));
    }

    const { error: uploadError } = await admin.storage
      .from("objekt-medien")
      .upload(fileName, file, { contentType: "application/pdf", upsert: true });
    if (uploadError) {
      console.error("save-expose-pdf upload error", uploadError);
      return json({ error: uploadError.message }, 500);
    }

    const { data: urlData } = admin.storage.from("objekt-medien").getPublicUrl(fileName);
    const lastGenerated = new Date().toISOString();
    if (isObjectExpose) {
      const meta = { ...((objekt as { meta?: Record<string, unknown> }).meta || {}), exposePdf: { url: urlData.publicUrl, lastGenerated } };
      await admin.from("objekte").update({ meta }).eq("id", objektId);

      // Stelle sicher, dass das Exposé-PDF in den Objektunterlagen sichtbar ist.
      // Wir suchen einen existierenden Eintrag mit Name "Exposé (PDF)" und
      // aktualisieren ihn – sonst legen wir einen neuen an.
      try {
        const { data: existingDok } = await admin
          .from("objekt_dokumente")
          .select("id")
          .eq("objekt_id", objektId)
          .eq("name", "Exposé (PDF)")
          .maybeSingle();
        if (existingDok?.id) {
          await admin
            .from("objekt_dokumente")
            .update({ url: urlData.publicUrl, sichtbar: true, kategorie: "objektunterlagen", typ: "standard" })
            .eq("id", existingDok.id);
        } else {
          await admin.from("objekt_dokumente").insert({
            objekt_id: objektId,
            name: "Exposé (PDF)",
            url: urlData.publicUrl,
            typ: "standard",
            kategorie: "objektunterlagen",
            sichtbar: true,
          });
        }
      } catch (dokError) {
        console.error("save-expose-pdf dokument upsert error", dokError);
      }
    }

    return json({ url: urlData.publicUrl, lastGenerated });
  } catch (error) {
    console.error("save-expose-pdf error", error);
    return json({ error: error instanceof Error ? error.message : "Unbekannter Fehler" }, 500);
  }
});
