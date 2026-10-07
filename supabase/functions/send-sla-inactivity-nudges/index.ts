// Daily cron — schreibt Bell-Notification für jeden User, der mindestens
// einen "roten" SLA-Verstoß hat. Dedupliziert pro Tag via meta-tag.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { automatikSchutz } from "../_shared/automatik-schutz.ts";
import { ESKALATION_STICHTAG, vorStichtag } from "../_shared/eskalation-bezug.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Nur die Automatik darf hier hinein. Siehe _shared/automatik-schutz.ts;
  // ohne hinterlegtes Geheimwort laesst der Schutz im Uebergang noch durch.
  const abgewiesen = automatikSchutz(req, "send-sla-inactivity-nudges", corsHeaders);
  if (abgewiesen) return abgewiesen;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = new Date().toISOString().slice(0, 10);
  const tag = `sla-nudge-${today}`;

  // Alle, die Leads betreuen. Nur Werte aus `app_role`: Bis zum 04.10.2026
  // stand hier `juniorpartner`, das es nicht gibt. Die Abfrage scheiterte
  // still, und der Dienst meldete "processed: 0". Die Setter-Rolle ruht.
  const { data: roles, error: rolesError } = await supabase
    .from("user_roles")
    .select("user_id, role")
    .in("role", ["vertriebspartner", "vertriebsleiter", "admin", "inhaber"]);

  if (rolesError) {
    console.error("send-sla-inactivity-nudges: Rollen nicht lesbar:", rolesError.message);
    return new Response(JSON.stringify({ ok: false, error: "Rollen nicht lesbar" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!roles?.length) {
    return new Response(JSON.stringify({ ok: true, processed: 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const uniqueUsers = [...new Set(roles.map((r) => r.user_id))];
  let sent = 0, skipped = 0;
  const errors: string[] = [];

  for (const uid of uniqueUsers) {
    const { data: violations, error: vError } = await supabase.rpc("get_sla_violations", { p_user_id: uid });
    if (vError) { errors.push(`${uid}: ${vError.message}`); continue; }
    // Altfaelle vor dem Stichtag zaehlen nicht, sonst kaeme nach dem
    // Ausrollen alles auf einmal (siehe _shared/eskalation-bezug.ts).
    const rot = (violations || []).filter((v: any) => v.severity === "rot" && !vorStichtag(v.last_activity));
    if (rot.length === 0) { skipped++; continue; }

    // Dedup: schon heute gesendet?
    const { data: existing } = await supabase
      .from("benachrichtigungen")
      .select("id")
      .eq("benutzer_id", uid)
      .ilike("titel", `%SLA%`)
      .gte("erstellt_am", `${today}T00:00:00`)
      .limit(1);

    if (existing && existing.length > 0) { skipped++; continue; }

    const { error: insError } = await supabase.from("benachrichtigungen").insert({
      benutzer_id: uid,
      titel: `⚠️ SLA-Verstoß: ${rot.length} Lead${rot.length > 1 ? "s" : ""} vernachlässigt`,
      nachricht: `Du hast ${rot.length} Lead${rot.length > 1 ? "s" : ""}, die seit über der SLA-Schwelle keine Aktivität haben. Bitte zeitnah kontaktieren.`,
      link: "/",
      gelesen: false,
    });
    if (insError) { errors.push(`${uid}: ${insError.message}`); continue; }
    sent++;
  }

  // Nur die Zahl nach aussen, die Meldungen selbst stehen im Log.
  if (errors.length) console.error("send-sla-inactivity-nudges: Fehler:", errors.slice(0, 50).join(" | "));
  return new Response(JSON.stringify({ ok: errors.length === 0, sent, skipped, tag, stichtag: ESKALATION_STICHTAG, fehler: errors.length }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});