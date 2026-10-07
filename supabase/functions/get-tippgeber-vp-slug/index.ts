import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { vergibVpSlug } from "../_shared/vp-slug.ts";
import { beurteileBeraterKennung } from "../_shared/lead-zuordnung.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { tippgeberId } = await req.json().catch(() => ({}));
    if (!tippgeberId) {
      return new Response(JSON.stringify({ error: "tippgeberId required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: tipp } = await admin
      .from("tippgeber")
      .select("zugeordnet_id")
      .eq("id", tippgeberId)
      .maybeSingle();
    const vpId = (tipp as any)?.zugeordnet_id;
    if (!vpId) {
      return new Response(JSON.stringify({ slug: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // Slug aus profiles.vp_slug lesen (Single Source of Truth, gepflegt durch ensure-vp-slug).
    const { data: profile } = await admin
      .from("profiles")
      .select("id, name, vp_slug, gesperrt")
      .eq("id", vpId)
      .maybeSingle();
    const { data: rollen } = await admin.from("user_roles").select("role").eq("user_id", vpId);

    // Dieselbe Pruefung wie `get-vp-microsite` und `submit-lead`: Der Link
    // eines gesperrten Partners oder eines Kontos ohne Partnerrolle zeigt
    // nur „nicht gefunden“. Der Tippgeber bekommt ihn deshalb gar nicht erst,
    // und es wird auch kein Kuerzel nachvergeben.
    if (beurteileBeraterKennung({ kennung: vpId, profil: profile, rollen }) !== "ok") {
      return new Response(JSON.stringify({ slug: null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let slug = (profile as any)?.vp_slug as string | null;

    // Self-heal: Wenn der VP noch keinen Slug hat, hier erzeugen, damit der
    // Tippgeber den Link sofort sehen kann (sonst „Bald verfügbar" bis der VP
    // sich einmal eingeloggt hat). Dieselbe Vergabe wie `ensure-vp-slug`,
    // damit auch hier kein gesperrtes Kürzel (konfigurator, ...) entsteht.
    if (!slug && profile?.name) {
      try {
        slug = await vergibVpSlug(admin, { userId: vpId, aktuellerSlug: slug, name: profile.name });
      } catch (e) {
        console.error("Tippgeber-Kürzel nicht vergeben:", e instanceof Error ? e.message : e);
      }
    }

    return new Response(JSON.stringify({ slug, vpId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});